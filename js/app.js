// app.js — Main orchestrator
import { CONFIG } from './config.js';
import { loadState, saveState, getState } from './storage.js';
import { initPlayer, loadTrack, togglePlay, nextTrack, prevTrack, seekBy, seekTo, setVolume, getVolume, isPlaying, getCurrentTrack, getCurrentIndex, getTracks, setTracks, getDuration } from './player.js';
import { initExplorer, filterByMood, getRandomTrack } from './explorer.js';
import { searchTracks } from './search.js';
import { createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, getAllPlaylists, exportPlaylist, importPlaylist } from './playlist.js';
import { initVisualizer, startVisualizer, stopVisualizer, setExpandMode, resize as resizeVisualizer } from './visualizer.js';
import { renderTrackCard, updateTrackCardActive, renderMoodPills, showToast, updateNowPlaying, updatePlayPauseBtn, updateProgress, formatTime, icons } from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let allTracks = [];
let displayedTracks = [];
let currentMood = 'All';
let isExpanded = false;
let searchQuery = '';
let isDragging = false;

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  const state = loadState();
  applyTheme(state.theme || 'zen-dark');

  // Canvas visualizer — defer one frame so CSS layout has applied
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    initVisualizer(canvas);
    startVisualizer();
  }

  try {
    const res = await fetch(CONFIG.DATA_URL);
    const raw = await res.json();

    // ── FIX #1: meditation.json has NO id field on any track.
    //    Without IDs every findIndex call returns 0 (undefined === undefined is
    //    true for all entries), so every play click loads track 0.
    //    Assign stable string IDs based on array position at load time.
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

  // Low power mode detection
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    saveState({ lowPowerMode: true });
  }
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

  // Batch render via DocumentFragment
  const frag = document.createDocumentFragment();
  tracks.forEach((track, i) => {
    const card = renderTrackCard(track, i, {
      active: track.id === activeId,
      onPlay: (t) => {
        // ── FIX #2: always look up by stable ID, never by display index.
        //    Previously used `idx` from the display list which could point to
        //    a different global position after mood/search filtering.
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
}

function handleProgress(current, duration) {
  if (!isDragging) updateProgress(current, duration);
}

function handlePlayerState(state) {
  if (state === 'play') {
    updatePlayPauseBtn(true);
    startVisualizer(); // ensure visualizer is running during playback
  } else if (state === 'pause') {
    updatePlayPauseBtn(false);
    // keep ambient particles running — stopVisualizer() is intentionally NOT called
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
    volSlider.addEventListener('input', (e) => {
      setVolume(e.target.value / 100);
    });
  }

  // Progress bar — click to seek
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    progressBar.addEventListener('mousedown', () => { isDragging = true; });
    progressBar.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });

    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      // ── FIX #3: read actual audio duration from player, not from DOM text.
      const dur = getDuration();
      if (dur && isFinite(dur)) seekTo(pct * dur);
      isDragging = false;
    });

    progressBar.addEventListener('mouseup', () => { isDragging = false; });
    progressBar.addEventListener('mouseleave', () => { isDragging = false; });
  }

  // ── FIX #4: dhyaan:seek custom event (fired by expand overlay click)
  //    Previously parsed duration from DOM text — brittle and broke on
  //    tracks longer than 59:59. Now uses getDuration() directly.
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
      expandImg.src = track.image_url?.high || CONFIG.FALLBACK_IMAGE;
    }
  }
}

function deactivateExpand() {
  isExpanded = false;
  document.body.classList.remove('expand-mode');
  setExpandMode(false);
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
  });
}

// ─── Playlist UI ──────────────────────────────────────────────────────────────
function bindPlaylistUI() {
  document.getElementById('new-playlist-btn')?.addEventListener('click', () => {
    const name = prompt('Playlist name:');
    if (!name) return;
    createPlaylist(name);
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
      }
    });
    item.querySelector('.pl-delete').addEventListener('click', () => {
      if (confirm(`Delete "${pl.name}"?`)) {
        deletePlaylist(pl.id);
        renderPlaylistSidebar();
        showToast('Playlist deleted');
      }
    });
    container.appendChild(item);
  });
}

function showAddToPlaylistModal(track) {
  const playlists = getAllPlaylists();
  if (!playlists.length) {
    const name = prompt('No playlists found. Create one:');
    if (!name) return;
    const pl = createPlaylist(name);
    addToPlaylist(pl.id, track.id);
    renderPlaylistSidebar();
    showToast(`Added to "${pl.name}"`);
    return;
  }
  const names = playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const choice = prompt(`Add to playlist:\n${names}\n\nEnter number:`);
  const idx = parseInt(choice) - 1;
  if (idx >= 0 && idx < playlists.length) {
    addToPlaylist(playlists[idx].id, track.id);
    renderPlaylistSidebar();
    showToast(`Added to "${playlists[idx].name}"`);
  }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
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
