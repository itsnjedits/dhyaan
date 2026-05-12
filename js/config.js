// config.js — Global configuration
export const CONFIG = {
  DATA_URL: './data/meditation.json',
  FALLBACK_IMAGE: './assets/fallback.jpg',
  THEMES: ['zen-dark', 'night-blue', 'cosmic-purple', 'forest-calm', 'spiritual-green', 'sunset-gold', 'rose-pink', 'moonlight'],
  MOODS: ['All', 'Buddha', 'Zen', 'Shiva', 'Rain','Sufi', 'Solitude', 'Night', 'Healing', '3AM', 'Meditation', 'Focus', 'Flow', 'Morning'],
  MOOD_ICONS: {
    'All': '∞', 'Buddha': '☸', 'Zen': '○', 'Shiva': '⊕', 'Rain': '☂','Sufi': '🕊',
    'Solitude': '◌', 'Night': '☽', 'Healing': '✦', '3AM': '◉',
    'Meditation': '◎', 'Focus': '◈', 'Flow': '≋', 'Morning': '☀'
  },
  PARTICLE_COUNT: { normal: 55, low: 20, expand: 80 },
  SEEK_SECONDS: 10,
  PRELOAD_DELAY: 3000,
  // Recommendation system config
  RECO: {
    TOP_WEIGHT: 0.35,
    RECENT_WEIGHT: 0.25,
    HOURLY_WEIGHT: 0.25,
    DISCOVERY_WEIGHT: 0.15,
    MAX_RECOMMENDATIONS: 8,
    DISCOVERY_RATIO: 0.2,   // 20% chance of showing unheard tracks
  },
};

export const STORAGE_KEYS = {
  STATE: 'dhyaan_state',
  PLAYLISTS: 'dhyaan_playlists',
  FAVORITES: 'dhyaan_favorites',
};
