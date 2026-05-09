// visualizer.js — Canvas particle system + ambient audio visualizer
//
// FIXES:
//   ❌→✅  IndexSizeError: radius always clamped to >= 0 (was negative on some frames)
//   ❌→✅  Visualizer not showing: resize deferred to rAF; canvas zero-size guard
//   ❌→✅  Audio not connected: connectAudio() wires Web Audio analyser
//   ❌→✅  NaN propagation: all computed values validated before use
//   ❌→✅  Mobile: particle count reduced automatically

import { CONFIG } from './config.js';
import { getState } from './storage.js';

let canvas, ctx;
let particles  = [];
let animFrame  = null;
let isRunning  = false;
let expandMode = false;
let lastTime   = 0;
const FPS_CAP  = 50;
const FRAME_MS = 1000 / FPS_CAP;

// ── Web Audio analyser ───────────────────────────────────────────────────────
let _audioCtx     = null;
let _analyser     = null;
let _freqData     = null;
let _sourceNode   = null;
let _connectedEl  = null;  // prevents double-connecting

// ── Particle hue (set by AtmosphereEngine via setParticleHue) ───────────────
let _baseHue = 120;   // default teal-green

export function setParticleHue(h) {
  _baseHue = (isFinite(h) ? h : 120);
}

// ── Audio connection ─────────────────────────────────────────────────────────
/**
 * connectAudio(audioEl)
 * Attach the player's <audio> element to the Web Audio graph.
 * Safe to call multiple times — skips if the same element is already connected.
 * Must be called inside a user-gesture handler so AudioContext can start.
 */
export function connectAudio(audioEl) {
  if (!audioEl || _connectedEl === audioEl) return;
  _connectedEl = audioEl;
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});

    // Disconnect previous source if any
    if (_sourceNode) { try { _sourceNode.disconnect(); } catch (_) {} }

    _sourceNode = _audioCtx.createMediaElementSource(audioEl);

    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 128;
    _analyser.smoothingTimeConstant = 0.82;
    _freqData = new Uint8Array(_analyser.frequencyBinCount);

    // Graph: source → analyser → speakers
    _sourceNode.connect(_analyser);
    _analyser.connect(_audioCtx.destination);
  } catch (err) {
    console.warn('[visualizer] AudioContext setup failed:', err);
    _analyser  = null;
    _freqData  = null;
    _sourceNode = null;
  }
}

// ── Frequency helpers ────────────────────────────────────────────────────────
/** Returns average energy across all frequency bins, 0..1 */
function _avgEnergy() {
  if (!_analyser || !_freqData) return 0;
  try {
    _analyser.getByteFrequencyData(_freqData);
    let sum = 0;
    for (let i = 0; i < _freqData.length; i++) sum += _freqData[i];
    return Math.max(0, Math.min(1, sum / _freqData.length / 255));
  } catch (_) { return 0; }
}

/** Returns low-frequency (bass) energy, 0..1 */
function _bassEnergy() {
  if (!_analyser || !_freqData) return 0;
  try {
    _analyser.getByteFrequencyData(_freqData);
    const n = Math.min(8, _freqData.length);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += _freqData[i];
    return Math.max(0, Math.min(1, sum / n / 255));
  } catch (_) { return 0; }
}

// ── Particle class ───────────────────────────────────────────────────────────
class Particle {
  constructor(w, h) { this.reset(w, h); }

  reset(w, h) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    // ── FIX: base radius always >= 0.3 before audio or pulse additions
    this.baseR = Math.random() * (expandMode ? 3.0 : 1.9) + 0.3;
    this.r     = this.baseR;
    this.tAlpha = Math.random() * 0.48 + 0.08;
    this.alpha  = this.tAlpha;
    this.vx     = (Math.random() - 0.5) * 0.22;
    this.vy     = (Math.random() - 0.5) * 0.18 - 0.07;
    this.life   = 0;
    this.maxLife = Math.random() * 400 + 200;
    // Per-particle hue offset so not all particles look identical
    this.hueOffset = (Math.random() - 0.5) * 55;
    this.pulse     = Math.random() * Math.PI * 2;
  }

  update(w, h, energy) {
    this.life++;
    this.pulse += 0.016;

    const boost = 1 + (isFinite(energy) ? energy : 0) * 1.4;
    this.x += this.vx * boost;
    this.y += this.vy * boost;

    // ── FIX: clamp radius — ALWAYS >= 0 regardless of audio/pulse arithmetic
    const pulseAdd = Math.sin(this.pulse) * 0.45;
    const audioAdd = (isFinite(energy) ? energy : 0) * 1.1;
    this.r = Math.max(0, this.baseR + pulseAdd + audioAdd);

    const frac = this.life / this.maxLife;
    this.alpha = Math.max(0, Math.sin(frac * Math.PI) * this.tAlpha);

    if (
      this.life >= this.maxLife ||
      this.x < -12 || this.x > w + 12 ||
      this.y < -12 || this.y > h + 12
    ) {
      this.reset(w, h);
    }
  }

  draw(ctx, energy) {
    const alpha = Math.max(0, Math.min(1, this.alpha));
    if (alpha < 0.005) return;   // skip invisible — cheap early-out
    const r = Math.max(0, this.r);   // ── FIX: final safety clamp before arc()

    const hue = ((_baseHue + this.hueOffset) % 360 + 360) % 360;
    const sat  = Math.min(90, 62 + (isFinite(energy) ? energy : 0) * 22);
    const lit  = Math.min(85, 68 + (isFinite(energy) ? energy : 0) * 14);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = `hsl(${hue},${sat}%,${lit}%)`;
    ctx.shadowColor = `hsla(${hue},90%,70%,0.7)`;
    ctx.shadowBlur  = 6 + (isFinite(energy) ? energy : 0) * 10;
    ctx.fill();
    ctx.restore();
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export function initVisualizer(canvasEl) {
  canvas = canvasEl;
  ctx    = canvas.getContext('2d');

  // ── FIX: defer resize by one rAF so CSS (position:fixed; 100% × 100%)
  //    has been applied — otherwise offsetWidth/Height can be 0 at
  //    DOMContentLoaded and produce a zero-pixel canvas.
  requestAnimationFrame(() => {
    resize();
    window.addEventListener('resize', resize, { passive: true });
  });
}

export function resize() {
  if (!canvas) return;
  const w = canvas.offsetWidth  || window.innerWidth  || 800;
  const h = canvas.offsetHeight || window.innerHeight || 600;
  if (canvas.width === w && canvas.height === h) return;
  canvas.width  = w;
  canvas.height = h;
  _spawnParticles();
}

function _spawnParticles() {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;
  const state    = getState();
  const isMobile = window.innerWidth < 768;
  const count    = state.lowPowerMode
    ? CONFIG.PARTICLE_COUNT.low
    : isMobile
    ? CONFIG.PARTICLE_COUNT.low
    : expandMode
    ? CONFIG.PARTICLE_COUNT.expand
    : CONFIG.PARTICLE_COUNT.normal;

  particles = Array.from({ length: count }, () =>
    new Particle(canvas.width, canvas.height)
  );
}

export function startVisualizer() {
  // Resume AudioContext — must happen inside user gesture
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  if (isRunning) return;
  isRunning = true;
  lastTime  = performance.now();
  _loop();
}

export function stopVisualizer() {
  isRunning = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function setExpandMode(val) {
  expandMode = !!val;
  _spawnParticles();
}

// ── Main render loop ─────────────────────────────────────────────────────────
function _loop(now = performance.now()) {
  if (!isRunning) return;
  animFrame = requestAnimationFrame(_loop);

  if (now - lastTime < FRAME_MS) return;   // FPS cap
  lastTime = now;

  if (!canvas) return;
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;          // not yet sized

  // ── FIX: read frequency data once, validate before using
  const energy = _avgEnergy();
  const bass   = _bassEnergy();

  ctx.clearRect(0, 0, w, h);

  const state = getState();
  if (state.lowPowerMode) {
    _drawLowPower(w, h);
    return;
  }

  // Bass-reactive centre glow
  if (bass > 0.04) {
    const gr = Math.max(1, w * (0.25 + bass * 0.45));
    try {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, gr);
      grad.addColorStop(0, `hsla(${_baseHue},60%,45%,${bass * 0.09})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } catch (_) {}
  }

  for (const p of particles) {
    p.update(w, h, energy);
    p.draw(ctx, energy);
  }
}

function _drawLowPower(w, h) {
  for (const p of particles) {
    p.update(w, h, 0);
    const alpha = Math.max(0, Math.min(1, p.alpha * 0.55));
    const r     = Math.max(0, p.r);
    if (alpha < 0.005) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${_baseHue},55%,65%)`;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
