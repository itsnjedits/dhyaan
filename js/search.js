// search.js — Fuzzy search (Levenshtein-based, no external deps)

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyScore(query, target) {
  query = query.toLowerCase().trim();
  target = target.toLowerCase().trim();
  if (!query) return 1;
  if (target.includes(query)) return 0; // exact substring = best score
  const words = query.split(' ');
  let minDist = Infinity;
  for (const word of words) {
    if (word.length < 2) continue;
    // sliding window over target
    for (let i = 0; i <= target.length - word.length + 2; i++) {
      const slice = target.slice(i, i + word.length + 2);
      const d = levenshtein(word, slice);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

export function searchTracks(tracks, query) {
  if (!query || query.trim().length < 1) return tracks;

  const scored = tracks.map(track => {
    const titleScore = fuzzyScore(query, track.title);
    const moodScore = Math.min(...(track.moods || []).map(m => fuzzyScore(query, m)));
    const best = Math.min(titleScore, moodScore);
    return { track, score: best };
  });

  return scored
    .filter(s => s.score <= 3)
    .sort((a, b) => a.score - b.score)
    .map(s => s.track);
}
