/* ============================================================
   js/pwa/index.js — PWA Install prompt + Banner patrocinador
   Extraído de app.js (Fase 5 — modularización 2026-05-23)

   Responsabilidades:
   - beforeinstallprompt (Android/Chrome/Desktop)
   - Banner manual para iOS Safari (sin beforeinstallprompt)
   - Banner de patrocinador (HS_CONFIG.SPONSOR)

   Expone: window.PWAManager = { init }
   ============================================================ */

window.PWAManager = (function () {
  'use strict';

  let _deferredInstallPrompt = null;

  // ── iOS Safari detection ──────────────────────────────────
  function _isIosSafari() {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = isIos && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    const isStandalone = window.navigator.standalone === true;
    return isSafari && !isStandalone;
  }

  // ── Banner de instalación ─────────────────────────────────
  function _showInstallBanner() {
    if (sessionStorage.getItem('hs_pwa_dismissed')) return;
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    const _t    = window.t || (k => k);
    const isIos = _isIosSafari();

    if (isIos) {
      banner.innerHTML = `
        <div class="pwa-banner pwa-banner--ios">
          <span class="pwa-icon"></span>
          <div class="pwa-info">
            <strong>${_t('pwa.install_title')}</strong>
            <small>
              Toca <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin:0 2px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              <strong>Compartir</strong> → <strong>Añadir a inicio</strong>
            </small>
          </div>
          <button class="pwa-dismiss" id="pwa-dismiss" title="${_t('pwa.close')}">✕</button>
        </div>
        <div class="pwa-ios-arrow">▼</div>`;
    } else {
      banner.innerHTML = `
        <div class="pwa-banner">
          <span class="pwa-icon"></span>
          <div class="pwa-info">
            <strong>${_t('pwa.install_title')}</strong>
            <small>${_t('pwa.install_desc')}</small>
          </div>
          <button class="btn btn--primary btn--sm" id="pwa-install-btn">${_t('pwa.install_btn')}</button>
          <button class="pwa-dismiss" id="pwa-dismiss" title="${_t('pwa.close')}">✕</button>
        </div>`;
    }

    banner.style.display = '';

    document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
      if (!_deferredInstallPrompt) return;
      _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') banner.style.display = 'none';
      _deferredInstallPrompt = null;
    });

    document.getElementById('pwa-dismiss')?.addEventListener('click', () => {
      banner.style.display = 'none';
      sessionStorage.setItem('hs_pwa_dismissed', '1');
    });
  }

  // ── Banner de patrocinador ────────────────────────────────
  function _renderSponsorBanner() {
    const banner = document.getElementById('sponsor-banner');
    if (!banner || typeof HS_CONFIG === 'undefined') return;
    const sp = HS_CONFIG.SPONSOR;
    if (!sp || !sp.active) return;

    const _t = window.t || (k => k);
    banner.innerHTML = `
      <a class="sponsor-card" href="${sp.url}" target="_blank" rel="sponsored noopener">
        <span class="sponsor-logo">${sp.logo}</span>
        <div class="sponsor-info">
          <span class="sponsor-label">${_t('sponsor.recommended')}</span>
          <strong>${sp.name}</strong>
          <small>${sp.tagline}</small>
        </div>
        <span class="sponsor-cta">${_t('sponsor.see_offers')}</span>
      </a>`;
  }

  // ── API pública ───────────────────────────────────────────
  function init() {
    // Android/Chrome: capturar evento nativo
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredInstallPrompt = e;
      _showInstallBanner();
    });

    window.addEventListener('appinstalled', () => {
      _deferredInstallPrompt = null; // evitar que el prompt vuelva a mostrarse
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'none';
    });

    // iOS Safari: sin beforeinstallprompt, mostramos guía manual
    if (_isIosSafari()) _showInstallBanner();

    _renderSponsorBanner();
  }

  return { init };
})();
