// visualizer.js — Canvas particle system + ambient visualizer
// Improved: dynamic artwork-driven color, depth layers, breathing glow
import { CONFIG } from './config.js';
import { getState } from './storage.js';

let canvas, ctx;
let particles = [];
let animFrame = null;
let isRunning = false;
let expandMode = false;
let lastTime = 0;
const FPS_CAP = 50;
const FRAME_MS = 1000 / FPS_CAP;

// Dynamic color — updated when track changes
let _particleHue = 140;      // dominant hue from artwork (0–360)
let _particleSat = 65;       // saturation
let _particleLit = 72;       // lightness

// Breathing glow state
let _glowPhase = 0;

class Particle {
  constructor(w, h, expand, layer = 0) {
    this.layer = layer; // 0=back, 1=mid, 2=front — depth simulation
    this.reset(w, h, expand);
  }

  reset(w, h, expand) {
    // Distribute with slight top bias for ethereal rising feel
    this.x = Math.random() * w;
    this.y = Math.random() * h * 1.1;

    // Layer-based sizing — back particles small, front larger
    const baseR = expand ? 3.0 : 1.8;
    const layerMult = [0.5, 1.0, 1.6][this.layer];
    this.r = (Math.random() * baseR + 0.3) * layerMult;

    // Layer-based opacity — back dim, front brighter
    const baseAlpha = [0.12, 0.28, 0.45][this.layer];
    this.targetAlpha = Math.random() * baseAlpha + baseAlpha * 0.3;
    this.alpha = this.targetAlpha;

    // Slow upward drift, slight lateral wobble
    const speed = [0.08, 0.16, 0.28][this.layer];
    this.vx = (Math.random() - 0.5) * speed * 1.4;
    this.vy = -(Math.random() * speed + 0.04); // always upward

    // Life
    this.life = Math.floor(Math.random() * 300); // staggered birth
    this.maxLife = Math.random() * 500 + 300;

    // Individual hue variance around dominant color
    this.hueOffset = (Math.random() - 0.5) * 50;

    // Pulse phase
    this.pulse = Math.random() * Math.PI * 2;
    this.pulseSpeed = 0.008 + Math.random() * 0.012;

    // Wobble
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleAmp = (Math.random() * 0.4 + 0.1) * ([0.5, 1, 1.5][this.layer]);
  }

  update(w, h) {
    this.life++;
    this.pulse += this.pulseSpeed;
    this.wobble += 0.01;

    this.x += this.vx + Math.sin(this.wobble) * this.wobbleAmp;
    this.y += this.vy;

    // Fade in/out envelope
    const t = this.life / this.maxLife;
    this.alpha = Math.sin(t * Math.PI) * this.targetAlpha;

    if (this.life >= this.maxLife ||
        this.x < -20 || this.x > w + 20 ||
        this.y < -30 || this.y > h + 20) {
      this.reset(w, h, expandMode);
    }
  }

  draw(ctx) {
    if (this.alpha <= 0.005) return;
    const hue = ((_particleHue + this.hueOffset + 360) % 360);
    const sat = Math.min(100, _particleSat + 10);
    const lit = Math.min(95, _particleLit + 5);
    const pulseR = this.r + Math.sin(this.pulse) * (this.r * 0.3);

    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);

    // Glow halo (only for mid/front layers)
    if (this.layer >= 1) {
      ctx.shadowColor = `hsla(${hue}, ${sat}%, ${lit}%, 0.9)`;
      ctx.shadowBlur = this.layer === 2 ? 14 : 7;
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit}%, 1)`;
    ctx.fill();
    ctx.restore();
  }
}

export function initVisualizer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  requestAnimationFrame(() => {
    resize();
    window.addEventListener('resize', resize);
  });
}

export function resize() {
  if (!canvas) return;
  const w = canvas.offsetWidth || window.innerWidth || 800;
  const h = canvas.offsetHeight || window.innerHeight || 600;
  canvas.width = w;
  canvas.height = h;
  spawnParticles();
}

// ── Dynamic color from artwork ─────────────────────────────────────────────
export function setParticleColor(hue, sat = 65, lit = 72) {
  _particleHue = hue;
  _particleSat = sat;
  _particleLit = lit;
}

function spawnParticles() {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;
  const state = getState();
  const total = state.lowPowerMode
    ? CONFIG.PARTICLE_COUNT.low
    : expandMode
    ? CONFIG.PARTICLE_COUNT.expand
    : CONFIG.PARTICLE_COUNT.normal;

  // Distribute across three depth layers
  const layerSplit = [0.4, 0.4, 0.2]; // 40% back, 40% mid, 20% front
  particles = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = Math.floor(total * layerSplit[layer]);
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(canvas.width, canvas.height, expandMode, layer));
    }
  }
}

export function startVisualizer() {
  if (isRunning) return;
  isRunning = true;
  lastTime = performance.now();
  loop();
}

export function stopVisualizer() {
  isRunning = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function setExpandMode(val) {
  expandMode = val;
  spawnParticles();
}

function loop(now = performance.now()) {
  if (!isRunning) return;
  animFrame = requestAnimationFrame(loop);
  if (now - lastTime < FRAME_MS) return;
  lastTime = now;

  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;

  ctx.clearRect(0, 0, w, h);

  const state = getState();
  _glowPhase += 0.008;

  if (state.lowPowerMode) {
    // Low-power: simple dots, no glow
    for (const p of particles) {
      p.update(w, h);
      ctx.globalAlpha = p.alpha * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${_particleHue}, ${_particleSat}%, ${_particleLit}%)`;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // ── Ambient radial gradient — breathes with _glowPhase ─────────────────
  const breathe = Math.sin(_glowPhase) * 0.025 + 0.04;
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.75);
  grad.addColorStop(0, `hsla(${_particleHue}, ${_particleSat}%, ${_particleLit}%, ${breathe})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // ── Secondary orb (offset, slower breathe) ────────────────────────────
  const breathe2 = Math.sin(_glowPhase * 0.6 + 1.5) * 0.02 + 0.025;
  const grad2 = ctx.createRadialGradient(w * 0.25, h * 0.35, 0, w * 0.25, h * 0.35, w * 0.4);
  grad2.addColorStop(0, `hsla(${(_particleHue + 30) % 360}, ${_particleSat}%, ${_particleLit}%, ${breathe2})`);
  grad2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, w, h);

  // ── Subtle light ray (expand mode only) ───────────────────────────────
  if (expandMode) {
    const rayAlpha = Math.sin(_glowPhase * 0.4) * 0.015 + 0.02;
    ctx.save();
    ctx.globalAlpha = rayAlpha;
    const rayGrad = ctx.createConicalGradient
      ? null // fallback below
      : null;
    // Soft vertical light column
    const col = ctx.createLinearGradient(w * 0.45, 0, w * 0.55, h);
    col.addColorStop(0, `hsla(${_particleHue}, ${_particleSat}%, 90%, 0.8)`);
    col.addColorStop(0.5, `hsla(${_particleHue}, ${_particleSat}%, 80%, 0.3)`);
    col.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = col;
    ctx.fillRect(w * 0.35, 0, w * 0.3, h);
    ctx.restore();
  }

  // ── Particles — back → front order for depth ──────────────────────────
  const byLayer = [[], [], []];
  for (const p of particles) byLayer[p.layer].push(p);

  for (let layer = 0; layer < 3; layer++) {
    for (const p of byLayer[layer]) {
      p.update(w, h);
      p.draw(ctx);
    }
  }
}
