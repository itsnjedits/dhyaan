// player.js — Audio engine with proper queue context + mobile/sync fixes
import { CONFIG } from './config.js';
import { saveState, getState, recordPlay, recordCompletion, recordSkip, recordListenTime, flushListenTime } from './storage.js';

let _allTracks   = [];
let _queue       = [];
let _queueIndex  = 0;
let _audio       = new Audio();
let _nextAudio   = new Audio();
let _preloadTimer   = null;
let _listenTimer    = null; // unused — kept for API compat
let _listenAccum    = 0;
let _playStartTime  = null;

// Drag state (set by index.html seek bar; prevents progress jumps while dragging)
let _isDragging = false;

// Callbacks
let _onTrackChange = null;
let _onProgress    = null;
let _onStateChange = null;

_audio.preload    = 'none';
_nextAudio.preload = 'none';

// ── Drag-state bridge ────────────────────────────────────────────────────────
// index.html dispatches these custom events so the player can pause progress updates
document.addEventListener('dhyaan:drag-start', () => { _isDragging = true; });
document.addEventListener('dhyaan:drag-end',   () => { _isDragging = false; });

// ── Init ──────────────────────────────────────────────────────────────────────
export function initPlayer(tracks, callbacks = {}) {
  _allTracks     = tracks;
  _onTrackChange = callbacks.onTrackChange || (() => {});
  _onProgress    = callbacks.onProgress    || (() => {});
  _onStateChange = callbacks.onStateChange || (() => {});

  const state    = getState();
  _audio.volume  = state.volume ?? 0.75;

  // ── Audio event listeners ───────────────────────────────────────────────
  _audio.addEventListener('timeupdate', () => {
    const track = getCurrentTrack();
    if (!track) return;

    const ct  = _audio.currentTime;
    const dur = _audio.duration || 0;

    saveState({ currentTime: ct });

    // Feed progress only when user is NOT dragging
    if (!_isDragging) _onProgress(ct, dur);

    // Accumulate listen time — flush every ~15 s
    if (_playStartTime != null) {
      _listenAccum = ct - _playStartTime;
      if (_listenAccum > 0 && _listenAccum % 15 < 0.55) {
        recordListenTime(track.id, 15);
        flushListenTime();
      }
    }
  });

  _audio.addEventListener('ended', () => {
    const track = getCurrentTrack();
    if (track && _audio.duration > 0) {
      const pct = (_audio.currentTime / _audio.duration) * 100;
      if (pct >= 78) recordCompletion(track.id);
    }
    flushListenTime();

    const { repeatMode } = getState();
    if (repeatMode === 'one') {
      _audio.currentTime = 0;
      _audio.play().catch(() => {});
    } else {
      _advanceQueue(1, true);
    }
  });

  _audio.addEventListener('play', () => {
    _playStartTime = _audio.currentTime;
    _onStateChange('play');
  });
  _audio.addEventListener('playing',       () => _onStateChange('play'));
  _audio.addEventListener('pause',         () => { flushListenTime(); _onStateChange('pause'); });
  _audio.addEventListener('waiting',       () => _onStateChange('buffering'));
  _audio.addEventListener('loadstart',     () => _onStateChange('buffering'));
  _audio.addEventListener('canplay',       () => _onStateChange('ready'));
  _audio.addEventListener('canplaythrough',() => _onStateChange('ready'));
  _audio.addEventListener('stalled',       () => _onStateChange('buffering'));
  _audio.addEventListener('error',         () => _onStateChange('error'));

  // ── Seek via custom event (dispatched by progress bar handlers) ─────────
  document.addEventListener('dhyaan:seek', (e) => {
    const dur = _audio.duration;
    if (dur && isFinite(dur)) {
      const t = Math.max(0, Math.min(dur, e.detail.pct * dur));
      _audio.currentTime = t;
      // Immediately push progress update so UI stays in sync
      if (!_isDragging) _onProgress(t, dur);
    }
  });

  // ── Restore session ─────────────────────────────────────────────────────
  if (state.lastTrackId != null) {
    const idx = _allTracks.findIndex(t => t.id === state.lastTrackId);
    if (idx !== -1) {
      _queue      = _allTracks;
      _queueIndex = idx;
      _audio.src  = _allTracks[idx].audio_url;
      _audio.currentTime = state.currentTime || 0;
      _onTrackChange(_allTracks[idx], idx);
    }
  }
}

// ── Queue management ─────────────────────────────────────────────────────────

export function setQueue(tracks, startIndex = 0, autoplay = false) {
  _queue      = tracks;
  _queueIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));

  const track = _queue[_queueIndex];
  if (!track) return;

  _audio.pause();
  _audio.src  = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;
  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);

  if (autoplay) _audio.play().catch(() => {});
  _schedulePreload();
}

export function setAllTracksQueue() { _queue = _allTracks; }

export function loadTrack(index, autoplay = false) {
  if (index < 0 || index >= _allTracks.length) return;

  _queue      = _allTracks;
  _queueIndex = index;

  const track = _allTracks[index];
  _audio.pause();
  _audio.src  = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;

  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);

  if (autoplay) _audio.play().catch(() => {});
  _schedulePreload();
}

export function loadQueueIndex(index, autoplay = false) {
  if (index < 0 || index >= _queue.length) return;
  _queueIndex = index;
  const track = _queue[_queueIndex];

  _audio.pause();
  _audio.src  = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;

  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);

  if (autoplay) _audio.play().catch(() => {});
  _schedulePreload();
}

function _advanceQueue(direction, autoplay = false) {
  const { shuffleMode } = getState();
  let nextIdx;

  if (shuffleMode) {
    do { nextIdx = Math.floor(Math.random() * _queue.length); }
    while (_queue.length > 1 && nextIdx === _queueIndex);
  } else {
    nextIdx = (_queueIndex + direction + _queue.length) % _queue.length;
  }

  loadQueueIndex(nextIdx, autoplay);
}

export function nextTrack() {
  const track = getCurrentTrack();
  if (track && _audio.currentTime < 5) recordSkip(track.id);
  _advanceQueue(1, true);
}

export function prevTrack() {
  if (_audio.currentTime > 3) { _audio.currentTime = 0; return; }
  _advanceQueue(-1, true);
}

function _schedulePreload() {
  clearTimeout(_preloadTimer);
  _preloadTimer = setTimeout(() => {
    const { shuffleMode } = getState();
    const nextIdx = shuffleMode
      ? Math.floor(Math.random() * _queue.length)
      : (_queueIndex + 1) % _queue.length;
    const next = _queue[nextIdx];
    if (next) { _nextAudio.src = next.audio_url; _nextAudio.preload = 'metadata'; }
  }, CONFIG.PRELOAD_DELAY);
}

// ── Playback controls ────────────────────────────────────────────────────────

export function play()       { return _audio.play().catch(() => {}); }
export function pause()      { _audio.pause(); }
export function togglePlay() { return _audio.paused ? play() : (pause(), Promise.resolve()); }

export function isPlaying() {
  return !_audio.paused && !_audio.ended && _audio.readyState > 2;
}

export function seekBy(seconds) {
  const t = Math.max(0, Math.min(_audio.duration || 0, _audio.currentTime + seconds));
  _audio.currentTime = t;
}

export function seekTo(time) {
  if (isFinite(time) && time >= 0) {
    _audio.currentTime = Math.min(time, _audio.duration || Infinity);
  }
}

export function setVolume(vol) {
  _audio.volume = Math.max(0, Math.min(1, vol));
  saveState({ volume: _audio.volume });
}

export function getVolume()       { return _audio.volume; }
export function getCurrentTrack() { return _queue[_queueIndex] || null; }
export function getCurrentIndex() { return _queueIndex; }
export function getDuration()     { return _audio.duration || 0; }
export function getCurrentTime()  { return _audio.currentTime || 0; }

export function setTracks(tracks) {
  _allTracks = tracks;
  if (_queue === _allTracks || _queue.length === 0) _queue = tracks;
}

export function getTracks()    { return _allTracks; }
export function getQueue()     { return _queue; }
export function getQueueIndex(){ return _queueIndex; }
