// Dev-only AG_CONFIG — overridden by install.sh injection in production.
window.AG_CONFIG = window.AG_CONFIG || {};
window.AG_CONFIG.apiUrl            = window.AG_CONFIG.apiUrl            || '/api';
window.AG_CONFIG.apiKey            = window.AG_CONFIG.apiKey            || null; // set by install.sh — enter manually on first dev launch
window.AG_CONFIG.licenseEmail      = window.AG_CONFIG.licenseEmail      || 'contact@audiogravity.io';
window.AG_CONFIG.licensePrice      = window.AG_CONFIG.licensePrice      || '€9.00';
window.AG_CONFIG.licensePaypalUrl  = window.AG_CONFIG.licensePaypalUrl  || 'https://paypal.me/audiogravity/9EUR';
window.AG_CONFIG.licensePortalUrl  = window.AG_CONFIG.licensePortalUrl  || 'http://10.0.4.254:8100/ls/portal/ui';
