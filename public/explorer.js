// explorer.js — Mood explorer and random meditation generator
import { CONFIG } from './config.js';

let _allTracks = [];

export function initExplorer(tracks) {
  _allTracks = tracks;
}

export function filterByMood(mood) {
  if (!mood || mood === 'All') return [..._allTracks];
  return _allTracks.filter(t => (t.moods || []).includes(mood));
}

export function getRandomTrack(mood = null) {
  const pool = mood && mood !== 'All' ? filterByMood(mood) : _allTracks;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getMoodStats() {
  const stats = {};
  for (const mood of CONFIG.MOODS) {
    if (mood === 'All') { stats[mood] = _allTracks.length; continue; }
    stats[mood] = _allTracks.filter(t => (t.moods || []).includes(mood)).length;
  }
  return stats;
}
