// ui.js — UI rendering and DOM helpers (mobile-optimised v2)
import { CONFIG } from './config.js';
import { isFavorite, toggleFavorite } from './storage.js';

// ── Time formatting ──────────────────────────────────────────────────────────
export function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Track card ───────────────────────────────────────────────────────────────
export function renderTrackCard(track, index, opts = {}) {
  const { active = false, onPlay, onFavorite, onAddToPlaylist, onRemoveFromPlaylist } = opts;
  const fav          = isFavorite(track.id);
  const isRemoveMode = typeof onRemoveFromPlaylist === 'function';
  const plBtnTitle   = isRemoveMode ? 'Remove from playlist' : 'Add to playlist';
  const plBtnIcon    = isRemoveMode ? icons.close : icons.plus;
  const plBtnClass   = isRemoveMode ? ' remove-pl-btn' : '';

  const card = document.createElement('div');
  card.className = `track-card${active ? ' active' : ''}`;
  card.dataset.id    = track.id;
  card.dataset.index = index;
  card.setAttribute('role', 'listitem');
  // Prevent context menu long-press on images
  card.addEventListener('contextmenu', e => e.preventDefault());

  card.innerHTML = `
    <div class="track-thumb">
      <img alt="${_escHtml(track.title)}" class="track-img" draggable="false" />
      <div class="track-play-overlay" aria-hidden="true">
        <button class="track-play-btn" aria-label="${active ? 'Pause' : 'Play'} ${_escHtml(track.title)}">
          ${active ? icons.pause : icons.play}
        </button>
      </div>
    </div>
    <div class="track-info">
      <div class="track-title">${_escHtml(track.title)}</div>
      <div class="track-moods">${(track.moods || []).slice(0, 3).map(m =>
        `<span class="mood-tag">${_escHtml(m)}</span>`
      ).join('')}</div>
    </div>
    <div class="track-actions">
      <button class="icon-btn fav-btn${fav ? ' active' : ''}"
              title="${fav ? 'Remove favourite' : 'Add favourite'}"
              aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}"
              aria-pressed="${fav}">
        ${fav ? icons.heartFilled : icons.heart}
      </button>
      <button class="icon-btn add-pl-btn${plBtnClass}"
              title="${plBtnTitle}" aria-label="${plBtnTitle}">
        ${plBtnIcon}
      </button>
    </div>
  `;

  // ── Lazy image loading ───────────────────────────────────────────────────
  const img    = card.querySelector('.track-img');
  const lowSrc = track.image_url?.low  || null;
  const hiSrc  = track.image_url?.high || null;

  const io = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      obs.disconnect();
      if (!lowSrc) return;
      img.onload  = () => img.classList.add('loaded');
      img.onerror = () => img.removeAttribute('src');
      img.src = lowSrc;
    }
  }, { rootMargin: '200px' });
  io.observe(img);

  // Hover → preload high-res (desktop only — pointless on touch)
  if (hiSrc && !('ontouchstart' in window)) {
    img.addEventListener('mouseover', () => {
      if (img.dataset.hiLoaded) return;
      img.dataset.hiLoaded = '1';
      const hi = new Image();
      hi.onload = () => { if (img.classList.contains('loaded')) img.src = hiSrc; };
      hi.src = hiSrc;
    }, { once: true });
  }

  // ── Events ───────────────────────────────────────────────────────────────
  const playBtn = card.querySelector('.track-play-btn');
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay && onPlay(track, index);
  });

  // Tap anywhere on card → play
  card.addEventListener('click', (e) => {
    // Don't fire if tapping an action button
    if (e.target.closest('.track-actions')) return;
    onPlay && onPlay(track, index);
  });

  const favBtn = card.querySelector('.fav-btn');
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newFavs = toggleFavorite(track.id);
    const isFav   = newFavs.includes(track.id);
    favBtn.innerHTML = isFav ? icons.heartFilled : icons.heart;
    favBtn.classList.toggle('active', isFav);
    favBtn.setAttribute('aria-label', isFav ? 'Remove from favourites' : 'Add to favourites');
    favBtn.setAttribute('aria-pressed', isFav);
    favBtn.title = isFav ? 'Remove favourite' : 'Add favourite';
    onFavorite && onFavorite(track, isFav);
  });

  const plBtn = card.querySelector('.add-pl-btn');
  plBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isRemoveMode) onRemoveFromPlaylist(track);
    else              onAddToPlaylist && onAddToPlaylist(track);
  });

  return card;
}

// ── Update active state in a list ────────────────────────────────────────────
export function updateTrackCardActive(listEl, activeId) {
  listEl.querySelectorAll('.track-card').forEach(card => {
    const isActive = card.dataset.id === activeId;
    card.classList.toggle('active', isActive);
    const btn = card.querySelector('.track-play-btn');
    if (btn) {
      btn.innerHTML = isActive ? icons.pause : icons.play;
      btn.setAttribute('aria-label', `${isActive ? 'Pause' : 'Play'} track`);
    }
  });
}

// ── Mood pills ────────────────────────────────────────────────────────────────
export function renderMoodPills(containerEl, moods, activeMood, onClick) {
  containerEl.innerHTML = '';
  for (const mood of moods) {
    const btn = document.createElement('button');
    btn.className    = `mood-pill${mood === activeMood ? ' active' : ''}`;
    btn.dataset.mood = mood;
    btn.setAttribute('aria-pressed', mood === activeMood);
    btn.setAttribute('aria-label',   `Filter by ${mood}`);
    btn.innerHTML    = `<span class="mood-icon" aria-hidden="true">${CONFIG.MOOD_ICONS[mood] || '◉'}</span><span>${_escHtml(mood)}</span>`;
    btn.addEventListener('click', () => onClick(mood));
    containerEl.appendChild(btn);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function showToast(message, duration = 2500) {
  const existing = document.querySelector('.dhyaan-toast');
  if (existing) { existing.remove(); }
  const toast = document.createElement('div');
  toast.className = 'dhyaan-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);
  // Use rAF so the initial paint (opacity:0) actually happens first
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Now-playing panel ─────────────────────────────────────────────────────────
export function updateNowPlaying(track, _playing) {
  if (!track) return;

  const titleEl     = document.getElementById('np-title');
  const moodsEl     = document.getElementById('np-moods');
  const imgEl       = document.getElementById('np-image');
  const expandImgEl = document.getElementById('expand-image');
  const expandTitle = document.getElementById('expand-title');
  const expandMoods = document.getElementById('expand-moods');

  const moodsStr = (track.moods || []).join(' · ') || '―';

  if (titleEl)     titleEl.textContent = track.title;
  if (moodsEl)     moodsEl.textContent = moodsStr;
  if (expandTitle) expandTitle.textContent = track.title;
  if (expandMoods) expandMoods.textContent = moodsStr;

  if (imgEl) {
    imgEl.classList.remove('loaded');
    imgEl.onload  = () => imgEl.classList.add('loaded');
    imgEl.onerror = () => imgEl.removeAttribute('src');
    imgEl.src = track.image_url?.low || '';
  }
  if (expandImgEl) {
    expandImgEl.classList.remove('loaded');
    expandImgEl.onload  = () => expandImgEl.classList.add('loaded');
    expandImgEl.onerror = () => expandImgEl.removeAttribute('src');
    expandImgEl.src = track.image_url?.high || track.image_url?.low || '';
  }

  document.title = `${track.title} — Dhyaan`;
}

// ── Play/pause button state ───────────────────────────────────────────────────
export function updatePlayPauseBtn(playing) {
  const btn       = document.getElementById('play-pause-btn');
  const expandBtn = document.getElementById('expand-play-btn');
  const icon      = playing ? icons.pause : icons.play;
  const label     = playing ? 'Pause' : 'Play';
  if (btn)       { btn.innerHTML       = icon; btn.setAttribute('aria-label', label); }
  if (expandBtn) { expandBtn.innerHTML = icon; expandBtn.setAttribute('aria-label', label); }
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function updateProgress(current, duration) {
  if (isNaN(current) || isNaN(duration)) return;

  const pct     = duration > 0 ? (current / duration) * 100 : 0;
  const pctStr  = `${pct.toFixed(2)}%`;

  const filled  = document.getElementById('progress-filled');
  const thumb   = document.getElementById('progress-thumb');
  const currEl  = document.getElementById('current-time');
  const durEl   = document.getElementById('duration');
  const bar     = document.getElementById('progress-bar');

  const expFill  = document.getElementById('expand-filled');
  const expThumb = document.getElementById('expand-thumb');
  const expCurr  = document.getElementById('expand-current');
  const expDur   = document.getElementById('expand-duration');
  const expBar   = document.getElementById('expand-progress-bar');

  if (filled) filled.style.width = pctStr;
  if (thumb)  thumb.style.left   = pctStr;
  if (currEl) currEl.textContent = formatTime(current);
  if (durEl)  durEl.textContent  = formatTime(duration);
  if (bar)    bar.setAttribute('aria-valuenow', Math.round(pct));

  if (expFill)  expFill.style.width = pctStr;
  if (expThumb) expThumb.style.left  = pctStr;
  if (expCurr)  expCurr.textContent  = formatTime(current);
  if (expDur)   expDur.textContent   = formatTime(duration);
  if (expBar)   expBar.setAttribute('aria-valuenow', Math.round(pct));
}

// ── Volume slider fill ────────────────────────────────────────────────────────
export function updateVolumeSliderFill(vol) {
  const slider = document.getElementById('volume-slider');
  if (!slider) return;
  const pct = Math.round(vol * 100);
  slider.style.setProperty('--vol-fill', `${pct}%`);
  slider.value = pct;
}

// ── HTML escaping ─────────────────────────────────────────────────────────────
function _escHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── SVG icon set ──────────────────────────────────────────────────────────────
export const icons = {
  play:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  pause:      `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  next:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
  prev:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
  heart:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  plus:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  close:      `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  shuffle:    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
  repeat:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
  repeatOne:  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`,
  expand:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
  collapse:   `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`,
  random:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V18h2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L7 11v1c0 2.76 2.24 5 5 5v-1l3.78 3.78c-.97.36-2.02.54-3.1.54-.58 0-1.15-.06-1.68-.17V19.93z"/></svg>`,
  playlist:   `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h12v2H3zm0 5h12v2H3zm15-1v6l5-3z"/></svg>`,
  search:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
  back:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
};
