// app.js — Main orchestrator
// Improved: custom modals, expand-mode idle detection, artwork color extraction
import { CONFIG } from './config.js';
import { loadState, saveState, getState } from './storage.js';
import { initPlayer, loadTrack, togglePlay, nextTrack, prevTrack, seekBy, seekTo, setVolume, getVolume, isPlaying, getCurrentTrack, getCurrentIndex, getTracks, setTracks, getDuration } from './player.js';
import { initExplorer, filterByMood, getRandomTrack } from './explorer.js';
import { searchTracks } from './search.js';
import { createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, getAllPlaylists, exportPlaylist, importPlaylist } from './playlist.js';
import { initVisualizer, startVisualizer, stopVisualizer, setExpandMode, setParticleColor, resize as resizeVisualizer } from './visualizer.js';
import { renderTrackCard, updateTrackCardActive, renderMoodPills, showToast, updateNowPlaying, updatePlayPauseBtn, updateProgress, formatTime, icons } from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let allTracks = [];
let displayedTracks = [];
let currentMood = 'All';
let isExpanded = false;
let searchQuery = '';
let isDragging = false;

// Expand-mode idle detection
let _expandIdleTimer = null;
let _expandMoveHandler = null;

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  const state = loadState();
  applyTheme(state.theme || 'zen-dark');

  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    initVisualizer(canvas);
    startVisualizer();
  }

  try {
    const res = await fetch(CONFIG.DATA_URL);
    const raw = await res.json();
    allTracks = raw.map((t, i) => ({
      ...t,
      id: t.id != null ? String(t.id) : String(i),
    }));
  } catch (e) {
    showToast('Could not load tracks. Check your connection.');
    allTracks = [];
  }

  initExplorer(allTracks);
  setTracks(allTracks);

  initPlayer(allTracks, {
    onTrackChange: handleTrackChange,
    onProgress: handleProgress,
    onStateChange: handlePlayerState,
  });

  currentMood = state.selectedMood || 'All';
  displayedTracks = filterByMood(currentMood);

  renderMoodPills(document.getElementById('mood-pills'), CONFIG.MOODS, currentMood, onMoodClick);
  renderTrackList(displayedTracks);

  if (state.lastTrackId) {
    const track = allTracks.find(t => t.id === state.lastTrackId);
    if (track) {
      updateNowPlaying(track, false);
      extractAndApplyColor(track);
    }
  }

  bindPlayerControls(state);
  bindSearchInput();
  bindExpandControls();
  bindThemeControls(state.theme || 'zen-dark');
  bindPlaylistUI();
  bindKeyboard();
  injectModalDOM();

  if (state.expandMode) activateExpand(false);

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    saveState({ lowPowerMode: true });
  }
}

// ─── Color extraction from artwork ───────────────────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function extractAndApplyColor(track) {
  const src = track?.image_url?.low || track?.image_url?.high;
  if (!src) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 40;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0, 40, 40);
      const px = c.getImageData(0, 0, 40, 40).data;

      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 20) { // sample every 5th pixel
        // Skip very dark or very white pixels — they skew the color
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum < 20 || lum > 230) continue;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
      }
      if (!n) return;
      r = Math.floor(r / n); g = Math.floor(g / n); b = Math.floor(b / n);

      const [hue, sat, lit] = rgbToHsl(r, g, b);
      // Clamp saturation up so particles always feel vivid
      const clampedSat = Math.max(45, Math.min(90, sat));
      const clampedLit = Math.max(55, Math.min(80, lit + 15));
      setParticleColor(hue, clampedSat, clampedLit);
    } catch (e) {
      // CORS block — keep existing color
    }
  };
  img.src = src;
}

// ─── Track list rendering ─────────────────────────────────────────────────────
function renderTrackList(tracks) {
  const container = document.getElementById('track-list');
  if (!container) return;
  container.innerHTML = '';

  if (!tracks.length) {
    container.innerHTML = `<div class="empty-state"><p>No tracks found</p></div>`;
    return;
  }

  const currentTrack = getCurrentTrack();
  const activeId = currentTrack?.id;

  const frag = document.createDocumentFragment();
  tracks.forEach((track, i) => {
    const card = renderTrackCard(track, i, {
      active: track.id === activeId,
      onPlay: (t) => {
        const globalIdx = allTracks.findIndex(at => at.id === t.id);
        if (globalIdx !== -1) loadTrack(globalIdx, true);
      },
      onFavorite: () => {},
      onAddToPlaylist: (t) => showAddToPlaylistModal(t),
    });
    frag.appendChild(card);
  });
  container.appendChild(frag);
}

// ─── Player event handlers ────────────────────────────────────────────────────
function handleTrackChange(track) {
  updateNowPlaying(track, true);
  updatePlayPauseBtn(true);
  const container = document.getElementById('track-list');
  if (container) updateTrackCardActive(container, track.id);
  const activeCard = container?.querySelector('.track-card.active');
  if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Extract color from new track's artwork
  extractAndApplyColor(track);
}

function handleProgress(current, duration) {
  if (!isDragging) updateProgress(current, duration);
}

function handlePlayerState(state) {
  if (state === 'play') {
    updatePlayPauseBtn(true);
    startVisualizer();
  } else if (state === 'pause') {
    updatePlayPauseBtn(false);
  } else if (state === 'buffering') {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.innerHTML = `<span class="spin">◌</span>`;
  }
}

// ─── Controls binding ─────────────────────────────────────────────────────────
function bindPlayerControls(state) {
  document.getElementById('play-pause-btn')?.addEventListener('click', async () => {
    await togglePlay();
    updatePlayPauseBtn(isPlaying());
  });

  document.getElementById('expand-play-btn')?.addEventListener('click', async () => {
    await togglePlay();
    updatePlayPauseBtn(isPlaying());
  });

  document.getElementById('next-btn')?.addEventListener('click', () => nextTrack());
  document.getElementById('prev-btn')?.addEventListener('click', () => prevTrack());

  document.getElementById('seek-fwd')?.addEventListener('click', () => seekBy(CONFIG.SEEK_SECONDS));
  document.getElementById('seek-bwd')?.addEventListener('click', () => seekBy(-CONFIG.SEEK_SECONDS));

  // Volume
  const volSlider = document.getElementById('volume-slider');
  if (volSlider) {
    volSlider.value = (state.volume ?? 0.75) * 100;
    volSlider.addEventListener('input', (e) => setVolume(e.target.value / 100));
  }

  // Progress bar
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    progressBar.addEventListener('mousedown', () => { isDragging = true; });
    progressBar.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = getDuration();
      if (dur && isFinite(dur)) seekTo(pct * dur);
      isDragging = false;
    });
    progressBar.addEventListener('mouseup', () => { isDragging = false; });
    progressBar.addEventListener('mouseleave', () => { isDragging = false; });
  }

  document.addEventListener('dhyaan:seek', (e) => {
    const dur = getDuration();
    if (dur && isFinite(dur)) seekTo(e.detail.pct * dur);
  });

  // Shuffle
  const shuffleBtn = document.getElementById('shuffle-btn');
  if (shuffleBtn) {
    shuffleBtn.classList.toggle('active', state.shuffleMode);
    shuffleBtn.addEventListener('click', () => {
      const { shuffleMode } = getState();
      saveState({ shuffleMode: !shuffleMode });
      shuffleBtn.classList.toggle('active', !shuffleMode);
      showToast(!shuffleMode ? 'Shuffle on' : 'Shuffle off');
    });
  }

  // Repeat
  const repeatBtn = document.getElementById('repeat-btn');
  if (repeatBtn) {
    updateRepeatBtn(repeatBtn, state.repeatMode || 'none');
    repeatBtn.addEventListener('click', () => {
      const { repeatMode } = getState();
      const modes = ['none', 'all', 'one'];
      const next = modes[(modes.indexOf(repeatMode) + 1) % 3];
      saveState({ repeatMode: next });
      updateRepeatBtn(repeatBtn, next);
    });
  }

  // Random meditation
  document.getElementById('random-btn')?.addEventListener('click', () => {
    const track = getRandomTrack(currentMood !== 'All' ? currentMood : null);
    if (!track) return;
    const idx = allTracks.findIndex(t => t.id === track.id);
    if (idx !== -1) loadTrack(idx, true);
    showToast(`✦ ${track.title}`);
    setTimeout(() => {
      const container = document.getElementById('track-list');
      const card = container?.querySelector(`[data-id="${track.id}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('highlight');
      setTimeout(() => card?.classList.remove('highlight'), 2000);
    }, 100);
  });
}

function updateRepeatBtn(btn, mode) {
  const labels = { none: 'No repeat', all: 'Repeat all', one: 'Repeat one' };
  btn.title = labels[mode];
  btn.innerHTML = mode === 'one' ? icons.repeatOne : icons.repeat;
  btn.classList.toggle('active', mode !== 'none');
}

// ─── Search ───────────────────────────────────────────────────────────────────
function bindSearchInput() {
  const input = document.getElementById('search-input');
  if (!input) return;
  let debounce;
  input.addEventListener('input', (e) => {
    clearTimeout(debounce);
    searchQuery = e.target.value;
    debounce = setTimeout(() => {
      const base = filterByMood(currentMood);
      displayedTracks = searchQuery ? searchTracks(base, searchQuery) : base;
      renderTrackList(displayedTracks);
    }, 220);
  });

  document.getElementById('search-clear')?.addEventListener('click', () => {
    input.value = '';
    searchQuery = '';
    displayedTracks = filterByMood(currentMood);
    renderTrackList(displayedTracks);
  });
}

// ─── Mood explorer ────────────────────────────────────────────────────────────
function onMoodClick(mood) {
  currentMood = mood;
  saveState({ selectedMood: mood });
  renderMoodPills(document.getElementById('mood-pills'), CONFIG.MOODS, mood, onMoodClick);
  displayedTracks = filterByMood(mood);
  if (searchQuery) displayedTracks = searchTracks(displayedTracks, searchQuery);
  renderTrackList(displayedTracks);
}

// ─── Expand mode ──────────────────────────────────────────────────────────────
function bindExpandControls() {
  document.getElementById('expand-btn')?.addEventListener('click', () => activateExpand(true));
  document.getElementById('collapse-btn')?.addEventListener('click', () => deactivateExpand());
}

function activateExpand(save = true) {
  isExpanded = true;
  document.body.classList.add('expand-mode');
  setExpandMode(true);
  resizeVisualizer();
  if (save) saveState({ expandMode: true });

  const track = getCurrentTrack();
  if (track) {
    const expandImg = document.getElementById('expand-image');
    if (expandImg) {
      expandImg.classList.remove('loaded');
      expandImg.onload = () => expandImg.classList.add('loaded');
      expandImg.onerror = () => {};
      expandImg.src = track.image_url?.high || track.image_url?.low || '';
    }
  }

  // Start idle detection — show controls briefly then fade
  _setupExpandIdle();
}

function deactivateExpand() {
  isExpanded = false;
  document.body.classList.remove('expand-mode');
  document.body.classList.remove('controls-visible');
  setExpandMode(false);
  resizeVisualizer();
  saveState({ expandMode: false });
  _teardownExpandIdle();
}

// ── Idle detection for expand mode ──────────────────────────────────────────
function _setupExpandIdle() {
  _showExpandControls(); // flash visible on open

  _expandMoveHandler = _throttle(() => _showExpandControls(), 100);
  document.addEventListener('mousemove', _expandMoveHandler);
  document.addEventListener('touchstart', _expandMoveHandler, { passive: true });
  document.addEventListener('keydown', _expandMoveHandler);
}

function _teardownExpandIdle() {
  clearTimeout(_expandIdleTimer);
  if (_expandMoveHandler) {
    document.removeEventListener('mousemove', _expandMoveHandler);
    document.removeEventListener('touchstart', _expandMoveHandler);
    document.removeEventListener('keydown', _expandMoveHandler);
    _expandMoveHandler = null;
  }
}

function _showExpandControls() {
  document.body.classList.add('controls-visible');
  clearTimeout(_expandIdleTimer);
  _expandIdleTimer = setTimeout(() => {
    document.body.classList.remove('controls-visible');
  }, 3200);
}

function _throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
}

function bindThemeControls(currentTheme) {
  const btns = document.querySelectorAll('[data-theme-btn]');
  btns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeBtn === currentTheme);
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeBtn);
      saveState({ theme: btn.dataset.themeBtn });
      btns.forEach(b => b.classList.toggle('active', b === btn));
      showToast(`Theme: ${btn.title}`);
    });
  });
}

// ─── Modal system (replaces all prompt() / confirm() calls) ──────────────────
function injectModalDOM() {
  if (document.getElementById('dhyaan-modal-root')) return;
  const root = document.createElement('div');
  root.id = 'dhyaan-modal-root';
  root.innerHTML = `
    <div id="dhyaan-modal-backdrop">
      <div id="dhyaan-modal-box" role="dialog" aria-modal="true">
        <div id="dhyaan-modal-title"></div>
        <div id="dhyaan-modal-body"></div>
        <div id="dhyaan-modal-footer"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
}

function openModal({ title = '', body = '', footer = '' } = {}) {
  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  document.getElementById('dhyaan-modal-title').innerHTML = title;
  document.getElementById('dhyaan-modal-body').innerHTML = body;
  document.getElementById('dhyaan-modal-footer').innerHTML = footer;
  backdrop.classList.add('open');

  // Close on backdrop click
  const close = (e) => {
    if (e.target === backdrop) closeModal();
  };
  backdrop._closeHandler = close;
  backdrop.addEventListener('click', close);
}

function closeModal() {
  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  backdrop.classList.remove('open');
  if (backdrop._closeHandler) {
    backdrop.removeEventListener('click', backdrop._closeHandler);
    backdrop._closeHandler = null;
  }
}

/** Prompt-style modal — returns Promise<string|null> */
function showInputModal({ title, placeholder = '', confirmLabel = 'Create' } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: `<span>${title}</span>`,
      body: `<input id="dhyaan-modal-input" type="text" placeholder="${placeholder}" autocomplete="off" />`,
      footer: `
        <button id="dhyaan-modal-cancel" class="modal-btn-ghost">Cancel</button>
        <button id="dhyaan-modal-confirm" class="modal-btn-accent">${confirmLabel}</button>
      `,
    });

    const input = document.getElementById('dhyaan-modal-input');
    input.focus();

    const confirm = () => { closeModal(); resolve(input.value.trim() || null); };
    const cancel  = () => { closeModal(); resolve(null); };

    document.getElementById('dhyaan-modal-confirm').addEventListener('click', confirm);
    document.getElementById('dhyaan-modal-cancel').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') cancel();
    });
  });
}

/** Playlist-picker modal — returns Promise<string|null> (playlist id) */
function showPickModal({ title, items /* [{id, label, sub}] */ } = {}) {
  return new Promise((resolve) => {
    const itemsHTML = items.length
      ? items.map(it => `
          <button class="modal-pick-item" data-id="${it.id}">
            <span class="modal-pick-name">${it.label}</span>
            <span class="modal-pick-sub">${it.sub || ''}</span>
          </button>`).join('')
      : `<p class="modal-empty-note">No playlists yet. Create one first.</p>`;

    openModal({
      title: `<span>${title}</span>`,
      body: `<div class="modal-pick-list">${itemsHTML}</div>`,
      footer: `<button id="dhyaan-modal-cancel" class="modal-btn-ghost">Cancel</button>`,
    });

    document.querySelectorAll('.modal-pick-item').forEach(btn => {
      btn.addEventListener('click', () => { closeModal(); resolve(btn.dataset.id); });
    });
    document.getElementById('dhyaan-modal-cancel')?.addEventListener('click', () => {
      closeModal(); resolve(null);
    });
  });
}

/** Confirm modal — returns Promise<boolean> */
function showConfirmModal({ title, message, confirmLabel = 'Delete', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: `<span>${title}</span>`,
      body: `<p class="modal-confirm-msg">${message}</p>`,
      footer: `
        <button id="dhyaan-modal-cancel" class="modal-btn-ghost">Cancel</button>
        <button id="dhyaan-modal-confirm" class="${danger ? 'modal-btn-danger' : 'modal-btn-accent'}">${confirmLabel}</button>
      `,
    });
    document.getElementById('dhyaan-modal-confirm').addEventListener('click', () => { closeModal(); resolve(true); });
    document.getElementById('dhyaan-modal-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
  });
}

// ─── Playlist UI ──────────────────────────────────────────────────────────────
function bindPlaylistUI() {
  document.getElementById('new-playlist-btn')?.addEventListener('click', async () => {
    const name = await showInputModal({
      title: 'New Playlist',
      placeholder: 'Enter playlist name…',
      confirmLabel: 'Create',
    });
    if (!name) return;
    createPlaylist(name);
    renderPlaylistSidebar();
    showToast(`✦ Playlist "${name}" created`);
  });

  renderPlaylistSidebar();
}

function renderPlaylistSidebar() {
  const container = document.getElementById('playlists-container');
  if (!container) return;
  const playlists = getAllPlaylists();
  container.innerHTML = '';

  if (!playlists.length) {
    container.innerHTML = `<div class="empty-pl">No playlists yet</div>`;
    return;
  }

  playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'pl-item';
    item.innerHTML = `
      <span class="pl-name">${pl.name}</span>
      <span class="pl-count">${pl.trackIds.length} tracks</span>
      <div class="pl-actions">
        <button class="pl-export" title="Export">⬇</button>
        <button class="pl-delete" title="Delete">✕</button>
      </div>
    `;

    item.querySelector('.pl-export').addEventListener('click', () => {
      const json = exportPlaylist(pl.id, allTracks);
      if (json) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pl.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported "${pl.name}"`);
      }
    });

    item.querySelector('.pl-delete').addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'Delete Playlist',
        message: `Delete "${pl.name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) {
        deletePlaylist(pl.id);
        renderPlaylistSidebar();
        showToast('Playlist deleted');
      }
    });

    container.appendChild(item);
  });
}

async function showAddToPlaylistModal(track) {
  const playlists = getAllPlaylists();

  if (!playlists.length) {
    // No playlists — offer to create one inline
    const name = await showInputModal({
      title: 'Create a Playlist',
      placeholder: 'Playlist name…',
      confirmLabel: 'Create & Add',
    });
    if (!name) return;
    const pl = createPlaylist(name);
    addToPlaylist(pl.id, track.id);
    renderPlaylistSidebar();
    showToast(`Added to "${pl.name}"`);
    return;
  }

  const picked = await showPickModal({
    title: 'Add to Playlist',
    items: playlists.map(p => ({
      id: p.id,
      label: p.name,
      sub: `${p.trackIds.length} tracks`,
    })),
  });

  if (!picked) return;
  const pl = playlists.find(p => p.id === picked);
  if (!pl) return;

  // Prevent duplicate (addToPlaylist already guards, but show feedback either way)
  const wasAlready = pl.trackIds.includes(track.id);
  addToPlaylist(pl.id, track.id);
  renderPlaylistSidebar();
  showToast(wasAlready ? `Already in "${pl.name}"` : `Added to "${pl.name}"`);
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    // Modal open — only Escape
    if (document.getElementById('dhyaan-modal-backdrop')?.classList.contains('open')) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlay().then(() => updatePlayPauseBtn(isPlaying())); break;
      case 'ArrowRight': e.preventDefault(); seekBy(CONFIG.SEEK_SECONDS); break;
      case 'ArrowLeft': e.preventDefault(); seekBy(-CONFIG.SEEK_SECONDS); break;
      case 'ArrowUp': e.preventDefault(); setVolume(Math.min(1, getVolume() + 0.05)); break;
      case 'ArrowDown': e.preventDefault(); setVolume(Math.max(0, getVolume() - 0.05)); break;
      case 'KeyN': nextTrack(); break;
      case 'KeyP': prevTrack(); break;
      case 'Escape': if (isExpanded) deactivateExpand(); break;
      case 'KeyE': isExpanded ? deactivateExpand() : activateExpand(true); break;
    }
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
