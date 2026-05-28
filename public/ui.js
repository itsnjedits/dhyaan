// ui.js — UI rendering and DOM helpers
import { CONFIG } from './config.js';
import { isFavorite, toggleFavorite } from './storage.js';

export function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function renderTrackCard(track, index, opts = {}) {
  const { active = false, onPlay, onFavorite, onAddToPlaylist, onRemoveFromPlaylist } = opts;
  const fav = isFavorite(track.id);

  const isRemoveMode = typeof onRemoveFromPlaylist === 'function';
  const plBtnTitle = isRemoveMode ? 'Remove from playlist' : 'Add to playlist';
  const plBtnIcon = isRemoveMode ? icons.close : icons.plus;
  const plBtnExtraClass = isRemoveMode ? ' remove-pl-btn' : '';

  const card = document.createElement('div');
  card.className = `track-card${active ? ' active' : ''}`;
  card.dataset.id = track.id;
  card.dataset.index = index;

  card.innerHTML = `
    <div class="track-thumb">
      <img
        alt="${track.title}"
        class="track-img"
        draggable="false"
      />
      <div class="track-play-overlay">
        <button class="track-play-btn" aria-label="Play ${track.title}">
          ${active ? icons.pause : icons.play}
        </button>
      </div>
    </div>
    <div class="track-info">
      <div class="track-title">${track.title}</div>
      <div class="track-moods">${(track.moods || []).slice(0, 3).map(m =>
        `<span class="mood-tag">${m}</span>`
      ).join('')}</div>
    </div>
    <div class="track-actions">
      <button class="icon-btn fav-btn ${fav ? 'active' : ''}" title="Favorite" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">
        ${fav ? icons.heartFilled : icons.heart}
      </button>
      <button class="icon-btn add-pl-btn${plBtnExtraClass}" title="${plBtnTitle}" aria-label="${plBtnTitle}">
        ${plBtnIcon}
      </button>
    </div>
  `;

  // Lazy load image
  const img = card.querySelector('.track-img');
  const lowSrc = track.image_url?.low || null;
  const highSrc = track.image_url?.high || null;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        io.disconnect();
        if (!lowSrc) return;
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => img.removeAttribute('src');
        img.src = lowSrc;
      }
    }
  }, { rootMargin: '150px' });
  io.observe(img);

  // Hover: preload high-res
  if (highSrc) {
    img.addEventListener('mouseover', () => {
      if (img.dataset.hiLoaded) return;
      img.dataset.hiLoaded = '1';
      const hi = new Image();
      hi.onload = () => {
        if (img.classList.contains('loaded')) img.src = highSrc;
      };
      hi.src = highSrc;
    }, { once: true });
  }

  card.querySelector('.track-play-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay && onPlay(track, index);
  });

  card.addEventListener('click', () => onPlay && onPlay(track, index));

  card.querySelector('.fav-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const newFavs = toggleFavorite(track.id);
    const btn = card.querySelector('.fav-btn');
    const isFav = newFavs.includes(track.id);
    btn.innerHTML = isFav ? icons.heartFilled : icons.heart;
    btn.classList.toggle('active', isFav);
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
    onFavorite && onFavorite(track, isFav);
  });

  card.querySelector('.add-pl-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isRemoveMode) {
      onRemoveFromPlaylist(track);
    } else {
      onAddToPlaylist && onAddToPlaylist(track);
    }
  });

  return card;
}

export function updateTrackCardActive(listEl, activeId) {
  listEl.querySelectorAll('.track-card').forEach(card => {
    const isActive = card.dataset.id === activeId;
    card.classList.toggle('active', isActive);
    const btn = card.querySelector('.track-play-btn');
    if (btn) btn.innerHTML = isActive ? icons.pause : icons.play;
  });
}

export function renderMoodPills(containerEl, moods, activeMood, onClick) {
  containerEl.innerHTML = '';
  for (const mood of moods) {
    const btn = document.createElement('button');
    btn.className = `mood-pill${mood === activeMood ? ' active' : ''}`;
    btn.dataset.mood = mood;
    btn.innerHTML = `<span class="mood-icon">${CONFIG.MOOD_ICONS[mood] || '◉'}</span><span>${mood}</span>`;
    btn.addEventListener('click', () => onClick(mood));
    containerEl.appendChild(btn);
  }
}

export function showToast(message, duration = 2500) {
  const existing = document.querySelector('.dhyaan-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'dhyaan-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

export function updateNowPlaying(track, playing) {
  if (!track) return;
  const titleEl = document.getElementById('np-title');
  const moodsEl = document.getElementById('np-moods');
  const imgEl = document.getElementById('np-image');
  const expandImgEl = document.getElementById('expand-image');

  if (titleEl) titleEl.textContent = track.title;
  if (moodsEl) moodsEl.textContent = (track.moods || []).join(' · ') || '―';

  if (imgEl) {
    imgEl.classList.remove('loaded');
    imgEl.onload = () => imgEl.classList.add('loaded');
    imgEl.onerror = () => imgEl.removeAttribute('src');
    imgEl.src = track.image_url?.low || '';
  }
  if (expandImgEl) {
    expandImgEl.classList.remove('loaded');
    expandImgEl.onload = () => expandImgEl.classList.add('loaded');
    expandImgEl.onerror = () => expandImgEl.removeAttribute('src');
    expandImgEl.src = track.image_url?.high || track.image_url?.low || '';
  }

  document.title = `${track.title} — Dhyaan`;
}

export function updatePlayPauseBtn(playing) {
  const btn = document.getElementById('play-pause-btn');
  if (btn) btn.innerHTML = playing ? icons.pause : icons.play;

  const expandBtn = document.getElementById('expand-play-btn');
  if (expandBtn) expandBtn.innerHTML = playing ? icons.pause : icons.play;
}

export function updateProgress(current, duration) {
  const filled = document.getElementById('progress-filled');
  const currEl = document.getElementById('current-time');
  const durEl = document.getElementById('duration');
  if (filled && duration) filled.style.width = `${(current / duration) * 100}%`;
  if (currEl) currEl.textContent = formatTime(current);
  if (durEl) durEl.textContent = formatTime(duration);
}

export const icons = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
  repeatOne: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
  collapse: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`,
  random: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V18h2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L7 11v1c0 2.76 2.24 5 5 5v-1l3.78 3.78c-.97.36-2.02.54-3.1.54-.58 0-1.15-.06-1.68-.17V19.93z"/></svg>`,
  playlist: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zm0 5h12v2H3zm0 5h12v2H3zm15-1v6l5-3z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
};
