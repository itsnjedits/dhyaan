// atmosphere.js — AtmosphereEngine: unified immersive experience controller
//
// Single controller object for all visual-atmosphere effects:
//   • Color palette extraction from album art (canvas sampling)
//   • Dynamic glow/tone overlay tied to extracted palette
//   • Fog vignette for expand mode
//   • Particle hue injection → visualizer
//   • Audio-sync glow pulse

let _glowEl = null;
let _fogEl = null;
let _particleHueCb = null;   // callback(h, s, l) → visualizer.setParticleHue

let _extractedH = 120;       // default green hue
let _extractedS = 60;
let _extractedL = 55;

// ── Init ────────────────────────────────────────────────────────────────────
export function initAtmosphere(callbacks = {}) {
  _particleHueCb = callbacks.onHueChange || null;

  // Glow overlay — sits behind the app (z-index 0)
  _glowEl = _makeEl('div', 'atmos-glow', `
    position:fixed;inset:0;z-index:0;pointer-events:none;
    transition:background 2.5s ease;mix-blend-mode:screen;
    background:radial-gradient(ellipse at 30% 40%,
      hsla(120,60%,55%,0.06) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 60%,
      hsla(150,60%,50%,0.04) 0%, transparent 60%);
  `);
  document.body.insertBefore(_glowEl, document.body.firstChild);

  // Fog overlay — shown in expand mode
  _fogEl = _makeEl('div', 'atmos-fog', `
    position:fixed;inset:0;z-index:0;pointer-events:none;
    opacity:0;transition:opacity 1.8s ease;
    background:radial-gradient(ellipse at 50% 110%,
      rgba(0,0,0,0.55) 0%, transparent 65%);
  `);
  document.body.insertBefore(_fogEl, document.body.firstChild);
}

// ── Color extraction ────────────────────────────────────────────────────────
/**
 * Sample a loaded <img> element with an off-screen 24×24 canvas.
 * Picks the most saturated, non-grayscale pixel cluster.
 * Silently fails on cross-origin taint (GitHub raw images have CORS headers
 * but the browser may still block canvas reads in some configs).
 */
export function extractColorFromImage(imgEl) {
  if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return;
  try {
    const oc = document.createElement('canvas');
    oc.width = 24; oc.height = 24;
    const ox = oc.getContext('2d');
    ox.drawImage(imgEl, 0, 0, 24, 24);
    const { data } = ox.getImageData(0, 0, 24, 24);

    let bestH = null, bestS = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const { h, s, l } = _rgbToHsl(r, g, b);
      // Ignore near-white, near-black, and near-gray
      if (s > bestS && l > 0.12 && l < 0.88 && s > 0.15) {
        bestS = s;
        bestH = h;
        _extractedS = Math.round(s * 100);
        _extractedL = Math.round(l * 100);
      }
    }

    if (bestH !== null) {
      _extractedH = Math.round(bestH * 360);
      _applyColor(_extractedH, _extractedS, _extractedL);
    }
  } catch (_) {
    // Cross-origin canvas taint — silently skip, keep current palette
  }
}

// ── Internal color application ───────────────────────────────────────────────
function _applyColor(h, s, l) {
  if (_glowEl) {
    _glowEl.style.background = [
      `radial-gradient(ellipse at 25% 35%, hsla(${h},${s}%,${l}%,0.07) 0%, transparent 60%)`,
      `radial-gradient(ellipse at 75% 65%, hsla(${(h + 35) % 360},${s}%,${Math.min(l + 12, 88)}%,0.05) 0%, transparent 60%)`,
    ].join(',');
  }
  if (_particleHueCb) _particleHueCb(h);
}

// ── Fog (expand mode) ───────────────────────────────────────────────────────
export function setFogMode(enabled) {
  if (_fogEl) _fogEl.style.opacity = enabled ? '1' : '0';
}

// ── Audio-reactive glow pulse (called from app.js per animation frame) ──────
export function pulseGlow(bassEnergy = 0) {
  if (!_glowEl) return;
  const h = _extractedH, s = _extractedS, l = _extractedL;
  const a1 = Math.min(0.05 + bassEnergy * 0.15, 0.22);
  const a2 = Math.min(0.03 + bassEnergy * 0.10, 0.14);
  _glowEl.style.background = [
    `radial-gradient(ellipse at 50% 50%, hsla(${h},${s}%,${l}%,${a1}) 0%, transparent 60%)`,
    `radial-gradient(ellipse at 25% 75%, hsla(${(h + 35) % 360},${s}%,${l}%,${a2}) 0%, transparent 55%)`,
  ].join(',');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _makeEl(tag, id, css) {
  const el = document.createElement(tag);
  el.id = id;
  el.style.cssText = css;
  return el;
}

function _rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 0.001) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}
