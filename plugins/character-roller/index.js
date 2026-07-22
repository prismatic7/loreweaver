function roll_ability_score() {
    let rolls = [];
    for (let i = 0; i < 4; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
    }
    // Sort descending
    rolls.sort((a, b) => b - a);
    // Sum top 3 rolls
    return rolls[0] + rolls[1] + rolls[2];
}

function generate_character(payload) {
    let input = {};
    try {
        input = JSON.parse(payload);
    } catch (e) {
        input = {};
    }

    let stats = {
        STR: roll_ability_score(),
        DEX: roll_ability_score(),
        CON: roll_ability_score(),
        INT: roll_ability_score(),
        WIS: roll_ability_score(),
        CHA: roll_ability_score()
    };
    
    let get_mod = (val) => {
        let mod = Math.floor((val - 10) / 2);
        return mod >= 0 ? "+" + mod : "" + mod;
    };
    
    let mdSheet = `---
type: Character
class: ${input.class || "Fighter"}
level: 1
hp: ${10 + Math.floor((stats.CON - 10) / 2)}
---
# ${input.name || "Adventurer"}

*Generated via Standard Ability Roller plugin*

## Attributes
- **Strength (STR)**: ${stats.STR} (${get_mod(stats.STR)})
- **Dexterity (DEX)**: ${stats.DEX} (${get_mod(stats.DEX)})
- **Constitution (CON)**: ${stats.CON} (${get_mod(stats.CON)})
- **Intelligence (INT)**: ${stats.INT} (${get_mod(stats.INT)})
- **Wisdom (WIS)**: ${stats.WIS} (${get_mod(stats.WIS)})
- **Charisma (CHA)**: ${stats.CHA} (${get_mod(stats.CHA)})

## Inventory
- Shortsword
- Leather Armor
- Explorer's Pack
`;

    return JSON.stringify({ sheet: mdSheet, stats: stats });
}
