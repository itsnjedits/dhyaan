// dhyaan.js — Dhyaan Meditation App — Single-File Master Script v4
// All modules merged into one. Module scope prevents global pollution.
// Strict mode: implicit (type="module"). No imports, no exports.

/* ═══════════════════════════════════════════════════════════════════════════
   01. CONFIGURATION & CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  DATA_URL: './data/meditation.json',
  FALLBACK_IMAGE: './assets/fallback.jpg',
  THEMES: [
    'zen-dark', 'night-blue', 'cosmic-purple', 'forest-calm',
    'spiritual-green', 'sunset-gold', 'rose-pink', 'moonlight',
  ],
  MOODS: [
    'All', 'Buddha', 'Zen', 'Shiva', 'Rain', 'Sufi', 'Solitude',
    'Night', 'Healing', '3AM', 'Meditation', 'Focus', 'Flow', 'Morning',
  ],
  MOOD_ICONS: {
    'All': '∞', 'Buddha': '☸', 'Zen': '○', 'Shiva': '⊕', 'Rain': '☂',
    'Sufi': '🕊', 'Solitude': '◌', 'Night': '☽', 'Healing': '✦', '3AM': '◉',
    'Meditation': '◎', 'Focus': '◈', 'Flow': '≋', 'Morning': '☀',
  },
  PARTICLE_COUNT: { normal: 55, low: 20, expand: 80 },
  SEEK_SECONDS: 10,
  RECO: {
    TOP_WEIGHT: 0.35,
    RECENT_WEIGHT: 0.25,
    HOURLY_WEIGHT: 0.25,
    DISCOVERY_WEIGHT: 0.15,
    MAX_RECOMMENDATIONS: 8,
    DISCOVERY_RATIO: 0.2,
  },
};

const STORAGE_KEYS = {
  STATE: 'dhyaan_state',
  PLAYLISTS: 'dhyaan_playlists',
};

// Theme background colours — used to update <meta name="theme-color">
const THEME_COLORS = {
  'zen-dark':       '#0a0f0d',
  'night-blue':     '#080b14',
  'cosmic-purple':  '#0a080f',
  'forest-calm':    '#050e08',
  'spiritual-green':'#080e0a',
  'sunset-gold':    '#0f0b04',
  'rose-pink':      '#0f080d',
  'moonlight':      '#08090c',
};

/* ═══════════════════════════════════════════════════════════════════════════
   02. STATE & STORAGE
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_STATE = {
  lastTrackId:      null,
  currentTime:      0,
  volume:           0.75,
  theme:            'zen-dark',
  shuffleMode:      false,
  repeatMode:       'none',   // none | one | all
  expandMode:       false,
  selectedMood:     'All',
  favorites:        [],
  lowPowerMode:     false,
  activePlaylistId: null,
  activeQueueIds:   null,
  currentQueueIndex:0,
};

let _state = { ...DEFAULT_STATE };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (raw) _state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    console.warn('[Dhyaan] State load failed, using defaults.');
  }
  return { ..._state };
}

function saveState(partial) {
  _state = { ..._state, ...partial };
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(_state));
  } catch {
    console.warn('[Dhyaan] State save failed.');
  }
}

function getState() { return { ..._state }; }

function getPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePlaylists(playlists) {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
  } catch {
    console.warn('[Dhyaan] Playlist save failed.');
  }
}

function getFavorites()          { return _state.favorites || []; }
function isFavorite(trackId)     { return getFavorites().includes(trackId); }

function toggleFavorite(trackId) {
  const favs = [...getFavorites()];
  const idx  = favs.indexOf(trackId);
  if (idx === -1) favs.push(trackId);
  else            favs.splice(idx, 1);
  saveState({ favorites: favs });
  return favs;
}

/* ═══════════════════════════════════════════════════════════════════════════
   03. ANALYTICS
   ═══════════════════════════════════════════════════════════════════════════ */

const ANALYTICS_KEY     = 'dhyaan_analytics';
const DEFAULT_ANALYTICS = { plays: {}, sessions: [], hourlyPattern: {} };
let _analytics = { ...DEFAULT_ANALYTICS };

function loadAnalytics() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    if (raw) _analytics = { ...DEFAULT_ANALYTICS, ...JSON.parse(raw) };
  } catch { /* silently fallback */ }
  return _analytics;
}

function _saveAnalytics() {
  try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(_analytics)); } catch {}
}

function getAnalytics() { return _analytics; }

function recordPlay(trackId) {
  if (!trackId) return;
  const hour = new Date().getHours();
  if (!_analytics.plays[trackId])
    _analytics.plays[trackId] = { count: 0, totalTime: 0, completions: 0, skips: 0, lastPlayed: null };
  _analytics.plays[trackId].count++;
  _analytics.plays[trackId].lastPlayed = Date.now();
  const key = `${hour}:${trackId}`;
  _analytics.hourlyPattern[key] = (_analytics.hourlyPattern[key] || 0) + 1;
  _saveAnalytics();
}

function recordListenTime(trackId, seconds) {
  if (!trackId || seconds <= 0 || !_analytics.plays[trackId]) return;
  _analytics.plays[trackId].totalTime = (_analytics.plays[trackId].totalTime || 0) + seconds;
  // Caller is responsible for flushing via flushListenTime()
}

function flushListenTime() { _saveAnalytics(); }

function recordCompletion(trackId) {
  if (!trackId || !_analytics.plays[trackId]) return;
  _analytics.plays[trackId].completions++;
  _saveAnalytics();
}

function recordSkip(trackId) {
  if (!trackId) return;
  if (!_analytics.plays[trackId])
    _analytics.plays[trackId] = { count: 0, totalTime: 0, completions: 0, skips: 0, lastPlayed: null };
  _analytics.plays[trackId].skips++;
  _saveAnalytics();
}

function getTopTracks(limit = 10) {
  return Object.entries(_analytics.plays)
    .sort((a, b) => (b[1].count - b[1].skips) - (a[1].count - a[1].skips))
    .slice(0, limit)
    .map(([id, data]) => ({ id, ...data }));
}

function getRecentTracks(limit = 10) {
  return Object.entries(_analytics.plays)
    .filter(([, d]) => d.lastPlayed)
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, limit)
    .map(([id, data]) => ({ id, ...data }));
}

function getHourlyPreferred(hour, limit = 5) {
  const prefix = `${hour}:`;
  return Object.entries(_analytics.hourlyPattern)
    .filter(([k]) => k.startsWith(prefix))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k.slice(prefix.length));
}

/* ═══════════════════════════════════════════════════════════════════════════
   04. UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ═══════════════════════════════════════════════════════════════════════════
   05. SVG ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

const ICONS = {
  play:        `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  pause:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  heart:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  plus:        `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  close:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  repeat:      `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
  repeatOne:   `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2v-5h-1l-2 1v1h1.5v3H13z"/></svg>`,
  back:        `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
   06. DOM CACHE
   Cached lazily on first access — eliminates repeated querySelector() calls
   on hot paths like updateProgress() which runs at ~4 Hz during playback.
   ═══════════════════════════════════════════════════════════════════════════ */

let _progressEls   = null;
let _nowPlayingEls = null;
let _playPauseEls  = null;

function _getProgressEls() {
  if (_progressEls) return _progressEls;
  return (_progressEls = {
    filled:   document.getElementById('progress-filled'),
    thumb:    document.getElementById('progress-thumb'),
    curr:     document.getElementById('current-time'),
    dur:      document.getElementById('duration'),
    bar:      document.getElementById('progress-bar'),
    expFill:  document.getElementById('expand-filled'),
    expThumb: document.getElementById('expand-thumb'),
    expCurr:  document.getElementById('expand-current'),
    expDur:   document.getElementById('expand-duration'),
    expBar:   document.getElementById('expand-progress-bar'),
  });
}

function _getNowPlayingEls() {
  if (_nowPlayingEls) return _nowPlayingEls;
  return (_nowPlayingEls = {
    title:       document.getElementById('np-title'),
    moods:       document.getElementById('np-moods'),
    img:         document.getElementById('np-image'),
    expandImg:   document.getElementById('expand-image'),
    expandTitle: document.getElementById('expand-title'),
    expandMoods: document.getElementById('expand-moods'),
  });
}

function _getPlayPauseEls() {
  if (_playPauseEls) return _playPauseEls;
  return (_playPauseEls = {
    btn:       document.getElementById('play-pause-btn'),
    expandBtn: document.getElementById('expand-play-btn'),
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   07. LAZY IMAGE OBSERVER
   Single shared IntersectionObserver for all card images.
   Avoids the per-card observer leak: when listEl.innerHTML='' is called on
   re-render, detached IO instances were left alive holding references to
   orphaned img elements. One observer, unobserve per element, zero leaks.
   ═══════════════════════════════════════════════════════════════════════════ */

const _lazyImageObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target;
    _lazyImageObserver.unobserve(img);         // stop watching only this element
    const src = img.dataset.lazySrc;
    if (!src) continue;
    img.onload  = () => img.classList.add('loaded');
    img.onerror = () => img.removeAttribute('src');
    img.src = src;
    delete img.dataset.lazySrc;                // clean up data attribute
  }
}, { rootMargin: '200px' });

/* ═══════════════════════════════════════════════════════════════════════════
   08. SEARCH  (fuzzy: Levenshtein + phonetic normalisation, zero deps)
   ═══════════════════════════════════════════════════════════════════════════ */

function _phonetize(s) {
  return s.toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/ck|k/g, 'c')
    .replace(/[aeiou]+/g, 'a')
    .replace(/(.)\1+/g, '$1')
    .replace(/[^a-z0-9 ]/g, '');
}

function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function _fuzzyScore(query, target) {
  query  = query.toLowerCase().trim();
  target = target.toLowerCase().trim();
  if (!query)                                         return 0;
  if (target.includes(query))                         return 0;
  if (_phonetize(target).includes(_phonetize(query))) return 0.5;

  const words = query.split(/\s+/).filter(w => w.length >= 2);
  let minDist  = Infinity;
  for (const word of words) {
    const pw = _phonetize(word);
    for (let i = 0; i <= target.length - word.length + 2; i++) {
      const sl = target.slice(i, i + word.length + 2);
      minDist = Math.min(minDist, _levenshtein(word, sl), _levenshtein(pw, _phonetize(sl)));
    }
  }
  if (query.length <= 6)
    minDist = Math.min(minDist, _levenshtein(query, target.slice(0, query.length + 3)));
  return minDist;
}

function searchTracks(tracks, query) {
  if (!query || query.trim().length < 1) return tracks;
  return tracks
    .map(t => ({
      t,
      s: Math.min(
        _fuzzyScore(query, t.title),
        (t.moods || []).length
          ? Math.min(...t.moods.map(m => _fuzzyScore(query, m)))
          : Infinity
      ),
    }))
    .filter(x => x.s <= 3)
    .sort((a, b) => a.s - b.s)
    .map(x => x.t);
}

/* ═══════════════════════════════════════════════════════════════════════════
   09. EXPLORER
   ═══════════════════════════════════════════════════════════════════════════ */

let _allTracks = [];

function _filterByMood(mood) {
  if (!mood || mood === 'All') return [..._allTracks];
  return _allTracks.filter(t => (t.moods || []).includes(mood));
}

function _getRandomTrack(mood = null) {
  const pool = mood && mood !== 'All' ? _filterByMood(mood) : _allTracks;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. RECOMMENDATIONS  (local, no server)
   ═══════════════════════════════════════════════════════════════════════════ */

function _getRecommendations(currentTrackId = null, limit = CONFIG.RECO.MAX_RECOMMENDATIONS) {
  const hour      = new Date().getHours();
  const analytics = getAnalytics();
  const hasData   = Object.keys(analytics.plays).length > 0;

  // Cold start → random selection
  if (!hasData) {
    return _shuffleArray([..._allTracks])
      .filter(t => t.id !== currentTrackId)
      .slice(0, limit);
  }

  const topIds    = new Set(getTopTracks(20).map(t => t.id));
  const recentIds = new Set(getRecentTracks(15).map(t => t.id));
  const hourlyIds = new Set(getHourlyPreferred(hour, 8));

  const scored = _allTracks
    .filter(t => t.id !== currentTrackId)
    .map(t => {
      let score = 0;
      const pd  = analytics.plays[t.id];

      if (topIds.has(t.id))    score += CONFIG.RECO.TOP_WEIGHT    * 100;
      if (recentIds.has(t.id)) score += CONFIG.RECO.RECENT_WEIGHT * 100;
      if (hourlyIds.has(t.id)) score += CONFIG.RECO.HOURLY_WEIGHT * 100;

      if (pd && pd.skips > 0 && pd.count > 0) score -= (pd.skips / pd.count) * 30;
      if (pd && pd.completions > 1)           score += Math.min(20, pd.completions * 5);

      const isUnheard = !pd || pd.count === 0;
      if (isUnheard) score += CONFIG.RECO.DISCOVERY_WEIGHT * 100;

      score += Math.random() * 8; // small jitter prevents identical orderings
      return { track: t, score, isUnheard };
    });

  scored.sort((a, b) => b.score - a.score);

  const dc = Math.max(1, Math.floor(limit * CONFIG.RECO.DISCOVERY_RATIO));
  return [
    ...scored.filter(s => !s.isUnheard).slice(0, limit - dc),
    ...scored.filter(s =>  s.isUnheard).slice(0, dc),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.track);
}

function _getRecoLabel() {
  const hour    = new Date().getHours();
  const hasData = Object.keys(getAnalytics().plays).length >= 3;
  let tl = '';
  if      (hour >= 4  && hour < 9)  tl = 'Morning ·';
  else if (hour >= 9  && hour < 12) tl = 'Midday ·';
  else if (hour >= 12 && hour < 17) tl = 'Afternoon ·';
  else if (hour >= 17 && hour < 21) tl = 'Evening ·';
  else                               tl = 'Night ·';
  return hasData ? `${tl} For You` : `${tl} Discover`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. PLAYLIST MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

function _createPlaylist(name) {
  const pls = getPlaylists();
  const np  = {
    id: Date.now().toString(),
    name: name || 'New Playlist',
    trackIds: [],
    createdAt: new Date().toISOString(),
  };
  pls.push(np);
  savePlaylists(pls);
  return np;
}

function _renamePlaylist(id, newName) {
  const pls = getPlaylists();
  const pl  = pls.find(p => p.id === id);
  if (pl) { pl.name = newName; savePlaylists(pls); }
  return pls;
}

function _deletePlaylist(id) {
  const pls = getPlaylists().filter(p => p.id !== id);
  savePlaylists(pls);
  return pls;
}

function _addToPlaylist(playlistId, trackId) {
  const pls = getPlaylists();
  const pl  = pls.find(p => p.id === playlistId);
  if (pl && !pl.trackIds.includes(trackId)) { pl.trackIds.push(trackId); savePlaylists(pls); }
  return pls;
}

function _removeFromPlaylist(playlistId, trackId) {
  const pls = getPlaylists();
  const pl  = pls.find(p => p.id === playlistId);
  if (pl) { pl.trackIds = pl.trackIds.filter(id => id !== trackId); savePlaylists(pls); }
  return pls;
}

/* ═══════════════════════════════════════════════════════════════════════════
   12. VISUALIZER  (canvas particle system, RAF-leak-free, adaptive FPS)
   ═══════════════════════════════════════════════════════════════════════════ */

let _vizCanvas, _vizCtx;
let _particles       = [];
let _animFrame       = null;
let _vizRunning      = false;
let _vizExpandMode   = false;
let _vizLastTime     = 0;
let _glowPhase       = 0;
let _particleHue     = 140;
let _particleSat     = 65;
let _particleLit     = 72;
let _vizResizeTimer  = null;
let _vizFpsCap       = 50;
let _vizFrameMs      = 1000 / 50;

// Resolved once at module load; listened to for runtime OS changes
const _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// _lowPowerCached prevents per-frame getState() calls (which spread _state
// on every call, creating GC pressure at 30–50 Hz).
let _lowPowerCached = _reducedMotion.matches;

const _isMobileViz = () => window.innerWidth <= 768 || 'ontouchstart' in window;

// ── Particle class ─────────────────────────────────────────────────────────
class _Particle {
  constructor(w, h, expand, layer = 0) {
    this.layer = layer;
    this.reset(w, h, expand);
  }

  reset(w, h, expand) {
    this.x = Math.random() * w;
    this.y = Math.random() * h * 1.1;

    const baseR     = expand ? 3.0 : 1.8;
    const layerMult = [0.5, 1.0, 1.6][this.layer];
    this.r          = (Math.random() * baseR + 0.3) * layerMult;

    const baseAlpha  = [0.12, 0.28, 0.45][this.layer];
    this.targetAlpha = Math.random() * baseAlpha + baseAlpha * 0.3;
    this.alpha       = this.targetAlpha;

    const speed = [0.08, 0.16, 0.28][this.layer];
    this.vx     = (Math.random() - 0.5) * speed * 1.4;
    this.vy     = -(Math.random() * speed + 0.04);

    this.life        = Math.floor(Math.random() * 300);
    this.maxLife     = Math.random() * 500 + 300;
    this.hueOffset   = (Math.random() - 0.5) * 50;
    this.pulse       = Math.random() * Math.PI * 2;
    this.pulseSpeed  = 0.008 + Math.random() * 0.012;
    this.wobble      = Math.random() * Math.PI * 2;
    this.wobbleAmp   = (Math.random() * 0.4 + 0.1) * [0.5, 1, 1.5][this.layer];
  }

  update(w, h) {
    this.life++;
    this.pulse  += this.pulseSpeed;
    this.wobble += 0.01;
    this.x      += this.vx + Math.sin(this.wobble) * this.wobbleAmp;
    this.y      += this.vy;
    this.alpha   = Math.sin((this.life / this.maxLife) * Math.PI) * this.targetAlpha;
    if (
      this.life >= this.maxLife ||
      this.x < -20 || this.x > w + 20 ||
      this.y < -30 || this.y > h + 20
    ) this.reset(w, h, _vizExpandMode);
  }

  draw(ctx) {
    if (this.alpha <= 0.005) return;
    const hue  = ((_particleHue + this.hueOffset + 360) % 360);
    const sat  = Math.min(100, _particleSat + 10);
    const lit  = Math.min(95,  _particleLit  + 5);
    const pulR = this.r + Math.sin(this.pulse) * (this.r * 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    // Shadow only on layer 2 (~20% of particles) — cuts GPU shadow calls ~80%
    if (this.layer === 2) {
      ctx.shadowColor = `hsla(${hue},${sat}%,${lit}%,0.9)`;
      ctx.shadowBlur  = 12;
    } else {
      ctx.shadowBlur  = 0; // explicit reset — don't rely on save/restore alone
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, pulR, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,1)`;
    ctx.fill();
    ctx.restore();
  }
}

function _spawnParticles() {
  if (!_vizCanvas || _vizCanvas.width === 0 || _vizCanvas.height === 0) return;
  const mobile = _isMobileViz();
  const mult   = mobile ? 0.55 : 1;
  const total  = _lowPowerCached
    ? CONFIG.PARTICLE_COUNT.low
    : _vizExpandMode
    ? Math.floor(CONFIG.PARTICLE_COUNT.expand * mult)
    : Math.floor(CONFIG.PARTICLE_COUNT.normal * mult);

  const split = [0.4, 0.4, 0.2];
  _particles  = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = Math.floor(total * split[layer]);
    for (let i = 0; i < count; i++) {
      const p = new _Particle(_vizCanvas.width, _vizCanvas.height, _vizExpandMode, layer);
      p.life = Math.floor(Math.random() * p.maxLife); // stagger initial life
      _particles.push(p);
    }
  }
}

function _updateFpsCap() {
  _vizFpsCap  = (_lowPowerCached || _reducedMotion.matches) ? 20 : _isMobileViz() ? 30 : 50;
  _vizFrameMs = 1000 / _vizFpsCap;
}

function _vizLoop(now = performance.now()) {
  if (!_vizRunning) return;
  _animFrame = requestAnimationFrame(_vizLoop);

  const delta = now - _vizLastTime;
  if (delta < _vizFrameMs) return;
  _vizLastTime = now - (delta % _vizFrameMs);

  const w = _vizCanvas.width, h = _vizCanvas.height;
  if (!w || !h) return;

  _vizCtx.clearRect(0, 0, w, h);
  _glowPhase += 0.008;

  // ── Low-power path: simple dots, no gradients, no shadows ────────────────
  if (_lowPowerCached) {
    for (const p of _particles) {
      p.update(w, h);
      if (p.alpha <= 0.005) continue;
      _vizCtx.globalAlpha = p.alpha * 0.5;
      _vizCtx.shadowBlur  = 0;
      _vizCtx.beginPath();
      _vizCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      _vizCtx.fillStyle = `hsl(${_particleHue},${_particleSat}%,${_particleLit}%)`;
      _vizCtx.fill();
    }
    _vizCtx.globalAlpha = 1;
    return;
  }

  // ── Normal path ───────────────────────────────────────────────────────────

  // Ambient breathing gradient
  const breathe = Math.sin(_glowPhase) * 0.025 + 0.04;
  const g1      = _vizCtx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.75);
  g1.addColorStop(0, `hsla(${_particleHue},${_particleSat}%,${_particleLit}%,${breathe})`);
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  _vizCtx.fillStyle = g1;
  _vizCtx.fillRect(0, 0, w, h);

  // Secondary orb
  const b2 = Math.sin(_glowPhase * 0.6 + 1.5) * 0.02 + 0.025;
  const g2  = _vizCtx.createRadialGradient(w * 0.25, h * 0.35, 0, w * 0.25, h * 0.35, w * 0.4);
  g2.addColorStop(0, `hsla(${(_particleHue + 30) % 360},${_particleSat}%,${_particleLit}%,${b2})`);
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  _vizCtx.fillStyle = g2;
  _vizCtx.fillRect(0, 0, w, h);

  // Expand-mode light column
  if (_vizExpandMode) {
    const ra = Math.sin(_glowPhase * 0.4) * 0.015 + 0.02;
    _vizCtx.save();
    _vizCtx.globalAlpha = ra;
    const col = _vizCtx.createLinearGradient(w * 0.45, 0, w * 0.55, h);
    col.addColorStop(0,   `hsla(${_particleHue},${_particleSat}%,90%,0.8)`);
    col.addColorStop(0.5, `hsla(${_particleHue},${_particleSat}%,80%,0.3)`);
    col.addColorStop(1,   'rgba(0,0,0,0)');
    _vizCtx.fillStyle = col;
    _vizCtx.fillRect(w * 0.35, 0, w * 0.3, h);
    _vizCtx.restore();
  }

  // Particles: back (layer 0) → front (layer 2) for correct compositing
  const byLayer = [[], [], []];
  for (const p of _particles) byLayer[p.layer].push(p);
  for (let l = 0; l < 3; l++)
    for (const p of byLayer[l]) { p.update(w, h); p.draw(_vizCtx); }
}

function _initVisualizer(canvasEl) {
  _vizCanvas = canvasEl;
  _vizCtx    = _vizCanvas.getContext('2d', { alpha: true });
  _updateFpsCap();

  window.addEventListener('resize', () => {
    clearTimeout(_vizResizeTimer);
    _vizResizeTimer = setTimeout(() => { _updateFpsCap(); _vizResize(); }, 150);
  });

  _reducedMotion.addEventListener('change', () => {
    if (_reducedMotion.matches) _lowPowerCached = true;
    _updateFpsCap();
    _spawnParticles();
  });

  requestAnimationFrame(() => _vizResize());
}

function _setLowPowerMode(val) {
  _lowPowerCached = !!val || _reducedMotion.matches;
  _updateFpsCap();
  _spawnParticles();
}

function _vizResize() {
  if (!_vizCanvas) return;
  const w = _vizCanvas.offsetWidth  || window.innerWidth  || 800;
  const h = _vizCanvas.offsetHeight || window.innerHeight || 600;
  if (_vizCanvas.width === w && _vizCanvas.height === h) return;
  _vizCanvas.width  = w;
  _vizCanvas.height = h;
  _spawnParticles();
}

function _startVisualizer() {
  if (_vizRunning) return;
  _vizRunning  = true;
  _vizLastTime = performance.now();
  _vizLoop();
}

function _stopVisualizer() {
  _vizRunning = false;
  if (_animFrame !== null) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  if (_vizCtx && _vizCanvas) _vizCtx.clearRect(0, 0, _vizCanvas.width, _vizCanvas.height);
}

function _setVizExpandMode(val) {
  _vizExpandMode = !!val;
  _spawnParticles();
}

function _setParticleColor(hue, sat = 65, lit = 72) {
  _particleHue = hue;
  _particleSat = sat;
  _particleLit = lit;
}

/* ═══════════════════════════════════════════════════════════════════════════
   13. AUDIO ENGINE
   ═══════════════════════════════════════════════════════════════════════════ */

let _playerTracks  = [];
let _queue         = [];
let _queueIndex    = 0;
const _audio       = new Audio();
let _saveStateTmr  = null;
let _playStartTime = null;
let _lastFlushCt   = null;
let _isDragging    = false;

let _onTrackChange = () => {};
let _onProgress    = () => {};
let _onStateChange = () => {};

_audio.preload = 'none';

// Drag-state bridge (set by seek bars below)
document.addEventListener('dhyaan:drag-start', () => { _isDragging = true;  });
document.addEventListener('dhyaan:drag-end',   () => { _isDragging = false; });

function _initPlayer(tracks, callbacks = {}) {
  _playerTracks  = tracks;
  _onTrackChange = callbacks.onTrackChange || _onTrackChange;
  _onProgress    = callbacks.onProgress    || _onProgress;
  _onStateChange = callbacks.onStateChange || _onStateChange;

  const state   = getState();
  _audio.volume = state.volume ?? 0.75;

  // ── timeupdate — debounced save + progress feed + listen-time accum ──────
  _audio.addEventListener('timeupdate', () => {
    const track = _getCurrentTrack();
    if (!track) return;
    const ct  = _audio.currentTime;
    const dur = _audio.duration || 0;

    // Debounce currentTime persistence (5 s) — save immediately on pause/seek
    clearTimeout(_saveStateTmr);
    _saveStateTmr = setTimeout(() => saveState({ currentTime: ct }), 5000);

    if (!_isDragging) _onProgress(ct, dur);

    // Accumulate listen time; flush ~every 15 s
    if (_playStartTime != null) {
      const accum = ct - _playStartTime;
      if (accum > 0 && accum % 15 < 0.55) {
        // Actual elapsed since last flush — accurate across seeks
        const secs = _lastFlushCt != null ? Math.max(1, Math.round(ct - _lastFlushCt)) : 15;
        recordListenTime(track.id, secs);
        _lastFlushCt = ct;
        flushListenTime();
      }
    }
  });

  _audio.addEventListener('ended', () => {
    const track = _getCurrentTrack();
    if (track && _audio.duration > 0 && (_audio.currentTime / _audio.duration) * 100 >= 78)
      recordCompletion(track.id);
    clearTimeout(_saveStateTmr);
    flushListenTime();
    const { repeatMode } = getState();
    if (repeatMode === 'one') { _audio.currentTime = 0; _audio.play().catch(() => {}); }
    else _advanceQueue(1, true);
  });

  _audio.addEventListener('play', () => {
    _playStartTime = _audio.currentTime;
    _lastFlushCt   = null;
    _onStateChange('play');
  });

  // Reset flush baseline on seek so accum is always positive
  _audio.addEventListener('seeked', () => {
    _playStartTime = _audio.currentTime;
    _lastFlushCt   = null;
  });

  _audio.addEventListener('pause', () => {
    clearTimeout(_saveStateTmr);
    saveState({ currentTime: _audio.currentTime });
    flushListenTime();
    _onStateChange('pause');
  });

  _audio.addEventListener('playing',        () => _onStateChange('play'));
  _audio.addEventListener('waiting',        () => _onStateChange('buffering'));
  _audio.addEventListener('loadstart',      () => _onStateChange('buffering'));
  _audio.addEventListener('canplay',        () => _onStateChange('ready'));
  _audio.addEventListener('canplaythrough', () => _onStateChange('ready'));
  _audio.addEventListener('stalled',        () => _onStateChange('buffering'));
  _audio.addEventListener('error',          () => _onStateChange('error'));

  // ── Seek via custom event (dispatched by seek-bar handler below) ──────────
  document.addEventListener('dhyaan:seek', (e) => {
    const dur = _audio.duration;
    if (dur && isFinite(dur)) {
      const t = Math.max(0, Math.min(dur, e.detail.pct * dur));
      _audio.currentTime = t;
      clearTimeout(_saveStateTmr);
      if (!_isDragging) _onProgress(t, dur);
    }
  });

  // ── Persist position on page unload ──────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    clearTimeout(_saveStateTmr);
    saveState({ currentTime: _audio.currentTime });
    flushListenTime();
  });

  // ── Restore previous session ──────────────────────────────────────────────
  if (state.lastTrackId != null) {
    const idx = _playerTracks.findIndex(t => t.id === state.lastTrackId);
    if (idx !== -1) {
      _queue      = _playerTracks;
      _queueIndex = idx;
      _audio.src  = _playerTracks[idx].audio_url;
      _audio.currentTime = state.currentTime || 0;
      _onTrackChange(_playerTracks[idx], idx);
    }
  }
}

// ── Queue management ─────────────────────────────────────────────────────────

function _setQueue(tracks, startIndex = 0, autoplay = false) {
  _queue      = tracks;
  _queueIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
  const track = _queue[_queueIndex];
  if (!track) return;
  _audio.pause();
  _audio.src = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;
  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);
  if (autoplay) _audio.play().catch(() => {});
}

function _setAllTracksQueue() { _queue = _playerTracks; }

function _loadTrack(index, autoplay = false) {
  if (index < 0 || index >= _playerTracks.length) return;
  _queue      = _playerTracks;
  _queueIndex = index;
  const track = _playerTracks[index];
  _audio.pause();
  _audio.src = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;
  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);
  if (autoplay) _audio.play().catch(() => {});
}

function _loadQueueIndex(index, autoplay = false) {
  if (index < 0 || index >= _queue.length) return;
  _queueIndex = index;
  const track = _queue[_queueIndex];
  _audio.pause();
  _audio.src = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;
  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);
  if (autoplay) _audio.play().catch(() => {});
}

// Empty-queue guard prevents infinite loop in shuffle mode
function _advanceQueue(direction, autoplay = false) {
  if (!_queue.length) return;
  const { shuffleMode } = getState();
  let next;
  if (shuffleMode) {
    do { next = Math.floor(Math.random() * _queue.length); }
    while (_queue.length > 1 && next === _queueIndex);
  } else {
    next = (_queueIndex + direction + _queue.length) % _queue.length;
  }
  _loadQueueIndex(next, autoplay);
}

function _nextTrack() {
  const t = _getCurrentTrack();
  if (t && _audio.currentTime < 5) recordSkip(t.id);
  _advanceQueue(1, true);
}

function _prevTrack() {
  if (_audio.currentTime > 3) { _audio.currentTime = 0; return; }
  _advanceQueue(-1, true);
}

// ── Playback controls ─────────────────────────────────────────────────────────

function _play()         { return _audio.play().catch(() => {}); }
function _pause()        { _audio.pause(); }
function _togglePlay()   { return _audio.paused ? _play() : (_pause(), Promise.resolve()); }
function _isPlaying()    { return !_audio.paused && !_audio.ended && _audio.readyState > 2; }
function _seekBy(secs)   { _audio.currentTime = Math.max(0, Math.min(_audio.duration || 0, _audio.currentTime + secs)); }
function _setVolume(vol) { _audio.volume = Math.max(0, Math.min(1, vol)); saveState({ volume: _audio.volume }); }
function _getVolume()    { return _audio.volume; }

function _getCurrentTrack() { return _queue[_queueIndex] || null; }
function _setTracks(t)      { _playerTracks = t; if (!_queue.length) _queue = t; }

/* ═══════════════════════════════════════════════════════════════════════════
   14. UI RENDERING
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Track card ────────────────────────────────────────────────────────────────
function _renderTrackCard(track, index, opts = {}) {
  const { active = false, onPlay, onFavorite, onAddToPlaylist, onRemoveFromPlaylist } = opts;
  const fav          = isFavorite(track.id);
  const isRemoveMode = typeof onRemoveFromPlaylist === 'function';
  const plBtnTitle   = isRemoveMode ? 'Remove from playlist' : 'Add to playlist';
  const plBtnIcon    = isRemoveMode ? ICONS.close : ICONS.plus;
  const plBtnClass   = isRemoveMode ? ' remove-pl-btn' : '';

  const card = document.createElement('div');
  card.className = `track-card${active ? ' active' : ''}`;
  card.dataset.id    = track.id;
  card.dataset.index = index;
  card.setAttribute('role', 'listitem');
  card.addEventListener('contextmenu', e => e.preventDefault());

  card.innerHTML = `
    <div class="track-thumb">
      <img alt="${escHtml(track.title)}" class="track-img" draggable="false" />
      <div class="track-play-overlay" aria-hidden="true">
        <button class="track-play-btn" aria-label="${active ? 'Pause' : 'Play'} ${escHtml(track.title)}">
          ${active ? ICONS.pause : ICONS.play}
        </button>
      </div>
    </div>
    <div class="track-info">
      <div class="track-title">${escHtml(track.title)}</div>
      <div class="track-moods">${(track.moods || []).slice(0, 3).map(m =>
        `<span class="mood-tag">${escHtml(m)}</span>`
      ).join('')}</div>
    </div>
    <div class="track-actions">
      <button class="icon-btn fav-btn${fav ? ' active' : ''}"
              title="${fav ? 'Remove favourite' : 'Add favourite'}"
              aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}"
              aria-pressed="${fav}">
        ${fav ? ICONS.heartFilled : ICONS.heart}
      </button>
      <button class="icon-btn add-pl-btn${plBtnClass}"
              title="${plBtnTitle}" aria-label="${plBtnTitle}">
        ${plBtnIcon}
      </button>
    </div>`;

  // Lazy image loading via shared observer
  const img    = card.querySelector('.track-img');
  const lowSrc = track.image_url?.low  || null;
  const hiSrc  = track.image_url?.high || null;
  if (lowSrc) { img.dataset.lazySrc = lowSrc; _lazyImageObserver.observe(img); }

  // High-res preload on hover — desktop + decent connection only
  if (hiSrc && !('ontouchstart' in window) && navigator.connection?.effectiveType !== '2g') {
    img.addEventListener('mouseover', () => {
      if (img.dataset.hiLoaded) return;
      img.dataset.hiLoaded = '1';
      const hi    = new Image();
      hi.onload   = () => { if (img.classList.contains('loaded')) img.src = hiSrc; };
      hi.src      = hiSrc;
    }, { once: true });
  }

  // Events
  card.querySelector('.track-play-btn').addEventListener('click', e => {
    e.stopPropagation(); onPlay && onPlay(track, index);
  });
  card.addEventListener('click', e => {
    if (e.target.closest('.track-actions')) return;
    onPlay && onPlay(track, index);
  });

  const favBtn = card.querySelector('.fav-btn');
  favBtn.addEventListener('click', e => {
    e.stopPropagation();
    const newFavs = toggleFavorite(track.id);
    const isF     = newFavs.includes(track.id);
    favBtn.innerHTML = isF ? ICONS.heartFilled : ICONS.heart;
    favBtn.classList.toggle('active', isF);
    favBtn.setAttribute('aria-label', isF ? 'Remove from favourites' : 'Add to favourites');
    favBtn.setAttribute('aria-pressed', isF);
    favBtn.title = isF ? 'Remove favourite' : 'Add favourite';
    onFavorite && onFavorite(track, isF);
  });

  card.querySelector('.add-pl-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (isRemoveMode) onRemoveFromPlaylist(track);
    else              onAddToPlaylist && onAddToPlaylist(track);
  });

  return card;
}

// ── Now playing ───────────────────────────────────────────────────────────────
function _updateNowPlaying(track) {
  if (!track) return;
  const els      = _getNowPlayingEls();
  const moodsStr = (track.moods || []).join(' · ').toUpperCase();

  if (els.title)       els.title.textContent       = track.title;
  if (els.moods)       els.moods.textContent        = moodsStr || '―';
  if (els.expandTitle) els.expandTitle.textContent  = track.title;
  if (els.expandMoods) els.expandMoods.textContent  = moodsStr;

  if (els.img) {
    els.img.classList.remove('loaded');
    if (track.image_url?.low) {
      els.img.onload  = () => els.img.classList.add('loaded');
      els.img.onerror = () => els.img.removeAttribute('src');
      els.img.src     = track.image_url.low;
    } else els.img.removeAttribute('src');
  }

  if (els.expandImg) {
    els.expandImg.classList.remove('loaded');
    const src = track.image_url?.high || track.image_url?.low || null;
    if (src) {
      els.expandImg.onload  = () => els.expandImg.classList.add('loaded');
      els.expandImg.onerror = () => els.expandImg.removeAttribute('src');
      els.expandImg.src     = src;
    } else els.expandImg.removeAttribute('src');
  }
}

// ── Play / pause button ───────────────────────────────────────────────────────
function _updatePlayPauseBtn(playing) {
  const els = _getPlayPauseEls();
  if (els.btn) {
    els.btn.innerHTML = playing ? ICONS.pause : ICONS.play;
    els.btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  if (els.expandBtn) {
    els.expandBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
    els.expandBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
}

// ── Progress ──────────────────────────────────────────────────────────────────
function _updateProgress(current, duration) {
  const els  = _getProgressEls();
  const pct  = duration > 0 ? (current / duration) * 100 : 0;
  const ps   = `${pct.toFixed(2)}%`;
  const cs   = formatTime(current);
  const ds   = formatTime(duration);

  if (els.filled)   els.filled.style.width             = ps;
  if (els.thumb)    els.thumb.style.left                = ps;
  if (els.curr)     els.curr.textContent                = cs;
  if (els.dur)      els.dur.textContent                 = ds;
  if (els.bar)      els.bar.setAttribute('aria-valuenow', Math.round(pct));
  if (els.expFill)  els.expFill.style.width             = ps;
  if (els.expThumb) els.expThumb.style.left             = ps;
  if (els.expCurr)  els.expCurr.textContent             = cs;
  if (els.expDur)   els.expDur.textContent              = ds;
  if (els.expBar)   els.expBar.setAttribute('aria-valuenow', Math.round(pct));
}

// ── Volume fill ───────────────────────────────────────────────────────────────
function _updateVolumeSliderFill(vol) {
  const s = document.getElementById('volume-slider');
  if (s) s.style.setProperty('--vol-fill', `${Math.round(vol * 100)}%`);
}

// ── Track card active state ───────────────────────────────────────────────────
function _updateTrackCardActive(listEl, activeId) {
  if (!listEl) return;
  listEl.querySelectorAll('.track-card').forEach(card => {
    const isA = card.dataset.id === activeId;
    card.classList.toggle('active', isA);
    const btn = card.querySelector('.track-play-btn');
    if (btn) {
      btn.innerHTML = isA ? ICONS.pause : ICONS.play;
      btn.setAttribute('aria-label', `${isA ? 'Pause' : 'Play'} — ${card.dataset.id}`);
    }
  });
}

// ── Mood pills ────────────────────────────────────────────────────────────────
function _renderMoodPills(container, activeMood, onSelect) {
  container.innerHTML = '';
  CONFIG.MOODS.forEach(mood => {
    const btn = document.createElement('button');
    btn.className = `mood-pill${mood === activeMood ? ' active' : ''}`;
    btn.setAttribute('aria-pressed', mood === activeMood);
    btn.setAttribute('aria-label', `${mood === 'All' ? 'All moods' : mood} mood filter`);
    btn.innerHTML = `<span class="mood-icon" aria-hidden="true">${CONFIG.MOOD_ICONS[mood] || '◉'}</span><span>${escHtml(mood)}</span>`;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.mood-pill').forEach(p => {
        p.classList.remove('active'); p.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      onSelect(mood);
    });
    container.appendChild(btn);
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function _showToast(msg, duration = 2400) {
  const ex = document.querySelector('.dhyaan-toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.className   = 'dhyaan-toast';
  t.textContent = msg;
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, duration);
}

/* ═══════════════════════════════════════════════════════════════════════════
   15. APP ORCHESTRATION
   ═══════════════════════════════════════════════════════════════════════════ */

let _currentMood      = 'All';
let _searchQuery      = '';
let _activePlaylistId = null;
let _appExpandOpen    = false;
let _controlsTimer    = null;
let _viewingPlaylist  = false;

// ── Low-end device detection ──────────────────────────────────────────────────
function _detectLowEndDevice() {
  const fewCores  = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 2;
  const lowMemory = navigator.deviceMemory != null && navigator.deviceMemory <= 1;
  const isMob     = window.innerWidth <= 768 || 'ontouchstart' in window;
  const slowNet   = isMob && navigator.connection?.effectiveType === '2g';
  return fewCores || lowMemory || slowNet;
}

// ── Player callbacks ──────────────────────────────────────────────────────────
function _handleTrackChange(track) {
  if (!track) return;
  _updateNowPlaying(track);
  _updatePlayPauseBtn(_isPlaying());
  _updateProgress(0, 0);
  _updateTrackCardActive(document.getElementById('track-list'), track.id);
  _setParticleColorFromTrack(track);
  if (_appExpandOpen) _renderExpandRecos();
}

function _handleProgress(current, duration) {
  _updateProgress(current, duration);
}

function _handleStateChange(state) {
  _updatePlayPauseBtn(state === 'play');
  if (state === 'play') _startVisualizer();
}

// ── Volume ────────────────────────────────────────────────────────────────────
function _initVolumeSlider() {
  const slider = document.getElementById('volume-slider');
  if (!slider) return;
  const vol = _getVolume();
  _updateVolumeSliderFill(vol);
  slider.value = Math.round(vol * 100);
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10) / 100;
    _setVolume(v);
    _updateVolumeSliderFill(v);
  });
}

// ── Player bar controls ────────────────────────────────────────────────────────
function _initPlayerControls() {
  document.getElementById('play-pause-btn')?.addEventListener('click', _togglePlay);
  document.getElementById('prev-btn')?.addEventListener('click', _prevTrack);
  document.getElementById('next-btn')?.addEventListener('click', _nextTrack);
  document.getElementById('seek-bwd')?.addEventListener('click', () => _seekBy(-CONFIG.SEEK_SECONDS));
  document.getElementById('seek-fwd')?.addEventListener('click', () => _seekBy(+CONFIG.SEEK_SECONDS));

  document.getElementById('shuffle-btn')?.addEventListener('click', () => {
    const { shuffleMode } = getState();
    const next = !shuffleMode;
    saveState({ shuffleMode: next });
    _applyShuffleUI(next);
    _showToast(next ? 'Shuffle on' : 'Shuffle off');
  });

  document.getElementById('repeat-btn')?.addEventListener('click', () => {
    const modes = ['none', 'all', 'one'];
    const { repeatMode } = getState();
    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    saveState({ repeatMode: next });
    _applyRepeatUI(next);
    _showToast(`Repeat: ${next === 'none' ? 'off' : next}`);
  });

  document.getElementById('random-btn')?.addEventListener('click', () => {
    const t = _getRandomTrack(_currentMood);
    if (!t) return;
    const idx = _allTracks.findIndex(x => x.id === t.id);
    if (idx !== -1) { _loadTrack(idx, true); setTimeout(() => _scrollToActive(), 300); }
  });
}

function _applyShuffleUI(on) {
  document.getElementById('shuffle-btn')?.classList.toggle('active', on);
}

function _applyRepeatUI(mode) {
  const btn = document.getElementById('repeat-btn');
  if (!btn) return;
  btn.classList.toggle('active', mode !== 'none');
  btn.innerHTML = mode === 'one' ? ICONS.repeatOne : ICONS.repeat;
  btn.title     = `Repeat: ${mode}`;
}

// ── Expand overlay delegates (direct calls — no DOM click chain) ──────────────
function _initExpandDelegates() {
  document.getElementById('expand-prev')?.addEventListener('click', _prevTrack);
  document.getElementById('expand-next')?.addEventListener('click', _nextTrack);
  document.getElementById('expand-play-btn')?.addEventListener('click', _togglePlay);
  document.getElementById('expand-btn-mobile')?.addEventListener('click', () => {
    _appExpandOpen ? _closeExpand() : _openExpand();
  });
}

// ── Search ─────────────────────────────────────────────────────────────────────
function _initSearchBar() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  if (!input) return;
  let debTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debTimer);
    debTimer = setTimeout(() => {
      _searchQuery = input.value.trim();
      if (clear) clear.style.display = _searchQuery ? 'flex' : 'none';
      _renderTrackList();
    }, 180);
  });
  if (clear) {
    clear.addEventListener('click', () => {
      input.value  = '';
      _searchQuery = '';
      clear.style.display = 'none';
      input.focus();
      _renderTrackList();
    });
    clear.style.display = 'none';
  }
}

// ── Theme ──────────────────────────────────────────────────────────────────────
function _initThemeDots() {
  document.querySelectorAll('[data-theme-btn]').forEach(dot => {
    dot.addEventListener('click',   () => _applyTheme(dot.dataset.themeBtn));
    dot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dot.click(); }
    });
  });
}

function _applyTheme(theme) {
  if (!CONFIG.THEMES.includes(theme)) return;
  document.body.setAttribute('data-theme', theme);
  saveState({ theme });
  document.querySelectorAll('[data-theme-btn]').forEach(d =>
    d.classList.toggle('active', d.dataset.themeBtn === theme)
  );
}

// ── Mood bar ──────────────────────────────────────────────────────────────────
function _renderMoodBar() {
  const container = document.getElementById('mood-pills');
  if (!container) return;
  function onMoodSelect(mood) {
    _currentMood = mood;
    saveState({ selectedMood: mood });
    _renderTrackList();
    _renderMoodPills(container, _currentMood, onMoodSelect);
  }
  _renderMoodPills(container, _currentMood, onMoodSelect);
}

// ── Track list ─────────────────────────────────────────────────────────────────
function _renderTrackList() {
  const listEl = document.getElementById('track-list');
  if (!listEl) return;

  if (_viewingPlaylist && _activePlaylistId) {
    _renderPlaylistView(_activePlaylistId);
    return;
  }

  let tracks = _filterByMood(_currentMood);
  if (_searchQuery) tracks = searchTracks(tracks, _searchQuery);

  if (!tracks.length) {
    listEl.innerHTML = `<div class="empty-state">${
      _searchQuery
        ? `No results for "${escHtml(_searchQuery)}"`
        : 'No tracks in this mood'
    }</div>`;
    return;
  }

  const frag  = document.createDocumentFragment();
  const curId = _getCurrentTrack()?.id;

  tracks.forEach((track, ri) => {
    const gi   = _allTracks.findIndex(t => t.id === track.id);
    const card = _renderTrackCard(track, gi, {
      active:          track.id === curId,
      onPlay:          (t, idx) => _playTrackFromLibrary(idx),
      onAddToPlaylist: (t)      => _showAddToPlaylistModal(t),
    });
    // BUG-019 FIX: stagger uses render-order index, not library index,
    // so ALL cards (not just the first 6) get proportional entry delays.
    card.style.setProperty('--card-delay', `${Math.min(ri * 0.03, 0.25)}s`);
    frag.appendChild(card);
  });

  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

// ── Playlist view ──────────────────────────────────────────────────────────────
function _renderPlaylistView(playlistId) {
  const listEl = document.getElementById('track-list');
  if (!listEl) return;

  const pls = getPlaylists();
  const pl  = pls.find(p => p.id === playlistId);
  if (!pl) { _exitPlaylistView(); return; }

  const plTracks = pl.trackIds
    .map(id => _allTracks.find(t => t.id === id))
    .filter(Boolean);

  const header = document.createElement('div');
  header.className = 'playlist-view-header';
  header.innerHTML = `
    <button class="pl-back-btn" id="pl-back-btn" aria-label="Back to all tracks">
      ${ICONS.back}
    </button>
    <div class="pl-header-info">
      <div class="pl-header-name">${escHtml(pl.name)}</div>
      <div class="pl-header-count">${plTracks.length} track${plTracks.length !== 1 ? 's' : ''}</div>
    </div>`;
  header.querySelector('#pl-back-btn').addEventListener('click', _exitPlaylistView);

  const frag  = document.createDocumentFragment();
  const curId = _getCurrentTrack()?.id;
  frag.appendChild(header);

  if (!plTracks.length) {
    const empty = document.createElement('div');
    empty.className   = 'empty-state';
    empty.textContent = 'No tracks yet — add some from the library';
    frag.appendChild(empty);
  } else {
    plTracks.forEach((track, ri) => {
      const card = _renderTrackCard(track, ri, {
        active: track.id === curId,
        onPlay: (t, idx) => {
          _setQueue(plTracks, idx, true);
          saveState({ activePlaylistId: playlistId, activeQueueIds: plTracks.map(x => x.id) });
        },
        onRemoveFromPlaylist: (t) => {
          _removeFromPlaylist(playlistId, t.id);
          _showToast(`Removed from "${pl.name}"`);
          _renderPlaylistView(playlistId);
          _renderPlaylists();
        },
      });
      card.style.setProperty('--card-delay', `${Math.min(ri * 0.03, 0.25)}s`);
      frag.appendChild(card);
    });
  }

  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

function _exitPlaylistView() {
  _viewingPlaylist  = false;
  _activePlaylistId = null;
  saveState({ activePlaylistId: null, activeQueueIds: null });
  _setAllTracksQueue();
  _renderPlaylists();
  _renderTrackList();
}

// ── Playlists sidebar ──────────────────────────────────────────────────────────
function _renderPlaylists() {
  const container = document.getElementById('playlists-container');
  if (!container) return;

  const pls = getPlaylists();
  if (!pls.length) {
    container.innerHTML = `<div class="empty-pl">No playlists yet</div>`;
  } else {
    const frag = document.createDocumentFragment();
    pls.forEach(pl => {
      const item = document.createElement('div');
      item.className = `pl-item${_activePlaylistId === pl.id ? ' active' : ''}`;
      item.dataset.id = pl.id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.innerHTML = `
        <span class="pl-name">${escHtml(pl.name)}</span>
        <span class="pl-count">${pl.trackIds.length}</span>
        <div class="pl-actions">
          <button title="Rename" aria-label="Rename playlist" class="pl-rename-btn">✎</button>
          <button title="Delete" aria-label="Delete playlist" class="pl-delete-btn">✕</button>
        </div>`;
      item.addEventListener('click', e => {
        if (e.target.closest('.pl-actions')) return;
        _activePlaylistId = pl.id;
        _viewingPlaylist  = true;
        saveState({ activePlaylistId: pl.id });
        _renderPlaylists();
        _renderPlaylistView(pl.id);
      });
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
      item.querySelector('.pl-rename-btn').addEventListener('click', e => {
        e.stopPropagation(); _showRenameModal(pl);
      });
      item.querySelector('.pl-delete-btn').addEventListener('click', e => {
        e.stopPropagation(); _showDeleteModal(pl);
      });
      frag.appendChild(item);
    });
    container.innerHTML = '';
    container.appendChild(frag);
  }
  _reAttachNewPlaylistBtn();
}

function _reAttachNewPlaylistBtn() {
  const btn = document.getElementById('new-playlist-btn');
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  clone.addEventListener('click', () => _showCreatePlaylistModal());
}

// ── Play from library ─────────────────────────────────────────────────────────
function _playTrackFromLibrary(globalIdx) {
  if (_viewingPlaylist) _exitPlaylistView();
  _setAllTracksQueue();
  _loadTrack(globalIdx, true);
  saveState({ activePlaylistId: null, activeQueueIds: null });
}

// ── Modal system ───────────────────────────────────────────────────────────────
let _modalRoot = null;

function _ensureModalRoot() {
  if (_modalRoot) return;
  const root = document.createElement('div');
  root.id    = 'dhyaan-modal-root';
  root.innerHTML = `
    <div id="dhyaan-modal-backdrop">
      <div id="dhyaan-modal-box" role="dialog" aria-modal="true" aria-labelledby="dhyaan-modal-title">
        <div id="dhyaan-modal-title"></div>
        <div id="dhyaan-modal-body"></div>
        <div id="dhyaan-modal-footer"></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  _modalRoot = root;
  root.querySelector('#dhyaan-modal-backdrop').addEventListener('click', e => {
    if (e.target === root.querySelector('#dhyaan-modal-backdrop')) _closeModal();
  });
  root.querySelector('#dhyaan-modal-box').addEventListener('click', e => e.stopPropagation());
}

function _showModal({ title, body, buttons = [], onMount } = {}) {
  _ensureModalRoot();
  const bd     = _modalRoot.querySelector('#dhyaan-modal-backdrop');
  const box    = _modalRoot.querySelector('#dhyaan-modal-box');
  const footer = _modalRoot.querySelector('#dhyaan-modal-footer');
  _modalRoot.querySelector('#dhyaan-modal-title').textContent = title;
  _modalRoot.querySelector('#dhyaan-modal-body').innerHTML    = body;
  footer.innerHTML = '';
  buttons.forEach(({ label, cls, action }) => {
    const btn = document.createElement('button');
    btn.className   = cls;
    btn.textContent = label;
    btn.addEventListener('click', () => action(_closeModal));
    footer.appendChild(btn);
  });
  _modalRoot.style.pointerEvents = 'all';
  requestAnimationFrame(() => requestAnimationFrame(() => bd.classList.add('open')));
  if (onMount) onMount(box);
  box.querySelectorAll('button, input, [tabindex]')[0]?.focus();
}

function _closeModal() {
  if (!_modalRoot) return;
  _modalRoot.querySelector('#dhyaan-modal-backdrop').classList.remove('open');
  setTimeout(() => { if (_modalRoot) _modalRoot.style.pointerEvents = 'none'; }, 380);
}

// ── Playlist modals ────────────────────────────────────────────────────────────
function _showAddToPlaylistModal(track) {
  const pls = getPlaylists();
  if (!pls.length) {
    _showModal({
      title: 'No playlists',
      body:  `<p class="modal-confirm-msg">You don't have any playlists yet. Create one first.</p>`,
      buttons: [
        { label: 'Create Playlist', cls: 'modal-btn-accent', action: (close) => { close(); _showCreatePlaylistModal(track); } },
        { label: 'Cancel',          cls: 'modal-btn-ghost',  action: close => close() },
      ],
    });
    return;
  }
  _showModal({
    title: 'Add to playlist',
    body:  `<div class="modal-pick-list">${pls.map(pl =>
      `<button class="modal-pick-item" data-plid="${pl.id}">
         <span class="modal-pick-name">${escHtml(pl.name)}</span>
         <span class="modal-pick-sub">${pl.trackIds.length} tracks</span>
       </button>`
    ).join('')}</div>`,
    buttons: [{ label: 'Cancel', cls: 'modal-btn-ghost', action: close => close() }],
    onMount: (box) => {
      box.querySelectorAll('.modal-pick-item').forEach(btn => {
        btn.addEventListener('click', () => {
          _addToPlaylist(btn.dataset.plid, track.id);
          const pl = getPlaylists().find(p => p.id === btn.dataset.plid);
          _showToast(`Added to "${pl?.name || 'playlist'}"`);
          _renderPlaylists();
          _closeModal();
        });
      });
    },
  });
}

function _showCreatePlaylistModal(trackToAdd = null) {
  _showModal({
    title: 'New Playlist',
    body:  `<input id="dhyaan-modal-input" type="text" placeholder="Playlist name…" maxlength="60" autocomplete="off" />`,
    buttons: [
      {
        label: 'Create', cls: 'modal-btn-accent', action: (close) => {
          const val = document.getElementById('dhyaan-modal-input')?.value?.trim();
          if (!val) return;
          const pl = _createPlaylist(val);
          if (trackToAdd) { _addToPlaylist(pl.id, trackToAdd.id); _showToast(`Added to "${pl.name}"`); }
          else            { _showToast(`Playlist "${pl.name}" created`); }
          _renderPlaylists();
          close();
        },
      },
      { label: 'Cancel', cls: 'modal-btn-ghost', action: close => close() },
    ],
    onMount: (box) => {
      const input = box.querySelector('#dhyaan-modal-input');
      input?.focus();
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') box.querySelector('.modal-btn-accent')?.click();
      });
    },
  });
}

function _showRenameModal(pl) {
  _showModal({
    title: 'Rename Playlist',
    body:  `<input id="dhyaan-modal-input" type="text" value="${escHtml(pl.name)}" maxlength="60" autocomplete="off" />`,
    buttons: [
      {
        label: 'Rename', cls: 'modal-btn-accent', action: (close) => {
          const val = document.getElementById('dhyaan-modal-input')?.value?.trim();
          if (!val) return;
          _renamePlaylist(pl.id, val);
          _showToast(`Renamed to "${val}"`);
          _renderPlaylists();
          if (_viewingPlaylist && _activePlaylistId === pl.id) _renderPlaylistView(pl.id);
          close();
        },
      },
      { label: 'Cancel', cls: 'modal-btn-ghost', action: close => close() },
    ],
    onMount: (box) => {
      const input = box.querySelector('#dhyaan-modal-input');
      input?.focus();
      input?.select();
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') box.querySelector('.modal-btn-accent')?.click();
      });
    },
  });
}

function _showDeleteModal(pl) {
  _showModal({
    title: 'Delete Playlist',
    body:  `<p class="modal-confirm-msg">Delete <em>"${escHtml(pl.name)}"</em>? This cannot be undone.</p>`,
    buttons: [
      {
        label: 'Delete', cls: 'modal-btn-danger', action: (close) => {
          _deletePlaylist(pl.id);
          _showToast('Playlist deleted');
          if (_activePlaylistId === pl.id) _exitPlaylistView();
          else                             _renderPlaylists();
          close();
        },
      },
      { label: 'Cancel', cls: 'modal-btn-ghost', action: close => close() },
    ],
  });
}

// ── Expand / Immersive mode ────────────────────────────────────────────────────
function _initExpandMode() {
  document.getElementById('expand-btn')?.addEventListener('click', () => {
    _appExpandOpen ? _closeExpand() : _openExpand();
  });
  document.getElementById('collapse-btn')?.addEventListener('click', _closeExpand);
  document.getElementById('expand-overlay')?.addEventListener('click', e => {
    if (e.target.closest('button, .expand-progress-bar, .expand-reco-item')) return;
    _showExpandControls();
  });
}

function _openExpand() {
  _appExpandOpen = true;
  document.body.classList.add('expand-mode');
  _setVizExpandMode(true);
  saveState({ expandMode: true });
  _renderExpandRecos();
  _showExpandControls();
  const overlay = document.getElementById('expand-overlay');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'false');
    overlay.focus({ preventScroll: true });
  }
}

function _closeExpand() {
  _appExpandOpen = false;
  document.body.classList.remove('expand-mode', 'controls-visible');
  _setVizExpandMode(false);
  saveState({ expandMode: false });
  const overlay = document.getElementById('expand-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', 'true');
  clearTimeout(_controlsTimer);
}

function _showExpandControls() {
  document.body.classList.add('controls-visible');
  clearTimeout(_controlsTimer);
  _controlsTimer = setTimeout(() => document.body.classList.remove('controls-visible'), 4000);
}

function _renderExpandRecos() {
  const ui = document.querySelector('.expand-ui');
  if (!ui) return;
  ui.querySelector('.expand-reco-panel')?.remove();

  const track = _getCurrentTrack();
  const recos = _getRecommendations(track?.id, 6);
  const label = _getRecoLabel();
  if (!recos.length) return;

  const panel = document.createElement('div');
  panel.className = 'expand-reco-panel';
  panel.innerHTML = `
    <div class="expand-reco-label">${label}</div>
    <div class="expand-reco-list">
      ${recos.map(t => `
        <div class="expand-reco-item" data-id="${t.id}" role="button" tabindex="0" aria-label="Play ${escHtml(t.title)}">
          <div class="expand-reco-thumb" style="background-image:url('${t.image_url?.low || ''}')"></div>
          <div class="expand-reco-name">${escHtml(t.title)}</div>
        </div>`).join('')}
    </div>`;

  panel.querySelectorAll('.expand-reco-item').forEach(item => {
    const handler = () => {
      const idx = _allTracks.findIndex(t => t.id === item.dataset.id);
      if (idx !== -1) { _loadTrack(idx, true); _showExpandControls(); }
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });

  ui.appendChild(panel);
}

// ── Particle colour from track ─────────────────────────────────────────────────
function _setParticleColorFromTrack(track) {
  if (track.hue != null) { _setParticleColor(track.hue, 65, 72); return; }
  const moodHues = {
    'Buddha': 42, 'Zen': 155, 'Shiva': 270, 'Rain': 205, 'Sufi': 30,
    'Solitude': 220, 'Night': 245, 'Healing': 160, '3AM': 230,
    'Meditation': 145, 'Focus': 200, 'Flow': 180, 'Morning': 55, 'All': 140,
  };
  const mood = (track.moods || [])[0];
  _setParticleColor(moodHues[mood] ?? 140, 60, 70);
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
function _initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    switch (e.key) {
      case ' ':
        e.preventDefault(); _togglePlay(); break;
      case 'ArrowRight':
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); _seekBy(+CONFIG.SEEK_SECONDS); } break;
      case 'ArrowLeft':
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); _seekBy(-CONFIG.SEEK_SECONDS); } break;
      case 'ArrowUp':
        e.preventDefault(); _setVolume(Math.min(1, _getVolume() + 0.05)); _updateVolumeSliderFill(_getVolume()); break;
      case 'ArrowDown':
        e.preventDefault(); _setVolume(Math.max(0, _getVolume() - 0.05)); _updateVolumeSliderFill(_getVolume()); break;
      case 'n': case 'N': _nextTrack(); break;
      case 'p': case 'P': _prevTrack(); break;
      case 'e': case 'E': _appExpandOpen ? _closeExpand() : _openExpand(); break;
      case 'f': case 'F': {
        const t = _getCurrentTrack();
        if (!t) break;
        toggleFavorite(t.id);
        _showToast(isFavorite(t.id) ? '♥ Added to favourites' : '♡ Removed from favourites');
        _updateTrackCardActive(document.getElementById('track-list'), t.id);
        break;
      }
      case 'Escape': if (_appExpandOpen) _closeExpand(); break;
    }
  });
}

// ── Logo / About modal ────────────────────────────────────────────────────────
function _initLogoAbout() {
  const logo = document.querySelector('.logo');
  if (!logo) return;
  const handler = () => _showModal({
    title: 'Dhyaan',
    body: `
      <div class="about-modal-wrap">
        <p class="about-tagline">A Living Meditation Experience</p>
        <p class="about-divider">· · ·</p>
        <p class="about-text">
          <em>Dhyaan</em> (ध्यान) means <em>meditation</em> in Sanskrit —
          a state of deep, unbroken awareness.
        </p>
        <p class="about-text">
          This space holds ambient soundscapes carefully curated for
          <em>focus</em>, <em>healing</em>, <em>stillness</em>, and the
          long hours between midnight and dawn.
        </p>
        <p class="about-text">Breathe. Let the sounds do the rest.</p>
        <p class="about-footer-text">
          Press <kbd>Space</kbd> to play · <kbd>E</kbd> for immersive mode
        </p>
      </div>`,
    buttons: [{ label: 'Enter Stillness', cls: 'modal-btn-accent', action: close => close() }],
  });
  logo.addEventListener('click',   handler);
  logo.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
  });
}

// ── Scroll active track into view ─────────────────────────────────────────────
function _scrollToActive() {
  document.getElementById('track-list')
    ?.querySelector('.track-card.active')
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Mobile sidebar ────────────────────────────────────────────────────────────
function _initMobileSidebar() {
  const sidebar    = document.getElementById('sidebar');
  const backdrop   = document.getElementById('mobile-sidebar-backdrop');
  const menuBtn    = document.getElementById('mobile-menu-btn');
  const closeBtn   = document.getElementById('sidebar-close-btn');
  const sidebarHdr = document.getElementById('sidebar-header-mobile');
  const themePanel = document.getElementById('mobile-theme-panel');
  const expMobile  = document.getElementById('expand-btn-mobile');

  const isMob = () => window.innerWidth <= 768;

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    menuBtn?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    // Focus first interactive element after slide-in completes
    setTimeout(() => {
      const first = sidebar.querySelector('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (first || sidebar).focus({ preventScroll: true });
    }, 400);
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    menuBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    menuBtn?.focus({ preventScroll: true });
  }

  function applyMobileUI() {
    const mob = isMob();
    closeBtn?.classList.toggle('sidebar-close-btn-hidden',   !mob);
    sidebarHdr?.classList.toggle('sidebar-mobile-header-hidden', !mob);
    themePanel?.classList.toggle('mobile-theme-panel-hidden',    !mob);
    expMobile?.classList.toggle('mobile-only-hidden',            !mob);
    if (!mob) closeSidebar();
  }

  menuBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);

  // Escape closes sidebar on mobile
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isMob() && sidebar.classList.contains('open')) closeSidebar();
  });

  // Swipe left to close
  let swipeStartX = 0;
  sidebar.addEventListener('touchstart', e => { swipeStartX = e.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend',   e => {
    if (e.changedTouches[0].clientX - swipeStartX < -50 && isMob()) closeSidebar();
  }, { passive: true });

  // Mobile theme swatches
  document.querySelectorAll('.mobile-theme-item').forEach(item => {
    const activate = () => {
      const theme = item.dataset.themeMobile;
      if (!theme) return;
      // Delegate to desktop theme dot to keep _applyTheme() as single source of truth
      document.querySelector(`[data-theme-btn="${theme}"]`)?.click();
      document.querySelectorAll('.mobile-theme-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      setTimeout(closeSidebar, 280);
    };
    item.addEventListener('click',   activate);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  // Sync mobile swatch highlight + <meta name="theme-color"> on body[data-theme] change
  const metaColor = document.querySelector('meta[name="theme-color"]:not([media])');
  const syncMobileTheme = (theme) => {
    document.querySelectorAll('.mobile-theme-item').forEach(i =>
      i.classList.toggle('active', i.dataset.themeMobile === theme)
    );
    if (metaColor && THEME_COLORS[theme]) metaColor.setAttribute('content', THEME_COLORS[theme]);
  };

  new MutationObserver(() => {
    const t = document.body.getAttribute('data-theme');
    if (t) syncMobileTheme(t);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

  syncMobileTheme(document.body.getAttribute('data-theme') || 'zen-dark');
  applyMobileUI();
  window.addEventListener('resize', applyMobileUI);
}

// ── Seek bars (mouse + touch + keyboard) ──────────────────────────────────────
function _initSeekBars() {
  function getSeekPct(e, barEl) {
    const rect = barEl.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
  }

  function bindSeekBar(barId) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    let dragging = false;

    const doSeek = (pct) =>
      document.dispatchEvent(new CustomEvent('dhyaan:seek', { detail: { pct } }));

    const updateVisual = (pct) => {
      const fillId  = barId === 'progress-bar' ? 'progress-filled' : 'expand-filled';
      const thumbId = barId === 'progress-bar' ? 'progress-thumb'  : 'expand-thumb';
      const fill    = document.getElementById(fillId);
      const thumb   = document.getElementById(thumbId);
      const s       = `${(pct * 100).toFixed(2)}%`;
      if (fill)  fill.style.width = s;
      if (thumb) thumb.style.left = s;
    };

    // Mouse
    bar.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      bar.classList.add('dragging');
      document.dispatchEvent(new CustomEvent('dhyaan:drag-start'));
      updateVisual(getSeekPct(e, bar));
    });
    document.addEventListener('mousemove', e => {
      if (dragging) updateVisual(getSeekPct(e, bar));
    });
    document.addEventListener('mouseup', e => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      doSeek(getSeekPct(e, bar));
      document.dispatchEvent(new CustomEvent('dhyaan:drag-end'));
    });

    // Touch
    bar.addEventListener('touchstart', e => {
      dragging = true;
      bar.classList.add('dragging');
      document.dispatchEvent(new CustomEvent('dhyaan:drag-start'));
      updateVisual(getSeekPct(e, bar));
    }, { passive: true });

    bar.addEventListener('touchmove', e => {
      if (!dragging) return;
      e.preventDefault();
      updateVisual(getSeekPct(e, bar));
    }, { passive: false });

    bar.addEventListener('touchend', e => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      const t   = e.changedTouches[0];
      const pct = Math.max(0, Math.min(1,
        (t.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth
      ));
      updateVisual(pct);
      doSeek(pct);
      document.dispatchEvent(new CustomEvent('dhyaan:drag-end'));
    }, { passive: true });

    // Keyboard
    bar.addEventListener('keydown', e => {
      const cur = parseFloat(bar.getAttribute('aria-valuenow') || 0) / 100;
      let pct   = cur;
      if      (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { pct = Math.min(1, cur + 0.02); e.preventDefault(); }
      else if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { pct = Math.max(0, cur - 0.02); e.preventDefault(); }
      else if (e.key === 'Home')                                 { pct = 0; e.preventDefault(); }
      else if (e.key === 'End')                                  { pct = 1; e.preventDefault(); }
      else return;
      updateVisual(pct);
      doSeek(pct);
    });
  }

  bindSeekBar('progress-bar');
  bindSeekBar('expand-progress-bar');
}

// ── Expand overlay: mobile tap-to-show controls + pull-to-refresh block ───────
function _initExpandMobile() {
  const overlay = document.getElementById('expand-overlay');
  if (!overlay) return;

  overlay.addEventListener('click', e => {
    if (window.innerWidth > 768) return;
    if (!e.target.closest('button, .expand-progress-bar, .expand-reco-item'))
      document.body.classList.toggle('controls-visible');
  });

  overlay.addEventListener('touchmove', e => {
    if (!e.target.closest('.expand-reco-list')) e.preventDefault();
  }, { passive: false });
}

// ── Service Worker ────────────────────────────────────────────────────────────
function _registerServiceWorker() {

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {

        try {

            await navigator.serviceWorker.register('./sw.js');

            console.log('✅ Service Worker Registered');

        }

        catch (err) {

            console.error(err);

        }

    });

}

/* ═══════════════════════════════════════════════════════════════════════════
   16. INITIALIZATION
   DOMContentLoaded fires after this deferred module executes.
   The listener is registered synchronously at module eval time, so it
   will always receive the event.
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {

  _registerServiceWorker();

  loadState();
  loadAnalytics();
  const state = getState();

  // ── Theme ─────────────────────────────────────────────────────────────────
  _applyTheme(state.theme || 'zen-dark');

  // ── Low-power mode ────────────────────────────────────────────────────────
  const isLowEnd         = _detectLowEndDevice();
  const activateLowPower = isLowEnd || state.lowPowerMode;
  if (activateLowPower) {
    document.body.classList.add('low-power');
    if (isLowEnd && !state.lowPowerMode) saveState({ lowPowerMode: true });
  }

  // ── Visualizer ────────────────────────────────────────────────────────────
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    _initVisualizer(canvas);
    if (activateLowPower) _setLowPowerMode(true);
    _startVisualizer();
  }

  // ── Fetch track data ──────────────────────────────────────────────────────
  try {
    const resp = await fetch(CONFIG.DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    _allTracks = (Array.isArray(data) ? data : data.tracks || []).map((t, i) => ({
      ...t,
      id: t.id ?? `track-${i}`,
    }));
  } catch (err) {
    console.error('[Dhyaan] Failed to load data:', err);
    document.getElementById('track-list').innerHTML =
      `<div class="empty-state">Could not load tracks. Please check your connection.</div>`;
    return;
  }

  if (!_allTracks.length) {
    document.getElementById('track-list').innerHTML =
      `<div class="empty-state">You're offline. Tracks will load when connected.</div>`;
    return;
  }

  // ── Player ────────────────────────────────────────────────────────────────
  _setTracks(_allTracks);
  _initPlayer(_allTracks, {
    onTrackChange: _handleTrackChange,
    onProgress:    _handleProgress,
    onStateChange: _handleStateChange,
  });
  _setAllTracksQueue();

  // Restore saved queue/playlist context
  const savedIds = state.activeQueueIds;
  if (savedIds && Array.isArray(savedIds)) {
    const qt = savedIds.map(id => _allTracks.find(t => t.id === id)).filter(Boolean);
    if (qt.length) {
      const si = Math.min(state.currentQueueIndex ?? 0, qt.length - 1);
      _setQueue(qt, si, false);
    }
  }

  // ── Restore saved view ────────────────────────────────────────────────────
  _currentMood = state.selectedMood || 'All';
  if (state.activePlaylistId) {
    _activePlaylistId = state.activePlaylistId;
    _viewingPlaylist  = true;
  }

  // ── Init all UI systems ───────────────────────────────────────────────────
  _renderMoodBar();
  _renderPlaylists();
  _renderTrackList();
  _initVolumeSlider();
  _initPlayerControls();
  _initExpandDelegates();
  _initSearchBar();
  _initThemeDots();
  _initExpandMode();
  _initKeyboard();
  _initLogoAbout();
  _initMobileSidebar();
  _initSeekBars();
  _initExpandMobile();

  // ── Restore playback state UI ─────────────────────────────────────────────
  const track = _getCurrentTrack();
  if (track) {
    _updateNowPlaying(track);
    _updatePlayPauseBtn(false);
    _updateProgress(state.currentTime || 0, 0);
    _updateVolumeSliderFill(state.volume ?? 0.75);
    _applyShuffleUI(state.shuffleMode);
    _applyRepeatUI(state.repeatMode || 'none');
    if (state.expandMode) requestAnimationFrame(() => _openExpand());
    _setParticleColorFromTrack(track);
  }

});
