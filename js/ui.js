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

// ── BUG-009 FIX: Single shared IntersectionObserver for lazy image loading ──
// The original code created one IntersectionObserver per track card. With 50+
// cards, this produced 50+ IO instances simultaneously. When the track list
// re-rendered (search, mood change), listEl.innerHTML='' removed elements from
// the DOM but did NOT call observer.disconnect(), leaving 50+ detached IO
// objects in memory holding references to orphaned img elements — a classic
// memory leak that worsened with every re-render.
//
// Fix: a single module-level observer handles ALL card images. Each img stores
// its src URL in dataset.lazySrc. The observer callback unobserves the specific
// element (not all elements like obs.disconnect() did) and loads the image.
const _lazyImageObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target;
    _lazyImageObserver.unobserve(img);   // stop watching this element only
    const src = img.dataset.lazySrc;
    if (!src) continue;
    img.onload  = () => img.classList.add('loaded');
    img.onerror = () => img.removeAttribute('src');
    img.src = src;
    delete img.dataset.lazySrc;          // clean up dataset attribute
  }
}, { rootMargin: '200px' });

// ── Cached DOM references — progress elements ────────────────────────────────
// updateProgress() is called at ~4Hz during playback. Caching element refs
// after first access reduces DOM queries from ~40/sec to 0/sec after init.
let _progressEls = null;

function _getProgressEls() {
  if (_progressEls) return _progressEls;
  _progressEls = {
    filled:  document.getElementById('progress-filled'),
    thumb:   document.getElementById('progress-thumb'),
    curr:    document.getElementById('current-time'),
    dur:     document.getElementById('duration'),
    bar:     document.getElementById('progress-bar'),
    expFill: document.getElementById('expand-filled'),
    expThumb:document.getElementById('expand-thumb'),
    expCurr: document.getElementById('expand-current'),
    expDur:  document.getElementById('expand-duration'),
    expBar:  document.getElementById('expand-progress-bar'),
  };
  return _progressEls;
}

// ── Cached DOM references — now-playing panel ────────────────────────────────
let _nowPlayingEls = null;

function _getNowPlayingEls() {
  if (_nowPlayingEls) return _nowPlayingEls;
  _nowPlayingEls = {
    title:      document.getElementById('np-title'),
    moods:      document.getElementById('np-moods'),
    img:        document.getElementById('np-image'),
    expandImg:  document.getElementById('expand-image'),
    expandTitle:document.getElementById('expand-title'),
    expandMoods:document.getElementById('expand-moods'),
  };
  return _nowPlayingEls;
}

// ── Cached DOM references — play/pause buttons ───────────────────────────────
let _playPauseEls = null;

function _getPlayPauseEls() {
  if (_playPauseEls) return _playPauseEls;
  _playPauseEls = {
    btn:       document.getElementById('play-pause-btn'),
    expandBtn: document.getElementById('expand-play-btn'),
  };
  return _playPauseEls;
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
      <img alt="${escHtml(track.title)}" class="track-img" draggable="false" />
      <div class="track-play-overlay" aria-hidden="true">
        <button class="track-play-btn" aria-label="${active ? 'Pause' : 'Play'} ${escHtml(track.title)}">
          ${active ? icons.pause : icons.play}
        </button>
      </div>
    </div>
    <div class="track-info">
      <div class="track-title">${escHtml(track.title)}</div>
      <div class="track-moods">${(track.moods || []).slice(0, 3).map(m =>
        `<span class="mood-tag">${escHtml(m)}</span>`
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

  // ── Lazy image loading (shared observer) ─────────────────────────────────
  const img    = card.querySelector('.track-img');
  const lowSrc = track.image_url?.low  || null;
  const hiSrc  = track.image_url?.high || null;

  if (lowSrc) {
    img.dataset.lazySrc = lowSrc;
    _lazyImageObserver.observe(img);
  }

  // Hover → preload high-res on desktop with a decent connection only.
  if (hiSrc && !('ontouchstart' in window) &&
      navigator.connection?.effectiveType !== '2g') {
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

  card.addEventListener('click', (e) => {
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

// ── Now playing ───────────────────────────────────────────────────────────────
export function updateNowPlaying(track, playing) {
  if (!track) return;
  const els = _getNowPlayingEls();

  const moodsStr = (track.moods || []).join(' · ').toUpperCase();

  if (els.title)       els.title.textContent       = track.title;
  if (els.moods)       els.moods.textContent        = moodsStr || '―';
  if (els.expandTitle) els.expandTitle.textContent  = track.title;
  if (els.expandMoods) els.expandMoods.textContent  = moodsStr;

  // Now-playing thumbnail
  if (els.img) {
    els.img.classList.remove('loaded');
    if (track.image_url?.low) {
      els.img.onload  = () => els.img.classList.add('loaded');
      els.img.onerror = () => els.img.removeAttribute('src');
      els.img.src = track.image_url.low;
    } else {
      els.img.removeAttribute('src');
    }
  }

  // Expand overlay image (high-res)
  if (els.expandImg) {
    els.expandImg.classList.remove('loaded');
    const src = track.image_url?.high || track.image_url?.low || null;
    if (src) {
      els.expandImg.onload  = () => els.expandImg.classList.add('loaded');
      els.expandImg.onerror = () => els.expandImg.removeAttribute('src');
      els.expandImg.src = src;
    } else {
      els.expandImg.removeAttribute('src');
    }
  }
}

// ── Play/pause button ─────────────────────────────────────────────────────────
export function updatePlayPauseBtn(playing) {
  const els = _getPlayPauseEls();
  if (els.btn) {
    els.btn.innerHTML   = playing ? icons.pause : icons.play;
    els.btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  if (els.expandBtn) {
    els.expandBtn.innerHTML = playing ? icons.pause : icons.play;
    els.expandBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
}

// ── Progress ──────────────────────────────────────────────────────────────────
export function updateProgress(current, duration) {
  const els = _getProgressEls();
  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const pctStr = `${pct.toFixed(2)}%`;
  const currStr = formatTime(current);
  const durStr  = formatTime(duration);

  if (els.filled)  { els.filled.style.width = pctStr; }
  if (els.thumb)   { els.thumb.style.left   = pctStr; }
  if (els.curr)    { els.curr.textContent    = currStr; }
  if (els.dur)     { els.dur.textContent     = durStr; }
  if (els.bar)     { els.bar.setAttribute('aria-valuenow', Math.round(pct)); }

  if (els.expFill)  { els.expFill.style.width  = pctStr; }
  if (els.expThumb) { els.expThumb.style.left   = pctStr; }
  if (els.expCurr)  { els.expCurr.textContent   = currStr; }
  if (els.expDur)   { els.expDur.textContent    = durStr; }
  if (els.expBar)   { els.expBar.setAttribute('aria-valuenow', Math.round(pct)); }
}

// ── Volume slider fill ────────────────────────────────────────────────────────
export function updateVolumeSliderFill(vol) {
  const slider = document.getElementById('volume-slider');
  if (slider) slider.style.setProperty('--vol-fill', `${Math.round(vol * 100)}%`);
}

// ── Track card active state ───────────────────────────────────────────────────
export function updateTrackCardActive(listEl, activeId) {
  if (!listEl) return;
  listEl.querySelectorAll('.track-card').forEach(card => {
    const isActive = card.dataset.id === activeId;
    card.classList.toggle('active', isActive);
    const btn = card.querySelector('.track-play-btn');
    if (btn) {
      btn.innerHTML = isActive ? icons.pause : icons.play;
      btn.setAttribute('aria-label', `${isActive ? 'Pause' : 'Play'} — ${card.dataset.id}`);
    }
  });
}

// ── Mood pills ────────────────────────────────────────────────────────────────
export function renderMoodPills(container, moods, activeMood, onSelect) {
  container.innerHTML = '';
  moods.forEach(mood => {
    const btn = document.createElement('button');
    btn.className = `mood-pill${mood === activeMood ? ' active' : ''}`;
    btn.setAttribute('aria-pressed', mood === activeMood);
    btn.setAttribute('aria-label', `${mood === 'All' ? 'All moods' : mood} mood filter`);
    btn.innerHTML    = `<span class="mood-icon" aria-hidden="true">${CONFIG.MOOD_ICONS[mood] || '◉'}</span><span>${escHtml(mood)}</span>`;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.mood-pill').forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      onSelect(mood);
    });
    container.appendChild(btn);
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function showToast(msg, duration = 2400) {
  const existing = document.querySelector('.dhyaan-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className  = 'dhyaan-toast';
  toast.textContent = msg;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ── BUG-017 FIX: escHtml is now exported so app.js can import it directly,
// eliminating the duplicate private _escHtml function that existed in both
// modules. All internal usages in this file are updated to the public name.
export function escHtml(str = '') {
  return String(str)
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
  repeat:     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
  repeatOne:  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2v-5h-1l-2 1v1h1.5v3H13z"/></svg>`,
  back:       `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
};