// NPC Generator plugin
//
// Demonstrates a plugin `ui` panel: the manifest declares fields (faction,
// tone) and an action (`generate`) whose hook returns a `table` result that the
// host renders. This plugin never touches the DOM — the panel is declarative
// data, and the result is a plain JSON object.

// Name pools keyed by tone. Deterministic — no network, no AI provider.
const NAME_POOLS = {
    grim: ["Vex", "Mara", "Corvus", "Ash", "Sable"],
    heroic: ["Ser Aldric", "Lianna", "Kael", "Rowan", "Isolde"],
    comic: ["Barnaby Fizz", "Wanda Wobble", "Pip", "Dizzy Dan", "Muffin"],
};

const ROLES = ["Captain", "Scout", "Loremaster", "Quartermaster", "Enforcer"];

function generate_npc(payload) {
    let data = {};
    try {
        data = JSON.parse(payload);
    } catch (e) {
        data = {};
    }
    const faction = data.faction || "Unknown";
    const tone = data.tone || "grim";
    const names = NAME_POOLS[tone] || NAME_POOLS.grim;

    const rows = names.map(function (name, i) {
        return [name, ROLES[i % ROLES.length], faction];
    });

    return JSON.stringify({
        type: "table",
        columns: ["Name", "Role", "Faction"],
        rows: rows,
    });
}
