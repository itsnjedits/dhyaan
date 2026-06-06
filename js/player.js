// player.js — Audio engine with proper queue context + mobile/sync fixes
import { CONFIG } from './config.js';
import { saveState, getState, recordPlay, recordCompletion, recordSkip, recordListenTime, flushListenTime } from './storage.js';

let _allTracks   = [];
let _queue       = [];
let _queueIndex  = 0;
let _audio       = new Audio();

// BUG-013 FIX: _nextAudio has been removed entirely. Previously it fetched
// metadata for the next track via _schedulePreload() but the preloaded element
// was never used when that track actually played — the engine always assigned
// _audio.src directly. The preload wasted network bandwidth and held an extra
// browser media element resource open indefinitely. Removing it saves ~1–2 kB
// of metadata per track per preload cycle with no change to playback behaviour.

let _saveStateTimer = null;  // debounce handle for currentTime persistence
let _listenAccum    = 0;
let _playStartTime  = null;

// BUG-024 FIX: tracks the audio currentTime at which the last listen-time
// flush occurred so we can pass the *actual* elapsed seconds to recordListenTime
// instead of the previous hard-coded value of 15. This gives accurate analytics
// even when the user seeks or timeupdate fires at an irregular cadence.
let _lastFlushCt    = null;

// Drag state (set by index.html seek bar; prevents progress jumps while dragging)
let _isDragging = false;

// Callbacks
let _onTrackChange = null;
let _onProgress    = null;
let _onStateChange = null;

_audio.preload = 'none';

// ── Drag-state bridge ────────────────────────────────────────────────────────
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

  // BUG-007 FIX: debounce the currentTime save to once every 5 seconds.
  // Saves still happen immediately on pause, seek, track-change, and
  // beforeunload so no meaningful position data is lost.
  _audio.addEventListener('timeupdate', () => {
    const track = getCurrentTrack();
    if (!track) return;

    const ct  = _audio.currentTime;
    const dur = _audio.duration || 0;

    // Debounced persistence
    clearTimeout(_saveStateTimer);
    _saveStateTimer = setTimeout(() => saveState({ currentTime: ct }), 5000);

    // Feed progress only when user is NOT dragging
    if (!_isDragging) _onProgress(ct, dur);

    // Accumulate listen time — flush every ~15 s
    if (_playStartTime != null) {
      _listenAccum = ct - _playStartTime;
      if (_listenAccum > 0 && _listenAccum % 15 < 0.55) {
        // BUG-024 FIX: pass actual elapsed seconds since last flush rather than
        // the previous hard-coded 15. This is accurate across seeks and
        // irregular timeupdate cadences.
        const actualSecs = (_lastFlushCt != null)
          ? Math.max(1, Math.round(ct - _lastFlushCt))
          : 15;
        recordListenTime(track.id, actualSecs);
        _lastFlushCt = ct;
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
    clearTimeout(_saveStateTimer);
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
    // BUG-024 FIX: reset flush baseline on every play/resume so the first
    // flush after a pause correctly measures only the resumed listening window.
    _lastFlushCt   = null;
    _onStateChange('play');
  });

  // BUG-010 FIX: reset _playStartTime and flush baseline whenever the audio
  // position jumps due to a seek. Without this, _listenAccum = ct - _playStartTime
  // can produce a negative or inflated value causing incorrect analytics.
  _audio.addEventListener('seeked', () => {
    _playStartTime = _audio.currentTime;
    _lastFlushCt   = null; // don't count time across a seek boundary
  });

  // Save currentTime immediately on pause (overrides pending debounced save).
  _audio.addEventListener('pause', () => {
    clearTimeout(_saveStateTimer);
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

  // ── Seek via custom event ───────────────────────────────────────────────
  document.addEventListener('dhyaan:seek', (e) => {
    const dur = _audio.duration;
    if (dur && isFinite(dur)) {
      const t = Math.max(0, Math.min(dur, e.detail.pct * dur));
      _audio.currentTime = t;
      clearTimeout(_saveStateTimer);
      if (!_isDragging) _onProgress(t, dur);
    }
  });

  // ── Save position on page unload ────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    clearTimeout(_saveStateTimer);
    saveState({ currentTime: _audio.currentTime });
    flushListenTime();
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
}

// FIX BUG-004: empty-queue guard prevents infinite do-while loop.
function _advanceQueue(direction, autoplay = false) {
  if (!_queue.length) return;

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