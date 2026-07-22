// Sample Loreweaver Plugin Script (Boa JS Compatible)
function roll_d20(payload) {
    var modifier = parseInt(payload) || 0;
    var roll = Math.floor(Math.random() * 20) + 1;
    var total = roll + modifier;
    
    // Save roll history in persistent state
    if (!globalThis.__state.rolls) {
        globalThis.__state.rolls = [];
    }
    globalThis.__state.rolls.push(total);
    
    return JSON.stringify({
        roll: roll,
        modifier: modifier,
        total: total,
        historyCount: globalThis.__state.rolls.length
    });
}
