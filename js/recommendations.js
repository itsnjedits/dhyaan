// recommendations.js — Local intelligent recommendation engine
import { CONFIG } from './config.js';
import { getAnalytics, getTopTracks, getRecentTracks, getHourlyPreferred } from './storage.js';

/**
 * Build a ranked list of recommended track objects.
 * Combines: most-played, recently-played, time-of-day patterns, discovery.
 */
export function getRecommendations(allTracks, currentTrackId = null, limit = CONFIG.RECO.MAX_RECOMMENDATIONS) {
  const hour = new Date().getHours();
  const analytics = getAnalytics();
  const hasData = Object.keys(analytics.plays).length > 0;

  if (!hasData) {
    // Cold start — return random selection
    return _shuffle([...allTracks])
      .filter(t => t.id !== currentTrackId)
      .slice(0, limit);
  }

  const topIds = new Set(getTopTracks(20).map(t => t.id));
  const recentIds = new Set(getRecentTracks(15).map(t => t.id));
  const hourlyIds = new Set(getHourlyPreferred(hour, 8));

  // Score each track
  const scored = allTracks
    .filter(t => t.id !== currentTrackId)
    .map(t => {
      let score = 0;
      const playData = analytics.plays[t.id];

      if (topIds.has(t.id)) score += CONFIG.RECO.TOP_WEIGHT * 100;
      if (recentIds.has(t.id)) score += CONFIG.RECO.RECENT_WEIGHT * 100;
      if (hourlyIds.has(t.id)) score += CONFIG.RECO.HOURLY_WEIGHT * 100;

      // Penalize skipped tracks
      if (playData && playData.skips > 0 && playData.count > 0) {
        const skipRatio = playData.skips / playData.count;
        score -= skipRatio * 30;
      }

      // Boost tracks completed multiple times
      if (playData && playData.completions > 1) {
        score += Math.min(20, playData.completions * 5);
      }

      // Discovery bonus for unheard tracks
      const isUnheard = !playData || playData.count === 0;
      if (isUnheard) score += CONFIG.RECO.DISCOVERY_WEIGHT * 100;

      // Small random jitter to prevent identical orderings
      score += Math.random() * 8;

      return { track: t, score, isUnheard };
    });

  scored.sort((a, b) => b.score - a.score);

  // Ensure some discovery tracks are included
  const discoveryCount = Math.max(1, Math.floor(limit * CONFIG.RECO.DISCOVERY_RATIO));
  const knownTracks = scored.filter(s => !s.isUnheard).slice(0, limit - discoveryCount);
  const discoveryTracks = scored.filter(s => s.isUnheard).slice(0, discoveryCount);

  return [...knownTracks, ...discoveryTracks]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.track);
}

/**
 * Get a human-readable context label for expand mode recommendations.
 * e.g. "Night Silence · For You", "Morning Focus · Suggested"
 */
export function getRecommendationLabel() {
  const hour = new Date().getHours();
  const analytics = getAnalytics();
  const hasData = Object.keys(analytics.plays).length >= 3;

  let timeLabel = '';
  if (hour >= 4 && hour < 9) timeLabel = 'Morning ·';
  else if (hour >= 9 && hour < 12) timeLabel = 'Midday ·';
  else if (hour >= 12 && hour < 17) timeLabel = 'Afternoon ·';
  else if (hour >= 17 && hour < 21) timeLabel = 'Evening ·';
  else timeLabel = 'Night ·';

  return hasData ? `${timeLabel} For You` : `${timeLabel} Discover`;
}

/**
 * Get "continue your journey" label based on incomplete tracks.
 */
export function getContinueJourneyTracks(allTracks, limit = 4) {
  const analytics = getAnalytics();
  // Tracks played but completion ratio < 0.5
  return allTracks
    .filter(t => {
      const d = analytics.plays[t.id];
      if (!d || !d.count) return false;
      return d.completions / d.count < 0.5;
    })
    .sort((a, b) => {
      const da = analytics.plays[a.id];
      const db = analytics.plays[b.id];
      return (db.lastPlayed || 0) - (da.lastPlayed || 0);
    })
    .slice(0, limit);
}

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
