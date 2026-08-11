import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Inbox, Plus, Send } from "lucide-react";
import { CampaignNote, WorldInfo } from "../types";

/**
 * LiminalView
 *
 * The Liminal — a holding pen between worlds. Notes captured while no world
 * is active (or via the capture inbox with no world selected) land in
 * `campaigns_root/_liminal/Captures/`. From here they can be:
 *
 *   - **Claimed** into an existing world (moved into that world's Worldbuilding/),
 *   - **Birthed** into a brand-new world (all liminal captures move into it).
 *
 * The backend commands `claim_liminal_note` and `make_world_from_liminal`
 * perform the moves; this view is a thin, read-only list around them.
 * `list_liminal_notes` is a read-only command added for this view.
 */

export interface LiminalViewProps {
  worlds: WorldInfo[];
  onMakeWorldFromLiminal: (name: string) => Promise<void>;
  onClose: () => void;
}

export const LiminalView: React.FC<LiminalViewProps> = ({
  worlds,
  onMakeWorldFromLiminal,
  onClose,
}) => {
  const [notes, setNotes] = useState<CampaignNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimTargets, setClaimTargets] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState<string | null>(null);
  const [newWorldName, setNewWorldName] = useState("");
  const [birthing, setBirthing] = useState(false);
  const [birthError, setBirthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const liminalNotes = await invoke<CampaignNote[]>("list_liminal_notes");
      setNotes(liminalNotes);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleClaim = async (notePath: string) => {
    // The select shows worlds[0] as its default value; claimTargets only
    // gains an entry once the user actively changes the select. Honour the
    // visible default when nothing was picked explicitly.
    const target = claimTargets[notePath] ?? worlds[0]?.path ?? "";
    if (!target) return;
    setClaiming(notePath);
    try {
      await invoke("claim_liminal_note", {
        notePath,
        targetWorldPath: target,
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setClaiming(null);
    }
  };

  const handleBirth = async () => {
    const name = newWorldName.trim();
    if (!name || birthing) return;
    setBirthing(true);
    setBirthError(null);
    try {
      await onMakeWorldFromLiminal(name);
      await refresh();
      setNewWorldName("");
    } catch (err) {
      setBirthError(String(err));
    } finally {
      setBirthing(false);
    }
  };

  return (
    <div className="liminal-view" data-od-id="liminal-view">
      <header className="liminal-header">
        <button
          className="btn btn-icon"
          onClick={onClose}
          title="Back to the shelf"
          data-od-id="liminal-back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="liminal-title">
          <h2>The Liminal</h2>
          <p className="liminal-subtitle">
            Ideas waiting for a world — captures not yet claimed by any
            campaign.
          </p>
        </div>
      </header>

      {error && <div className="liminal-error">{error}</div>}

      <div className="liminal-body">
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-title">Loading…</div>
          </div>
        ) : notes.length === 0 ? (
          <div className="empty-state">
            <Inbox size={32} />
            <div className="empty-state-title">The Liminal is empty</div>
            <div className="empty-state-desc">
              Captured notes land here when no world is ready for them yet.
            </div>
          </div>
        ) : (
          <ul className="liminal-note-list">
            {notes.map((note) => (
              <li key={note.id} className="liminal-note-item">
                <div className="liminal-note-info">
                  <div className="liminal-note-title">{note.title}</div>
                  <div className="liminal-note-path">{note.path}</div>
                </div>
                <div className="liminal-note-actions">
                  <select
                    className="liminal-target-select"
                    value={claimTargets[note.id] ?? worlds[0]?.path ?? ""}
                    onChange={(e) =>
                      setClaimTargets((prev) => ({
                        ...prev,
                        [note.id]: e.target.value,
                      }))
                    }
                    data-od-id={`liminal-target-${note.id}`}
                  >
                    {worlds.map((w) => (
                      <option key={w.id} value={w.path}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm"
                    disabled={!worlds.length || claiming === note.id}
                    onClick={() => handleClaim(note.path)}
                    aria-label={`Claim ${note.title} into world`}
                    data-od-id={`liminal-claim-${note.id}`}
                  >
                    {claiming === note.id ? "Claiming…" : "Claim"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="liminal-footer">
        <div className="liminal-birth">
          <Plus size={16} />
          <input
            className="liminal-name-input"
            placeholder="Birth a new world from these captures…"
            value={newWorldName}
            onChange={(e) => setNewWorldName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleBirth();
            }}
            data-od-id="liminal-birth-input"
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!newWorldName.trim() || birthing}
            onClick={handleBirth}
            aria-label="Birth world from liminal captures"
            data-od-id="liminal-birth-button"
          >
            {birthing ? "Birthing…" : <Send size={14} />}
          </button>
        </div>
        {birthError && <div className="liminal-error">{birthError}</div>}
      </footer>
    </div>
  );
};
