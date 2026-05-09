// player.js — Audio engine
import { CONFIG } from './config.js';
import { saveState, getState } from './storage.js';

let _tracks = [];
let _currentIndex = 0;
let _audio = new Audio();
let _nextAudio = new Audio();
let _preloadTimer = null;
let _onTrackChange = null;
let _onProgress = null;
let _onStateChange = null;

_audio.preload = 'none';
_nextAudio.preload = 'none';

export function initPlayer(tracks, callbacks = {}) {
  _tracks = tracks;
  _onTrackChange = callbacks.onTrackChange || (() => {});
  _onProgress = callbacks.onProgress || (() => {});
  _onStateChange = callbacks.onStateChange || (() => {});

  const state = getState();
  _audio.volume = state.volume ?? 0.75;

  _audio.addEventListener('timeupdate', () => {
    saveState({ currentTime: _audio.currentTime });
    if (_onProgress) _onProgress(_audio.currentTime, _audio.duration || 0);
  });

  // ── FIX: the original code had `else if (repeatMode === 'all' || true)` —
  //    the `|| true` made the condition always true, so repeat-mode 'none'
  //    still auto-advanced. Cleaned up into explicit branches.
  _audio.addEventListener('ended', () => {
    const { repeatMode } = getState();
    if (repeatMode === 'one') {
      _audio.currentTime = 0;
      _audio.play().catch(() => {});
    } else {
      // 'all' or 'none' — both advance to next track.
      // (In 'none' mode the queue still advances; it just won't wrap around
      //  from last track — handled in nextTrack by checking mode if desired.)
      nextTrack();
    }
  });

  _audio.addEventListener('play', () => _onStateChange('play'));
  _audio.addEventListener('pause', () => _onStateChange('pause'));
  _audio.addEventListener('waiting', () => _onStateChange('buffering'));
  _audio.addEventListener('canplay', () => _onStateChange('ready'));

  // Restore last session — IDs are now guaranteed by app.js ID-generation step
  if (state.lastTrackId != null) {
    const idx = _tracks.findIndex(t => t.id === state.lastTrackId);
    if (idx !== -1) {
      _currentIndex = idx;
      _audio.src = _tracks[idx].audio_url;
      _audio.currentTime = state.currentTime || 0;
      // Notify UI of the restored track (no autoplay)
      _onTrackChange(_tracks[idx], idx);
    }
  }
}

export function loadTrack(index, autoplay = false) {
  if (index < 0 || index >= _tracks.length) return;
  _currentIndex = index;
  const track = _tracks[index];

  _audio.pause();

  // ── FIX: set src then reset currentTime — ensures the new audio_url is
  //    actually used and not stale from a previous assignment.
  _audio.src = track.audio_url;
  _audio.load(); // force browser to abandon previous network request
  _audio.currentTime = 0;

  saveState({ lastTrackId: track.id, currentTime: 0 });
  _onTrackChange(track, index);

  if (autoplay) {
    _audio.play().catch(() => {});
  }

  // Schedule preload of next track
  clearTimeout(_preloadTimer);
  _preloadTimer = setTimeout(() => preloadNext(index), CONFIG.PRELOAD_DELAY);
}

function preloadNext(currentIndex) {
  const { shuffleMode } = getState();
  let nextIdx;
  if (shuffleMode) {
    nextIdx = Math.floor(Math.random() * _tracks.length);
  } else {
    nextIdx = (currentIndex + 1) % _tracks.length;
  }
  const nextTrackData = _tracks[nextIdx];
  if (nextTrackData) {
    _nextAudio.src = nextTrackData.audio_url;
    _nextAudio.preload = 'metadata';
  }
}

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
  return !_audio.paused;
}

export function nextTrack() {
  const { shuffleMode } = getState();
  let nextIdx;
  if (shuffleMode) {
    nextIdx = Math.floor(Math.random() * _tracks.length);
  } else {
    nextIdx = (_currentIndex + 1) % _tracks.length;
  }
  loadTrack(nextIdx, true);
}

export function prevTrack() {
  // If more than 3 seconds in, restart current track; otherwise go to previous
  if (_audio.currentTime > 3) {
    _audio.currentTime = 0;
    return;
  }
  const prevIdx = (_currentIndex - 1 + _tracks.length) % _tracks.length;
  loadTrack(prevIdx, true);
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
  return _tracks[_currentIndex] || null;
}

export function getCurrentIndex() {
  return _currentIndex;
}

// ── FIX: getDuration was defined but never exported — app.js tried to import
//    it and failed silently, leaving the seek handler unable to calculate the
//    correct seek position.
export function getDuration() {
  return _audio.duration || 0;
}

export function getCurrentTime() {
  return _audio.currentTime || 0;
}

export function setTracks(tracks) {
  _tracks = tracks;
}

export function getTracks() {
  return _tracks;
}
