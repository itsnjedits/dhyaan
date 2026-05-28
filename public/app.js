// app.js — Main orchestrator
// All 15 improvement areas implemented
import { CONFIG } from './config.js';
import { loadState, saveState, getState, loadAnalytics } from './storage.js';
import {
  initPlayer, loadTrack, setQueue, setAllTracksQueue,
  togglePlay, nextTrack, prevTrack, seekBy, seekTo,
  setVolume, getVolume, isPlaying,
  getCurrentTrack, getDuration, getTracks, setTracks,
} from './player.js';
import { initExplorer, filterByMood, getRandomTrack } from './explorer.js';
import { searchTracks } from './search.js';
import { createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, getAllPlaylists } from './playlist.js';
import { initVisualizer, startVisualizer, stopVisualizer, setExpandMode, setParticleColor, resize as resizeVisualizer } from './visualizer.js';
import { renderTrackCard, updateTrackCardActive, renderMoodPills, showToast, updateNowPlaying, updatePlayPauseBtn, updateProgress, formatTime, icons } from './ui.js';
import { getRecommendations, getRecommendationLabel, getContinueJourneyTracks } from './recommendations.js';

// ─── App state ────────────────────────────────────────────────────────────────
let allTracks = [];
let displayedTracks = [];
let currentMood = 'All';
let isExpanded = false;
let searchQuery = '';
let isDragging = false;

// Playlist queue context
let activePlaylistId = null;   // null = browsing all tracks

// Expand-mode idle detection
let _expandIdleTimer = null;
let _expandMoveHandler = null;

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  const state = loadState();
  loadAnalytics();
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

  // Restore active playlist context from last session
  if (state.activePlaylistId) {
    const playlists = getAllPlaylists();
    const pl = playlists.find(p => p.id === state.activePlaylistId);
    if (pl) {
      activePlaylistId = pl.id;
      const plTracks = pl.trackIds.map(id => allTracks.find(t => t.id === id)).filter(Boolean);
      if (plTracks.length > 0) {
        setQueue(plTracks, 0, false);
      }
    }
  }

  currentMood = state.selectedMood || 'All';
  displayedTracks = filterByMood(currentMood);

  renderMoodPills(document.getElementById('mood-pills'), CONFIG.MOODS, currentMood, onMoodClick);

  if (activePlaylistId) {
    loadPlaylistView(activePlaylistId, false);
  } else {
    renderTrackList(displayedTracks);
  }

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
  bindLogoClick();
  injectModalDOM();

  if (state.expandMode) activateExpand(false);

  // Apply content protection
  applyContentProtection();

  // Apply volume slider visual fill on load
  updateVolumeSliderFill((state.volume ?? 0.75) * 100);

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    saveState({ lowPowerMode: true });
  }
}

// ─── Content protection (Task 7) ─────────────────────────────────────────────
function applyContentProtection() {
  // Disable context menu on track images and artwork
  document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });
  // Prevent drag on images
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });
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
      for (let i = 0; i < px.length; i += 20) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum < 20 || lum > 230) continue;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
      }
      if (!n) return;
      r = Math.floor(r / n); g = Math.floor(g / n); b = Math.floor(b / n);
      const [hue, sat, lit] = rgbToHsl(r, g, b);
      setParticleColor(hue, Math.max(45, Math.min(90, sat)), Math.max(55, Math.min(80, lit + 15)));
    } catch (e) { /* CORS block */ }
  };
  img.src = src;
}

// ─── Track list rendering ─────────────────────────────────────────────────────
function renderTrackList(tracks) {
  const container = document.getElementById('track-list');
  if (!container) return;

  if (activePlaylistId) {
    activePlaylistId = null;
    saveState({ activePlaylistId: null });
    document.querySelectorAll('.pl-item').forEach(el => el.classList.remove('active'));
    document.getElementById('playlist-view-header')?.remove();
    setAllTracksQueue();
  }

  container.innerHTML = '';
  if (!tracks.length) {
    container.innerHTML = `<div class="empty-state"><p>No tracks found</p></div>`;
    return;
  }

  const activeId = getCurrentTrack()?.id;
  const frag = document.createDocumentFragment();
  tracks.forEach((track, i) => {
    const card = renderTrackCard(track, i, {
      active: track.id === activeId,
      onPlay: (t) => {
        const idx = allTracks.findIndex(at => at.id === t.id);
        if (idx !== -1) loadTrack(idx, true);
      },
      onFavorite: () => {},
      onAddToPlaylist: (t) => showAddToPlaylistModal(t),
    });
    frag.appendChild(card);
  });
  container.appendChild(frag);
}

// ─── Playlist view rendering ──────────────────────────────────────────────────
function loadPlaylistView(playlistId, setPlayerQueue = true) {
  const playlists = getAllPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;

  activePlaylistId = playlistId;
  saveState({ activePlaylistId: playlistId });

  document.querySelectorAll('.pl-item').forEach(el => {
    el.classList.toggle('active', el.dataset.plId === playlistId);
  });

  const playlistTracks = pl.trackIds
    .map(id => allTracks.find(t => t.id === id))
    .filter(Boolean);

  // Set the player queue to this playlist (no autoplay)
  if (setPlayerQueue && playlistTracks.length > 0) {
    setQueue(playlistTracks, 0, false);
  }

  renderPlaylistHeader(pl.name, playlistTracks.length);
  renderPlaylistTracks(playlistTracks, playlistId);
}

function renderPlaylistHeader(name, count) {
  document.getElementById('playlist-view-header')?.remove();

  const header = document.createElement('div');
  header.id = 'playlist-view-header';
  header.className = 'playlist-view-header';
  header.innerHTML = `
    <button class="pl-back-btn" title="Back to all tracks" aria-label="Back to all tracks">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
      </svg>
    </button>
    <div class="pl-header-info">
      <span class="pl-header-name">${name}</span>
      <span class="pl-header-count">${count} track${count !== 1 ? 's' : ''}</span>
    </div>
  `;

  header.querySelector('.pl-back-btn').addEventListener('click', exitPlaylistView);

  const main = document.getElementById('main');
  const trackList = document.getElementById('track-list');
  if (main && trackList) main.insertBefore(header, trackList);
}

function renderPlaylistTracks(tracks, playlistId) {
  const container = document.getElementById('track-list');
  if (!container) return;

  container.innerHTML = '';

  if (!tracks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>This playlist is empty.</p>
        <p style="font-size:0.85rem;margin-top:8px;opacity:0.6">Use + on any track to add it here.</p>
      </div>`;
    return;
  }

  const activeId = getCurrentTrack()?.id;
  const frag = document.createDocumentFragment();
  tracks.forEach((track, i) => {
    const card = renderTrackCard(track, i, {
      active: track.id === activeId,
      onPlay: (t) => {
        // Play within playlist queue context
        const plIdx = tracks.findIndex(pt => pt.id === t.id);
        if (plIdx !== -1) {
          setQueue(tracks, plIdx, true);
        }
      },
      onFavorite: () => {},
      onAddToPlaylist: null,
      onRemoveFromPlaylist: (t) => {
        removeFromPlaylist(playlistId, t.id);
        const updated = getAllPlaylists().find(p => p.id === playlistId);
        if (!updated) { exitPlaylistView(); return; }
        const updatedTracks = updated.trackIds
          .map(id => allTracks.find(tr => tr.id === id))
          .filter(Boolean);
        renderPlaylistHeader(updated.name, updatedTracks.length);
        renderPlaylistTracks(updatedTracks, playlistId);
        renderPlaylistSidebar();
        showToast('Removed from playlist');
      },
    });
    frag.appendChild(card);
  });
  container.appendChild(frag);
}

function exitPlaylistView() {
  activePlaylistId = null;
  saveState({ activePlaylistId: null });
  setAllTracksQueue();

  document.querySelectorAll('.pl-item').forEach(el => el.classList.remove('active'));
  document.getElementById('playlist-view-header')?.remove();

  displayedTracks = filterByMood(currentMood);
  if (searchQuery) displayedTracks = searchTracks(displayedTracks, searchQuery);

  const container = document.getElementById('track-list');
  if (!container) return;
  container.innerHTML = '';
  if (!displayedTracks.length) {
    container.innerHTML = `<div class="empty-state"><p>No tracks found</p></div>`;
    return;
  }

  const activeId = getCurrentTrack()?.id;
  const frag = document.createDocumentFragment();
  displayedTracks.forEach((track, i) => {
    const card = renderTrackCard(track, i, {
      active: track.id === activeId,
      onPlay: (t) => {
        const idx = allTracks.findIndex(at => at.id === t.id);
        if (idx !== -1) loadTrack(idx, true);
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
  extractAndApplyColor(track);
  // Update expand recommendations
  updateExpandRecommendations();
}

function handleProgress(current, duration) {
  if (!isDragging) updateProgress(current, duration);
}

// Single source of truth for play/pause state (Task 4)
function handlePlayerState(state) {
  if (state === 'play') {
    updatePlayPauseBtn(true);
    // Remove any spinner
    _clearSpinner();
    startVisualizer();
  } else if (state === 'pause') {
    updatePlayPauseBtn(false);
    _clearSpinner();
  } else if (state === 'buffering') {
    // Only show spinner if not already playing (avoid flash during normal seek)
    _showSpinner();
  } else if (state === 'ready') {
    // canplay — if audio is actually playing, update UI accordingly
    updatePlayPauseBtn(isPlaying());
    _clearSpinner();
  } else if (state === 'error') {
    updatePlayPauseBtn(false);
    _clearSpinner();
  }
}

let _spinnerActive = false;
let _spinnerTimer = null;

function _showSpinner() {
  // Delay spinner slightly — don't flash on fast loads
  clearTimeout(_spinnerTimer);
  _spinnerTimer = setTimeout(() => {
    if (!isPlaying()) {
      _spinnerActive = true;
      const btn = document.getElementById('play-pause-btn');
      if (btn) btn.innerHTML = `<span class="spin">◌</span>`;
    }
  }, 350);
}

function _clearSpinner() {
  clearTimeout(_spinnerTimer);
  if (_spinnerActive) {
    _spinnerActive = false;
    updatePlayPauseBtn(isPlaying());
  }
}

// ─── Expand mode recommendations (Task 12) ───────────────────────────────────
function updateExpandRecommendations() {
  if (!isExpanded) return;
  const panel = document.getElementById('expand-reco-panel');
  if (!panel) return;

  const track = getCurrentTrack();
  const recos = getRecommendations(allTracks, track?.id, 4);
  const label = getRecommendationLabel();
  const continueJourney = getContinueJourneyTracks(allTracks, 2);

  let html = `<div class="expand-reco-label">${label}</div>`;
  html += `<div class="expand-reco-list">`;
  for (const t of recos) {
    html += `
      <button class="expand-reco-item" data-id="${t.id}" title="${t.title}">
        <div class="expand-reco-thumb" style="background-image:url('${t.image_url?.low || ''}')"></div>
        <div class="expand-reco-name">${t.title}</div>
      </button>`;
  }
  html += `</div>`;

  if (continueJourney.length > 0) {
    html += `<div class="expand-reco-label" style="margin-top:14px">Continue Journey</div>`;
    html += `<div class="expand-reco-list">`;
    for (const t of continueJourney) {
      html += `
        <button class="expand-reco-item" data-id="${t.id}" title="${t.title}">
          <div class="expand-reco-thumb" style="background-image:url('${t.image_url?.low || ''}')"></div>
          <div class="expand-reco-name">${t.title}</div>
        </button>`;
    }
    html += `</div>`;
  }

  panel.innerHTML = html;

  panel.querySelectorAll('.expand-reco-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = allTracks.find(t => t.id === btn.dataset.id);
      if (!t) return;
      const idx = allTracks.indexOf(t);
      loadTrack(idx, true);
    });
  });
}

// ─── Volume slider fill (Task 8) ─────────────────────────────────────────────
function updateVolumeSliderFill(value) {
  const slider = document.getElementById('volume-slider');
  if (!slider) return;
  const pct = Math.max(0, Math.min(100, value));
  slider.style.setProperty('--vol-fill', `${pct}%`);
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
    const initVol = (state.volume ?? 0.75) * 100;
    volSlider.value = initVol;
    updateVolumeSliderFill(initVol);
    volSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      setVolume(val / 100);
      updateVolumeSliderFill(val);
    });
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
    if (activePlaylistId) exitPlaylistView();
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

  // Inject recommendations panel if not present
  _ensureExpandRecoPanel();
  updateExpandRecommendations();
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

function _ensureExpandRecoPanel() {
  if (document.getElementById('expand-reco-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'expand-reco-panel';
  panel.className = 'expand-reco-panel';
  const ui = document.querySelector('.expand-ui');
  if (ui) ui.appendChild(panel);
}

function _setupExpandIdle() {
  _showExpandControls();
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

// ─── Logo click → About modal (Task 5) ───────────────────────────────────────
function bindLogoClick() {
  const logo = document.querySelector('.logo');
  if (!logo) return;
  logo.style.cursor = 'pointer';
  logo.addEventListener('click', () => showAboutModal());
}

function showAboutModal() {
  openModal({
    title: `<span class="about-modal-title">☸ Dhyaan</span>`,
    body: `
      <div class="about-modal-wrap">
        <canvas class="about-particle-canvas" id="about-particle-canvas" aria-hidden="true"></canvas>
        <p class="about-tagline">a living space of stillness</p>
        <div class="about-divider">◈</div>
        <p class="about-text">
          There is a silence beneath all silence. Dhyaan is a doorway into that.
          Not into emptiness — but into the fullness that was always there,
          beneath the noise, beneath the names, beneath the restless wanting to be somewhere else.
        </p>
        <p class="about-text">
          Every sound here is an invitation. To slow down. To arrive.
          To rest in the awareness that <em>you are already here</em> —
          whole, unhurried, quietly luminous.
        </p>
        <p class="about-text">
          Dhyaan — <em>ध्यान</em> — is the Sanskrit word for deep meditation.
          The seventh limb of yoga. The unbroken gaze of awareness
          turned gently inward, like candlelight finding its own source.
        </p>
        <p class="about-text">
          Let the sound dissolve thought. Let silence hold what words cannot.
          Let whatever is heavy in you rise — and release — like smoke into open sky.
        </p>
        <div class="about-divider">◎</div>
        <p class="about-footer-text">crafted with presence · for the seeker in all of us</p>
      </div>
    `,
    footer: `<button id="dhyaan-modal-cancel" class="modal-btn-ghost">Close</button>`,
    extraClass: 'about-modal',
  });

  document.getElementById('dhyaan-modal-cancel')?.addEventListener('click', closeModal);

  // ── Ascending spiritual particles ─────────────────────────────────────────
  requestAnimationFrame(() => {
    const canvas = document.getElementById('about-particle-canvas');
    if (!canvas) return;

    // Size canvas to its container
    const wrap = canvas.parentElement;
    canvas.width  = wrap.offsetWidth  || 400;
    canvas.height = wrap.offsetHeight || 320;

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Read accent color from CSS variable
    const accent = getComputedStyle(document.body).getPropertyValue('--particle-color').trim() || '140, 70%, 70%';
    const [hue, sat, lit] = accent.split(',').map(s => parseFloat(s));

    // Generate ascending particles
    const PARTICLE_COUNT = window.innerWidth < 480 ? 28 : 48;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => createAboutParticle(W, H));

    function createAboutParticle(w, h, fromBottom = false) {
      return {
        x: Math.random() * w,
        y: fromBottom ? h + Math.random() * 30 : Math.random() * h,
        r: Math.random() * 2.2 + 0.4,
        alpha: 0,
        targetAlpha: Math.random() * 0.55 + 0.08,
        vy: -(Math.random() * 0.45 + 0.12),  // always upward
        vx: (Math.random() - 0.5) * 0.22,
        wobble: Math.random() * Math.PI * 2,
        wobbleAmp: Math.random() * 0.35 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.015 + Math.random() * 0.01,
        life: Math.floor(Math.random() * 180),
        maxLife: Math.random() * 220 + 140,
        hueOffset: (Math.random() - 0.5) * 45,
      };
    }

    let raf;
    let alive = true;

    function drawFrame() {
      if (!alive) return;
      raf = requestAnimationFrame(drawFrame);

      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.life++;
        p.pulse += p.pulseSpeed;
        p.wobble += 0.012;
        p.x += p.vx + Math.sin(p.wobble) * p.wobbleAmp;
        p.y += p.vy;

        // Fade envelope
        const t = p.life / p.maxLife;
        p.alpha = Math.sin(t * Math.PI) * p.targetAlpha;

        if (p.life >= p.maxLife || p.y < -20) {
          Object.assign(p, createAboutParticle(W, H, true));
        }

        if (p.alpha <= 0.005) continue;

        const h2 = ((hue + p.hueOffset + 360) % 360);
        const pulseR = p.r + Math.sin(p.pulse) * p.r * 0.3;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor  = `hsla(${h2}, ${sat}%, ${lit}%, 0.9)`;
        ctx.shadowBlur   = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h2}, ${sat}%, ${Math.min(95, lit + 8)}%, 1)`;
        ctx.fill();
        ctx.restore();
      }
    }

    drawFrame();

    // Stop when modal closes
    const backdrop = document.getElementById('dhyaan-modal-backdrop');
    const observer = new MutationObserver(() => {
      if (!backdrop.classList.contains('open')) {
        alive = false;
        cancelAnimationFrame(raf);
        observer.disconnect();
      }
    });
    observer.observe(backdrop, { attributes: true, attributeFilter: ['class'] });
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
    item.className = `pl-item${activePlaylistId === pl.id ? ' active' : ''}`;
    item.dataset.plId = pl.id;
    item.innerHTML = `
      <span class="pl-name">${pl.name}</span>
      <span class="pl-count">${pl.trackIds.length}</span>
      <div class="pl-actions">
        <button class="pl-rename" title="Rename" aria-label="Rename playlist">✎</button>
        <button class="pl-delete" title="Delete" aria-label="Delete playlist">✕</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.pl-actions')) return;
      loadPlaylistView(pl.id);
    });

    item.querySelector('.pl-rename').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newName = await showInputModal({
        title: 'Rename Playlist',
        placeholder: 'New name…',
        confirmLabel: 'Rename',
        prefill: pl.name,
      });
      if (!newName || newName === pl.name) return;
      renamePlaylist(pl.id, newName);
      renderPlaylistSidebar();
      if (activePlaylistId === pl.id) {
        const updatedPl = getAllPlaylists().find(p => p.id === pl.id);
        if (updatedPl) renderPlaylistHeader(updatedPl.name, updatedPl.trackIds.length);
      }
      showToast(`Renamed to "${newName}"`);
    });

    item.querySelector('.pl-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirmModal({
        title: 'Delete Playlist',
        message: `Delete "${pl.name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) {
        deletePlaylist(pl.id);
        if (activePlaylistId === pl.id) exitPlaylistView();
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

  const wasAlready = pl.trackIds.includes(track.id);
  addToPlaylist(pl.id, track.id);
  renderPlaylistSidebar();
  if (activePlaylistId === picked) loadPlaylistView(picked, false);
  showToast(wasAlready ? `Already in "${pl.name}"` : `Added to "${pl.name}"`);
}

// ─── Keyboard shortcuts (hidden from UI per Task 9) ──────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (document.getElementById('dhyaan-modal-backdrop')?.classList.contains('open')) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlay().then(() => updatePlayPauseBtn(isPlaying())); break;
      case 'ArrowRight': e.preventDefault(); seekBy(CONFIG.SEEK_SECONDS); break;
      case 'ArrowLeft': e.preventDefault(); seekBy(-CONFIG.SEEK_SECONDS); break;
      case 'ArrowUp': e.preventDefault(); {
        const newVol = Math.min(1, getVolume() + 0.05);
        setVolume(newVol);
        updateVolumeSliderFill(newVol * 100);
        const s = document.getElementById('volume-slider');
        if (s) s.value = newVol * 100;
        break;
      }
      case 'ArrowDown': e.preventDefault(); {
        const newVol = Math.max(0, getVolume() - 0.05);
        setVolume(newVol);
        updateVolumeSliderFill(newVol * 100);
        const s = document.getElementById('volume-slider');
        if (s) s.value = newVol * 100;
        break;
      }
      case 'KeyN': nextTrack(); break;
      case 'KeyP': prevTrack(); break;
      case 'Escape':
        if (isExpanded) deactivateExpand();
        else if (activePlaylistId) exitPlaylistView();
        break;
      case 'KeyE': isExpanded ? deactivateExpand() : activateExpand(true); break;
    }
  });
}

// ─── Modal system ─────────────────────────────────────────────────────────────
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

function openModal({ title = '', body = '', footer = '', extraClass = '' } = {}) {
  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  const box = document.getElementById('dhyaan-modal-box');
  document.getElementById('dhyaan-modal-title').innerHTML = title;
  document.getElementById('dhyaan-modal-body').innerHTML = body;
  document.getElementById('dhyaan-modal-footer').innerHTML = footer;
  box.className = extraClass ? `dhyaan-modal-box-extra ${extraClass}` : '';
  backdrop.classList.add('open');

  const close = (e) => { if (e.target === backdrop) closeModal(); };
  backdrop._closeHandler = close;
  backdrop.addEventListener('click', close);
}

function closeModal() {
  const backdrop = document.getElementById('dhyaan-modal-backdrop');
  backdrop.classList.remove('open');
  const box = document.getElementById('dhyaan-modal-box');
  if (box) box.className = '';
  if (backdrop._closeHandler) {
    backdrop.removeEventListener('click', backdrop._closeHandler);
    backdrop._closeHandler = null;
  }
}

function showInputModal({ title, placeholder = '', confirmLabel = 'Create', prefill = '' } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: `<span>${title}</span>`,
      body: `<input id="dhyaan-modal-input" type="text" placeholder="${placeholder}" autocomplete="off" value="${prefill}" />`,
      footer: `
        <button id="dhyaan-modal-cancel" class="modal-btn-ghost">Cancel</button>
        <button id="dhyaan-modal-confirm" class="modal-btn-accent">${confirmLabel}</button>
      `,
    });

    const input = document.getElementById('dhyaan-modal-input');
    input.focus();
    if (prefill) input.selectionStart = input.selectionEnd = prefill.length;

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

function showPickModal({ title, items } = {}) {
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
