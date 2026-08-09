export const fallbackRoll = (notation: string): string => {
  try {
    const str = notation.toLowerCase().replace(/\s+/g, "");
    const termRegex = /([+-]?)(?:(\d*)d(\d+|%|f)|(\d+))/g;
    let match;
    let total = 0;
    const explanation: string[] = [];

    while ((match = termRegex.exec(str)) !== null) {
      const sign = match[1] === "-" ? -1 : 1;
      const signText = match[1] || (explanation.length > 0 ? "+" : "");

      if (match[4]) {
        const val = parseInt(match[4], 10);
        total += sign * val;
        explanation.push(signText + val);
      } else {
        const count = match[2] ? parseInt(match[2], 10) : 1;
        const sidesStr = match[3];
        const sides =
          sidesStr === "%"
            ? 100
            : sidesStr === "f"
              ? "f"
              : parseInt(sidesStr, 10);

        const termRolls: number[] = [];
        let termTotal = 0;
        for (let i = 0; i < count; i++) {
          let rollVal;
          if (sides === "f") {
            rollVal = Math.floor(Math.random() * 3) - 1;
          } else {
            rollVal = Math.floor(Math.random() * (sides as number)) + 1;
          }
          termRolls.push(rollVal);
          termTotal += rollVal;
        }

        total += sign * termTotal;
        explanation.push(signText + count + "d" + sidesStr + "[" + termRolls.join(",") + "]");
      }
    }

    if (explanation.length === 0) return `Invalid notation: ${notation}`;
    return `${notation}: ${explanation.join(" ")} = ${total}`;
  } catch (e) {
    return `Error rolling ${notation}`;
  }
};
