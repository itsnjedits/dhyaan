// app.js — Dhyaan main orchestrator v2
// Fixes: state sync, no duplicate listeners, proper seek/drag, expand mode,
//        mobile sidebar, modal, playlist view, recommendations, volume fill,
//        RAF cleanup, async race guards, keyboard shortcuts,
//        low-end device detection + low-power mode activation.

import { CONFIG, STORAGE_KEYS } from './config.js';
import {
  loadState, saveState, getState,
  loadAnalytics, getFavorites, toggleFavorite, isFavorite,
} from './storage.js';
import {
  initPlayer, loadTrack, loadQueueIndex, setQueue, setAllTracksQueue,
  play, pause, togglePlay, nextTrack, prevTrack,
  isPlaying, seekBy, setVolume, getVolume,
  getCurrentTrack, getCurrentTime, getDuration,
  getTracks, getQueue, getQueueIndex,
} from './player.js';
import { initExplorer, filterByMood, getRandomTrack } from './explorer.js';
import { searchTracks } from './search.js';
import {
  createPlaylist, renamePlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, getAllPlaylists,
} from './playlist.js';
import { getRecommendations, getRecommendationLabel, getContinueJourneyTracks } from './recommendations.js';
import {
  renderTrackCard, updateTrackCardActive, renderMoodPills,
  showToast, updateNowPlaying, updatePlayPauseBtn,
  updateProgress, updateVolumeSliderFill, icons, formatTime,
  // BUG-017 FIX: import the shared escHtml from ui.js — removes the duplicate
  // private _escHtml that previously existed in both app.js and ui.js.
  escHtml,
} from './ui.js';
import {
  initVisualizer, startVisualizer, stopVisualizer,
  resize, setExpandMode, setParticleColor, setLowPowerMode,
} from './visualizer.js';

// ── Module-level state ────────────────────────────────────────────────────────
let _allTracks        = [];
let _currentMood      = 'All';
let _searchQuery      = '';
let _activePlaylistId = null;   // null = all-tracks view
let _expandOpen       = false;
let _controlsTimer    = null;   // timeout to hide expand-mode controls

// Track whether we're in a playlist view (vs global library)
let _viewingPlaylist  = false;

// ── Low-end device detection ──────────────────────────────────────────────────
function _detectLowEndDevice() {
  const fewCores    = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 2;
  const lowMemory   = navigator.deviceMemory != null && navigator.deviceMemory <= 1;
  const isMobile    = window.innerWidth <= 768 || ('ontouchstart' in window);
  const slowNetwork = isMobile && navigator.connection?.effectiveType === '2g';
  return fewCores || lowMemory || slowNetwork;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadState();
  loadAnalytics();

  const state = getState();

  // ── Apply saved theme ────────────────────────────────────────────────────
  _applyTheme(state.theme || 'zen-dark');

  // ── BUG-015: Low-power mode activation ───────────────────────────────────
  const _isLowEnd      = _detectLowEndDevice();
  const _activateLowPower = _isLowEnd || state.lowPowerMode;

  if (_activateLowPower) {
    document.body.classList.add('low-power');
    if (_isLowEnd && !state.lowPowerMode) saveState({ lowPowerMode: true });
  }

  // ── Visualizer ───────────────────────────────────────────────────────────
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    initVisualizer(canvas);
    if (_activateLowPower) setLowPowerMode(true);
    startVisualizer();
  }

  // ── Fetch data ───────────────────────────────────────────────────────────
  try {
    const resp = await fetch(CONFIG.DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data  = await resp.json();
    _allTracks  = (Array.isArray(data) ? data : data.tracks || []).map((t, i) => ({
      ...t,
      id: t.id ?? `track-${i}`,
    }));
  } catch (err) {
    console.error('[Dhyaan] Failed to load data:', err);
    document.getElementById('track-list').innerHTML =
      `<div class="empty-state">Could not load tracks. Please check your connection.</div>`;
    return;
  }

  if (!_allTracks.length) {
    document.getElementById('track-list').innerHTML =
      `<div class="empty-state">You're offline. Tracks will load when connected.</div>`;
    return;
  }

  initExplorer(_allTracks);

  // ── Player init ──────────────────────────────────────────────────────────
  initPlayer(_allTracks, {
    onTrackChange: _handleTrackChange,
    onProgress:    _handleProgress,
    onStateChange: _handleStateChange,
  });
  setAllTracksQueue();

  // Restore saved queue/playlist context
  const savedQueueIds = state.activeQueueIds;
  if (savedQueueIds && Array.isArray(savedQueueIds)) {
    const queueTracks = savedQueueIds
      .map(id => _allTracks.find(t => t.id === id))
      .filter(Boolean);
    if (queueTracks.length) {
      const savedIdx = Math.min(state.currentQueueIndex ?? 0, queueTracks.length - 1);
      setQueue(queueTracks, savedIdx, false);
    }
  }

  // ── Restore saved mood/playlist view ────────────────────────────────────
  _currentMood = state.selectedMood || 'All';
  if (state.activePlaylistId) {
    _activePlaylistId = state.activePlaylistId;
    _viewingPlaylist  = true;
  }

  // ── UI setup ─────────────────────────────────────────────────────────────
  _renderMoodBar();
  _renderPlaylists();
  _renderTrackList();
  _initVolumeSlider();
  _initPlayerControls();
  _initSearchBar();
  _initThemeDots();
  _initExpandMode();
  _initKeyboard();
  _initLogoAbout();

  // Apply saved playback state UI
  const track = getCurrentTrack();
  if (track) {
    updateNowPlaying(track, false);
    updatePlayPauseBtn(false);
    updateProgress(state.currentTime || 0, 0);
    updateVolumeSliderFill(state.volume ?? 0.75);
    _applyShuffleUI(state.shuffleMode);
    _applyRepeatUI(state.repeatMode || 'none');
    if (state.expandMode) {
      requestAnimationFrame(() => _openExpand());
    }
    _setParticleColorFromTrack(track);
  }
});

// ── Track-change handler ──────────────────────────────────────────────────────
function _handleTrackChange(track, idx) {
  if (!track) return;
  updateNowPlaying(track, isPlaying());
  updatePlayPauseBtn(isPlaying());
  updateProgress(0, 0);
  updateTrackCardActive(document.getElementById('track-list'), track.id);
  _setParticleColorFromTrack(track);
  if (_expandOpen) _renderExpandRecos();
}

// ── Progress handler ──────────────────────────────────────────────────────────
function _handleProgress(current, duration) {
  updateProgress(current, duration);
}

// ── State-change handler ──────────────────────────────────────────────────────
function _handleStateChange(state) {
  const playing = (state === 'play');
  updatePlayPauseBtn(playing);
  if (playing) startVisualizer();
}

// ── Volume slider ─────────────────────────────────────────────────────────────
function _initVolumeSlider() {
  const slider = document.getElementById('volume-slider');
  if (!slider) return;
  const vol = getVolume();
  updateVolumeSliderFill(vol);
  slider.value = Math.round(vol * 100);

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10) / 100;
    setVolume(v);
    updateVolumeSliderFill(v);
  });
}

// ── Player controls ────────────────────────────────────────────────────────────
function _initPlayerControls() {
  document.getElementById('play-pause-btn')?.addEventListener('click', togglePlay);
  document.getElementById('prev-btn')?.addEventListener('click', prevTrack);
  document.getElementById('next-btn')?.addEventListener('click', nextTrack);
  document.getElementById('seek-bwd')?.addEventListener('click', () => seekBy(-CONFIG.SEEK_SECONDS));
  document.getElementById('seek-fwd')?.addEventListener('click', () => seekBy(+CONFIG.SEEK_SECONDS));

  document.getElementById('shuffle-btn')?.addEventListener('click', () => {
    const { shuffleMode } = getState();
    const next = !shuffleMode;
    saveState({ shuffleMode: next });
    _applyShuffleUI(next);
    showToast(next ? 'Shuffle on' : 'Shuffle off');
  });

  document.getElementById('repeat-btn')?.addEventListener('click', () => {
    const modes = ['none', 'all', 'one'];
    const { repeatMode } = getState();
    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    saveState({ repeatMode: next });
    _applyRepeatUI(next);
    showToast(`Repeat: ${next === 'none' ? 'off' : next}`);
  });

  document.getElementById('random-btn')?.addEventListener('click', () => {
    const track = getRandomTrack(_currentMood);
    if (!track) return;
    const idx = _allTracks.findIndex(t => t.id === track.id);
    if (idx !== -1) loadTrack(idx, true);
    setTimeout(() => _scrollToActive(), 300);
  });
}

function _applyShuffleUI(on) {
  const btn = document.getElementById('shuffle-btn');
  if (btn) btn.classList.toggle('active', on);
}

function _applyRepeatUI(mode) {
  const btn = document.getElementById('repeat-btn');
  if (!btn) return;
  btn.classList.toggle('active', mode !== 'none');
  btn.innerHTML = mode === 'one' ? icons.repeatOne : icons.repeat;
  btn.title = `Repeat: ${mode}`;
}

// ── Search ─────────────────────────────────────────────────────────────────────
function _initSearchBar() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  if (!input) return;

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      _searchQuery = input.value.trim();
      clear.style.display = _searchQuery ? 'flex' : 'none';
      _renderTrackList();
    }, 180);
  });

  clear.addEventListener('click', () => {
    input.value   = '';
    _searchQuery  = '';
    clear.style.display = 'none';
    input.focus();
    _renderTrackList();
  });

  clear.style.display = 'none';
}

// ── Theme dots ────────────────────────────────────────────────────────────────
function _initThemeDots() {
  document.querySelectorAll('[data-theme-btn]').forEach(dot => {
    dot.addEventListener('click', () => _applyTheme(dot.dataset.themeBtn));
  });
}

function _applyTheme(theme) {
  if (!CONFIG.THEMES.includes(theme)) return;
  document.body.setAttribute('data-theme', theme);
  saveState({ theme });
  document.querySelectorAll('[data-theme-btn]').forEach(d =>
    d.classList.toggle('active', d.dataset.themeBtn === theme)
  );
}

// ── Mood bar ──────────────────────────────────────────────────────────────────
// FIX BUG-001: named inner function replaces arguments.callee (illegal in strict mode).
function _renderMoodBar() {
  const container = document.getElementById('mood-pills');
  if (!container) return;

  function _onMoodSelect(mood) {
    _currentMood = mood;
    saveState({ selectedMood: mood });
    _renderTrackList();
    renderMoodPills(container, CONFIG.MOODS, _currentMood, _onMoodSelect);
  }

  renderMoodPills(container, CONFIG.MOODS, _currentMood, _onMoodSelect);
}

// ── Track list ─────────────────────────────────────────────────────────────────
function _renderTrackList() {
  const listEl = document.getElementById('track-list');
  if (!listEl) return;

  if (_viewingPlaylist && _activePlaylistId) {
    _renderPlaylistView(_activePlaylistId);
    return;
  }

  let tracks = filterByMood(_currentMood);
  if (_searchQuery) tracks = searchTracks(tracks, _searchQuery);

  if (!tracks.length) {
    listEl.innerHTML = `<div class="empty-state">
      ${_searchQuery ? `No results for "${escHtml(_searchQuery)}"` : 'No tracks in this mood'}
    </div>`;
    return;
  }

  const frag      = document.createDocumentFragment();
  const currentId = getCurrentTrack()?.id;

  // BUG-019 FIX: set --card-delay on each card using the render-order index
  // (not the global library index). This gives proportional stagger across ALL
  // rendered cards (capped at 250 ms), not just the first 6 covered by the
  // previous nth-child CSS declarations.
  tracks.forEach((track, renderIdx) => {
    const globalIdx = _allTracks.findIndex(t => t.id === track.id);
    const card = renderTrackCard(track, globalIdx, {
      active:          track.id === currentId,
      onPlay:          (t, idx) => _playTrackFromLibrary(idx),
      onAddToPlaylist: (t)      => _showAddToPlaylistModal(t),
    });
    card.style.setProperty('--card-delay', `${Math.min(renderIdx * 0.03, 0.25)}s`);
    frag.appendChild(card);
  });

  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

// ── Playlist view ──────────────────────────────────────────────────────────────
function _renderPlaylistView(playlistId) {
  const listEl = document.getElementById('track-list');
  if (!listEl) return;

  const playlists = getAllPlaylists();
  const pl        = playlists.find(p => p.id === playlistId);
  if (!pl) { _exitPlaylistView(); return; }

  const plTracks = pl.trackIds
    .map(id => _allTracks.find(t => t.id === id))
    .filter(Boolean);

  const header = document.createElement('div');
  header.className = 'playlist-view-header';
  header.innerHTML = `
    <button class="pl-back-btn" id="pl-back-btn" aria-label="Back to all tracks">
      ${icons.back}
    </button>
    <div class="pl-header-info">
      <div class="pl-header-name">${escHtml(pl.name)}</div>
      <div class="pl-header-count">${plTracks.length} track${plTracks.length !== 1 ? 's' : ''}</div>
    </div>
  `;
  header.querySelector('#pl-back-btn').addEventListener('click', _exitPlaylistView);

  const frag      = document.createDocumentFragment();
  const currentId = getCurrentTrack()?.id;
  frag.appendChild(header);

  if (!plTracks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tracks yet — add some from the library';
    frag.appendChild(empty);
  } else {
    // BUG-019 FIX: stagger also applies in playlist view.
    plTracks.forEach((track, renderIdx) => {
      const card = renderTrackCard(track, renderIdx, {
        active:               track.id === currentId,
        onPlay:               (t, idx) => {
          setQueue(plTracks, idx, true);
          saveState({ activePlaylistId: playlistId, activeQueueIds: plTracks.map(t => t.id) });
        },
        onRemoveFromPlaylist: (t) => {
          removeFromPlaylist(playlistId, t.id);
          showToast(`Removed from "${pl.name}"`);
          _renderPlaylistView(playlistId);
          _renderPlaylists();
        },
      });
      card.style.setProperty('--card-delay', `${Math.min(renderIdx * 0.03, 0.25)}s`);
      frag.appendChild(card);
    });
  }

  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

function _exitPlaylistView() {
  _viewingPlaylist  = false;
  _activePlaylistId = null;
  saveState({ activePlaylistId: null, activeQueueIds: null });
  setAllTracksQueue();
  _renderPlaylists();
  _renderTrackList();
}

// ── Playlists sidebar ──────────────────────────────────────────────────────────
function _renderPlaylists() {
  const container = document.getElementById('playlists-container');
  if (!container) return;

  const playlists = getAllPlaylists();

  if (!playlists.length) {
    container.innerHTML = `<div class="empty-pl">No playlists yet</div>`;
  } else {
    const frag = document.createDocumentFragment();
    playlists.forEach(pl => {
      const item = document.createElement('div');
      item.className = `pl-item${_activePlaylistId === pl.id ? ' active' : ''}`;
      item.dataset.id = pl.id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.innerHTML = `
        <span class="pl-name">${escHtml(pl.name)}</span>
        <span class="pl-count">${pl.trackIds.length}</span>
        <div class="pl-actions">
          <button title="Rename" aria-label="Rename playlist" class="pl-rename-btn">✎</button>
          <button title="Delete" aria-label="Delete playlist" class="pl-delete-btn">✕</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.pl-actions')) return;
        _activePlaylistId = pl.id;
        _viewingPlaylist  = true;
        saveState({ activePlaylistId: pl.id });
        _renderPlaylists();
        _renderPlaylistView(pl.id);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });

      item.querySelector('.pl-rename-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        _showRenameModal(pl);
      });
      item.querySelector('.pl-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        _showDeleteModal(pl);
      });

      frag.appendChild(item);
    });
    container.innerHTML = '';
    container.appendChild(frag);
  }

  // FIX BUG-003: removed dead { once: true } listener.
  _reAttachNewPlaylistBtn();
}

function _reAttachNewPlaylistBtn() {
  const btn = document.getElementById('new-playlist-btn');
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  clone.addEventListener('click', _showCreatePlaylistModal);
}

// ── Play from library ─────────────────────────────────────────────────────────
function _playTrackFromLibrary(globalIdx) {
  if (_viewingPlaylist) _exitPlaylistView();
  setAllTracksQueue();
  loadTrack(globalIdx, true);
  saveState({ activePlaylistId: null, activeQueueIds: null });
}

// ── Add to playlist modal ─────────────────────────────────────────────────────
function _showAddToPlaylistModal(track) {
  const playlists = getAllPlaylists();
  if (!playlists.length) {
    _showModal({
      title: 'No playlists',
      body: `<p class="modal-confirm-msg">You don't have any playlists yet. Create one first.</p>`,
      buttons: [
        { label: 'Create Playlist', cls: 'modal-btn-accent', action: (close) => { close(); _showCreatePlaylistModal(track); }},
        { label: 'Cancel', cls: 'modal-btn-ghost', action: (close) => close() },
      ],
    });
    return;
  }

  const listHtml = playlists.map(pl =>
    `<button class="modal-pick-item" data-plid="${pl.id}">
       <span class="modal-pick-name">${escHtml(pl.name)}</span>
       <span class="modal-pick-sub">${pl.trackIds.length} tracks</span>
     </button>`
  ).join('');

  _showModal({
    title: `Add to playlist`,
    body:  `<div class="modal-pick-list">${listHtml}</div>`,
    buttons: [{ label: 'Cancel', cls: 'modal-btn-ghost', action: (close) => close() }],
    onMount: (rootEl) => {
      rootEl.querySelectorAll('.modal-pick-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const plId = btn.dataset.plid;
          addToPlaylist(plId, track.id);
          const pl = getAllPlaylists().find(p => p.id === plId);
          showToast(`Added to "${pl?.name || 'playlist'}"`);
          _renderPlaylists();
          _closeModal();
        });
      });
    },
  });
}

function _showCreatePlaylistModal(trackToAdd = null) {
  _showModal({
    title: 'New Playlist',
    body: `<input id="dhyaan-modal-input" type="text" placeholder="Playlist name…" maxlength="60" autocomplete="off" />`,
    buttons: [
      {
        label: 'Create', cls: 'modal-btn-accent', action: (close) => {
          const val = document.getElementById('dhyaan-modal-input')?.value?.trim();
          if (!val) return;
          const pl = createPlaylist(val);
          if (trackToAdd) {
            addToPlaylist(pl.id, trackToAdd.id);
            showToast(`Added to "${pl.name}"`);
          } else {
            showToast(`Playlist "${pl.name}" created`);
          }
          _renderPlaylists();
          close();
        },
      },
      { label: 'Cancel', cls: 'modal-btn-ghost', action: (close) => close() },
    ],
    onMount: (rootEl) => {
      const input = rootEl.querySelector('#dhyaan-modal-input');
      input?.focus();
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') rootEl.querySelector('.modal-btn-accent')?.click();
      });
    },
  });
}

function _showRenameModal(pl) {
  _showModal({
    title: 'Rename Playlist',
    body:  `<input id="dhyaan-modal-input" type="text" value="${escHtml(pl.name)}" maxlength="60" autocomplete="off" />`,
    buttons: [
      {
        label: 'Rename', cls: 'modal-btn-accent', action: (close) => {
          const val = document.getElementById('dhyaan-modal-input')?.value?.trim();
          if (!val) return;
          renamePlaylist(pl.id, val);
          showToast(`Renamed to "${val}"`);
          _renderPlaylists();
          if (_viewingPlaylist && _activePlaylistId === pl.id) _renderPlaylistView(pl.id);
          close();
        },
      },
      { label: 'Cancel', cls: 'modal-btn-ghost', action: (close) => close() },
    ],
    onMount: (rootEl) => {
      const input = rootEl.querySelector('#dhyaan-modal-input');
      input?.focus();
      input?.select();
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') rootEl.querySelector('.modal-btn-accent')?.click();
      });
    },
  });
}

function _showDeleteModal(pl) {
  _showModal({
    title: 'Delete Playlist',
    body:  `<p class="modal-confirm-msg">Delete <em>"${escHtml(pl.name)}"</em>? This cannot be undone.</p>`,
    buttons: [
      {
        label: 'Delete', cls: 'modal-btn-danger', action: (close) => {
          deletePlaylist(pl.id);
          showToast(`Playlist deleted`);
          if (_activePlaylistId === pl.id) _exitPlaylistView();
          else _renderPlaylists();
          close();
        },
      },
      { label: 'Cancel', cls: 'modal-btn-ghost', action: (close) => close() },
    ],
  });
}

// ── Modal system ───────────────────────────────────────────────────────────────
let _modalRoot = null;

function _ensureModalRoot() {
  if (_modalRoot) return;
  const root = document.createElement('div');
  root.id = 'dhyaan-modal-root';

  // BUG-021 FIX: added aria-labelledby="dhyaan-modal-title" so screen readers
  // announce the dialog name when focus enters. WCAG 2.1 requires role="dialog"
  // elements to have an accessible name via aria-labelledby or aria-label.
  root.innerHTML = `
    <div id="dhyaan-modal-backdrop">
      <div id="dhyaan-modal-box" role="dialog" aria-modal="true" aria-labelledby="dhyaan-modal-title">
        <div id="dhyaan-modal-title"></div>
        <div id="dhyaan-modal-body"></div>
        <div id="dhyaan-modal-footer"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  _modalRoot = root;

  const backdrop = root.querySelector('#dhyaan-modal-backdrop');
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) _closeModal();
  });
  root.querySelector('#dhyaan-modal-box').addEventListener('click', (e) => e.stopPropagation());
}

function _showModal({ title, body, buttons = [], onMount } = {}) {
  _ensureModalRoot();
  const backdrop = _modalRoot.querySelector('#dhyaan-modal-backdrop');
  const box      = _modalRoot.querySelector('#dhyaan-modal-box');
  const titleEl  = _modalRoot.querySelector('#dhyaan-modal-title');
  const bodyEl   = _modalRoot.querySelector('#dhyaan-modal-body');
  const footerEl = _modalRoot.querySelector('#dhyaan-modal-footer');

  titleEl.textContent = title;
  bodyEl.innerHTML    = body;
  footerEl.innerHTML  = '';

  buttons.forEach(({ label, cls, action }) => {
    const btn = document.createElement('button');
    btn.className   = cls;
    btn.textContent = label;
    btn.addEventListener('click', () => action(_closeModal));
    footerEl.appendChild(btn);
  });

  _modalRoot.style.pointerEvents = 'all';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => backdrop.classList.add('open'));
  });

  if (onMount) onMount(box);

  const focusable = box.querySelectorAll('button, input, [tabindex]');
  focusable[0]?.focus();
}

function _closeModal() {
  if (!_modalRoot) return;
  const backdrop = _modalRoot.querySelector('#dhyaan-modal-backdrop');
  backdrop.classList.remove('open');
  setTimeout(() => { _modalRoot.style.pointerEvents = 'none'; }, 380);
}

// ── Expand / Immersive mode ────────────────────────────────────────────────────
function _initExpandMode() {
  document.getElementById('expand-btn')?.addEventListener('click', () => {
    _expandOpen ? _closeExpand() : _openExpand();
  });
  document.getElementById('collapse-btn')?.addEventListener('click', _closeExpand);

  const overlay = document.getElementById('expand-overlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target.closest('button, .expand-progress-bar, .expand-reco-item')) return;
    _showExpandControls();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _expandOpen) _closeExpand();
  });
}

function _openExpand() {
  _expandOpen = true;
  document.body.classList.add('expand-mode');
  setExpandMode(true);
  saveState({ expandMode: true });
  _renderExpandRecos();
  _showExpandControls();

  const overlay = document.getElementById('expand-overlay');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'false');
    // BUG-020 FIX: tabindex="-1" is now on the element in HTML, making this
    // focus() call actually work for keyboard/screen-reader users.
    overlay.focus({ preventScroll: true });
  }
}

function _closeExpand() {
  _expandOpen = false;
  document.body.classList.remove('expand-mode', 'controls-visible');
  setExpandMode(false);
  saveState({ expandMode: false });

  const overlay = document.getElementById('expand-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', 'true');

  clearTimeout(_controlsTimer);
}

function _showExpandControls() {
  document.body.classList.add('controls-visible');
  clearTimeout(_controlsTimer);
  _controlsTimer = setTimeout(() => {
    document.body.classList.remove('controls-visible');
  }, 4000);
}

function _renderExpandRecos() {
  const ui = document.querySelector('.expand-ui');
  if (!ui) return;

  ui.querySelector('.expand-reco-panel')?.remove();

  const track  = getCurrentTrack();
  const recos  = getRecommendations(_allTracks, track?.id, 6);
  const label  = getRecommendationLabel();
  if (!recos.length) return;

  const panel = document.createElement('div');
  panel.className = 'expand-reco-panel';
  panel.innerHTML = `
    <div class="expand-reco-label">${label}</div>
    <div class="expand-reco-list">
      ${recos.map(t => `
        <div class="expand-reco-item" data-id="${t.id}" role="button" tabindex="0" aria-label="Play ${escHtml(t.title)}">
          <div class="expand-reco-thumb"
               style="background-image:url('${t.image_url?.low || ''}')">
          </div>
          <div class="expand-reco-name">${escHtml(t.title)}</div>
        </div>
      `).join('')}
    </div>
  `;

  panel.querySelectorAll('.expand-reco-item').forEach(item => {
    const handler = () => {
      const id  = item.dataset.id;
      const idx = _allTracks.findIndex(t => t.id === id);
      if (idx !== -1) loadTrack(idx, true);
      _showExpandControls();
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });

  ui.appendChild(panel);
}

// ── Particle colour from track ─────────────────────────────────────────────────
function _setParticleColorFromTrack(track) {
  if (track.hue != null) {
    setParticleColor(track.hue, 65, 72);
    return;
  }
  const moodHues = {
    'Buddha': 42, 'Zen': 155, 'Shiva': 270, 'Rain': 205, 'Sufi': 30,
    'Solitude': 220, 'Night': 245, 'Healing': 160, '3AM': 230,
    'Meditation': 145, 'Focus': 200, 'Flow': 180, 'Morning': 55, 'All': 140,
  };
  const mood = (track.moods || [])[0];
  const hue  = moodHues[mood] ?? 140;
  setParticleColor(hue, 60, 70);
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
function _initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    switch (e.key) {
      case ' ':        e.preventDefault(); togglePlay(); break;
      case 'ArrowRight':
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); seekBy(+CONFIG.SEEK_SECONDS); }
        break;
      case 'ArrowLeft':
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); seekBy(-CONFIG.SEEK_SECONDS); }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(Math.min(1, getVolume() + 0.05));
        updateVolumeSliderFill(getVolume());
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(Math.max(0, getVolume() - 0.05));
        updateVolumeSliderFill(getVolume());
        break;
      case 'n': case 'N': nextTrack(); break;
      case 'p': case 'P': prevTrack(); break;
      case 'e': case 'E': _expandOpen ? _closeExpand() : _openExpand(); break;
      case 'f': case 'F': {
        const t = getCurrentTrack();
        if (t) {
          toggleFavorite(t.id);
          showToast(isFavorite(t.id) ? '♥ Added to favourites' : '♡ Removed from favourites');
          updateTrackCardActive(document.getElementById('track-list'), t.id);
        }
        break;
      }
      case 'Escape': if (_expandOpen) _closeExpand(); break;
    }
  });
}

// ── Logo / About modal ────────────────────────────────────────────────────────
function _initLogoAbout() {
  const logo = document.querySelector('.logo');
  if (!logo) return;
  logo.addEventListener('click', () => {
    _showModal({
      title: 'Dhyaan',
      body: `
        <div class="about-modal-wrap">
          <p class="about-tagline">A Living Meditation Experience</p>
          <p class="about-divider">· · ·</p>
          <p class="about-text">
            <em>Dhyaan</em> (ध्यान) means <em>meditation</em> in Sanskrit —
            a state of deep, unbroken awareness.
          </p>
          <p class="about-text">
            This space holds ambient soundscapes carefully curated for
            <em>focus</em>, <em>healing</em>, <em>stillness</em>, and the
            long hours between midnight and dawn.
          </p>
          <p class="about-text">
            Breathe. Let the sounds do the rest.
          </p>
          <p class="about-footer-text">
            Press <kbd>Space</kbd> to play · <kbd>E</kbd> for immersive mode
          </p>
        </div>
      `,
      buttons: [{ label: 'Enter Stillness', cls: 'modal-btn-accent', action: (close) => close() }],
    });
  });
}

// ── Scroll active track into view ─────────────────────────────────────────────
function _scrollToActive() {
  const listEl = document.getElementById('track-list');
  const active = listEl?.querySelector('.track-card.active');
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}