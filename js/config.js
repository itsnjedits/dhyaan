// config.js — Global configuration
export const CONFIG = {
  DATA_URL: './data/meditation.json',
  FALLBACK_IMAGE: './assets/fallback.jpg',
  THEMES: ['zen-dark', 'night-blue', 'cosmic-purple', 'forest-calm', 'spiritual-green'],
  MOODS: ['All', 'Buddha', 'Zen', 'Shiva', 'Rain', 'Solitude', 'Night', 'Healing', '3AM', 'Meditation', 'Focus', 'Flow', 'Morning'],
  MOOD_ICONS: {
    'All': '∞', 'Buddha': '☸', 'Zen': '○', 'Shiva': '⊕', 'Rain': '☂',
    'Solitude': '◌', 'Night': '☽', 'Healing': '✦', '3AM': '◉',
    'Meditation': '◎', 'Focus': '◈', 'Flow': '≋', 'Morning': '☀'
  },
  PARTICLE_COUNT: { normal: 55, low: 20, expand: 80 },
  SEEK_SECONDS: 10,
  PRELOAD_DELAY: 3000,
};

export const STORAGE_KEYS = {
  STATE: 'dhyaan_state',
  PLAYLISTS: 'dhyaan_playlists',
  FAVORITES: 'dhyaan_favorites',
};
