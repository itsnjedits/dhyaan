// storage.js — State persistence layer
import { STORAGE_KEYS } from './config.js';

const DEFAULT_STATE = {
  lastTrackId: null,
  currentTime: 0,
  volume: 0.75,
  theme: 'zen-dark',
  shuffleMode: false,
  repeatMode: 'none', // none | one | all
  expandMode: false,
  selectedMood: 'All',
  favorites: [],
  playlists: [],
  lowPowerMode: false,
};

let _state = { ...DEFAULT_STATE };

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      _state = { ...DEFAULT_STATE, ...parsed };
    }
  } catch (e) {
    console.warn('State load failed, using defaults.');
  }
  return { ..._state };
}

export function saveState(partial) {
  _state = { ..._state, ...partial };
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(_state));
  } catch (e) {
    console.warn('State save failed.');
  }
}

export function getState() {
  return { ..._state };
}

export function getPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePlaylists(playlists) {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
  } catch (e) { console.warn('Playlist save failed.'); }
}

export function getFavorites() {
  return _state.favorites || [];
}

export function toggleFavorite(trackId) {
  const favs = [...(getFavorites())];
  const idx = favs.indexOf(trackId);
  if (idx === -1) favs.push(trackId);
  else favs.splice(idx, 1);
  saveState({ favorites: favs });
  return favs;
}

export function isFavorite(trackId) {
  return getFavorites().includes(trackId);
}
