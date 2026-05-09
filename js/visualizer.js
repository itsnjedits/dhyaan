// visualizer.js — Canvas particle system + ambient visualizer
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

class Particle {
  constructor(w, h, expand) {
    this.reset(w, h, expand);
  }

  reset(w, h, expand) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.r = Math.random() * (expand ? 3.5 : 2.2) + 0.4;
    this.alpha = Math.random() * 0.5 + 0.08;
    this.targetAlpha = this.alpha;
    this.vx = (Math.random() - 0.5) * 0.22;
    this.vy = (Math.random() - 0.5) * 0.18 - 0.08;
    this.life = 0;
    this.maxLife = Math.random() * 400 + 200;
    this.hue = Math.random() * 60 + 100; // greens to teals
    this.pulse = Math.random() * Math.PI * 2;
  }

  update(w, h) {
    this.life++;
    this.x += this.vx;
    this.y += this.vy;
    this.pulse += 0.015;
    this.alpha = Math.sin((this.life / this.maxLife) * Math.PI) * this.targetAlpha;
    if (this.life >= this.maxLife || this.x < -10 || this.x > w + 10 || this.y < -10 || this.y > h + 10) {
      this.reset(w, h, expandMode);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + Math.sin(this.pulse) * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.hue}, 70%, 75%, 1)`;
    ctx.shadowColor = `hsla(${this.hue}, 90%, 70%, 0.8)`;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }
}

export function initVisualizer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  if (!canvas) return;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  spawnParticles();
}

function spawnParticles() {
  const state = getState();
  const count = state.lowPowerMode
    ? CONFIG.PARTICLE_COUNT.low
    : expandMode
    ? CONFIG.PARTICLE_COUNT.expand
    : CONFIG.PARTICLE_COUNT.normal;

  particles = Array.from({ length: count }, () =>
    new Particle(canvas.width, canvas.height, expandMode)
  );
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
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  ctx.clearRect(0, 0, w, h);

  const state = getState();
  if (state.lowPowerMode) {
    // Minimal rendering
    for (const p of particles) {
      p.update(w, h);
      ctx.globalAlpha = p.alpha * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Ambient gradient overlay
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.7);
  grad.addColorStop(0, 'rgba(20, 80, 50, 0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (const p of particles) {
    p.update(w, h);
    p.draw(ctx);
  }
}
