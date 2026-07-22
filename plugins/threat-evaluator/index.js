function evaluate_encounter(payload) {
    let data = {};
    try {
        data = JSON.parse(payload);
    } catch (e) {
        data = {};
    }

    let party = data.party_levels || [3, 3, 3, 3];
    let crs = data.adversaries_cr || [1, 2];

    let totalPartyLevel = party.reduce((a, b) => a + b, 0);
    let avgPartyLevel = totalPartyLevel / party.length;

    let totalAdversaryCR = crs.reduce((a, b) => a + b, 0);

    // Simple rating heuristic:
    // If sum CR < avgPartyLevel / 4 -> Easy
    // If sum CR < avgPartyLevel / 2 -> Medium
    // If sum CR <= avgPartyLevel -> Challenging
    // If sum CR > avgPartyLevel -> Deadly
    let difficulty = "Medium";
    let ratio = totalAdversaryCR / avgPartyLevel;

    if (ratio < 0.25) {
        difficulty = "Easy (Trivial)";
    } else if (ratio < 0.5) {
        difficulty = "Medium (Fair)";
    } else if (ratio <= 1.0) {
        difficulty = "Hard (Challenging)";
    } else {
        difficulty = "Deadly (Tense)";
    }

    return JSON.stringify({
        avgPartyLevel: avgPartyLevel,
        totalCR: totalAdversaryCR,
        difficulty: difficulty,
        verdict: `A party of ${party.length} players (average level ${avgPartyLevel}) facing a CR total of ${totalAdversaryCR} will find this encounter ${difficulty}.`
    });
}
