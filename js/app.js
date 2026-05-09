// app.js — Main orchestrator
//
// FIXES & NEW FEATURES vs original:
//   ❌→✅  Audio plays correct track: stable ID lookup by t.id, not display index
//   ❌→✅  Visualizer connected to audio: connectAudio(getAudio()) after initPlayer
//   ❌→✅  Seek broken: getDuration() used (was parsing DOM text)
//   ❌→✅  Expand mode: smooth low→high image crossfade via two-layer system
//   ❌→✅  Expand mode: UI auto-hides on inactivity, returns on mouse move
//   🆕    AtmosphereEngine: color extraction → particle hue → glow overlay
//   🆕    setFogMode toggled with expand mode

import { CONFIG } from './config.js';
import { loadState, saveState, getState } from './storage.js';
import {
  initPlayer, loadTrack, togglePlay, nextTrack, prevTrack,
  seekBy, seekTo, setVolume, getVolume, isPlaying,
  getCurrentTrack, getCurrentIndex, getTracks, setTracks,
  getDuration, getAudio,
} from './player.js';
import { initExplorer, filterByMood, getRandomTrack } from './explorer.js';
import { searchTracks } from './search.js';
import {
  createPlaylist, renamePlaylist, deletePlaylist,
  addToPlaylist, getAllPlaylists, exportPlaylist,
} from './playlist.js';
import {
  initVisualizer, startVisualizer, stopVisualizer,
  setExpandMode, resize as resizeVisualizer,
  connectAudio, setParticleHue,
} from './visualizer.js';
import {
  initAtmosphere, extractColorFromImage, setFogMode, pulseGlow,
} from './atmosphere.js';
import {
  renderTrackCard, updateTrackCardActive, renderMoodPills,
  showToast, updateNowPlaying, updatePlayPauseBtn,
  updateProgress, formatTime, icons,
} from './ui.js';

// ─── App state ────────────────────────────────────────────────────────────────
let allTracks      = [];
let displayedTracks = [];
let currentMood    = 'All';
let isExpanded     = false;
let searchQuery    = '';
let isDragging     = false;

// Expand-mode inactivity timer
let _inactivityTimer = null;
const INACTIVITY_MS  = 3500;

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  const state = loadState();
  applyTheme(state.theme || 'zen-dark');

  // Canvas particle visualizer
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    initVisualizer(canvas);
    startVisualizer();
  }

  // AtmosphereEngine — overlay elements + particle hue bridge
  initAtmosphere({
    onHueChange: (h) => setParticleHue(h),
  });

  // Load track data
  try {
    const res = await fetch(CONFIG.DATA_URL);
    const raw = await res.json();
    // ── FIX: assign stable IDs (meditation.json has no id field)
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
    onTrackChange:  handleTrackChange,
    onProgress:     handleProgress,
    onStateChange:  handlePlayerState,
  });

  // ── FIX: connect audio element to Web Audio analyser NOW
  //    Must happen after initPlayer creates the Audio element.
  //    connectAudio is called again on first play gesture to resume AudioContext.
  connectAudio(getAudio());

  currentMood     = state.selectedMood || 'All';
  displayedTracks = filterByMood(currentMood);

  renderMoodPills(
    document.getElementById('mood-pills'),
    CONFIG.MOODS, currentMood, onMoodClick
  );
  renderTrackList(displayedTracks);

  // Restore last track display (no autoplay)
  if (state.lastTrackId) {
    const track = allTracks.find(t => t.id === state.lastTrackId);
    if (track) updateNowPlaying(track, false);
  }

  bindPlayerControls(state);
  bindSearchInput();
  bindExpandControls();
  bindThemeControls(state.theme || 'zen-dark');
  bindPlaylistUI();
  bindKeyboard();

  if (state.expandMode) activateExpand(false);

  // Low-power detection
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    saveState({ lowPowerMode: true });
  }
}

// ─── Track list ───────────────────────────────────────────────────────────────
function renderTrackList(tracks) {
  const container = document.getElementById('track-list');
  if (!container) return;
  container.innerHTML = '';

  if (!tracks.length) {
    container.innerHTML = `<div class="empty-state"><p>No tracks found for this mood</p></div>`;
    return;
  }

  const activeId = getCurrentTrack()?.id;
  const frag     = document.createDocumentFragment();

  tracks.forEach((track, i) => {
    const card = renderTrackCard(track, i, {
      active: track.id === activeId,
      onPlay: (t) => {
        // ── FIX: always look up by ID — display index ≠ global index after filtering
        const globalIdx = allTracks.findIndex(at => at.id === t.id);
        if (globalIdx !== -1) loadTrack(globalIdx, true);
      },
      onFavorite:      () => {},
      onAddToPlaylist: (t) => showAddToPlaylistModal(t),
    });
    frag.appendChild(card);
  });

  container.appendChild(frag);
}

// ─── Player callbacks ─────────────────────────────────────────────────────────
function handleTrackChange(track) {
  updateNowPlaying(track, true);
  updatePlayPauseBtn(true);

  const container = document.getElementById('track-list');
  if (container) updateTrackCardActive(container, track.id);

  const activeCard = container?.querySelector('.track-card.active');
  if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Color extraction — use the now-playing thumbnail once it loads
  const npImg = document.getElementById('np-image');
  if (npImg) {
    const tryExtract = () => {
      if (npImg.complete && npImg.naturalWidth > 0) {
        extractColorFromImage(npImg);
      } else {
        npImg.addEventListener('load', () => extractColorFromImage(npImg), { once: true });
      }
    };
    tryExtract();
  }
}

function handleProgress(current, duration) {
  if (!isDragging) updateProgress(current, duration);
}

function handlePlayerState(playerState) {
  if (playerState === 'play') {
    // Resume AudioContext (requires user gesture — play click qualifies)
    connectAudio(getAudio());
    updatePlayPauseBtn(true);
    startVisualizer();
  } else if (playerState === 'pause') {
    updatePlayPauseBtn(false);
    // Keep ambient particles running — don't stopVisualizer()
  } else if (playerState === 'buffering') {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.innerHTML = `<span class="spin">◌</span>`;
  }
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function bindPlayerControls(state) {
  document.getElementById('play-pause-btn')?.addEventListener('click', async () => {
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
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur  = getDuration();
      if (dur && isFinite(dur)) seekTo(pct * dur);
      isDragging = false;
    });
    progressBar.addEventListener('mouseup',    () => { isDragging = false; });
    progressBar.addEventListener('mouseleave', () => { isDragging = false; });
  }

  // Custom seek event from expand overlay
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
      const next  = modes[(modes.indexOf(repeatMode) + 1) % 3];
      saveState({ repeatMode: next });
      updateRepeatBtn(repeatBtn, next);
    });
  }

  // Random
  document.getElementById('random-btn')?.addEventListener('click', () => {
    const track = getRandomTrack(currentMood !== 'All' ? currentMood : null);
    if (!track) return;
    const idx = allTracks.findIndex(t => t.id === track.id);
    if (idx !== -1) loadTrack(idx, true);
    showToast(`🎲 ${track.title}`);
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
  btn.title    = labels[mode];
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
    debounce    = setTimeout(() => {
      const base      = filterByMood(currentMood);
      displayedTracks = searchQuery ? searchTracks(base, searchQuery) : base;
      renderTrackList(displayedTracks);
    }, 220);
  });

  document.getElementById('search-clear')?.addEventListener('click', () => {
    input.value     = '';
    searchQuery     = '';
    displayedTracks = filterByMood(currentMood);
    renderTrackList(displayedTracks);
  });
}

// ─── Mood ─────────────────────────────────────────────────────────────────────
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
  document.getElementById('expand-btn')?.addEventListener('click',    () => activateExpand(true));
  document.getElementById('collapse-btn')?.addEventListener('click',  () => deactivateExpand());

  // Sync expand overlay controls to main controls
  document.getElementById('expand-prev')?.addEventListener('click', () =>
    document.getElementById('prev-btn')?.click());
  document.getElementById('expand-next')?.addEventListener('click', () =>
    document.getElementById('next-btn')?.click());
  document.getElementById('expand-play-btn')?.addEventListener('click', async () => {
    await togglePlay();
    updatePlayPauseBtn(isPlaying());
  });

  // Expand progress bar click
  document.getElementById('expand-progress-bar')?.addEventListener('click', (e) => {
    const bar = document.getElementById('expand-progress-bar');
    const pct = (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth;
    document.dispatchEvent(new CustomEvent('dhyaan:seek', { detail: { pct } }));
  });

  // MutationObserver to sync progress bar & labels to expand overlay
  const progressFilled = document.getElementById('progress-filled');
  if (progressFilled) {
    const obs = new MutationObserver(() => {
      document.getElementById('expand-filled').style.width =
        progressFilled.style.width;
      const ct  = document.getElementById('current-time')?.textContent;
      const dur = document.getElementById('duration')?.textContent;
      const ttl = document.getElementById('np-title')?.textContent;
      const mds = document.getElementById('np-moods')?.textContent;
      if (ct)  document.getElementById('expand-current').textContent = ct;
      if (dur) document.getElementById('expand-duration').textContent = dur;
      if (ttl) document.getElementById('expand-title').textContent   = ttl;
      if (mds) document.getElementById('expand-moods').textContent   = mds;
    });
    obs.observe(progressFilled, { attributes: true, attributeFilter: ['style'] });
  }

  // Inactivity hide for expand UI
  const expandOverlay = document.getElementById('expand-overlay');
  if (expandOverlay) {
    expandOverlay.addEventListener('mousemove', _resetInactivity);
    expandOverlay.addEventListener('touchstart', _resetInactivity, { passive: true });
    expandOverlay.addEventListener('click', _resetInactivity);
  }
}

function _resetInactivity() {
  // Show UI
  document.getElementById('expand-overlay')?.classList.remove('ui-hidden');
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    if (isExpanded) {
      document.getElementById('expand-overlay')?.classList.add('ui-hidden');
    }
  }, INACTIVITY_MS);
}

function activateExpand(save = true) {
  isExpanded = true;
  document.body.classList.add('expand-mode');
  setExpandMode(true);
  setFogMode(true);
  resizeVisualizer();
  if (save) saveState({ expandMode: true });

  const track = getCurrentTrack();
  if (track) updateNowPlaying(track, isPlaying()); // triggers two-layer image load

  _resetInactivity(); // start inactivity timer
}

function deactivateExpand() {
  isExpanded = false;
  clearTimeout(_inactivityTimer);
  document.body.classList.remove('expand-mode');
  document.getElementById('expand-overlay')?.classList.remove('ui-hidden');
  setExpandMode(false);
  setFogMode(false);
  resizeVisualizer();
  saveState({ expandMode: false });
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
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') btn.click();
    });
  });
}

// ─── Playlist UI ──────────────────────────────────────────────────────────────
function bindPlaylistUI() {
  document.getElementById('new-playlist-btn')?.addEventListener('click', () => {
    const name = prompt('Playlist name:');
    if (!name?.trim()) return;
    createPlaylist(name.trim());
    renderPlaylistSidebar();
    showToast(`Playlist "${name}" created`);
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
        <button class="pl-export" title="Export playlist">⬇</button>
        <button class="pl-delete" title="Delete playlist">✕</button>
      </div>
    `;
    item.querySelector('.pl-export').addEventListener('click', () => {
      const json = exportPlaylist(pl.id, allTracks);
      if (!json) return;
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href      = url;
      a.download  = `${pl.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    item.querySelector('.pl-delete').addEventListener('click', () => {
      if (!confirm(`Delete "${pl.name}"?`)) return;
      deletePlaylist(pl.id);
      renderPlaylistSidebar();
      showToast('Playlist deleted');
    });
    container.appendChild(item);
  });
}

function showAddToPlaylistModal(track) {
  const playlists = getAllPlaylists();
  if (!playlists.length) {
    const name = prompt('No playlists yet. Create one:');
    if (!name?.trim()) return;
    const pl = createPlaylist(name.trim());
    addToPlaylist(pl.id, track.id);
    renderPlaylistSidebar();
    showToast(`Added to "${pl.name}"`);
    return;
  }
  const names  = playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const choice = prompt(`Add to playlist:\n${names}\n\nEnter number:`);
  const idx    = parseInt(choice) - 1;
  if (idx >= 0 && idx < playlists.length) {
    addToPlaylist(playlists[idx].id, track.id);
    renderPlaylistSidebar();
    showToast(`Added to "${playlists[idx].name}"`);
  }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.code) {
      case 'Space':      e.preventDefault(); togglePlay().then(() => updatePlayPauseBtn(isPlaying())); break;
      case 'ArrowRight': e.preventDefault(); seekBy(CONFIG.SEEK_SECONDS);  break;
      case 'ArrowLeft':  e.preventDefault(); seekBy(-CONFIG.SEEK_SECONDS); break;
      case 'ArrowUp':    e.preventDefault(); setVolume(Math.min(1, getVolume() + 0.05)); break;
      case 'ArrowDown':  e.preventDefault(); setVolume(Math.max(0, getVolume() - 0.05)); break;
      case 'KeyN':       nextTrack(); break;
      case 'KeyP':       prevTrack(); break;
      case 'Escape':     if (isExpanded) deactivateExpand(); break;
      case 'KeyE':       isExpanded ? deactivateExpand() : activateExpand(true); break;
    }
    if (isExpanded) _resetInactivity();
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
