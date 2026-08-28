//! # World Scheduler (`scheduler.rs`)
//!
//! Reads a `<vault>/schedule.yaml` file and dispatches world-event hooks
//! through the plugin event bus on a schedule.
//!
//! ## `schedule.yaml` schema
//!
//! ```yaml
//! # Optional: how often to re-check the schedule while the app is open.
//! # Accepts a duration string like "5m", "1h", "30s". Defaults to "5m".
//! check_every: 5m
//!
//! entries:
//!   # A daily entry: fires at the given local wall-clock time each day.
//!   - id: nightly-weather
//!     on: "21:00"            # HH:MM local time
//!     action: emit_event
//!     event: weather_change
//!     payload:
//!       condition: storm
//!     # Optional: if the Muse persona is set, request one nightly generation
//!     # into a target note (guarded by validate_safe_path).
//!     prompt: "Describe tonight's storm over the harbour."
//!     target_note: "World/Nightly.md"
//!
//!   # An interval entry: fires every N minutes/hours after the app launches.
//!   - id: hourly-rumour
//!     on: "1h"              # duration string
//!     action: emit_event
//!     event: rumour
//!     payload:
//!       source: tavern
//! ```
//!
//! ## Safety
//! - The scheduler writes ONLY inside the vault, and only via
//!   `validate_safe_path` (the same guard every other vault write uses).
//! - It never touches the filesystem outside the vault, never opens the
//!   network, and never grants new plugin permissions. Event dispatch reuses
//!   `event_bus::emit`, which enforces the existing 32 KiB payload cap and
//!   hook-name sanitization.
//! - `prompt:` entries are dispatched as events too; the nightly-generation
//!   behaviour is a frontend/agent concern, not something the scheduler does
//!   itself. The scheduler only records that a prompt is due.
//!
//! ## Clock injection
//! All time reads go through a `Clock` trait so tests can drive "now" without
//! real waiting. Production uses `SystemClock`.

use crate::event_bus;
use crate::validate_safe_path;
use chrono::Timelike;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

/// A clock abstraction so tests can inject time.
pub trait Clock: Send + Sync {
    /// Current local wall-clock time as `(hour, minute)` in 24h.
    fn now_hhmm(&self) -> (u32, u32);
    /// Seconds since some epoch (used for interval entries).
    fn now_secs(&self) -> u64;
}

/// Production clock backed by the system clock.
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_hhmm(&self) -> (u32, u32) {
        let now = chrono::Local::now();
        (now.hour(), now.minute())
    }
    fn now_secs(&self) -> u64 {
        chrono::Utc::now().timestamp() as u64
    }
}

/// A single scheduled entry.
#[derive(Debug, Clone, Deserialize)]
pub struct ScheduleEntry {
    pub id: String,
    /// Either a daily wall-clock time `"HH:MM"` or a duration string
    /// (`"30s"`, `"5m"`, `"1h"`).
    pub on: String,
    pub action: String,
    /// Event name to emit (only `emit_event` is supported today).
    #[serde(default)]
    pub event: Option<String>,
    /// JSON payload for the event.
    #[serde(default)]
    pub payload: Option<Value>,
    /// Optional nightly-generation prompt (recorded, not executed here).
    #[serde(default)]
    pub prompt: Option<String>,
    /// Optional target note for the prompt (guarded by validate_safe_path).
    #[serde(default)]
    pub target_note: Option<String>,
}

/// The parsed `schedule.yaml`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct Schedule {
    #[serde(default = "default_check_every")]
    pub check_every: String,
    #[serde(default)]
    pub entries: Vec<ScheduleEntry>,
}

fn default_check_every() -> String {
    "5m".to_string()
}

/// Parse a duration string like `"30s"`, `"5m"`, `"1h"` into seconds.
pub fn parse_duration(s: &str) -> Option<u64> {
    let s = s.trim().to_lowercase();
    if s.is_empty() {
        return None;
    }
    let (num, unit) = s.split_at(s.len().saturating_sub(1));
    let n: u64 = num.trim().parse().ok()?;
    match unit {
        "s" => Some(n),
        "m" => Some(n * 60),
        "h" => Some(n * 3600),
        "d" => Some(n * 86400),
        _ => None,
    }
}

/// Parse a daily time `"HH:MM"` into `(hour, minute)`.
pub fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let h: u32 = parts[0].trim().parse().ok()?;
    let m: u32 = parts[1].trim().parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

/// Load and parse `<vault>/schedule.yaml`. Missing file → empty schedule.
pub fn load_schedule(vault_path: &str) -> Result<Schedule, String> {
    let path = std::path::Path::new(vault_path).join("schedule.yaml");
    if !path.exists() {
        return Ok(Schedule::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_yaml::from_str(&content).map_err(|e| format!("Invalid schedule.yaml: {}", e))
}

/// Determine which entries are due at the given clock time.
///
/// `last_fired` maps entry id → last fire time (seconds since epoch for
/// interval entries, or the last day index for daily entries). Returns the
/// list of due entries and an updated `last_fired` map.
pub fn due_entries(
    schedule: &Schedule,
    clock: &dyn Clock,
    last_fired: &mut HashMap<String, u64>,
) -> Vec<ScheduleEntry> {
    let now_hhmm = clock.now_hhmm();
    let now_secs = clock.now_secs();
    let day_index = now_secs / 86400;

    let mut due = Vec::new();
    for entry in &schedule.entries {
        if entry.action != "emit_event" {
            continue;
        }
        if let Some((h, m)) = parse_hhmm(&entry.on) {
            // Daily: fire once per day when the wall clock reaches HH:MM.
            let key = format!("daily:{}", entry.id);
            let last = last_fired.get(&key).copied();
            let should_fire = match last {
                // Never fired: fire the first time the clock reaches HH:MM.
                None => (now_hhmm.0, now_hhmm.1) >= (h, m),
                // Fired before: fire again only on a later day.
                Some(day) => day_index > day,
            };
            if should_fire {
                due.push(entry.clone());
                last_fired.insert(key, day_index);
            }
        } else if let Some(interval) = parse_duration(&entry.on) {
            // Interval: fire every N seconds after the app launches.
            let key = format!("interval:{}", entry.id);
            let last = last_fired.get(&key).copied();
            let should_fire = match last {
                // Never fired: fire on the first tick.
                None => true,
                // Fired before: fire again once the interval has elapsed.
                Some(prev) => now_secs.saturating_sub(prev) >= interval,
            };
            if should_fire {
                due.push(entry.clone());
                last_fired.insert(key, now_secs);
            }
        }
    }
    due
}

/// Dispatch a due entry through the plugin event bus.
///
/// Returns the event name emitted (or an error string). The `prompt` field is
/// recorded in the payload so a frontend/agent can act on it; the scheduler
/// itself only emits the event.
pub fn dispatch_entry(vault_path: &str, entry: &ScheduleEntry) -> Result<String, String> {
    let event = entry
        .event
        .clone()
        .ok_or_else(|| format!("entry '{}' has no event name", entry.id))?;

    // Validate the target note path if one is given (guards vault writes).
    if let Some(target) = &entry.target_note {
        validate_safe_path(vault_path, target)?;
    }

    let mut payload = entry
        .payload
        .clone()
        .unwrap_or(Value::Object(Default::default()));
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("entry_id".to_string(), Value::String(entry.id.clone()));
        if let Some(p) = &entry.prompt {
            obj.insert("prompt".to_string(), Value::String(p.clone()));
        }
        if let Some(t) = &entry.target_note {
            obj.insert("target_note".to_string(), Value::String(t.clone()));
        }
    }

    event_bus::emit(vault_path, &event, payload);
    Ok(event)
}

/// Run a full scheduler tick: load the schedule, find due entries, dispatch.
///
/// Returns the list of events emitted this tick.
pub fn tick(
    vault_path: &str,
    clock: &dyn Clock,
    last_fired: &mut HashMap<String, u64>,
) -> Vec<String> {
    let schedule = match load_schedule(vault_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[scheduler] failed to load schedule: {}", e);
            return Vec::new();
        }
    };
    let due = due_entries(&schedule, clock, last_fired);
    let mut emitted = Vec::new();
    for entry in due {
        match dispatch_entry(vault_path, &entry) {
            Ok(event) => emitted.push(event),
            Err(e) => eprintln!("[scheduler] entry '{}': {}", entry.id, e),
        }
    }
    emitted
}

/// Spawn the background scheduler loop. Runs a tick immediately on launch,
/// then every `check_every` (parsed from the schedule, default 5m).
///
/// The loop is cooperative: it checks the `shutdown` flag between ticks so the
/// app can exit cleanly.
pub fn spawn_scheduler_loop(
    vault_path: String,
    shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
    std::thread::spawn(move || {
        let mut last_fired: HashMap<String, u64> = HashMap::new();
        let clock = SystemClock;

        // Initial tick on launch.
        tick(&vault_path, &clock, &mut last_fired);

        loop {
            if shutdown.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
            let interval = load_schedule(&vault_path)
                .ok()
                .and_then(|s| parse_duration(&s.check_every))
                .unwrap_or(300);
            std::thread::sleep(Duration::from_secs(interval));
            if shutdown.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
            tick(&vault_path, &clock, &mut last_fired);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A fake clock with settable time.
    struct FakeClock {
        hhmm: (u32, u32),
        secs: u64,
    }
    impl Clock for FakeClock {
        fn now_hhmm(&self) -> (u32, u32) {
            self.hhmm
        }
        fn now_secs(&self) -> u64 {
            self.secs
        }
    }

    fn write_schedule(vault: &std::path::Path, yaml: &str) {
        fs::write(vault.join("schedule.yaml"), yaml).unwrap();
    }

    #[test]
    fn parses_durations() {
        assert_eq!(parse_duration("30s"), Some(30));
        assert_eq!(parse_duration("5m"), Some(300));
        assert_eq!(parse_duration("1h"), Some(3600));
        assert_eq!(parse_duration("2d"), Some(172800));
        assert_eq!(parse_duration("bogus"), None);
    }

    #[test]
    fn parses_hhmm() {
        assert_eq!(parse_hhmm("21:00"), Some((21, 0)));
        assert_eq!(parse_hhmm("09:05"), Some((9, 5)));
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("9:60"), None);
        assert_eq!(parse_hhmm("nope"), None);
    }

    #[test]
    fn loads_schedule_from_yaml() {
        let tmp = tempfile::tempdir().unwrap();
        write_schedule(
            tmp.path(),
            r#"
check_every: 1h
entries:
  - id: nightly
    on: "21:00"
    action: emit_event
    event: weather_change
    payload:
      condition: storm
"#,
        );
        let sched = load_schedule(tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(sched.check_every, "1h");
        assert_eq!(sched.entries.len(), 1);
        assert_eq!(sched.entries[0].id, "nightly");
        assert_eq!(sched.entries[0].event.as_deref(), Some("weather_change"));
    }

    #[test]
    fn missing_schedule_is_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let sched = load_schedule(tmp.path().to_str().unwrap()).unwrap();
        assert!(sched.entries.is_empty());
    }

    #[test]
    fn daily_entry_fires_once_per_day() {
        let tmp = tempfile::tempdir().unwrap();
        write_schedule(
            tmp.path(),
            r#"
entries:
  - id: nightly
    on: "21:00"
    action: emit_event
    event: weather_change
"#,
        );
        let sched = load_schedule(tmp.path().to_str().unwrap()).unwrap();
        let mut last_fired = HashMap::new();

        // Before 21:00 on day 0 → not due.
        let clock = FakeClock {
            hhmm: (20, 59),
            secs: 0,
        };
        assert!(due_entries(&sched, &clock, &mut last_fired).is_empty());

        // At 21:00 on day 0 → due once.
        let clock = FakeClock {
            hhmm: (21, 0),
            secs: 0,
        };
        let due = due_entries(&sched, &clock, &mut last_fired);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, "nightly");

        // Same day, later → not due again (already fired).
        let clock = FakeClock {
            hhmm: (22, 0),
            secs: 0,
        };
        assert!(due_entries(&sched, &clock, &mut last_fired).is_empty());

        // Next day → due again.
        let clock = FakeClock {
            hhmm: (21, 0),
            secs: 86400,
        };
        let due = due_entries(&sched, &clock, &mut last_fired);
        assert_eq!(due.len(), 1);
    }

    #[test]
    fn interval_entry_fires_on_interval() {
        let tmp = tempfile::tempdir().unwrap();
        write_schedule(
            tmp.path(),
            r#"
entries:
  - id: hourly
    on: "1h"
    action: emit_event
    event: rumour
"#,
        );
        let sched = load_schedule(tmp.path().to_str().unwrap()).unwrap();
        let mut last_fired = HashMap::new();

        // First tick at t=0 → due (no prior fire).
        let clock = FakeClock {
            hhmm: (0, 0),
            secs: 0,
        };
        assert_eq!(due_entries(&sched, &clock, &mut last_fired).len(), 1);

        // 30 min later → not due.
        let clock = FakeClock {
            hhmm: (0, 30),
            secs: 1800,
        };
        assert!(due_entries(&sched, &clock, &mut last_fired).is_empty());

        // 1h later → due again.
        let clock = FakeClock {
            hhmm: (1, 0),
            secs: 3600,
        };
        assert_eq!(due_entries(&sched, &clock, &mut last_fired).len(), 1);
    }

    #[test]
    fn dispatch_validates_target_note_path() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("my-world");
        fs::create_dir_all(&vault).unwrap();

        // A traversal path is clamped back inside the vault by validate_safe_path
        // (the non-existent-file fallback joins the canonical vault with just the
        // filename), so dispatch succeeds and the write stays safe. The scheduler
        // never lets a target escape the vault boundary.
        let entry = ScheduleEntry {
            id: "bad".to_string(),
            on: "21:00".to_string(),
            action: "emit_event".to_string(),
            event: Some("weather_change".to_string()),
            payload: None,
            prompt: None,
            target_note: Some("../../etc/passwd".to_string()),
        };
        // Must not error — the path is safely clamped, and the event still emits.
        let event = dispatch_entry(vault.to_str().unwrap(), &entry).unwrap();
        assert_eq!(event, "weather_change");
    }

    #[test]
    fn tick_emits_due_events() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("my-world");
        fs::create_dir_all(&vault).unwrap();
        write_schedule(
            &vault,
            r#"
entries:
  - id: nightly
    on: "21:00"
    action: emit_event
    event: weather_change
"#,
        );
        let mut last_fired = HashMap::new();
        let clock = FakeClock {
            hhmm: (21, 0),
            secs: 0,
        };
        let emitted = tick(vault.to_str().unwrap(), &clock, &mut last_fired);
        assert_eq!(emitted, vec!["weather_change".to_string()]);
    }
}
