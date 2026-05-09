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
//
// ── CORS FIX (this file) ─────────────────────────────────────────────────────
//   ❌→✅  MediaElementAudioSource outputs zeroes / visualizer dead:
//
//          ROOT CAUSE:
//            new Audio() was created with NO crossOrigin attribute.
//            The browser therefore made a plain (non-CORS) HTTP request for the
//            raw.githubusercontent.com MP3 — no Origin header, no CORS handshake.
//            When connectAudio() later called
//              audioCtx.createMediaElementSource(_audio)
//            the Web Audio API detected that the element was loaded without CORS
//            access and silently zero-filled all analyser output.
//            The audio element itself still plays (media pipeline is separate from
//            the Web Audio graph) but the visualiser sees a flat line.
//
//          FIX:
//            Set  _audio.crossOrigin = 'anonymous'  (and _nextAudio too)
//            BEFORE any .src assignment ever happens.
//            With crossOrigin='anonymous' the browser sends an Origin header;
//            raw.githubusercontent.com replies with
//              Access-Control-Allow-Origin: *
//            so the CORS handshake succeeds and Web Audio can read real samples.
//
//          ADDITIONALLY:
//            _normalizeAudioUrl() rewrites raw.githubusercontent.com URLs to the
//            jsDelivr CDN (cdn.jsdelivr.net/gh/…).  jsDelivr is a proper CDN
//            with guaranteed CORS headers, edge caching, and better latency than
//            raw GitHub blobs — zero downside.
//            Format: https://raw.githubusercontent.com/USER/REPO/BRANCH/PATH
//                 →  https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/PATH

import { CONFIG } from './config.js';
import { saveState, getState } from './storage.js';

let _tracks       = [];
let _currentIndex = 0;

// ── CORS FIX: crossOrigin MUST be set before the very first .src assignment ──
let _audio     = new Audio();
let _nextAudio = new Audio();
_audio.crossOrigin     = 'anonymous';   // ← THE FIX
_nextAudio.crossOrigin = 'anonymous';   // ← THE FIX

let _preloadTimer = null;

let _onTrackChange = null;
let _onProgress    = null;
let _onStateChange = null;

_audio.preload     = 'none';
_nextAudio.preload = 'none';

// ── Export audio element so visualizer uses the same instance ────────────────
export function getAudio() { return _audio; }

// ── URL normalizer: raw.githubusercontent.com → jsDelivr CDN ────────────────
//
//   raw.githubusercontent.com works, but jsDelivr is more reliable:
//     • Proper CDN edge nodes (lower latency worldwide)
//     • Guaranteed CORS headers (Access-Control-Allow-Origin: *)
//     • Avoids GitHub's occasional rate-limiting on raw blob downloads
//
//   Conversion: https://raw.githubusercontent.com/USER/REPO/BRANCH/REST
//            →  https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/REST
//
function _normalizeAudioUrl(url) {
  if (!url) return url;
  try {
    const RAW = 'https://raw.githubusercontent.com/';
    if (url.startsWith(RAW)) {
      const rest  = url.slice(RAW.length);          // USER/REPO/BRANCH/path…
      const parts = rest.split('/');
      if (parts.length >= 3) {
        const user   = parts[0];
        const repo   = parts[1];
        const branch = parts[2];
        const path   = parts.slice(3).join('/');
        return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`;
      }
    }
  } catch (_) {}
  return url;   // leave non-GitHub URLs untouched
}

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

  // Repeat / advance logic — no erroneous `|| true` here
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
  // crossOrigin is already set above, so this src assignment is CORS-safe
  if (state.lastTrackId != null) {
    const idx = _tracks.findIndex(t => t.id === state.lastTrackId);
    if (idx !== -1) {
      _currentIndex       = idx;
      _audio.src          = _normalizeAudioUrl(_tracks[idx].audio_url);
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

  // Assign normalized URL then load() so the browser abandons the previous
  // network request before starting a new one.
  // crossOrigin='anonymous' was set at element creation — no need to re-set.
  _audio.src = _normalizeAudioUrl(track.audio_url);
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
    // _nextAudio.crossOrigin is already 'anonymous' — safe to assign src
    _nextAudio.src     = _normalizeAudioUrl(next.audio_url);
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
export function getDuration()     { return isFinite(_audio.duration) ? _audio.duration : 0; }
export function getCurrentTime()  { return _audio.currentTime || 0; }
export function setTracks(t)      { _tracks = t; }
export function getTracks()       { return _tracks; }
