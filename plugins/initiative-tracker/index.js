// Initiative Tracker plugin
// System-agnostic combat turn-order tracker. State is persisted per-vault via
// globalThis.__state (JSON). Hooks:
//   - init_combat(payload)      -> reset state, optionally seed combatants
//   - add_combatant(payload)    -> { name, initiative, hp, maxHp, status? }
//   - remove_combatant(payload) -> { name }
//   - next_turn(payload)        -> advance to next combatant in order
//   - prev_turn(payload)        -> go back one combatant
//   - damage_combatant(payload) -> { name, amount }
//   - heal_combatant(payload)   -> { name, amount }
//   - set_status(payload)       -> { name, status }
//   - get_combat_state(payload) -> return full state as JSON

function ensureState() {
    if (!__state.combatants) __state.combatants = [];
    if (!__state.currentIndex) __state.currentIndex = 0;
    if (!__state.round) __state.round = 1;
    if (!__state.log) __state.log = [];
}

function sortByInitiative() {
    __state.combatants.sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
}

function log(msg) {
    __state.log.unshift({ text: msg, at: new Date().toISOString() });
    if (__state.log.length > 50) __state.log.length = 50;
}

function findCombatant(name) {
    return __state.combatants.find((c) => c.name.toLowerCase() === String(name || "").toLowerCase());
}

function init_combat(payload) {
    ensureState();
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    __state.combatants = [];
    __state.currentIndex = 0;
    __state.round = 1;
    __state.log = [];
    (data.combatants || []).forEach((c) => {
        __state.combatants.push({
            name: c.name || "Combatant",
            initiative: Number(c.initiative) || 0,
            hp: Number(c.hp) || 0,
            maxHp: Number(c.maxHp) || Number(c.hp) || 0,
            status: c.status || "",
        });
    });
    sortByInitiative();
    log("Combat started.");
    return JSON.stringify(__state);
}

function add_combatant(payload) {
    ensureState();
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    const name = data.name || "Combatant";
    __state.combatants.push({
        name: name,
        initiative: Number(data.initiative) || 0,
        hp: Number(data.hp) || 0,
        maxHp: Number(data.maxHp) || Number(data.hp) || 0,
        status: data.status || "",
    });
    sortByInitiative();
    log("Added " + name + " (init " + (Number(data.initiative) || 0) + ").");
    return JSON.stringify(__state);
}

function remove_combatant(payload) {
    ensureState();
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    const idx = __state.combatants.findIndex(
        (c) => c.name.toLowerCase() === String(data.name || "").toLowerCase()
    );
    if (idx >= 0) {
        const removed = __state.combatants.splice(idx, 1)[0];
        log("Removed " + removed.name + ".");
        if (__state.currentIndex >= __state.combatants.length && __state.combatants.length > 0) {
            __state.currentIndex = 0;
        }
    }
    return JSON.stringify(__state);
}

function next_turn(payload) {
    ensureState();
    if (__state.combatants.length === 0) return JSON.stringify(__state);
    __state.currentIndex = (__state.currentIndex + 1) % __state.combatants.length;
    if (__state.currentIndex === 0) {
        __state.round = (__state.round || 1) + 1;
        log("Round " + __state.round + " begins.");
    }
    const current = __state.combatants[__state.currentIndex];
    log("Turn: " + current.name);
    return JSON.stringify(__state);
}

function prev_turn(payload) {
    ensureState();
    if (__state.combatants.length === 0) return JSON.stringify(__state);
    __state.currentIndex = (__state.currentIndex - 1 + __state.combatants.length) % __state.combatants.length;
    const current = __state.combatants[__state.currentIndex];
    log("Turn: " + current.name);
    return JSON.stringify(__state);
}

function damage_combatant(payload) {
    ensureState();
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    const c = findCombatant(data.name);
    if (c) {
        const amount = Number(data.amount) || 0;
        c.hp = Math.max(0, (Number(c.hp) || 0) - amount);
        log(c.name + " took " + amount + " damage (HP " + c.hp + ").");
    }
    return JSON.stringify(__state);
}

function heal_combatant(payload) {
    ensureState();
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    const c = findCombatant(data.name);
    if (c) {
        const amount = Number(data.amount) || 0;
        c.hp = Math.min(Number(c.maxHp) || Number(c.hp) || 0, (Number(c.hp) || 0) + amount);
        log(c.name + " healed " + amount + " (HP " + c.hp + ").");
    }
    return JSON.stringify(__state);
}

function set_status(payload) {
    ensureState();
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    const c = findCombatant(data.name);
    if (c) {
        c.status = data.status || "";
        log(c.name + " status: " + (c.status || "none") + ".");
    }
    return JSON.stringify(__state);
}

function get_combat_state(payload) {
    ensureState();
    return JSON.stringify(__state);
}
