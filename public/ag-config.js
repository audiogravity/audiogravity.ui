// Dev-only AG_CONFIG — overridden by install.sh injection in production.
window.AG_CONFIG = window.AG_CONFIG || {};
window.AG_CONFIG.apiUrl            = window.AG_CONFIG.apiUrl            || '/api';
window.AG_CONFIG.apiKey            = window.AG_CONFIG.apiKey            || null; // set by install.sh — enter manually on first dev launch
