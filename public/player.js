// player.js — Audio engine with proper queue context
import { CONFIG } from './config.js';
import { saveState, getState, recordPlay, recordCompletion, recordSkip, recordListenTime, flushListenTime } from './storage.js';

let _allTracks = [];          // full library (never changes)
let _queue = [];              // active playback queue (may be subset for playlist)
let _queueIndex = 0;          // position within _queue
let _audio = new Audio();
let _nextAudio = new Audio();
let _preloadTimer = null;
let _listenTimer = null;      // tracks accumulated listen time for analytics
let _listenAccum = 0;
let _playStartTime = null;
let _trackDurationAtStart = 0;

// Callbacks
let _onTrackChange = null;
let _onProgress = null;
let _onStateChange = null;

_audio.preload = 'none';
_nextAudio.preload = 'none';

export function initPlayer(tracks, callbacks = {}) {
  _allTracks = tracks;
  _onTrackChange = callbacks.onTrackChange || (() => {});
  _onProgress = callbacks.onProgress || (() => {});
  _onStateChange = callbacks.onStateChange || (() => {});

  const state = getState();
  _audio.volume = state.volume ?? 0.75;

  // ── Audio event listeners ───────────────────────────────────────────────
  _audio.addEventListener('timeupdate', () => {
    const track = getCurrentTrack();
    if (track) {
      saveState({ currentTime: _audio.currentTime });
      _onProgress(_audio.currentTime, _audio.duration || 0);

      // Accumulate listen time for analytics (flush every 15s)
      if (_playStartTime) {
        _listenAccum = (_audio.currentTime - _playStartTime);
        if (_listenAccum > 0 && _listenAccum % 15 < 0.5) {
          recordListenTime(track.id, 15);
          flushListenTime();
        }
      }
    }
  });

  _audio.addEventListener('ended', () => {
    const track = getCurrentTrack();
    if (track && _audio.duration > 0) {
      // If played >80% — count as completion
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
  _audio.addEventListener('playing', () => _onStateChange('play'));
  _audio.addEventListener('pause', () => {
    flushListenTime();
    _onStateChange('pause');
  });
  _audio.addEventListener('waiting', () => _onStateChange('buffering'));
  _audio.addEventListener('loadstart', () => _onStateChange('buffering'));
  _audio.addEventListener('canplay', () => _onStateChange('ready'));
  _audio.addEventListener('canplaythrough', () => _onStateChange('ready'));
  _audio.addEventListener('stalled', () => _onStateChange('buffering'));
  _audio.addEventListener('error', () => _onStateChange('error'));

  // ── Restore session ─────────────────────────────────────────────────────
  // Queue restoration is done by app.js after calling setQueue / setAllTracksQueue
  if (state.lastTrackId != null) {
    const idx = _allTracks.findIndex(t => t.id === state.lastTrackId);
    if (idx !== -1) {
      _queue = _allTracks;
      _queueIndex = idx;
      _audio.src = _allTracks[idx].audio_url;
      _audio.currentTime = state.currentTime || 0;
      _onTrackChange(_allTracks[idx], idx);
    }
  }
}

// ── Queue management ────────────────────────────────────────────────────────

/**
 * Set a custom queue (e.g., a playlist's tracks).
 * @param {Array} tracks  - array of track objects for this queue
 * @param {number} startIndex - index within tracks to start at
 * @param {boolean} autoplay
 */
export function setQueue(tracks, startIndex = 0, autoplay = false) {
  _queue = tracks;
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
  _schedulePreload();
}

/** Reset queue to the full library */
export function setAllTracksQueue() {
  _queue = _allTracks;
}

/** Load by global index in allTracks (used when browsing all tracks) */
export function loadTrack(index, autoplay = false) {
  if (index < 0 || index >= _allTracks.length) return;

  // When loading from global library, reset queue to full library
  _queue = _allTracks;
  _queueIndex = index;

  const track = _allTracks[index];
  _audio.pause();
  _audio.src = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;

  saveState({ lastTrackId: track.id, currentTime: 0, currentQueueIndex: _queueIndex });
  _onTrackChange(track, _queueIndex);
  recordPlay(track.id);

  if (autoplay) _audio.play().catch(() => {});
  _schedulePreload();
}

/** Load by index within current queue */
export function loadQueueIndex(index, autoplay = false) {
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
  _schedulePreload();
}

function _advanceQueue(direction, autoplay = false) {
  const { shuffleMode } = getState();
  let nextIdx;

  if (shuffleMode) {
    // Avoid repeating the same track
    do {
      nextIdx = Math.floor(Math.random() * _queue.length);
    } while (_queue.length > 1 && nextIdx === _queueIndex);
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
  if (_audio.currentTime > 3) {
    _audio.currentTime = 0;
    return;
  }
  _advanceQueue(-1, true);
}

function _schedulePreload() {
  clearTimeout(_preloadTimer);
  _preloadTimer = setTimeout(() => {
    const { shuffleMode } = getState();
    let nextIdx;
    if (shuffleMode) {
      nextIdx = Math.floor(Math.random() * _queue.length);
    } else {
      nextIdx = (_queueIndex + 1) % _queue.length;
    }
    const next = _queue[nextIdx];
    if (next) {
      _nextAudio.src = next.audio_url;
      _nextAudio.preload = 'metadata';
    }
  }, CONFIG.PRELOAD_DELAY);
}

// ── Playback controls ───────────────────────────────────────────────────────

export function play() {
  return _audio.play().catch(() => {});
}

export function pause() {
  _audio.pause();
}

export function togglePlay() {
  if (_audio.paused) return play();
  else { pause(); return Promise.resolve(); }
}

export function isPlaying() {
  return !_audio.paused && !_audio.ended && _audio.readyState > 2;
}

export function seekBy(seconds) {
  _audio.currentTime = Math.max(0, Math.min(_audio.duration || 0, _audio.currentTime + seconds));
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

export function getVolume() {
  return _audio.volume;
}

export function getCurrentTrack() {
  return _queue[_queueIndex] || null;
}

export function getCurrentIndex() {
  return _queueIndex;
}

export function getDuration() {
  return _audio.duration || 0;
}

export function getCurrentTime() {
  return _audio.currentTime || 0;
}

export function setTracks(tracks) {
  _allTracks = tracks;
  if (_queue === _allTracks || _queue.length === 0) {
    _queue = tracks;
  }
}

export function getTracks() {
  return _allTracks;
}

export function getQueue() {
  return _queue;
}

export function getQueueIndex() {
  return _queueIndex;
}
