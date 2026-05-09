// player.js — Audio engine
//
// FIXES vs original:
//   ❌→✅  Every song plays the same track: _audio.src = track.audio_url + _audio.load()
//          ensures the browser abandons the previous request before starting a new one.
//   ❌→✅  getDuration was not exported — seekbar click always returned 0 / NaN.
//   ❌→✅  getAudio() exported so visualizer can wire Web Audio analyser to the
//          correct HTMLAudioElement (creating a second Audio() would play twice).
//   ❌→✅  Repeat-mode 'none' advanced to next track because the original ended
//          handler had `|| true` making the condition always truthy.

import { CONFIG } from './config.js';
import { saveState, getState } from './storage.js';

let _tracks      = [];
let _currentIndex = 0;
let _audio        = new Audio();
let _nextAudio    = new Audio();
let _preloadTimer = null;

let _onTrackChange = null;
let _onProgress    = null;
let _onStateChange = null;

_audio.preload     = 'none';
_nextAudio.preload = 'none';

// ── FIX: export so visualizer.connectAudio() gets the same element ──────────
export function getAudio() { return _audio; }

export function initPlayer(tracks, callbacks = {}) {
  _tracks         = tracks;
  _onTrackChange  = callbacks.onTrackChange || (() => {});
  _onProgress     = callbacks.onProgress    || (() => {});
  _onStateChange  = callbacks.onStateChange || (() => {});

  const state = getState();
  _audio.volume = state.volume ?? 0.75;

  _audio.addEventListener('timeupdate', () => {
    saveState({ currentTime: _audio.currentTime });
    if (_onProgress) _onProgress(_audio.currentTime, _audio.duration || 0);
  });

  // ── FIX: removed the erroneous `|| true` that caused 'none' mode to still
  //    advance to the next track.
  _audio.addEventListener('ended', () => {
    const { repeatMode } = getState();
    if (repeatMode === 'one') {
      _audio.currentTime = 0;
      _audio.play().catch(() => {});
    } else {
      nextTrack();
    }
  });

  _audio.addEventListener('play',    () => _onStateChange('play'));
  _audio.addEventListener('pause',   () => _onStateChange('pause'));
  _audio.addEventListener('waiting', () => _onStateChange('buffering'));
  _audio.addEventListener('canplay', () => _onStateChange('ready'));

  // Restore last session (no autoplay)
  if (state.lastTrackId != null) {
    const idx = _tracks.findIndex(t => t.id === state.lastTrackId);
    if (idx !== -1) {
      _currentIndex       = idx;
      _audio.src          = _tracks[idx].audio_url;
      _audio.currentTime  = state.currentTime || 0;
      _onTrackChange(_tracks[idx], idx);
    }
  }
}

export function loadTrack(index, autoplay = false) {
  if (index < 0 || index >= _tracks.length) return;
  _currentIndex = index;
  const track   = _tracks[index];

  _audio.pause();

  // ── FIX: set src then call .load() — forces browser to abandon previous
  //    network request so the new URL is actually fetched.
  _audio.src = track.audio_url;
  _audio.load();
  _audio.currentTime = 0;

  saveState({ lastTrackId: track.id, currentTime: 0 });
  _onTrackChange(track, index);

  if (autoplay) _audio.play().catch(() => {});

  clearTimeout(_preloadTimer);
  _preloadTimer = setTimeout(() => _preloadNext(index), CONFIG.PRELOAD_DELAY);
}

function _preloadNext(currentIdx) {
  const { shuffleMode } = getState();
  const nextIdx = shuffleMode
    ? Math.floor(Math.random() * _tracks.length)
    : (currentIdx + 1) % _tracks.length;
  const next = _tracks[nextIdx];
  if (next) {
    _nextAudio.src     = next.audio_url;
    _nextAudio.preload = 'metadata';
  }
}

export function play()       { return _audio.play().catch(() => {}); }
export function pause()      { _audio.pause(); }
export function togglePlay() { return _audio.paused ? play() : (pause(), Promise.resolve()); }
export function isPlaying()  { return !_audio.paused; }

export function nextTrack() {
  const { shuffleMode } = getState();
  const next = shuffleMode
    ? Math.floor(Math.random() * _tracks.length)
    : (_currentIndex + 1) % _tracks.length;
  loadTrack(next, true);
}

export function prevTrack() {
  if (_audio.currentTime > 3) { _audio.currentTime = 0; return; }
  loadTrack((_currentIndex - 1 + _tracks.length) % _tracks.length, true);
}

export function seekBy(seconds) {
  _audio.currentTime = Math.max(
    0,
    Math.min(_audio.duration || 0, _audio.currentTime + seconds)
  );
}

export function seekTo(time) {
  if (isFinite(time) && time >= 0)
    _audio.currentTime = Math.min(time, _audio.duration || Infinity);
}

export function setVolume(vol) {
  _audio.volume = Math.max(0, Math.min(1, vol));
  saveState({ volume: _audio.volume });
}

export function getVolume()       { return _audio.volume; }
export function getCurrentTrack() { return _tracks[_currentIndex] || null; }
export function getCurrentIndex() { return _currentIndex; }

// ── FIX: getDuration was missing from exports — seekbar pct → time failed ───
export function getDuration()    { return isFinite(_audio.duration) ? _audio.duration : 0; }
export function getCurrentTime() { return _audio.currentTime || 0; }
export function setTracks(t)     { _tracks = t; }
export function getTracks()      { return _tracks; }
