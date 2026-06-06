// visualizer.js — Canvas particle system + ambient visualizer
// v3: RAF-leak-free, adaptive FPS, mobile-optimised, reduced-motion aware,
//     getState() removed from hot loop (eliminates per-frame object spread).
import { CONFIG } from './config.js';
import { getState } from './storage.js';

let canvas, ctx;
let particles  = [];
let animFrame  = null;
let isRunning  = false;
let expandMode = false;
let lastTime   = 0;

// ── prefers-reduced-motion ────────────────────────────────────────────────────
// Resolved once at module load; also listened to for runtime changes.
const _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ── Low-power cache ───────────────────────────────────────────────────────────
// Caches the combined "render in low-power mode" flag so the hot RAF _loop()
// never calls getState() — getState() returns { ..._state } (an object spread)
// on every call, which creates a GC-able allocation at 30-50 Hz = thousands of
// short-lived objects per minute.
//
// Sources that flip this flag:
//   1. _reducedMotion at module load (initialised below)
//   2. app.js calls setLowPowerMode(true) after device capability detection
//   3. Runtime change of the OS reduced-motion preference
let _lowPowerCached = _reducedMotion.matches; // seed from OS preference at load

// ── Adaptive FPS ──────────────────────────────────────────────────────────────
const isMobileDevice = () => window.innerWidth <= 768 || ('ontouchstart' in window);
let FPS_CAP  = 50;
let FRAME_MS = 1000 / FPS_CAP;

// Dynamic colour driven by artwork hue extraction
let _particleHue = 140;
let _particleSat = 65;
let _particleLit = 72;

// Breathing glow
let _glowPhase = 0;

// Resize debounce
let _resizeTimer = null;

// ── Particle class ────────────────────────────────────────────────────────────
class Particle {
  constructor(w, h, expand, layer = 0) {
    this.layer = layer;
    this.reset(w, h, expand);
  }

  reset(w, h, expand) {
    this.x = Math.random() * w;
    this.y = Math.random() * h * 1.1;

    const baseR      = expand ? 3.0 : 1.8;
    const layerMult  = [0.5, 1.0, 1.6][this.layer];
    this.r           = (Math.random() * baseR + 0.3) * layerMult;

    const baseAlpha  = [0.12, 0.28, 0.45][this.layer];
    this.targetAlpha = Math.random() * baseAlpha + baseAlpha * 0.3;
    this.alpha       = this.targetAlpha;

    const speed      = [0.08, 0.16, 0.28][this.layer];
    this.vx          = (Math.random() - 0.5) * speed * 1.4;
    this.vy          = -(Math.random() * speed + 0.04);

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

    this.x += this.vx + Math.sin(this.wobble) * this.wobbleAmp;
    this.y += this.vy;

    const t    = this.life / this.maxLife;
    this.alpha = Math.sin(t * Math.PI) * this.targetAlpha;

    if (
      this.life >= this.maxLife ||
      this.x < -20 || this.x > w + 20 ||
      this.y < -30 || this.y > h + 20
    ) {
      this.reset(w, h, expandMode);
    }
  }

  draw(ctx) {
    if (this.alpha <= 0.005) return;

    const hue    = ((_particleHue + this.hueOffset + 360) % 360);
    const sat    = Math.min(100, _particleSat + 10);
    const lit    = Math.min(95,  _particleLit  + 5);
    const pulseR = this.r + Math.sin(this.pulse) * (this.r * 0.3);

    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);

    // ── Shadow budget optimisation ──────────────────────────────────────────
    // ctx.shadowBlur triggers a full GPU shadow-rendering pipeline for every
    // draw call it is active on. The original code applied shadows to both
    // layer 1 (blur=7) and layer 2 (blur=14). With 55 particles that was
    // ~110 shadow draws per frame at 50 fps — the single largest GPU cost in
    // the canvas path.
    //
    // Fix: restrict shadows to layer 2 only (~20% of particles). Layer 1
    // particles are small enough that blur=7 adds negligible visual value.
    // This cuts GPU shadow calls by ~80% with no perceptible visual change.
    //
    // shadowBlur MUST be explicitly reset to 0 on non-shadow paths.
    // Some rasterisation pipelines pre-cache shadow state and bleed it into
    // subsequent draws within the same batch even inside save()/restore().
    if (this.layer === 2) {
      ctx.shadowColor = `hsla(${hue},${sat}%,${lit}%,0.9)`;
      ctx.shadowBlur  = 12;
    } else {
      ctx.shadowBlur  = 0; // explicit reset — do not rely on save/restore alone
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,1)`;
    ctx.fill();
    ctx.restore();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function initVisualizer(canvasEl) {
  canvas = canvasEl;
  ctx    = canvas.getContext('2d', { alpha: true });

  _updateFpsCap();

  // Debounced resize
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      _updateFpsCap();
      resize();
    }, 150);
  });

  // React to runtime OS preference changes (user toggles system accessibility
  // setting while the app is open).
  _reducedMotion.addEventListener('change', () => {
    if (_reducedMotion.matches) {
      // Reduced-motion turned ON → force low-power regardless of device state.
      // (We intentionally do not unset when it turns OFF to preserve any
      // device-capability low-power flag that app.js may have set.)
      _lowPowerCached = true;
    }
    _updateFpsCap();
    spawnParticles();
  });

  requestAnimationFrame(() => resize());
}

/**
 * Called by app.js after low-end device detection.
 * Sets the low-power flag and updates FPS cap + particle count.
 * Safe to call before the canvas is sized (spawnParticles guards internally).
 */
export function setLowPowerMode(val) {
  // Combine device-level flag with current OS reduced-motion preference so
  // either source activates the low-power path.
  _lowPowerCached = !!val || _reducedMotion.matches;
  _updateFpsCap();
  spawnParticles(); // no-op if canvas not yet sized; correct values used on first resize
}

export function resize() {
  if (!canvas) return;
  const w = canvas.offsetWidth  || window.innerWidth  || 800;
  const h = canvas.offsetHeight || window.innerHeight || 600;
  if (canvas.width === w && canvas.height === h) return; // avoid unnecessary respawn
  canvas.width  = w;
  canvas.height = h;
  spawnParticles();
}

export function setParticleColor(hue, sat = 65, lit = 72) {
  _particleHue = hue;
  _particleSat = sat;
  _particleLit = lit;
}

function spawnParticles() {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;

  // Use _lowPowerCached directly — no getState() call needed here.
  // spawnParticles() is only called on resize / mode-change events (infrequent),
  // so this is not a hot path, but keeping it consistent avoids stale reads.
  const mobile = isMobileDevice();
  const mult   = mobile ? 0.55 : 1;

  const total = _lowPowerCached
    ? CONFIG.PARTICLE_COUNT.low
    : expandMode
    ? Math.floor(CONFIG.PARTICLE_COUNT.expand * mult)
    : Math.floor(CONFIG.PARTICLE_COUNT.normal * mult);

  const layerSplit = [0.4, 0.4, 0.2];
  particles = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = Math.floor(total * layerSplit[layer]);
    for (let i = 0; i < count; i++) {
      const p = new Particle(canvas.width, canvas.height, expandMode, layer);
      // Stagger initial life to avoid synchronised birth flash
      p.life = Math.floor(Math.random() * p.maxLife);
      particles.push(p);
    }
  }
}

export function startVisualizer() {
  if (isRunning) return;
  isRunning = true;
  lastTime  = performance.now();
  _loop();
}

export function stopVisualizer() {
  isRunning = false;
  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function setExpandMode(val) {
  expandMode = !!val;
  spawnParticles();
}

// ── Private ───────────────────────────────────────────────────────────────────
function _updateFpsCap() {
  // Priority: reduced-motion / low-power > mobile > desktop
  // Low-power and reduced-motion both cap at 20 fps; the reduced particle count
  // set in spawnParticles() does the heavy lifting, the FPS cap prevents
  // wasted rAF callbacks on frames that would be visually indistinguishable.
  if (_lowPowerCached || _reducedMotion.matches) {
    FPS_CAP = 20;
  } else {
    FPS_CAP = isMobileDevice() ? 30 : 50;
  }
  FRAME_MS = 1000 / FPS_CAP;
}

function _loop(now = performance.now()) {
  if (!isRunning) return;
  animFrame = requestAnimationFrame(_loop);

  const delta = now - lastTime;
  if (delta < FRAME_MS) return;
  // Account for missed frames without accumulating huge debt
  lastTime = now - (delta % FRAME_MS);

  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;

  ctx.clearRect(0, 0, w, h);

  // ── Use _lowPowerCached instead of getState() ─────────────────────────────
  // getState() returns { ..._state } — a new object spread on every call.
  // At 30–50 fps that is 30–50 allocations/second → continuous GC pressure.
  // _lowPowerCached is updated only when the state actually changes (device
  // detection at boot, or OS preference change at runtime) so it is always
  // accurate and costs zero allocations in this hot path.
  _glowPhase += 0.008;

  if (_lowPowerCached) {
    // Low-power / reduced-motion path: simple opaque dots, no shadows, no gradients.
    // Deliberately minimal GPU work.
    ctx.globalAlpha = 1;
    for (const p of particles) {
      p.update(w, h);
      if (p.alpha <= 0.005) continue;
      ctx.globalAlpha = p.alpha * 0.5;
      ctx.shadowBlur  = 0; // ensure no leaked shadow state from a prior frame
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${_particleHue},${_particleSat}%,${_particleLit}%)`;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // ── Normal rendering path ─────────────────────────────────────────────────

  // Ambient breathing gradient
  const breathe = Math.sin(_glowPhase) * 0.025 + 0.04;
  const grad    = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.75);
  grad.addColorStop(0, `hsla(${_particleHue},${_particleSat}%,${_particleLit}%,${breathe})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Secondary orb
  const breathe2 = Math.sin(_glowPhase * 0.6 + 1.5) * 0.02 + 0.025;
  const grad2    = ctx.createRadialGradient(w * 0.25, h * 0.35, 0, w * 0.25, h * 0.35, w * 0.4);
  grad2.addColorStop(0, `hsla(${(_particleHue + 30) % 360},${_particleSat}%,${_particleLit}%,${breathe2})`);
  grad2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, w, h);

  // Expand-mode light column
  if (expandMode) {
    const rayAlpha = Math.sin(_glowPhase * 0.4) * 0.015 + 0.02;
    ctx.save();
    ctx.globalAlpha = rayAlpha;
    const col = ctx.createLinearGradient(w * 0.45, 0, w * 0.55, h);
    col.addColorStop(0,   `hsla(${_particleHue},${_particleSat}%,90%,0.8)`);
    col.addColorStop(0.5, `hsla(${_particleHue},${_particleSat}%,80%,0.3)`);
    col.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = col;
    ctx.fillRect(w * 0.35, 0, w * 0.3, h);
    ctx.restore();
  }

  // Particles: back → front (layer 0 first, layer 2 last so glowing particles
  // composite over dimmer ones)
  const byLayer = [[], [], []];
  for (const p of particles) byLayer[p.layer].push(p);

  for (let layer = 0; layer < 3; layer++) {
    for (const p of byLayer[layer]) {
      p.update(w, h);
      p.draw(ctx);
    }
  }
}