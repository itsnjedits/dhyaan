// ═══════════════════════════════════════════════════════════════
// Dhyaan v2.0 — script.js
// Complete rebuild: modular, clean, bug-free, production-ready.
// ═══════════════════════════════════════════════════════════════

// ─── 1. CONFIG & CONSTANTS ──────────────────────────────────────

const DATA_URL       = './data/meditation.json';
const STORAGE_STATE  = 'dhyaan_state_v2';
const STORAGE_PL     = 'dhyaan_playlists_v2';
const STORAGE_STATS  = 'dhyaan_analytics_v2';
const SEEK_SECONDS   = 10;
const CTRL_HIDE_MS   = 4_000;
const SAVE_TIME_INTV = 5_000;
const PARTICLE_COUNT = 50;

const THEMES = [
  'zen-dark', 'night-blue', 'cosmic-purple', 'forest-calm',
  'spiritual-green', 'sunset-gold', 'rose-pink', 'moonlight',
];

const MOOD_ICON = {
  All:      '✦',
  Favorites:'♡',
  Morning:  '☀',
  Night:    '☽',
  '3AM':    '✦',
  Healing:  '✿',
  Focus:    '◎',
  Rain:     '⌁',
  Nature:   '❧',
};

// SVG icon strings used in dynamically generated HTML
const ICO = {
  play:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  pause:    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  heart:    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  heartOut: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`,
  add:      `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  remove:   `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  back:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  rename:   `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
  trash:    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  shuffle:  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
  repeatAll:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
  repeatOne:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`,
};

const DEFAULT_STATE = {
  lastTrackUrl:      null,
  currentTime:       0,
  volume:            0.75,
  theme:             'zen-dark',
  shuffleMode:       false,
  repeatMode:        'none',   // 'none' | 'all' | 'one'
  selectedMood:      'All',
  searchQuery:       '',
  favorites:         [],       // array of audio_url strings
  activePlaylistId:  null,
  queueUrls:         null,
  currentQueueIndex: 0,
  lowPowerMode:      false,
};


// ─── 2. STATE MANAGEMENT ────────────────────────────────────────

let _state = { ...DEFAULT_STATE };

function getState()   { return _state; }
function setState(patch) {
  Object.assign(_state, patch);
  _persistState();
}

function _persistState() {
  try {
    localStorage.setItem(STORAGE_STATE, JSON.stringify(_state));
  } catch { /* storage full or unavailable */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_STATE);
    if (raw) {
      const saved = JSON.parse(raw);
      // Merge with defaults so new keys are always present
      _state = { ...DEFAULT_STATE, ...saved };
    }
  } catch {
    _state = { ...DEFAULT_STATE };
  }
}


// ─── Playlists ─────────────────────────────────────────────────

let _playlists = [];

function getPlaylists()   { return _playlists; }

function loadPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_PL);
    if (raw) _playlists = JSON.parse(raw);
    if (!Array.isArray(_playlists)) _playlists = [];
  } catch {
    _playlists = [];
  }
}

function savePlaylists() {
  try {
    localStorage.setItem(STORAGE_PL, JSON.stringify(_playlists));
  } catch { }
}


// ─── Analytics ─────────────────────────────────────────────────

const _analytics = { plays: {} };

function loadAnalytics() {
  try {
    const raw = localStorage.getItem(STORAGE_STATS);
    if (raw) Object.assign(_analytics, JSON.parse(raw));
  } catch { }
}

function incrementPlay(url) {
  _analytics.plays[url] = (_analytics.plays[url] || 0) + 1;
  try {
    localStorage.setItem(STORAGE_STATS, JSON.stringify(_analytics));
  } catch { }
}


// ─── 3. AUDIO ENGINE ────────────────────────────────────────────

const _audio = new Audio();
_audio.preload  = 'metadata';
_audio.crossOrigin = 'anonymous';

let _allTracks      = [];    // complete track library
let _filteredIndices = [];   // indices of currently visible tracks
let _queue          = [];    // playback queue (array of original indices)
let _queueIndex     = 0;     // position in _queue
let _currentOrigIdx = -1;    // current track's original index (-1 = none)

let _saveTimeTimer  = null;  // throttled position save
let _retryTimer     = null;  // auto-advance on error
let _playedMinimum  = false; // track play count

// Callbacks set by boot()
const _cb = {
  onTrackChange: null,
  onProgress:    null,
  onStateChange: null,
};

function _play() {
  if (!_audio.src) return;
  _audio.play().catch(err => console.warn('[Dhyaan] play() blocked:', err.message));
}
function _pause()  { _audio.pause(); }
function _togglePlay() { _audio.paused ? _play() : _pause(); }

function _nextTrack(autoplay = true) {
  clearTimeout(_retryTimer);
  const { repeatMode } = getState();

  if (repeatMode === 'one') {
    _audio.currentTime = 0;
    if (autoplay) _play();
    return;
  }

  let next = _queueIndex + 1;
  if (next >= _queue.length) {
    if (repeatMode === 'all') {
      next = 0;
    } else {
      _cb.onStateChange?.('paused');
      return;
    }
  }
  _queueIndex = next;
  _loadQueueItem(_queueIndex, autoplay);
  _saveQueueState();
}

function _prevTrack() {
  clearTimeout(_retryTimer);
  if (_audio.currentTime > 3) {
    // Restart current track
    _audio.currentTime = 0;
    if (!_audio.paused) _play();
    return;
  }
  _queueIndex = Math.max(0, _queueIndex - 1);
  _loadQueueItem(_queueIndex, !_audio.paused);
  _saveQueueState();
}

function _seekTo(pct) {
  const dur = _audio.duration;
  if (!isFinite(dur) || dur <= 0) return;
  _audio.currentTime = Math.min(Math.max(0, pct * dur), dur);
}

function _seekBy(secs) {
  const dur = _audio.duration;
  if (!isFinite(dur)) return;
  _audio.currentTime = Math.min(Math.max(0, _audio.currentTime + secs), dur);
}

function _setVolume(v) {
  const vol = Math.min(1, Math.max(0, v));
  _audio.volume = vol;
  _audio.muted  = (vol === 0);
  setState({ volume: vol });
  _updateVolumeUI(vol);
}

function _setMuted(muted) {
  _audio.muted = muted;
  _updateMuteUI(muted);
}

function _loadQueueItem(queueIdx, autoplay = false) {
  const origIdx = _queue[queueIdx];
  if (origIdx === undefined) return;
  const track = _allTracks[origIdx];
  if (!track) return;

  _currentOrigIdx = origIdx;
  _playedMinimum  = false;

  _audio.pause();
  _audio.src = '';

  // Small delay avoids a race where pause() hasn't flushed yet
  requestAnimationFrame(() => {
    _audio.src = track.audio_url;
    if (autoplay) {
      _audio.play().catch(err => console.warn('[Dhyaan] autoplay blocked:', err.message));
    }
    _cb.onTrackChange?.(track, queueIdx, origIdx);
  });
}

function _buildQueue(indices, startOrigIdx) {
  const { shuffleMode } = getState();
  _queue = [...indices];
  if (shuffleMode && _queue.length > 1) {
    // Fisher-Yates, then bring startOrigIdx to front
    for (let i = _queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_queue[i], _queue[j]] = [_queue[j], _queue[i]];
    }
    if (startOrigIdx !== undefined) {
      const pos = _queue.indexOf(startOrigIdx);
      if (pos > 0) {
        [_queue[0], _queue[pos]] = [_queue[pos], _queue[0]];
      }
    }
  }
}

function playFromLibrary(origIdx) {
  const visible = _filteredIndices;
  if (!visible.length) return;

  _buildQueue(visible, origIdx);

  if (getState().shuffleMode) {
    _queueIndex = _queue.indexOf(origIdx);
    if (_queueIndex === -1) _queueIndex = 0;
  } else {
    _queueIndex = _queue.indexOf(origIdx);
    if (_queueIndex === -1) { _queue.unshift(origIdx); _queueIndex = 0; }
  }

  _loadQueueItem(_queueIndex, true);
  _saveQueueState();
}

function _saveQueueState() {
  const queueUrls = _queue
    .map(idx => _allTracks[idx]?.audio_url)
    .filter(Boolean);
  setState({
    lastTrackUrl:      _allTracks[_currentOrigIdx]?.audio_url ?? null,
    queueUrls,
    currentQueueIndex: _queueIndex,
    currentTime:       _audio.currentTime || 0,
  });
}

// ── Audio events ──────────────────────────────────────────────

_audio.addEventListener('play', () => {
  _cb.onStateChange?.('playing');
  _updateMediaSessionPlaybackState('playing');
});

_audio.addEventListener('pause', () => {
  _cb.onStateChange?.('paused');
  _updateMediaSessionPlaybackState('paused');
  // Persist position on pause
  if (_audio.currentTime > 0) setState({ currentTime: _audio.currentTime });
});

_audio.addEventListener('waiting', () => {
  _cb.onStateChange?.('waiting');
});

_audio.addEventListener('playing', () => {
  _cb.onStateChange?.('playing');
  clearTimeout(_retryTimer);
});

_audio.addEventListener('ended', () => {
  _playedMinimum = false;
  _nextTrack(true);
});

_audio.addEventListener('timeupdate', () => {
  const ct  = _audio.currentTime;
  const dur = _audio.duration || 0;

  // Count play if listened for 5+ seconds
  if (!_playedMinimum && ct > 5 && _currentOrigIdx !== -1) {
    _playedMinimum = true;
    const url = _allTracks[_currentOrigIdx]?.audio_url;
    if (url) incrementPlay(url);
  }

  // Throttle position save
  clearTimeout(_saveTimeTimer);
  _saveTimeTimer = setTimeout(() => {
    setState({ currentTime: ct });
  }, SAVE_TIME_INTV);

  // Get buffered pct
  let bufferedPct = 0;
  try {
    if (_audio.buffered.length && dur > 0) {
      bufferedPct = _audio.buffered.end(_audio.buffered.length - 1) / dur;
    }
  } catch { }

  _cb.onProgress?.(ct, dur, bufferedPct);
  _updateMediaPositionState(ct, dur);
});

_audio.addEventListener('error', e => {
  const code = e.target?.error?.code;
  // MEDIA_ERR_SRC_NOT_SUPPORTED (4) or MEDIA_ERR_NETWORK (2)
  if (code === 2 || code === 4) {
    _cb.onStateChange?.('error');
    showToast('Audio unavailable — skipping in 3s…');
    _retryTimer = setTimeout(() => _nextTrack(true), 3000);
  }
});

_audio.addEventListener('loadedmetadata', () => {
  // If we're restoring a saved position, apply it now
  const { currentTime } = getState();
  if (currentTime > 1 && currentTime < (_audio.duration - 2)) {
    _audio.currentTime = currentTime;
    // Clear after first restore so subsequent track loads don't jump
    setState({ currentTime: 0 });
  }
});


// ─── 4. MEDIA SESSION API ───────────────────────────────────────

function initMediaSession() {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.setActionHandler('play',         () => _play());
  navigator.mediaSession.setActionHandler('pause',        () => _pause());
  navigator.mediaSession.setActionHandler('nexttrack',    () => _nextTrack(true));
  navigator.mediaSession.setActionHandler('previoustrack',() => _prevTrack());

  try {
    navigator.mediaSession.setActionHandler('seekto', d => {
      if (d.seekTime !== undefined) _audio.currentTime = d.seekTime;
    });
    navigator.mediaSession.setActionHandler('seekbackward', d => {
      _seekBy(-(d.seekOffset ?? SEEK_SECONDS));
    });
    navigator.mediaSession.setActionHandler('seekforward', d => {
      _seekBy(d.seekOffset ?? SEEK_SECONDS);
    });
  } catch { /* seekto not supported in all browsers */ }
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  if (!track) return;

  const artwork = track.image_url?.high
    ? [{ src: track.image_url.high, sizes: '512x512', type: 'image/webp' }]
    : [];

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track.title,
      artist: 'Dhyaan',
      album:  (track.moods || []).join(' · ') || 'Meditation',
      artwork,
    });
  } catch { }
}

function _updateMediaSessionPlaybackState(state) {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = state; } catch { }
}

function _updateMediaPositionState(ct, dur) {
  if (!('mediaSession' in navigator)) return;
  if (!isFinite(dur) || dur <= 0) return;
  try {
    navigator.mediaSession.setPositionState?.({
      duration:     dur,
      playbackRate: _audio.playbackRate || 1,
      position:     Math.min(ct, dur),
    });
  } catch { }
}


// ─── 5. PARTICLE VISUALIZER ─────────────────────────────────────

let _canvas  = null;
let _ctx     = null;
let _particles  = [];
let _rafId      = null;
let _vizPlaying = false;

class Particle {
  constructor() {
    this._reset(true);
  }

  _reset(initial = false) {
    const w = _canvas?.width  || window.innerWidth;
    const h = _canvas?.height || window.innerHeight;
    this.x   = Math.random() * w;
    this.y   = initial
      ? Math.random() * h
      : h + Math.random() * 20;
    this.vx  = (Math.random() - 0.5) * 0.25;
    this.vy  = -(Math.random() * 0.35 + 0.08);
    this.r   = Math.random() * 1.8 + 0.4;
    this.a   = 0;
    this.ta  = Math.random() * 0.38 + 0.06;
    this.life = 0;
    this.maxLife = 450 + Math.random() * 200;
  }

  update() {
    const speed = _vizPlaying ? 1 : 0.25;
    this.x += this.vx * speed;
    this.y += this.vy * speed;
    this.life++;
    const fadeIn  = 60;
    const fadeOut = this.maxLife - 80;
    if (this.life < fadeIn) {
      this.a = this.ta * (this.life / fadeIn);
    } else if (this.life > fadeOut) {
      this.a = this.ta * (1 - (this.life - fadeOut) / 80);
    } else {
      this.a = this.ta;
    }
    if (this.life >= this.maxLife || this.a <= 0) this._reset();
  }

  draw() {
    if (!_ctx || this.a <= 0) return;
    const hsl = getComputedStyle(document.body)
      .getPropertyValue('--particle-color').trim() || '140,70%,70%';
    _ctx.beginPath();
    _ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    _ctx.fillStyle = `hsla(${hsl},${this.a})`;
    _ctx.fill();
  }
}

function initVisualizer() {
  _canvas = document.getElementById('particle-canvas');
  if (!_canvas) return;
  _ctx = _canvas.getContext('2d', { alpha: true });

  const resize = () => {
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const count = getState().lowPowerMode
    ? Math.floor(PARTICLE_COUNT * 0.3)
    : PARTICLE_COUNT;
  _particles = Array.from({ length: count }, () => new Particle());

  _rafId = requestAnimationFrame(_vizFrame);
}

function _vizFrame() {
  if (!_canvas || !_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  for (const p of _particles) { p.update(); p.draw(); }
  _rafId = requestAnimationFrame(_vizFrame);
}

function setVizPlaying(v) { _vizPlaying = v; }


// ─── 6. UTILITIES ───────────────────────────────────────────────

function fmt(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isMobilePointer() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function isLowEndDevice() {
  return (navigator.hardwareConcurrency ?? 4) <= 2;
}


// ─── 7. TOAST ───────────────────────────────────────────────────

let _toastEl  = null;
let _toastTimer = null;

function _ensureToast() {
  if (_toastEl) return;
  _toastEl = document.createElement('div');
  _toastEl.className = 'dhyaan-toast';
  _toastEl.setAttribute('role', 'status');
  _toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(_toastEl);
}

function showToast(msg, ms = 2800) {
  _ensureToast();
  clearTimeout(_toastTimer);
  _toastEl.textContent = msg;
  _toastEl.classList.add('show');
  _toastTimer = setTimeout(() => _toastEl?.classList.remove('show'), ms);
}


// ─── 8. MODAL SYSTEM ────────────────────────────────────────────

let _modalResolve = null;
let _modalInited  = false;

function _initModal() {
  if (_modalInited) return;
  _modalInited = true;

  const root = document.createElement('div');
  root.id  = 'dhyaan-modal-root';
  root.innerHTML = `
    <div id="dhyaan-modal-backdrop">
      <div id="dhyaan-modal-box"
           role="dialog"
           aria-modal="true"
           aria-labelledby="dhyaan-modal-title"
           tabindex="-1">
        <div id="dhyaan-modal-title"></div>
        <div id="dhyaan-modal-body"></div>
        <div id="dhyaan-modal-footer"></div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) _closeModal(null);
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) {
      _closeModal(null);
    }
  });
}

function _openModal() {
  _initModal();
  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  backdrop.classList.add('open');
  // Focus the modal box for accessibility
  setTimeout(() => document.getElementById('dhyaan-modal-box')?.focus(), 50);
}

function _closeModal(result) {
  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => {
    const ids = ['dhyaan-modal-title', 'dhyaan-modal-body', 'dhyaan-modal-footer'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  }, 380);
  const resolve = _modalResolve;
  _modalResolve = null;
  resolve?.(result);
}

// Show a text-input prompt. Returns Promise<string|null>
function promptModal(title, placeholder = '', defaultValue = '') {
  return new Promise(resolve => {
    _modalResolve = resolve;
    _initModal();

    document.getElementById('dhyaan-modal-title').textContent = title;
    document.getElementById('dhyaan-modal-body').innerHTML = `
      <input id="dhyaan-modal-input" type="text"
             placeholder="${esc(placeholder)}"
             value="${esc(defaultValue)}"
             autocomplete="off" spellcheck="false" />`;
    document.getElementById('dhyaan-modal-footer').innerHTML = `
      <button class="modal-btn-ghost"  id="modal-cancel">Cancel</button>
      <button class="modal-btn-accent" id="modal-confirm">Confirm</button>`;

    _openModal();

    const input = document.getElementById('dhyaan-modal-input');
    const confirm = () => {
      const val = input.value.trim();
      if (!val) { input.focus(); input.style.borderColor = '#f87171'; return; }
      _closeModal(val);
    };
    document.getElementById('modal-cancel').addEventListener('click', () => _closeModal(null));
    document.getElementById('modal-confirm').addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    setTimeout(() => { input.focus(); input.select(); }, 80);
  });
}

// Show a pick list. Returns Promise<string|null> (resolves with item.id)
function pickModal(title, items) {
  return new Promise(resolve => {
    _modalResolve = resolve;
    _initModal();

    document.getElementById('dhyaan-modal-title').textContent = title;
    const list = items.map(it => `
      <button class="modal-pick-item" data-id="${esc(it.id)}">
        <div>
          <div class="modal-pick-name">${esc(it.name)}</div>
          ${it.sub ? `<div class="modal-pick-sub">${esc(it.sub)}</div>` : ''}
        </div>
      </button>`).join('');
    document.getElementById('dhyaan-modal-body').innerHTML =
      `<div class="modal-pick-list">${list || '<p style="color:var(--text-muted);font-size:.9rem;padding:8px 0">No playlists yet. Create one first.</p>'}</div>`;
    document.getElementById('dhyaan-modal-footer').innerHTML =
      `<button class="modal-btn-ghost" id="modal-cancel">Cancel</button>`;

    _openModal();

    document.getElementById('modal-cancel').addEventListener('click', () => _closeModal(null));
    document.getElementById('dhyaan-modal-body')
      .addEventListener('click', e => {
        const btn = e.target.closest('[data-id]');
        if (btn) _closeModal(btn.dataset.id);
      });
  });
}

// Show a confirmation dialog. Returns Promise<true|null>
function confirmModal(title, message, dangerLabel = 'Delete') {
  return new Promise(resolve => {
    _modalResolve = resolve;
    _initModal();

    document.getElementById('dhyaan-modal-title').textContent = title;
    document.getElementById('dhyaan-modal-body').innerHTML =
      `<p class="modal-confirm-msg">${message}</p>`;
    document.getElementById('dhyaan-modal-footer').innerHTML = `
      <button class="modal-btn-ghost" id="modal-cancel">Cancel</button>
      <button class="modal-btn-danger" id="modal-confirm">${esc(dangerLabel)}</button>`;

    _openModal();

    document.getElementById('modal-cancel').addEventListener('click', () => _closeModal(null));
    document.getElementById('modal-confirm').addEventListener('click', () => _closeModal(true));
  });
}


// ─── 9. LAZY IMAGE LOADING ──────────────────────────────────────

let _imgObserver = null;

function initLazyImages() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.track-img[data-src]').forEach(_loadImg);
    return;
  }
  _imgObserver?.disconnect();
  _imgObserver = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      const img = e.target;
      if (img.dataset.src) { _loadImg(img); }
      _imgObserver.unobserve(img);
    }),
    { rootMargin: '300px 0px', threshold: 0 }
  );
  document.querySelectorAll('.track-img[data-src]').forEach(img => _imgObserver.observe(img));
}

function _loadImg(img) {
  const src = img.dataset.src;
  if (!src) return;
  delete img.dataset.src;
  img.onload  = () => img.classList.add('loaded');
  img.onerror = () => { /* silently keep empty */ };
  img.src = src;
}

// Load the player bar thumbnail (not lazy — loads immediately on track change)
function _loadNpImage(src) {
  const img = document.getElementById('np-image');
  if (!img) return;
  img.classList.remove('loaded');
  img.src = '';
  if (!src) return;
  img.onload  = () => img.classList.add('loaded');
  img.onerror = () => { };
  img.src = src;
}

// Load the expand overlay background image
function _loadExpandImage(src) {
  const img = document.getElementById('expand-image');
  if (!img) return;
  img.classList.remove('loaded');
  img.src = '';
  if (!src) return;
  img.onload  = () => img.classList.add('loaded');
  img.onerror = () => { };
  img.src = src;
}


// ─── 10. SEARCH & FILTER ────────────────────────────────────────

function applyFilter() {
  const { selectedMood, searchQuery, favorites, activePlaylistId } = getState();

  let indices;

  if (activePlaylistId !== null) {
    const pl = _playlists.find(p => p.id === activePlaylistId);
    const urls = pl?.trackUrls || [];
    indices = urls
      .map(url => _allTracks.findIndex(t => t.audio_url === url))
      .filter(i => i !== -1);
  } else if (selectedMood === 'Favorites') {
    const favSet = new Set(favorites);
    indices = _allTracks
      .map((t, i) => (favSet.has(t.audio_url) ? i : -1))
      .filter(i => i !== -1);
  } else {
    indices = _allTracks.map((_, i) => i);
    if (selectedMood !== 'All') {
      indices = indices.filter(i => (_allTracks[i].moods || []).includes(selectedMood));
    }
  }

  // Apply search (works in all contexts including playlist view)
  const q = (searchQuery || '').trim().toLowerCase();
  if (q) {
    indices = indices.filter(i => {
      const t = _allTracks[i];
      return (
        t.title.toLowerCase().includes(q) ||
        (t.moods || []).some(m => m.toLowerCase().includes(q))
      );
    });
  }

  _filteredIndices = indices;
}


// ─── 11. RECOMMENDATIONS ────────────────────────────────────────

function getRecommendations(currentTrack, count = 5) {
  if (!currentTrack || _allTracks.length < 2) return [];
  const currentMoods = new Set(currentTrack.moods || []);
  const currentUrl   = currentTrack.audio_url;

  return _allTracks
    .filter(t => t.audio_url !== currentUrl)
    .map(t => {
      let score = 0;
      const tMoods = t.moods || [];
      tMoods.forEach(m => { if (currentMoods.has(m)) score += 3; });
      if (t.space === currentTrack.space)        score += 1;
      score += Math.min(_analytics.plays[t.audio_url] || 0, 5) * 0.4;
      score += Math.random() * 0.5; // slight randomization
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(x => x.t);
}


// ─── 12. TRACK CARD RENDERER ────────────────────────────────────

function makeTrackCard(track, origIdx, isActive, isFav, inPlaylist) {
  const moods = (track.moods || [])
    .map(m => `<span class="mood-tag">${esc(m)}</span>`)
    .join('');

  const playIcon  = isActive ? ICO.pause : ICO.play;
  const favCls    = isFav ? ' active' : '';
  const favIcon   = isFav ? ICO.heart  : ICO.heartOut;
  const favLabel  = isFav ? 'Remove from favorites' : 'Add to favorites';

  const plBtn = inPlaylist
    ? `<button class="icon-btn remove-pl-btn" aria-label="Remove from playlist" title="Remove" type="button">${ICO.remove}</button>`
    : `<button class="icon-btn add-pl-btn"    aria-label="Add to playlist"      title="Add to playlist"  type="button">${ICO.add}</button>`;

  const card = document.createElement('article');
  card.className = `track-card${isActive ? ' active' : ''}`;
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', track.title);
  card.dataset.trackIdx = origIdx;
  card.dataset.trackUrl = track.audio_url;

  card.innerHTML = `
    <div class="track-thumb">
      <img class="track-img"
           data-src="${esc(track.image_url?.low || '')}"
           alt="${esc(track.title)}"
           draggable="false" aria-hidden="true" />
      <div class="track-play-overlay" aria-hidden="true">
        <button class="track-play-btn" tabindex="-1" type="button"
                aria-label="${isActive ? 'Now playing' : 'Play'}">
          ${playIcon}
        </button>
      </div>
    </div>
    <div class="track-info">
      <div class="track-title">${esc(track.title)}</div>
      <div class="track-moods">${moods}</div>
    </div>
    <div class="track-actions">
      <button class="icon-btn fav-btn${favCls}"
              aria-label="${favLabel}" title="${favLabel}" type="button">
        ${favIcon}
      </button>
      ${plBtn}
      <button class="icon-btn dl-btn"
              aria-label="Download" title="Download" type="button">
        ${ICO.download}
      </button>
    </div>`;

  return card;
}

function renderTrackList() {
  const el = document.getElementById('track-list');
  if (!el) return;

  const { activePlaylistId, favorites } = getState();
  const inPlaylist = activePlaylistId !== null;
  const favSet     = new Set(favorites);

  // Playlist header
  let headerNode = null;
  if (inPlaylist) {
    const pl = _playlists.find(p => p.id === activePlaylistId);
    if (pl) {
      headerNode = document.createElement('div');
      headerNode.style.gridColumn = '1 / -1';
      headerNode.innerHTML = `
        <div class="playlist-view-header">
          <button class="pl-back-btn" id="pl-back-btn" aria-label="Back to library" type="button">
            ${ICO.back} <span style="margin-left:5px">Library</span>
          </button>
          <div class="pl-header-info">
            <div class="pl-header-name">${esc(pl.name)}</div>
            <div class="pl-header-count">
              ${_filteredIndices.length} track${_filteredIndices.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>`;
    }
  }

  if (!_filteredIndices.length) {
    el.innerHTML = '';
    if (headerNode) el.appendChild(headerNode);
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = _emptyMessage();
    el.appendChild(empty);
    _attachEmptyListeners();
    return;
  }

  const frag = document.createDocumentFragment();
  if (headerNode) frag.appendChild(headerNode);

  _filteredIndices.forEach((origIdx, pos) => {
    const track   = _allTracks[origIdx];
    if (!track) return;
    const card    = makeTrackCard(
      track, origIdx,
      origIdx === _currentOrigIdx,
      favSet.has(track.audio_url),
      inPlaylist
    );
    card.style.setProperty('--card-delay', `${Math.min(pos * 0.025, 0.25)}s`);
    frag.appendChild(card);
  });

  el.innerHTML = '';
  el.appendChild(frag);
  initLazyImages();
  _attachEmptyListeners();
}

function _emptyMessage() {
  const { selectedMood, searchQuery, activePlaylistId } = getState();
  if (activePlaylistId !== null)  return 'This playlist is empty.<br>Add tracks from the library.';
  if (searchQuery.trim())         return `No tracks found for "<em>${esc(searchQuery.trim())}</em>"`;
  if (selectedMood === 'Favorites') return 'No favourites yet.<br>Tap ♡ on any track to save it here.';
  if (selectedMood !== 'All')     return `No tracks tagged <em>${esc(selectedMood)}</em>`;
  return `Nothing to show.<br><button class="retry-btn" id="retry-load-btn">Retry loading</button>`;
}

function _attachEmptyListeners() {
  const back  = document.getElementById('pl-back-btn');
  const retry = document.getElementById('retry-load-btn');
  back?.addEventListener('click',  () => viewLibrary(), { once: true });
  retry?.addEventListener('click', () => location.reload(), { once: true });
}

// Update .active class on cards without re-rendering everything
function _syncActiveCard(origIdx) {
  document.querySelectorAll('.track-card').forEach(card => {
    const isActive = parseInt(card.dataset.trackIdx) === origIdx;
    card.classList.toggle('active', isActive);
    const playBtn = card.querySelector('.track-play-btn');
    if (playBtn) playBtn.innerHTML = isActive ? ICO.pause : ICO.play;
  });
}

// Update heart icon on all cards matching a URL
function _syncFavCards(url, isFav) {
  document.querySelectorAll(`.track-card[data-track-url="${CSS.escape(url)}"] .fav-btn`)
    .forEach(btn => {
      btn.classList.toggle('active', isFav);
      btn.innerHTML  = isFav ? ICO.heart : ICO.heartOut;
      btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
    });
}


// ─── 13. MOOD PILLS ─────────────────────────────────────────────

function _getMoods() {
  const seen = new Set();
  _allTracks.forEach(t => (t.moods || []).forEach(m => seen.add(m)));
  return ['All', 'Favorites', ...seen];
}

function renderMoodPills() {
  const el = document.getElementById('mood-pills');
  if (!el) return;
  const { selectedMood } = getState();
  const moods = _getMoods();

  el.innerHTML = moods.map(mood => {
    const icon   = MOOD_ICON[mood] || '●';
    const active = mood === selectedMood ? ' active' : '';
    return `<button class="mood-pill${active}"
              data-mood="${esc(mood)}"
              aria-pressed="${mood === selectedMood}"
              type="button">
              <span class="mood-icon">${icon}</span>${esc(mood)}
            </button>`;
  }).join('');
}


// ─── 14. NOW PLAYING UI ─────────────────────────────────────────

function updateNowPlaying(track) {
  if (!track) return;

  // Player bar
  const title = document.getElementById('np-title');
  const moods = document.getElementById('np-moods');
  if (title) title.textContent = track.title;
  if (moods) moods.textContent = (track.moods || []).join(' · ') || '―';

  // Player bar thumbnail
  _loadNpImage(track.image_url?.low || track.image_url?.high || '');

  // np-thumb glow uses :has() in CSS; no explicit JS needed

  // Expand overlay
  const expTitle = document.getElementById('expand-title');
  const expMoods = document.getElementById('expand-moods');
  if (expTitle) expTitle.textContent = track.title;
  if (expMoods) expMoods.textContent = (track.moods || []).join(' · ');

  // Expand image (high-res)
  _loadExpandImage(track.image_url?.high || track.image_url?.low || '');

  // Page title
  document.title = `${track.title} — Dhyaan`;

  // Media Session
  updateMediaSession(track);

  // Meta theme-color (keep current theme's bg)
  // (already set by applyTheme, no change needed)
}


// ─── 15. PROGRESS BAR ───────────────────────────────────────────

let _mainDragging   = false;
let _expandDragging = false;

function initSeekBar(barId, filledId, thumbId, buffId, onStart, onEnd) {
  const bar = document.getElementById(barId);
  if (!bar) return;

  let dragging = false;

  function getPct(clientX) {
    const rect = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function applyPct(pct) {
    const filled = document.getElementById(filledId);
    const thumb  = document.getElementById(thumbId);
    if (filled) filled.style.width = `${pct * 100}%`;
    if (thumb)  thumb.style.left   = `${pct * 100}%`;
    bar.setAttribute('aria-valuenow', Math.round(pct * 100));
    onStart(pct);
  }

  bar.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    barId === 'progress-bar'
      ? (_mainDragging = true)
      : (_expandDragging = true);
    bar.classList.add('dragging');
    try { bar.setPointerCapture(e.pointerId); } catch { }
    applyPct(getPct(e.clientX));
  }, { passive: false });

  bar.addEventListener('pointermove', e => {
    if (!dragging) return;
    applyPct(getPct(e.clientX));
  }, { passive: true });

  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    barId === 'progress-bar'
      ? (_mainDragging = false)
      : (_expandDragging = false);
    bar.classList.remove('dragging');
    const pct = getPct(e.clientX);
    const filled = document.getElementById(filledId);
    const thumb  = document.getElementById(thumbId);
    if (filled) filled.style.width = `${pct * 100}%`;
    if (thumb)  thumb.style.left   = `${pct * 100}%`;
    onEnd(pct);
  };

  bar.addEventListener('pointerup',     endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // Keyboard: arrow keys, Home, End
  bar.addEventListener('keydown', e => {
    const cur = parseFloat(bar.getAttribute('aria-valuenow') || '0') / 100;
    let pct = cur;
    if      (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')  pct = Math.max(0, cur - 0.01);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')    pct = Math.min(1, cur + 0.01);
    else if (e.key === 'Home')                                  pct = 0;
    else if (e.key === 'End')                                   pct = 1;
    else return;
    e.preventDefault();
    applyPct(pct);
    onEnd(pct);
  });
}

function updateProgressUI(ct, dur, bufferedPct) {
  const pct  = dur > 0 ? Math.min(ct / dur, 1) : 0;
  const pctP = `${pct * 100}%`;
  const bPct  = `${(bufferedPct || 0) * 100}%`;

  // Main progress bar (suppress during drag)
  if (!_mainDragging) {
    const fill = document.getElementById('progress-filled');
    const thb  = document.getElementById('progress-thumb');
    const buf  = document.getElementById('progress-buffered');
    if (fill) fill.style.width = pctP;
    if (thb)  thb.style.left   = pctP;
    if (buf)  buf.style.width  = bPct;
    document.getElementById('progress-bar')
      ?.setAttribute('aria-valuenow', Math.round(pct * 100));
  }

  // Expand progress bar (suppress during drag)
  if (!_expandDragging) {
    const xFill = document.getElementById('expand-filled');
    const xThb  = document.getElementById('expand-thumb');
    const xBuf  = document.getElementById('expand-buffered');
    if (xFill) xFill.style.width = pctP;
    if (xThb)  xThb.style.left   = pctP;
    if (xBuf)  xBuf.style.width  = bPct;
    document.getElementById('expand-progress-bar')
      ?.setAttribute('aria-valuenow', Math.round(pct * 100));
  }

  // Time labels
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('current-time',   fmt(ct));
  setTxt('duration',       fmt(dur));
  setTxt('expand-current', fmt(ct));
  setTxt('expand-duration',fmt(dur));
}


// ─── 16. PLAYER CONTROLS UI ─────────────────────────────────────

function updatePlayPauseUI(isPlaying) {
  const icon  = isPlaying ? ICO.pause : ICO.play;
  const label = isPlaying ? 'Pause'   : 'Play';

  ['play-pause-btn', 'expand-play-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.innerHTML  = icon;
    btn.setAttribute('aria-label', label);
  });
  setVizPlaying(isPlaying);
}

function updateShuffleUI(shuffle) {
  ['shuffle-btn', 'expand-shuffle'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', shuffle);
  });
}

function updateRepeatUI(mode) {
  const icon  = mode === 'one' ? ICO.repeatOne : ICO.repeatAll;
  const label = mode === 'none' ? 'Repeat: off'
    : mode === 'all' ? 'Repeat: all' : 'Repeat: one';

  ['repeat-btn', 'expand-repeat'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', mode !== 'none');
    btn.innerHTML = icon;
    btn.setAttribute('aria-label', label);
  });
}

function _updateVolumeUI(vol) {
  const slider = document.getElementById('volume-slider');
  if (slider) {
    slider.value = Math.round(vol * 100);
    slider.style.setProperty('--vol-fill', `${vol * 100}%`);
  }
  _updateMuteUI(_audio.muted || vol === 0);
}

function _updateMuteUI(muted) {
  const btn = document.getElementById('mute-btn');
  if (!btn) return;
  btn.classList.toggle('muted', muted);
  btn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
}

function initPlayerControls() {
  // Main play/pause
  document.getElementById('play-pause-btn')?.addEventListener('click', () => _togglePlay());

  // Prev / Next
  document.getElementById('prev-btn')?.addEventListener('click', () => _prevTrack());
  document.getElementById('next-btn')?.addEventListener('click', () => _nextTrack());

  // Seek buttons (desktop only via CSS visibility)
  document.getElementById('seek-bwd')?.addEventListener('click', () => _seekBy(-SEEK_SECONDS));
  document.getElementById('seek-fwd')?.addEventListener('click', () => _seekBy( SEEK_SECONDS));

  // Shuffle
  document.getElementById('shuffle-btn')?.addEventListener('click', () => {
    const next = !getState().shuffleMode;
    setState({ shuffleMode: next });
    updateShuffleUI(next);
    showToast(next ? 'Shuffle on' : 'Shuffle off');
  });

  // Repeat
  document.getElementById('repeat-btn')?.addEventListener('click', () => {
    const modes = ['none', 'all', 'one'];
    const cur   = modes.indexOf(getState().repeatMode);
    const next  = modes[(cur + 1) % modes.length];
    setState({ repeatMode: next });
    updateRepeatUI(next);
  });

  // Volume slider
  const volSlider = document.getElementById('volume-slider');
  if (volSlider) {
    _updateVolumeUI(getState().volume);
    volSlider.addEventListener('input', () => {
      _setVolume(parseInt(volSlider.value) / 100);
    });
  }

  // Mute button
  document.getElementById('mute-btn')?.addEventListener('click', () => {
    const nowMuted = !_audio.muted;
    _setMuted(nowMuted);
    if (!nowMuted && _audio.volume < 0.01) _setVolume(0.5);
  });

  // Expand button (desktop)
  document.getElementById('expand-btn')?.addEventListener('click', openExpand);

  // Expand button (mobile, in player bar)
  document.getElementById('expand-btn-mobile')?.addEventListener('click', openExpand);

  // Main progress bar
  initSeekBar(
    'progress-bar', 'progress-filled', 'progress-thumb', 'progress-buffered',
    () => { },                            // onStart: visual only (handled in initSeekBar)
    pct => { _seekTo(pct); }              // onEnd: actually seek
  );

  // Expand progress bar
  initSeekBar(
    'expand-progress-bar', 'expand-filled', 'expand-thumb', 'expand-buffered',
    () => { },
    pct => { _seekTo(pct); }
  );

  // Track list event delegation
  const trackListEl = document.getElementById('track-list');
  if (trackListEl) {
    trackListEl.addEventListener('click', e => {
      // Download
      if (e.target.closest('.dl-btn')) {
        const card = e.target.closest('.track-card');
        downloadTrack(_allTracks[parseInt(card?.dataset.trackIdx)]);
        return;
      }
      // Favourite
      if (e.target.closest('.fav-btn')) {
        const card = e.target.closest('.track-card');
        toggleFavorite(card?.dataset.trackUrl);
        return;
      }
      // Add to playlist
      if (e.target.closest('.add-pl-btn')) {
        const card = e.target.closest('.track-card');
        addToPlaylistFlow(_allTracks[parseInt(card?.dataset.trackIdx)]);
        return;
      }
      // Remove from playlist
      if (e.target.closest('.remove-pl-btn')) {
        const card = e.target.closest('.track-card');
        removeFromPlaylist(card?.dataset.trackUrl);
        return;
      }
      // Play card
      const card = e.target.closest('.track-card');
      if (card) {
        const origIdx = parseInt(card.dataset.trackIdx);
        if (!isNaN(origIdx)) playFromLibrary(origIdx);
      }
    });
  }

  // Mood pills delegation
  const moodEl = document.getElementById('mood-pills');
  if (moodEl) {
    moodEl.addEventListener('click', e => {
      const pill = e.target.closest('.mood-pill');
      if (!pill) return;
      const mood = pill.dataset.mood;
      setState({ selectedMood: mood, searchQuery: '', activePlaylistId: null });
      viewLibrary(mood);
    });
  }

  // Search input
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  if (searchInput) {
    let _searchTimer = null;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      searchClear.hidden = !q;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        setState({ searchQuery: q });
        applyFilter();
        renderTrackList();
      }, 200);
    });
    searchInput.value = getState().searchQuery || '';
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.hidden = true;
      setState({ searchQuery: '' });
      applyFilter();
      renderTrackList();
      searchInput?.focus();
    });
    searchClear.hidden = !getState().searchQuery;
  }
}


// ─── 17. EXPAND MODE ────────────────────────────────────────────

let _ctrlTimer = null;

function openExpand() {
  if (!_allTracks[_currentOrigIdx]) {
    showToast('Select a track first');
    return;
  }
  document.body.classList.add('expand-mode');
  document.getElementById('expand-overlay').setAttribute('aria-hidden', 'false');
  showExpandControls();
  renderExpandRecos();
  // Trap focus
  document.getElementById('expand-overlay')?.focus();
}

function closeExpand() {
  document.body.classList.remove('expand-mode', 'controls-visible');
  document.getElementById('expand-overlay').setAttribute('aria-hidden', 'true');
  clearTimeout(_ctrlTimer);
  setState({ expandMode: false });
}

function showExpandControls() {
  document.body.classList.add('controls-visible');
  clearTimeout(_ctrlTimer);
  _ctrlTimer = setTimeout(hideExpandControls, CTRL_HIDE_MS);
}

function hideExpandControls() {
  document.body.classList.remove('controls-visible');
}

function renderExpandRecos() {
  const track = _allTracks[_currentOrigIdx];
  if (!track) return;

  const recos = getRecommendations(track, 5);
  if (!recos.length) return;

  // Remove existing panel if present
  document.querySelector('.expand-reco-panel')?.remove();

  const panel = document.createElement('div');
  panel.className = 'expand-reco-panel';
  panel.innerHTML = `
    <div class="expand-reco-label">You might also like</div>
    <div class="expand-reco-list">
      ${recos.map(t => `
        <div class="expand-reco-item" data-track-url="${esc(t.audio_url)}" tabindex="0"
             role="button" aria-label="Play: ${esc(t.title)}">
          <div class="expand-reco-thumb"
               style="background-image:url('${esc(t.image_url?.low || '')}')"></div>
          <div class="expand-reco-name">${esc(t.title)}</div>
        </div>`).join('')}
    </div>`;

  document.querySelector('.expand-ui')?.appendChild(panel);
}

function initExpandMode() {
  const overlay = document.getElementById('expand-overlay');
  if (!overlay) return;

  // Expand controls
  document.getElementById('expand-play-btn')?.addEventListener('click', () => { _togglePlay(); showExpandControls(); });
  document.getElementById('expand-prev')?.addEventListener('click', () => { _prevTrack(); showExpandControls(); });
  document.getElementById('expand-next')?.addEventListener('click', () => { _nextTrack(); showExpandControls(); });
  document.getElementById('expand-shuffle')?.addEventListener('click', () => {
    const next = !getState().shuffleMode;
    setState({ shuffleMode: next });
    updateShuffleUI(next);
    showExpandControls();
    showToast(next ? 'Shuffle on' : 'Shuffle off');
  });
  document.getElementById('expand-repeat')?.addEventListener('click', () => {
    const modes = ['none', 'all', 'one'];
    const cur   = modes.indexOf(getState().repeatMode);
    const next  = modes[(cur + 1) % modes.length];
    setState({ repeatMode: next });
    updateRepeatUI(next);
    showExpandControls();
  });

  // Collapse button
  document.getElementById('collapse-btn')?.addEventListener('click', closeExpand);

  // Tap overlay to show controls (on mobile: tap anywhere non-interactive)
  overlay.addEventListener('click', e => {
    // Don't intercept clicks on buttons or interactive elements
    if (e.target.closest('button, [role="button"], [role="slider"], a, .expand-reco-item')) return;
    showExpandControls();
  });

  // Mouse move on desktop: show controls
  let _mouseTimer = null;
  overlay.addEventListener('mousemove', () => {
    showExpandControls();
    clearTimeout(_mouseTimer);
    _mouseTimer = setTimeout(hideExpandControls, CTRL_HIDE_MS);
  }, { passive: true });

  // Swipe down to close (touch devices)
  let _swipeStartY = 0;
  let _swipeStartT = 0;
  overlay.addEventListener('touchstart', e => {
    if (e.target.closest('button, [role="slider"], .expand-reco-item')) return;
    _swipeStartY = e.touches[0].clientY;
    _swipeStartT = Date.now();
  }, { passive: true });
  overlay.addEventListener('touchend', e => {
    if (!_swipeStartY) return;
    const dy = e.changedTouches[0].clientY - _swipeStartY;
    const dt = Date.now() - _swipeStartT;
    _swipeStartY = 0;
    if (dy > 80 && dt < 450) closeExpand();
  }, { passive: true });

  // Reco click delegation
  overlay.addEventListener('click', e => {
    const item = e.target.closest('.expand-reco-item');
    if (!item) return;
    const url = item.dataset.trackUrl;
    const origIdx = _allTracks.findIndex(t => t.audio_url === url);
    if (origIdx !== -1) {
      playFromLibrary(origIdx);
      showExpandControls();
    }
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('expand-mode')) {
      closeExpand();
    }
  });
}


// ─── 18. SIDEBAR & PLAYLISTS ────────────────────────────────────

function openSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar?.classList.add('open');
  backdrop?.classList.add('open');
  document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';

  // FIX ISSUE 2 — Ghost-click protection:
  // After a touchend, mobile browsers synthesize a 'click' event at the same
  // coordinates (~0–350ms later). If the backdrop already has pointer-events:all
  // that ghost-click would fire on the backdrop and immediately close the sidebar.
  // We disable backdrop pointer-events for 380ms to let any pending ghost clicks pass.
  if (backdrop) {
    backdrop.style.pointerEvents = 'none';
    setTimeout(() => { backdrop.style.pointerEvents = ''; }, 380);
  }

  // Focus close button for accessibility
  setTimeout(() => document.getElementById('sidebar-close-btn')?.focus(), 80);
}

function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('open');
  document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function renderPlaylists() {
  const el = document.getElementById('playlists-container');
  if (!el) return;
  const { activePlaylistId } = getState();

  if (!_playlists.length) {
    el.innerHTML = '<p class="empty-pl">No playlists yet.</p>';
    return;
  }

  el.innerHTML = _playlists.map(pl => {
    const active = pl.id === activePlaylistId ? ' active' : '';
    return `
      <div class="pl-item${active}" role="listitem" data-pl-id="${esc(pl.id)}" tabindex="0">
        <span class="pl-name">${esc(pl.name)}</span>
        <span class="pl-count">${pl.trackUrls?.length || 0}</span>
        <div class="pl-actions">
          <button class="pl-rename-btn" data-pl-id="${esc(pl.id)}"
                  aria-label="Rename ${esc(pl.name)}" title="Rename" type="button">
            ${ICO.rename}
          </button>
          <button class="pl-delete-btn" data-pl-id="${esc(pl.id)}"
                  aria-label="Delete ${esc(pl.name)}" title="Delete" type="button">
            ${ICO.trash}
          </button>
        </div>
      </div>`;
  }).join('');
}

function initSidebar() {
  // Open/close
  document.getElementById('mobile-menu-btn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);

  // FIX ISSUE 2 — Backdrop click handler:
  // Root cause: addEventListener('click', closeSidebar) with no target check.
  // On mobile WebKit, synthetic 'click' events from touchend can be dispatched
  // to multiple hit-test candidates at the same viewport coordinates. The backdrop
  // (position:fixed; inset:0; pointer-events:all) and the sidebar (z-index above it)
  // both receive the event simultaneously in some browsers, causing the sidebar to
  // close immediately after a user taps a theme swatch or playlist item inside it.
  //
  // Fix: only close when e.target IS the backdrop element itself. Since the sidebar
  // is a DOM sibling (not a child) of the backdrop, any legitimate "tap outside"
  // click will correctly report e.target === backdrop. Clicks originating from
  // inside the sidebar will have e.target set to that sidebar child element,
  // which is !== backdrop, so closeSidebar() will not fire.
  const backdropEl = document.getElementById('sidebar-backdrop');
  if (backdropEl) {
    backdropEl.addEventListener('click', e => {
      if (e.target === backdropEl) closeSidebar();
    });
  }

  // New playlist
  document.getElementById('new-playlist-btn')?.addEventListener('click', async () => {
    const name = await promptModal('New Playlist', 'Playlist name…');
    if (!name) return;
    const pl = { id: Date.now().toString(), name, trackUrls: [] };
    _playlists.push(pl);
    savePlaylists();
    renderPlaylists();
    showToast(`Created "${name}"`);
  });

  // Playlist list delegation
  const container = document.getElementById('playlists-container');
  if (container) {
    container.addEventListener('click', async e => {
      // Rename
      const renameBtn = e.target.closest('.pl-rename-btn');
      if (renameBtn) {
        e.stopPropagation();
        const id = renameBtn.dataset.plId;
        const pl = _playlists.find(p => p.id === id);
        if (!pl) return;
        const newName = await promptModal('Rename Playlist', 'New name…', pl.name);
        if (!newName) return;
        pl.name = newName;
        savePlaylists();
        renderPlaylists();
        // Update header if currently viewing this playlist
        if (getState().activePlaylistId === id) renderTrackList();
        showToast('Renamed ✓');
        return;
      }
      // Delete
      const deleteBtn = e.target.closest('.pl-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const id  = deleteBtn.dataset.plId;
        const pl  = _playlists.find(p => p.id === id);
        if (!pl) return;
        const ok = await confirmModal('Delete Playlist', `Delete "${pl.name}"? This can't be undone.`);
        if (!ok) return;
        _playlists = _playlists.filter(p => p.id !== id);
        savePlaylists();
        if (getState().activePlaylistId === id) viewLibrary();
        renderPlaylists();
        showToast('Playlist deleted');
        return;
      }
      // Open playlist
      const item = e.target.closest('.pl-item');
      if (item) {
        const id = item.dataset.plId;
        closeSidebar();
        viewPlaylist(id);
      }
    });

    // Keyboard: Enter on playlist items
    container.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const item = e.target.closest('.pl-item');
        if (item) { item.click(); }
      }
    });
  }

  // Mobile theme swatches (in sidebar)
  // FIX ISSUE 2 — Defensive stopPropagation on sidebar swatch clicks:
  // Prevents any possibility of the click event propagating out of the sidebar
  // and being mis-handled by document-level listeners. Note: stopPropagation
  // here travels up the DOM tree (swatch → sidebar), not to sibling elements,
  // but it closes the door on future edge cases.
  const sidebar = document.getElementById('sidebar');
  sidebar?.addEventListener('click', e => {
    e.stopPropagation(); // Keep all sidebar interaction events contained
    const swatch = e.target.closest('[data-theme-swatch]');
    if (swatch) applyTheme(swatch.dataset.themeSwatch);
  });
}

async function addToPlaylistFlow(track) {
  if (!track) return;
  if (!_playlists.length) {
    const ok = await confirmModal('Add to Playlist',
      'You have no playlists yet. Create one first?', 'Create');
    if (!ok) return;
    const name = await promptModal('New Playlist', 'Playlist name…');
    if (!name) return;
    const pl = { id: Date.now().toString(), name, trackUrls: [] };
    _playlists.push(pl);
    savePlaylists();
    pl.trackUrls.push(track.audio_url);
    savePlaylists();
    renderPlaylists();
    showToast(`Added to "${name}"`);
    return;
  }

  const items = _playlists
    .filter(pl => !pl.trackUrls?.includes(track.audio_url))
    .map(pl => ({ id: pl.id, name: pl.name, sub: `${pl.trackUrls?.length || 0} tracks` }));

  if (!items.length) { showToast('Already in all playlists'); return; }

  const plId = await pickModal('Add to Playlist', items);
  if (!plId) return;
  const pl = _playlists.find(p => p.id === plId);
  if (!pl) return;
  if (!pl.trackUrls) pl.trackUrls = [];
  pl.trackUrls.push(track.audio_url);
  savePlaylists();
  renderPlaylists();
  showToast(`Added to "${pl.name}" ✓`);
}

function removeFromPlaylist(trackUrl) {
  const { activePlaylistId } = getState();
  if (!activePlaylistId || !trackUrl) return;
  const pl = _playlists.find(p => p.id === activePlaylistId);
  if (!pl) return;
  pl.trackUrls = (pl.trackUrls || []).filter(u => u !== trackUrl);
  savePlaylists();
  applyFilter();
  renderTrackList();
  renderPlaylists();
  showToast('Removed from playlist');
}

function toggleFavorite(url) {
  if (!url) return;
  const { favorites } = getState();
  const isFav  = favorites.includes(url);
  const newFavs = isFav
    ? favorites.filter(u => u !== url)
    : [...favorites, url];
  setState({ favorites: newFavs });
  _syncFavCards(url, !isFav);
  showToast(isFav ? 'Removed from favourites' : 'Added to favourites ♡');
  // Re-render if in Favorites view and we just removed one
  if (isFav && getState().selectedMood === 'Favorites') {
    applyFilter();
    renderTrackList();
  }
}


// ─── 19. THEME SYSTEM ───────────────────────────────────────────

function applyTheme(name) {
  if (!THEMES.includes(name)) name = 'zen-dark';
  document.body.setAttribute('data-theme', name);
  setState({ theme: name });

  // Update meta theme-color to match the new bg
  const bg = getComputedStyle(document.body).getPropertyValue('--bg-primary').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.content = bg || '#0a0f0d');

  // Sync desktop dots
  document.querySelectorAll('[data-theme-btn]').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.themeBtn === name);
  });

  // Sync mobile sidebar swatches
  document.querySelectorAll('[data-theme-swatch]').forEach(s => {
    s.classList.toggle('active', s.dataset.themeSwatch === name);
  });
}

function initThemeDots() {
  document.addEventListener('click', e => {
    const dot = e.target.closest('[data-theme-btn]');
    if (dot) applyTheme(dot.dataset.themeBtn);
  });
  // Set initial active state
  applyTheme(getState().theme || 'zen-dark');
}


// ─── 20. DOWNLOAD ───────────────────────────────────────────────

async function downloadTrack(track) {
  if (!track?.audio_url) return;

  // On coarse-pointer devices (mobile), blob approach risks OOM on large files
  if (isMobilePointer()) {
    window.open(track.audio_url, '_blank');
    showToast('Opening audio — long-press to save ↓');
    return;
  }

  showToast('Preparing download…', 10_000);
  try {
    const res = await fetch(track.audio_url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const burl = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href:     burl,
      download: `${track.title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')}.mp3`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(burl), 90_000);
    showToast('Download started ↓');
  } catch {
    window.open(track.audio_url, '_blank');
    showToast('Opening in new tab — save with browser');
  }
}


// ─── 21. NETWORK STATUS ─────────────────────────────────────────

function initNetworkStatus() {
  window.addEventListener('online',  () => showToast('Back online ✓'));
  window.addEventListener('offline', () => showToast('You\'re offline — cached audio still plays'));
}


// ─── 22. KEYBOARD SHORTCUTS ─────────────────────────────────────

function initKeyboard() {
  document.addEventListener('keydown', e => {
    // Ignore when typing in inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        _togglePlay();
        break;
      case 'ArrowLeft':
        if (e.shiftKey) { e.preventDefault(); _prevTrack(); }
        else            { e.preventDefault(); _seekBy(-SEEK_SECONDS); }
        break;
      case 'ArrowRight':
        if (e.shiftKey) { e.preventDefault(); _nextTrack(); }
        else            { e.preventDefault(); _seekBy( SEEK_SECONDS); }
        break;
      case 'ArrowUp':
        e.preventDefault();
        _setVolume(Math.min(1, getState().volume + 0.05));
        break;
      case 'ArrowDown':
        e.preventDefault();
        _setVolume(Math.max(0, getState().volume - 0.05));
        break;
      case 'm': case 'M':
        _setMuted(!_audio.muted);
        break;
      case 's': case 'S': {
        const next = !getState().shuffleMode;
        setState({ shuffleMode: next });
        updateShuffleUI(next);
        showToast(next ? 'Shuffle on' : 'Shuffle off');
        break;
      }
      case 'r': case 'R': {
        const modes = ['none', 'all', 'one'];
        const next  = modes[(modes.indexOf(getState().repeatMode) + 1) % modes.length];
        setState({ repeatMode: next });
        updateRepeatUI(next);
        break;
      }
      case 'e': case 'E':
        if (document.body.classList.contains('expand-mode')) closeExpand();
        else openExpand();
        break;
      case 'l': case 'L': {
        const low = !getState().lowPowerMode;
        setState({ lowPowerMode: low });
        document.body.classList.toggle('low-power', low);
        showToast(low ? 'Low power mode on' : 'Low power mode off');
        break;
      }
      case 'f': case 'F': {
        const track = _allTracks[_currentOrigIdx];
        if (track) toggleFavorite(track.audio_url);
        break;
      }
      case '?':
        showAboutModal();
        break;
      default:
        break;
    }
  });
}


// ─── 23. ABOUT MODAL ────────────────────────────────────────────

function showAboutModal() {
  _initModal();
  document.getElementById('dhyaan-modal-title').textContent = 'About Dhyaan';
  document.getElementById('dhyaan-modal-body').innerHTML = `
    <p class="about-tagline">A Living Meditation Experience</p>
    <div class="about-divider">· · ·</div>
    <p class="about-text">
      Dhyaan is a sanctuary of sound — a space where ambient music and silence
      meet to help you <em>slow down, breathe, and be present</em>.
    </p>
    <p class="about-text">
      Every track, every transition, every particle of light is designed
      to dissolve distraction and invite stillness.
    </p>
    <div class="about-divider">· · ·</div>
    <p class="about-text" style="font-size:.88rem; color:var(--text-muted)">
      <strong style="color:var(--text-secondary)">Keyboard shortcuts:</strong><br>
      <kbd>Space</kbd> Play / Pause &nbsp;
      <kbd>← →</kbd> Seek &nbsp;
      <kbd>Shift+← →</kbd> Prev / Next<br>
      <kbd>↑ ↓</kbd> Volume &nbsp;
      <kbd>M</kbd> Mute &nbsp;
      <kbd>S</kbd> Shuffle &nbsp;
      <kbd>R</kbd> Repeat<br>
      <kbd>E</kbd> Immersive &nbsp;
      <kbd>F</kbd> Favourite &nbsp;
      <kbd>L</kbd> Low power &nbsp;
      <kbd>?</kbd> About
    </p>
    <p class="about-footer-text">Dhyaan v2.0 · Made with intention</p>`;
  document.getElementById('dhyaan-modal-footer').innerHTML =
    `<button class="modal-btn-accent" id="modal-confirm">Begin</button>`;

  _openModal();
  document.getElementById('modal-confirm')?.addEventListener('click', () => _closeModal(null));
}

function initLogoBtn() {
  document.querySelector('.logo')?.addEventListener('click', showAboutModal);
}


// ─── 24. APP ORCHESTRATION ──────────────────────────────────────

function viewLibrary(mood) {
  const activeMood = mood ?? getState().selectedMood;
  setState({ activePlaylistId: null, selectedMood: activeMood });
  applyFilter();
  renderMoodPills();
  renderTrackList();
  renderPlaylists(); // update active state in sidebar
}

function viewPlaylist(id) {
  setState({ activePlaylistId: id, searchQuery: '' });
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  document.getElementById('search-clear').hidden = true;
  applyFilter();
  renderMoodPills(); // deactivate mood pills
  renderTrackList();
  renderPlaylists();
}

// Called by Audio Engine on every track change
function handleTrackChange(track, _qIdx, origIdx) {
  _currentOrigIdx = origIdx;
  updateNowPlaying(track);
  updatePlayPauseUI(false); // will flip to play once playing event fires
  _syncActiveCard(origIdx);
  renderExpandRecos();

  // FIX ISSUE 5 — Conditional scrollIntoView:
  // On touch/mobile devices, scrollIntoView({ behavior: 'smooth' }) causes iOS
  // Safari to briefly recalculate the compositor viewport, which combined with
  // vw-based font scaling creates a visible "zoom" between meditations.
  // On desktop (pointer: fine), smooth scroll is fine and expected behaviour.
  // On mobile, the user can already see or manually scroll to the active card.
  const isDesktop = window.matchMedia('(pointer: fine)').matches;
  if (isDesktop) {
    const activeCard = document.querySelector('.track-card.active');
    if (activeCard) {
      activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Save state
  setState({
    lastTrackUrl: track.audio_url,
    currentTime:  0,
  });

  // Update shuffle/repeat UI (in case state was restored)
  const { shuffleMode, repeatMode } = getState();
  updateShuffleUI(shuffleMode);
  updateRepeatUI(repeatMode);
}

// Called on timeupdate
function handleProgress(ct, dur, bufferedPct) {
  updateProgressUI(ct, dur, bufferedPct);
}

// Called on play/pause/waiting/error state changes
function handleStateChange(state) {
  const isPlaying = state === 'playing';
  updatePlayPauseUI(isPlaying);
  setVizPlaying(isPlaying);

  if (state === 'error') {
    // Already handled in audio engine
  }
}

// Restore saved queue + track on startup (called after tracks are loaded)
function _restorePlaybackState() {
  const { lastTrackUrl, queueUrls, currentQueueIndex, volume,
          shuffleMode, repeatMode, lowPowerMode } = getState();

  // Apply volume
  _audio.volume = volume ?? 0.75;
  _updateVolumeUI(_audio.volume);

  // Apply shuffle / repeat
  updateShuffleUI(shuffleMode);
  updateRepeatUI(repeatMode);

  // Apply low power mode
  if (lowPowerMode || isLowEndDevice()) {
    document.body.classList.add('low-power');
    if (!lowPowerMode) setState({ lowPowerMode: true });
  }

  // Restore queue
  if (queueUrls?.length) {
    const restored = queueUrls
      .map(u => _allTracks.findIndex(t => t.audio_url === u))
      .filter(i => i !== -1);
    if (restored.length) {
      _queue = restored;
      _queueIndex = Math.min(currentQueueIndex || 0, _queue.length - 1);
    }
  }

  // No last track? Nothing to restore.
  if (!lastTrackUrl) return;

  const origIdx = _allTracks.findIndex(t => t.audio_url === lastTrackUrl);
  if (origIdx === -1) return;

  _currentOrigIdx = origIdx;

  // Ensure queueIndex points to this track
  const posInQ = _queue.indexOf(origIdx);
  if (posInQ !== -1) _queueIndex = posInQ;

  // Load track metadata (no autoplay)
  _audio.src = lastTrackUrl;
  // currentTime will be applied in 'loadedmetadata' listener in audio engine

  // Update UI with saved track info
  handleTrackChange(_allTracks[origIdx], _queueIndex, origIdx);
  updatePlayPauseUI(false); // Not playing until user presses play
}

// Register Service Worker
function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Update ready — refresh to apply ↺', 6000);
          }
        });
      });
    })
    .catch(err => console.warn('[Dhyaan] SW registration failed:', err));
}


// ─── 25. BOOT ───────────────────────────────────────────────────

async function boot() {
  // 1. Load persisted state
  loadState();
  loadPlaylists();
  loadAnalytics();

  // 2. Apply saved theme immediately (before any paint)
  applyTheme(getState().theme || 'zen-dark');

  // 3. Init ambient particle system
  initVisualizer();

  // 4. Init Media Session (lock-screen controls)
  initMediaSession();

  // 5. Set audio callbacks
  _cb.onTrackChange  = handleTrackChange;
  _cb.onProgress     = handleProgress;
  _cb.onStateChange  = handleStateChange;

  // 6. Wire up all interactive elements
  initPlayerControls();
  initExpandMode();
  initSidebar();
  initThemeDots();
  initKeyboard();
  initNetworkStatus();
  initLogoBtn();
  updateRepeatUI(getState().repeatMode || 'none');
  updateShuffleUI(getState().shuffleMode || false);

  // 7. Fetch track library
  let tracks = [];
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tracks = await res.json();
    if (!Array.isArray(tracks) || !tracks.length) throw new Error('Empty library');
  } catch (err) {
    console.error('[Dhyaan] Failed to load tracks:', err);
    const el = document.getElementById('track-list');
    if (el) {
      el.innerHTML = `
        <div class="empty-state">
          <p>Could not load the meditation library.</p>
          <p style="margin-top:6px;font-size:.82rem;color:var(--text-muted)">
            Check your connection and try again.
          </p>
          <button class="retry-btn" onclick="location.reload()">Retry</button>
        </div>`;
    }
    return;
  }

  _allTracks = tracks;

  // 8. Build initial filtered list
  applyFilter();

  // 9. Build default queue (all tracks in order)
  if (!_queue.length) {
    _queue = _allTracks.map((_, i) => i);
  }

  // 10. Render initial UI
  renderMoodPills();
  renderTrackList();
  renderPlaylists();

  // 11. Restore previous session
  _restorePlaybackState();

  // 12. Register Service Worker
  _registerSW();
}

document.addEventListener('DOMContentLoaded', boot);
