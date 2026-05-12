// storage.js — State persistence + analytics/recommendation data layer
import { STORAGE_KEYS } from './config.js';

const DEFAULT_STATE = {
  lastTrackId: null,
  currentTime: 0,
  volume: 0.75,
  theme: 'zen-dark',
  shuffleMode: false,
  repeatMode: 'none', // none | one | all
  expandMode: false,
  selectedMood: 'All',
  favorites: [],
  lowPowerMode: false,
  // Playlist context persistence
  activePlaylistId: null,
  activeQueueIds: null,     // serialized active queue (track id array)
  currentQueueIndex: 0,
};

let _state = { ...DEFAULT_STATE };

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      _state = { ...DEFAULT_STATE, ...parsed };
    }
  } catch (e) {
    console.warn('State load failed, using defaults.');
  }
  return { ..._state };
}

export function saveState(partial) {
  _state = { ..._state, ...partial };
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(_state));
  } catch (e) {
    console.warn('State save failed.');
  }
}

export function getState() {
  return { ..._state };
}

export function getPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePlaylists(playlists) {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
  } catch (e) { console.warn('Playlist save failed.'); }
}

export function getFavorites() {
  return _state.favorites || [];
}

export function toggleFavorite(trackId) {
  const favs = [...(getFavorites())];
  const idx = favs.indexOf(trackId);
  if (idx === -1) favs.push(trackId);
  else favs.splice(idx, 1);
  saveState({ favorites: favs });
  return favs;
}

export function isFavorite(trackId) {
  return getFavorites().includes(trackId);
}

// ── Analytics / Recommendation data ──────────────────────────────────────────
const ANALYTICS_KEY = 'dhyaan_analytics';

const DEFAULT_ANALYTICS = {
  plays: {},          // trackId → { count, totalTime, completions, skips, lastPlayed }
  sessions: [],       // [{ start, duration, trackIds }] — last 30
  hourlyPattern: {},  // "hour:trackId" → count
};

let _analytics = { ...DEFAULT_ANALYTICS };

export function loadAnalytics() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _analytics = { ...DEFAULT_ANALYTICS, ...parsed };
    }
  } catch (e) { /* silently fallback */ }
  return _analytics;
}

function saveAnalytics() {
  try {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(_analytics));
  } catch (e) { /* storage full — silently skip */ }
}

export function getAnalytics() {
  return _analytics;
}

// Called when a track starts playing
export function recordPlay(trackId) {
  if (!trackId) return;
  const hour = new Date().getHours();

  if (!_analytics.plays[trackId]) {
    _analytics.plays[trackId] = { count: 0, totalTime: 0, completions: 0, skips: 0, lastPlayed: null };
  }
  _analytics.plays[trackId].count++;
  _analytics.plays[trackId].lastPlayed = Date.now();

  // hourly pattern
  const key = `${hour}:${trackId}`;
  _analytics.hourlyPattern[key] = (_analytics.hourlyPattern[key] || 0) + 1;

  saveAnalytics();
}

// Called periodically while playing — accumulated listen time
export function recordListenTime(trackId, seconds) {
  if (!trackId || seconds <= 0) return;
  if (!_analytics.plays[trackId]) return;
  _analytics.plays[trackId].totalTime = (_analytics.plays[trackId].totalTime || 0) + seconds;
  // Don't save every tick — caller batches this
}

export function flushListenTime() {
  saveAnalytics();
}

// Called when track finishes (completion > 80%)
export function recordCompletion(trackId) {
  if (!trackId || !_analytics.plays[trackId]) return;
  _analytics.plays[trackId].completions++;
  saveAnalytics();
}

// Called when user skips early
export function recordSkip(trackId) {
  if (!trackId) return;
  if (!_analytics.plays[trackId]) {
    _analytics.plays[trackId] = { count: 0, totalTime: 0, completions: 0, skips: 0, lastPlayed: null };
  }
  _analytics.plays[trackId].skips++;
  saveAnalytics();
}

// Get sorted play data
export function getTopTracks(limit = 10) {
  const entries = Object.entries(_analytics.plays);
  return entries
    .sort((a, b) => (b[1].count - b[1].skips) - (a[1].count - a[1].skips))
    .slice(0, limit)
    .map(([id, data]) => ({ id, ...data }));
}

export function getRecentTracks(limit = 10) {
  const entries = Object.entries(_analytics.plays)
    .filter(([, d]) => d.lastPlayed)
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, limit);
  return entries.map(([id, data]) => ({ id, ...data }));
}

// Get preferred track IDs for a given hour
export function getHourlyPreferred(hour, limit = 5) {
  const prefix = `${hour}:`;
  return Object.entries(_analytics.hourlyPattern)
    .filter(([k]) => k.startsWith(prefix))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k.slice(prefix.length));
}
