/* ============================================================
   supplements.js — Sección de suplementos y macronutrientes
   Datos desde HS_CONFIG (config.js), opcionalmente desde la API.
   Convierte el contenido estático de las capturas FitSciPro en
   componentes dinámicos reutilizables.
   ============================================================ */

const Supplements = (function () {
  'use strict';

  // ── Helpers de badge ──────────────────────────────────────────────────────
  function levelBadge(level) {
    return level === 'essential'
      ? '<span class="suppl-badge suppl-badge--essential">IMPRESCINDIBLE</span>'
      : '<span class="suppl-badge suppl-badge--optional">OPCIONAL</span>';
  }

  const EVIDENCE_MAP = { high: 3, medium: 2, low: 1 };
  function evidenceCount(level) { return EVIDENCE_MAP[level] || 1; }

  function evidenceDots(level) {
    const n = evidenceCount(level);
    const dots = Array.from({ length: 3 }, (_, i) =>
      `<span class="ev-dot${i < n ? ' ev-dot--on' : ''}"></span>`
    ).join('');
    return `<div class="evidence-dots" title="Evidencia: ${level}">${dots}</div>`;
  }

  // ── Estado de filtro ──────────────────────────────────────────────────────
  // _activeFilter: 0 = todos, 3/2/1 = nº exacto de evidencias.
  let _allSupplements = [];
  let _activeFilter   = 0;

  function _filterLabel(n) {
    if (n === 0) return 'Todos';
    if (n === 3) return '●●● Alta';
    if (n === 2) return '●●○ Media';
    return '●○○ Baja';
  }

  function renderFilterBar() {
    const bar = document.getElementById('suppl-filter-bar');
    if (!bar) return;

    // Contar suplementos por nivel para mostrar el número en cada chip
    const counts = { 3: 0, 2: 0, 1: 0 };
    _allSupplements.forEach(s => { counts[evidenceCount(s.evidence_level)]++; });

    const chips = [0, 3, 2, 1].map(n => {
      const active = n === _activeFilter ? ' suppl-filter-chip--active' : '';
      const count  = n === 0 ? _allSupplements.length : counts[n];
      // Ocultar chips sin resultados (excepto "Todos")
      if (n !== 0 && count === 0) return '';
      return `<button type="button" class="suppl-filter-chip${active}" data-filter="${n}" aria-pressed="${n === _activeFilter}">
        <span class="suppl-filter-chip-label">${_filterLabel(n)}</span>
        <span class="suppl-filter-chip-count">${count}</span>
      </button>`;
    }).join('');

    bar.innerHTML = chips;
    bar.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeFilter = parseInt(btn.dataset.filter, 10) || 0;
        renderFilterBar();
        _renderGrid();
      });
    });
  }

  // ── Render tarjetas de suplementos ────────────────────────────────────────
  function renderSupplements(supplements) {
    _allSupplements = Array.isArray(supplements) ? supplements : [];
    _activeFilter = 0;
    renderFilterBar();
    _renderGrid();
  }

  function _renderGrid() {
    const grid = document.getElementById('suppl-grid');
    if (!grid) return;

    let supplements = _allSupplements;
    if (_activeFilter !== 0) {
      supplements = supplements.filter(s => evidenceCount(s.evidence_level) === _activeFilter);
    }

    if (!supplements.length) {
      grid.innerHTML = `<div class="suppl-empty">No hay suplementos con ese nivel de evidencia.</div>`;
      return;
    }

    const essential = supplements.filter(s => s.level === 'essential');
    const optional  = supplements.filter(s => s.level !== 'essential');

    let html = '';

    if (essential.length) {
      html += `<div class="suppl-section-title">
        <span class="suppl-section-label suppl-section-label--essential">
          Imprescindibles — Evidencia sólida
        </span>
      </div>`;
      html += '<div class="suppl-grid-row">';
      essential.forEach(s => { html += supplCard(s); });
      html += '</div>';
    }

    if (optional.length) {
      html += `<div class="suppl-section-title" style="margin-top:32px">
        <span class="suppl-section-label suppl-section-label--optional">
          Opcionales — Beneficios adicionales
        </span>
      </div>`;
      html += '<div class="suppl-grid-row">';
      optional.forEach(s => { html += supplCard(s); });
      html += '</div>';
    }

    grid.innerHTML = html;

    // Bind affiliate buttons
    grid.querySelectorAll('[data-affiliate]').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = HS_CONFIG.resolveAffiliateLink(btn.dataset.affiliate);
        if (url && url !== '#') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  function supplCard(s) {
    const borderColor = s.level === 'essential' ? '#ff4757' : '#f59e0b';
    const affLabel = s.affiliate_link_placeholder;
    return `
      <div class="suppl-card" style="--suppl-border: ${borderColor}">
        <div class="suppl-card-top">
          ${levelBadge(s.level)}
          ${evidenceDots(s.evidence_level)}
        </div>
        <div class="suppl-icon">${s.icon_emoji || ''}</div>
        <h3 class="suppl-name">${s.name}</h3>
        <div class="suppl-meta">
          <div class="suppl-meta-item">
            <span class="suppl-meta-label">DOSIS</span>
            <span class="suppl-meta-value">${s.dose}</span>
          </div>
          <div class="suppl-meta-item">
            <span class="suppl-meta-label">MOMENTO</span>
            <span class="suppl-meta-value">${s.timing}</span>
          </div>
        </div>
        <p class="suppl-desc">${s.description}</p>
        <button class="btn suppl-cta" data-affiliate="${affLabel}">
          Ver oferta <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>`;
  }

  // ── Render macronutrientes (contenido FitSciPro captura A) ─────────────────
  function renderMacroInfo() {
    if (!window.HS_CONFIG) return;
    const info = HS_CONFIG.MACRO_INFO;
    const html = Object.values(info).map(m => `
      <div class="macro-info-card" style="--macro-color:${m.color}">
        <div class="mic-icon">${m.icon}</div>
        <h3 class="mic-title">${m.title}</h3>
        <p class="mic-range">${m.range}</p>
        <p class="mic-desc">${m.description}</p>
        <div class="mic-details">
          ${Object.entries(m.details).map(([k, v]) =>
            `<p><strong>En ${k}:</strong> ${v}</p>`
          ).join('')}
        </div>
      </div>
    `).join('');

    const el = document.getElementById('macro-info-grid');
    if (el) el.innerHTML = html;
  }

  // ── Render timing de nutrientes (captura A) ────────────────────────────────
  function renderTimingInfo() {
    if (!window.HS_CONFIG) return;
    const timing = HS_CONFIG.TIMING_INFO;

    let preHTML = timing.pre.slots.map(slot => `
      <div class="timing-slot" style="--slot-color:${slot.color}">
        <div class="timing-slot-header">
          <span class="timing-badge" style="background:${slot.color}">${slot.time}</span>
          <span class="timing-label">${slot.label}</span>
        </div>
        <ul class="timing-list">
          ${slot.items.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    let postHTML = timing.post.slots.map(slot => `
      <div class="timing-slot" style="--slot-color:${slot.color}">
        <div class="timing-slot-header">
          <span class="timing-badge" style="background:${slot.color}">${slot.time}</span>
          <span class="timing-label">${slot.label}</span>
        </div>
        <ul class="timing-list">
          ${slot.items.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    let principlesHTML = timing.principles.map(p => `
      <li class="principle-item">
        <span class="principle-dot"></span>
        <span>${p}</span>
      </li>
    `).join('');

    const timingHTML = `
      <div class="timing-columns">
        <div class="timing-col">
          <h4 class="timing-col-title" style="color:#ff4757">${timing.pre.title}</h4>
          ${preHTML}
        </div>
        <div class="timing-col">
          <h4 class="timing-col-title" style="color:#00d2ff">${timing.post.title}</h4>
          ${postHTML}
        </div>
      </div>
      <div class="principles-panel card">
        <h4 class="principles-title">Principios basados en evidencia científica</h4>
        <ul class="principles-list">${principlesHTML}</ul>
      </div>
    `;

    const el = document.getElementById('nutrient-timing-wrap');
    if (el) el.innerHTML = timingHTML;
  }

  // ── Render banner de patrocinador (monetización no intrusiva) ─────────────
  function renderSponsorBanner() {
    const wrap = document.getElementById('sponsor-banner');
    if (!wrap || !window.HS_CONFIG) return;
    const sp = HS_CONFIG.SPONSOR;
    if (!sp.active) { wrap.style.display = 'none'; return; }

    wrap.innerHTML = `
      <div class="sponsor-inner">
        <span class="sponsor-label">PATROCINADOR</span>
        <a href="${sp.url}" target="_blank" rel="noopener sponsored" class="sponsor-link">
          <span class="sponsor-logo">${sp.logo}</span>
          <span class="sponsor-name">${sp.name}</span>
          <span class="sponsor-tagline">— ${sp.tagline}</span>
        </a>
        <button class="sponsor-dismiss" id="sponsor-dismiss" title="Ocultar">×</button>
      </div>
    `;

    document.getElementById('sponsor-dismiss')?.addEventListener('click', () => {
      wrap.style.display = 'none';
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (!window.HS_CONFIG) return;

    // Render secciones de macro/timing inmediatamente desde config.js (no dependen de la API)
    renderMacroInfo();
    renderTimingInfo();

    // Intentar cargar suplementos desde la API; si falla o tarda, usar config.js como fallback
    var _isProd = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    var _base   = _isProd ? ('https://' + location.hostname + '/api/v1') : 'http://localhost:8000/api/v1';

    var _timedOut = false;
    var _fallbackTimer = setTimeout(function() {
      _timedOut = true;
      renderSupplements(HS_CONFIG.SUPPLEMENTS);
    }, 3000); // 3s timeout — si la API no responde, usar config.js

    fetch(_base + '/nutrition/supplements')
      .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(data) {
        clearTimeout(_fallbackTimer);
        if (_timedOut) return; // ya se renderizó el fallback
        var list = Array.isArray(data) ? data : (data.supplements || data.items || []);
        renderSupplements(list.length ? list : HS_CONFIG.SUPPLEMENTS);
      })
      .catch(function() {
        clearTimeout(_fallbackTimer);
        if (!_timedOut) renderSupplements(HS_CONFIG.SUPPLEMENTS);
      });
  }

  return { init };
})();
