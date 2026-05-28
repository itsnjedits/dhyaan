// search.js — Fuzzy search (Levenshtein + phonetic normalization, no deps)

// Phonetic normalization: collapse common sound-alike substitutions
function phonetize(s) {
  return s
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/ck|k/g, 'c')
    .replace(/[aeiou]+/g, 'a') // vowel collapsing
    .replace(/(.)\1+/g, '$1')  // deduplicate consecutive chars
    .replace(/[^a-z0-9 ]/g, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
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
  if (!query) return 0;

  // Exact substring → best score
  if (target.includes(query)) return 0;

  // Phonetic match
  if (phonetize(target).includes(phonetize(query))) return 0.5;

  // Word-level Levenshtein with sliding window
  const words = query.split(/\s+/).filter(w => w.length >= 2);
  let minDist = Infinity;
  for (const word of words) {
    const pWord = phonetize(word);
    // Sliding window over target — check both original and phonetic
    for (let i = 0; i <= target.length - word.length + 2; i++) {
      const slice = target.slice(i, i + word.length + 2);
      const d1 = levenshtein(word, slice);
      const d2 = levenshtein(pWord, phonetize(slice));
      const d = Math.min(d1, d2);
      if (d < minDist) minDist = d;
    }
  }

  // Also check full query vs full target for short queries
  if (query.length <= 6) {
    const full = levenshtein(query, target.slice(0, query.length + 3));
    minDist = Math.min(minDist, full);
  }

  return minDist;
}

export function searchTracks(tracks, query) {
  if (!query || query.trim().length < 1) return tracks;

  const scored = tracks.map(track => {
    const titleScore = fuzzyScore(query, track.title);
    const moodScore = (track.moods || []).length
      ? Math.min(...(track.moods).map(m => fuzzyScore(query, m)))
      : Infinity;
    const best = Math.min(titleScore, moodScore);
    return { track, score: best };
  });

  return scored
    .filter(s => s.score <= 3)
    .sort((a, b) => a.score - b.score)
    .map(s => s.track);
}
