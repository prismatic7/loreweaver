// Encounter Builder plugin
// System-agnostic encounter composer. Hooks:
//   - build_encounter(payload) -> { name, partyLevels:[], adversaries:[{name,cr,count}] }
//       returns { encounter, difficulty, totalCR, combatants:[{name,initiative,hp,maxHp}] }
//   - rate_encounter(payload)  -> { partyLevels:[], adversaries_cr:[] } returns difficulty verdict

function rateEncounter(partyLevels, crs) {
    let totalPartyLevel = partyLevels.reduce((a, b) => a + b, 0);
    let avgPartyLevel = totalPartyLevel / (partyLevels.length || 1);
    let totalAdversaryCR = crs.reduce((a, b) => a + b, 0);
    let ratio = totalAdversaryCR / (avgPartyLevel || 1);

    let difficulty = "Medium";
    if (ratio < 0.25) difficulty = "Easy (Trivial)";
    else if (ratio < 0.5) difficulty = "Medium (Fair)";
    else if (ratio <= 1.0) difficulty = "Hard (Challenging)";
    else difficulty = "Deadly (Tense)";

    return { avgPartyLevel, totalCR: totalAdversaryCR, difficulty, ratio };
}

function build_encounter(payload) {
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }

    let partyLevels = data.partyLevels || [3, 3, 3, 3];
    let adversaries = data.adversaries || [{ name: "Goblin", cr: 1, count: 2 }];

    let crs = [];
    let combatants = [];
    adversaries.forEach((adv) => {
        let count = Number(adv.count) || 1;
        for (let i = 0; i < count; i++) {
            crs.push(Number(adv.cr) || 0);
            combatants.push({
                name: (adv.name || "Adversary") + (count > 1 ? " " + (i + 1) : ""),
                initiative: Math.floor(Math.random() * 20) + 1,
                hp: Number(adv.hp) || 10,
                maxHp: Number(adv.hp) || 10,
                status: "",
            });
        }
    });

    let rating = rateEncounter(partyLevels, crs);

    return JSON.stringify({
        name: data.name || "Unnamed Encounter",
        difficulty: rating.difficulty,
        totalCR: rating.totalCR,
        avgPartyLevel: rating.avgPartyLevel,
        combatants: combatants,
        verdict: "A party of " + partyLevels.length + " (avg level " + rating.avgPartyLevel.toFixed(1) +
            ") facing CR " + rating.totalCR + " will find this encounter " + rating.difficulty + ".",
    });
}

function rate_encounter(payload) {
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { data = {}; }
    let partyLevels = data.partyLevels || [3, 3, 3, 3];
    let crs = data.adversaries_cr || [1, 2];
    let rating = rateEncounter(partyLevels, crs);
    return JSON.stringify({
        avgPartyLevel: rating.avgPartyLevel,
        totalCR: rating.totalCR,
        difficulty: rating.difficulty,
        verdict: "A party of " + partyLevels.length + " (avg level " + rating.avgPartyLevel.toFixed(1) +
            ") facing CR " + rating.totalCR + " will find this encounter " + rating.difficulty + ".",
    });
}
