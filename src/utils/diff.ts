/**
 * A dependency-free line-level diff for the co-writer review UI.
 *
 * `diffLines` computes the longest-common-subsequence between two texts and
 * returns contiguous change hunks. `applyHunks` rebuilds a text from the left
 * side while accepting a chosen subset of hunks — rejecting a hunk leaves the
 * original lines untouched.
 */

export interface DiffHunk {
  /** Index into `left` where the hunk starts. */
  leftStart: number;
  /** Lines removed from the left (empty for a pure insertion). */
  leftLines: string[];
  /** Index into `right` where the hunk starts. */
  rightStart: number;
  /** Lines added on the right (empty for a pure deletion). */
  rightLines: string[];
}

export interface DiffResult {
  left: string[];
  right: string[];
  hunks: DiffHunk[];
}

export function diffLines(leftText: string, rightText: string): DiffResult {
  const left = leftText.split("\n");
  const right = rightText.split("\n");
  const n = left.length;
  const m = right.length;

  // LCS length table, filled from the end so dp[i][j] is the LCS of the suffixes.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        left[i] === right[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let i = 0;
  let j = 0;

  const flush = () => {
    if (current) {
      hunks.push(current);
      current = null;
    }
  };
  const open = () => {
    if (!current) {
      current = { leftStart: i, leftLines: [], rightStart: j, rightLines: [] };
    }
    return current;
  };

  while (i < n && j < m) {
    if (left[i] === right[j]) {
      flush();
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      open().leftLines.push(left[i]);
      i++;
    } else {
      open().rightLines.push(right[j]);
      j++;
    }
  }
  while (i < n) {
    open().leftLines.push(left[i]);
    i++;
  }
  while (j < m) {
    open().rightLines.push(right[j]);
    j++;
  }
  flush();

  return { left, right, hunks };
}

/**
 * Rebuilds a text from the left side, applying only the accepted hunks.
 * Hunks are applied back-to-front so earlier indices stay valid.
 *
 * @param hunks         The hunks from `diffLines`.
 * @param accepted      Indices into `hunks` that should be applied.
 * @param leftText      The original text.
 */
export function applyHunks(
  leftText: string,
  hunks: DiffHunk[],
  accepted: Set<number>,
): string {
  const lines = leftText.split("\n");
  const ordered = hunks
    .map((hunk, index) => ({ hunk, index }))
    .filter(({ index }) => accepted.has(index))
    .sort((a, b) => b.hunk.leftStart - a.hunk.leftStart);

  for (const { hunk } of ordered) {
    lines.splice(hunk.leftStart, hunk.leftLines.length, ...hunk.rightLines);
  }
  return lines.join("\n");
}
