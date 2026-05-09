// ui.js — UI rendering and DOM helpers
//
// FIXES:
//   ❌→✅  Image loading: two-layer (low → high) crossfade system.
//          Low-res shown immediately; high-res preloaded silently and faded in
//          on top — NO layout shift, NO blank state, NO flicker.
//   ❌→✅  Race condition: handlers bound BEFORE src assigned in all image loads.
//   ❌→✅  Download: fetch + Blob for cross-origin GitHub raw URLs; falls back
//          to window.open on CORS failure.
//   ❌→✅  Favorites: instant UI update on toggle.

import { CONFIG } from './config.js';
import { isFavorite, toggleFavorite } from './storage.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Two-layer image loader ────────────────────────────────────────────────────
/**
 * loadDualImage(lowSrc, highSrc, lowEl, highEl)
 *
 * Behaviour:
 *   1. Lazy-load lowEl (IntersectionObserver, 150 px margin) → adds .loaded
 *   2. As soon as lowEl is loading, silently preload highSrc in background
 *   3. When high is ready, highEl.src = highSrc → adds .loaded (fades in on top)
 *
 * CSS contract (in main.css):
 *   .track-img        { opacity:0; transition: opacity 0.7s }
 *   .track-img.loaded { opacity:1 }
 *   .track-img-high   { z-index:1 }   ← sits above low, fades in over it
 */
function loadDualImage(lowSrc, highSrc, lowEl, highEl) {
  if (!lowSrc) return;  // no image — keep placeholder

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.disconnect();

      // ── FIX: bind handlers BEFORE setting src (cache race-condition)
      lowEl.onload  = () => lowEl.classList.add('loaded');
      lowEl.onerror = () => lowEl.removeAttribute('src');
      lowEl.src = lowSrc;

      // Immediately start preloading high-res in the background
      if (highSrc) {
        const hi = new Image();
        hi.onload = () => {
          // ── FIX: bind handler before src
          highEl.onload  = () => highEl.classList.add('loaded');
          highEl.onerror = () => highEl.removeAttribute('src');
          highEl.src = highSrc;
        };
        // Cross-origin images — no credentials needed for GitHub raw
        hi.crossOrigin = 'anonymous';
        hi.src = highSrc;
      }
    }
  }, { rootMargin: '150px' });

  io.observe(lowEl);
}

// ── Track card ────────────────────────────────────────────────────────────────
export function renderTrackCard(track, index, opts = {}) {
  const { active = false, onPlay, onFavorite, onAddToPlaylist } = opts;
  const fav  = isFavorite(track.id);
  const card = document.createElement('div');
  card.className = `track-card${active ? ' active' : ''}`;
  card.dataset.id    = track.id;
  card.dataset.index = index;

  const lowSrc  = track.image_url?.low  || null;
  const highSrc = track.image_url?.high || null;

  card.innerHTML = `
    <div class="track-thumb">
      <div class="img-wrap">
        <img class="track-img track-img-low"  alt="${track.title}" />
        <img class="track-img track-img-high" alt=""  aria-hidden="true" />
      </div>
      <div class="track-play-overlay">
        <button class="track-play-btn" aria-label="${active ? 'Pause' : 'Play'} ${track.title}">
          ${active ? icons.pause : icons.play}
        </button>
      </div>
    </div>
    <div class="track-info">
      <div class="track-title" title="${track.title}">${track.title}</div>
      <div class="track-moods">${(track.moods || []).slice(0, 3).map(m =>
        `<span class="mood-tag">${m}</span>`
      ).join('')}</div>
    </div>
    <div class="track-actions">
      <button class="icon-btn fav-btn ${fav ? 'active' : ''}"
        title="${fav ? 'Remove from favorites' : 'Add to favorites'}"
        aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">
        ${fav ? icons.heartFilled : icons.heart}
      </button>
      <button class="icon-btn add-pl-btn" title="Add to playlist" aria-label="Add to playlist">
        ${icons.plus}
      </button>
      <button class="icon-btn dl-btn" title="Download" aria-label="Download ${track.title}"
        data-audio-url="${track.audio_url}" data-title="${track.title}">
        ${icons.download}
      </button>
    </div>
  `;

  // Wire two-layer image loading
  const lowEl  = card.querySelector('.track-img-low');
  const highEl = card.querySelector('.track-img-high');
  loadDualImage(lowSrc, highSrc, lowEl, highEl);

  // ── Play
  card.querySelector('.track-play-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay && onPlay(track, index);
  });
  card.addEventListener('click', () => onPlay && onPlay(track, index));

  // ── Favorite toggle
  card.querySelector('.fav-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const newFavs = toggleFavorite(track.id);
    const btn     = card.querySelector('.fav-btn');
    const isFav   = newFavs.includes(track.id);
    btn.innerHTML  = isFav ? icons.heartFilled : icons.heart;
    btn.classList.toggle('active', isFav);
    btn.title      = isFav ? 'Remove from favorites' : 'Add to favorites';
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
    onFavorite && onFavorite(track, isFav);
  });

  // ── Add to playlist
  card.querySelector('.add-pl-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onAddToPlaylist && onAddToPlaylist(track);
  });

  // ── Download — fetch + Blob for cross-origin GitHub raw URLs
  //   Falls back to window.open if CORS blocks the fetch.
  card.querySelector('.dl-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn   = e.currentTarget;
    const url   = btn.dataset.audioUrl;
    const title = btn.dataset.title || 'track';
    if (!url) return;

    const orig = btn.innerHTML;
    btn.innerHTML = `<span class="spin">◌</span>`;
    btn.disabled  = true;

    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob    = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.href         = blobUrl;
      a.download     = `${title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
    } catch (err) {
      console.warn('[download] fetch failed, opening in new tab:', err);
      window.open(url, '_blank', 'noopener');
    } finally {
      btn.innerHTML = orig;
      btn.disabled  = false;
    }
  });

  return card;
}

// ── Active card highlight ─────────────────────────────────────────────────────
export function updateTrackCardActive(listEl, activeId) {
  listEl.querySelectorAll('.track-card').forEach(card => {
    const isActive = card.dataset.id === String(activeId);
    card.classList.toggle('active', isActive);
    const btn = card.querySelector('.track-play-btn');
    if (btn) btn.innerHTML = isActive ? icons.pause : icons.play;
  });
}

// ── Mood pills ────────────────────────────────────────────────────────────────
export function renderMoodPills(containerEl, moods, activeMood, onClick) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  for (const mood of moods) {
    const btn = document.createElement('button');
    btn.className  = `mood-pill${mood === activeMood ? ' active' : ''}`;
    btn.dataset.mood = mood;
    btn.innerHTML  = `<span class="mood-icon">${CONFIG.MOOD_ICONS[mood] || '◉'}</span><span>${mood}</span>`;
    btn.addEventListener('click', () => onClick(mood));
    containerEl.appendChild(btn);
  }
}

// ── Toast notification ────────────────────────────────────────────────────────
export function showToast(message, duration = 2500) {
  document.querySelector('.dhyaan-toast')?.remove();
  const toast = document.createElement('div');
  toast.className   = 'dhyaan-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 420);
  }, duration);
}

// ── Now Playing update ────────────────────────────────────────────────────────
/**
 * updateNowPlaying(track, playing)
 *
 * Updates the player bar thumbnail and the expand overlay image.
 * Expand overlay uses the same two-layer system:
 *   #expand-image-low  → low.webp (shows immediately)
 *   #expand-image      → high.webp (fades in on top)
 */
export function updateNowPlaying(track, playing) {
  if (!track) return;

  const titleEl  = document.getElementById('np-title');
  const moodsEl  = document.getElementById('np-moods');
  const imgEl    = document.getElementById('np-image');

  if (titleEl) titleEl.textContent = track.title;
  if (moodsEl) moodsEl.textContent = (track.moods || []).join(' · ') || '―';

  // Player bar thumbnail (single small image — low only is fine here)
  if (imgEl) {
    imgEl.classList.remove('loaded');
    imgEl.onload  = () => imgEl.classList.add('loaded');
    imgEl.onerror = () => imgEl.removeAttribute('src');
    imgEl.src     = track.image_url?.low || '';
  }

  // Expand overlay — two-layer crossfade
  const expandLowEl  = document.getElementById('expand-image-low');
  const expandHighEl = document.getElementById('expand-image');

  if (expandLowEl && expandHighEl) {
    // Reset both layers
    expandLowEl.classList.remove('loaded');
    expandHighEl.classList.remove('loaded');

    const low  = track.image_url?.low  || '';
    const high = track.image_url?.high || low;

    // Low loads immediately (no IntersectionObserver needed — expand is visible)
    if (low) {
      expandLowEl.onload  = () => expandLowEl.classList.add('loaded');
      expandLowEl.onerror = () => expandLowEl.removeAttribute('src');
      expandLowEl.src     = low;
    }

    // High loads in background then fades in over low
    if (high) {
      const hiPre = new Image();
      hiPre.crossOrigin = 'anonymous';
      hiPre.onload = () => {
        expandHighEl.onload  = () => expandHighEl.classList.add('loaded');
        expandHighEl.onerror = () => expandHighEl.removeAttribute('src');
        expandHighEl.src     = high;
      };
      hiPre.src = high;
    }
  }

  document.title = `${track.title} — Dhyaan`;
}

// ── Play / Pause button state ─────────────────────────────────────────────────
export function updatePlayPauseBtn(playing) {
  const btn = document.getElementById('play-pause-btn');
  if (btn) btn.innerHTML = playing ? icons.pause : icons.play;

  const expandBtn = document.getElementById('expand-play-btn');
  if (expandBtn) expandBtn.innerHTML = playing ? icons.pause : icons.play;
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function updateProgress(current, duration) {
  const filled  = document.getElementById('progress-filled');
  const currEl  = document.getElementById('current-time');
  const durEl   = document.getElementById('duration');
  if (filled && duration) filled.style.width = `${(current / duration) * 100}%`;
  if (currEl) currEl.textContent = formatTime(current);
  if (durEl)  durEl.textContent  = formatTime(duration);
}

// ── Icon set ──────────────────────────────────────────────────────────────────
export const icons = {
  play:       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  next:       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
  prev:       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
  heart:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  download:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  plus:       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  shuffle:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
  repeat:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
  repeatOne:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`,
  expand:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
  collapse:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`,
  random:     `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>`,
  playlist:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zm0 5h12v2H3zm0 5h12v2H3zm15-1v6l5-3z"/></svg>`,
  close:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  search:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
};
