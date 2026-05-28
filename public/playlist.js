// playlist.js — Playlist management (export/import removed per spec)
import { getPlaylists, savePlaylists } from './storage.js';

export function createPlaylist(name) {
  const playlists = getPlaylists();
  const newPL = {
    id: Date.now().toString(),
    name: name || 'New Playlist',
    trackIds: [],
    createdAt: new Date().toISOString(),
  };
  playlists.push(newPL);
  savePlaylists(playlists);
  return newPL;
}

export function renamePlaylist(id, newName) {
  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === id);
  if (pl) {
    pl.name = newName;
    savePlaylists(playlists);
  }
  return playlists;
}

export function deletePlaylist(id) {
  const playlists = getPlaylists().filter(p => p.id !== id);
  savePlaylists(playlists);
  return playlists;
}

export function addToPlaylist(playlistId, trackId) {
  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (pl && !pl.trackIds.includes(trackId)) {
    pl.trackIds.push(trackId);
    savePlaylists(playlists);
  }
  return playlists;
}

export function removeFromPlaylist(playlistId, trackId) {
  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (pl) {
    pl.trackIds = pl.trackIds.filter(id => id !== trackId);
    savePlaylists(playlists);
  }
  return playlists;
}

export function getAllPlaylists() {
  return getPlaylists();
}
