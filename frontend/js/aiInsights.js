/**
 * aiInsights.js — Dashboard AI Insights card
 * Fetches biomarker narrative, injury risk and weekly goals
 * from /api/v1/ai-insights/* and renders them in the dashboard card.
 */

(function () {
  'use strict';

  const BASE = '/api/v1/ai-insights';
  const CACHE_KEY_PREFIX = 'ai_insights_cache_';
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  function _cacheKey() {
    return CACHE_KEY_PREFIX + ((window.getLanguage && window.getLanguage()) || 'es');
  }

  function t(key) {
    return (window.t && window.t(key)) || key;
  }

  function getToken() {
    return localStorage.getItem('hs_access_token') || '';
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  async function fetchInsights() {
    const token = getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const lang = (window.getLanguage && window.getLanguage()) || 'es';

    const [narrative, risk, goals] = await Promise.allSettled([
      fetch(`${BASE}/biomarker-narrative?lang=${lang}`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${BASE}/injury-risk?lang=${lang}`,         { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${BASE}/weekly-goals?lang=${lang}`,        { headers }).then(r => r.ok ? r.json() : null),
    ]);

    return {
      narrative: narrative.status === 'fulfilled' ? narrative.value : null,
      risk:      risk.status === 'fulfilled'      ? risk.value      : null,
      goals:     goals.status === 'fulfilled'     ? goals.value     : null,
    };
  }

  function trendIcon(trend) {
    const map = {
      improving:         '<span class="ai-trend-icon ai-trend-icon--up">↑</span>',
      declining:         '<span class="ai-trend-icon ai-trend-icon--down">↓</span>',
      stable:            '<span class="ai-trend-icon ai-trend-icon--stable">→</span>',
      insufficient_data: '<span class="ai-trend-icon ai-trend-icon--unknown">?</span>',
    };
    return map[trend] || '';
  }

  function riskBadge(level) {
    const map = {
      low:    'background:rgba(34,197,94,0.15);color:#22c55e',
      medium: 'background:rgba(245,158,11,0.15);color:#f59e0b',
      high:   'background:rgba(239,68,68,0.15);color:#ef4444',
    };
    const labelKey = { low: 'ai_insights.risk_low', medium: 'ai_insights.risk_medium', high: 'ai_insights.risk_high' };
    const label = t(labelKey[level] || level);
    return `<span class="ai-risk-badge" style="${map[level] || ''}">${label}</span>`;
  }

  function categoryDot(cat) {
    const map = {
      weight:   'ai-cat-dot--weight',
      training: 'ai-cat-dot--training',
      nutrition: 'ai-cat-dot--nutrition',
      recovery: 'ai-cat-dot--recovery',
    };
    return `<span class="ai-cat-dot ${map[cat] || 'ai-cat-dot--default'}"></span>`;
  }

  // Store last data so we can re-render on language change without re-fetching
  let _lastData = null;

  // ── Renderizado completo (para el panel de detalle) ─────────────
  function _buildFullHTML(data) {
    const { narrative, risk, goals } = data;
    let html = '<div class="ai-insights-sections">';

    if (narrative && narrative.narrative) {
      html += `
        <div class="ai-section">
          <div class="ai-section-label">
            <span class="ai-section-label-bar"></span>
            ${t('ai_insights.current_status')}
            ${trendIcon(narrative.trend)}
          </div>
          <p class="ai-narrative">${narrative.narrative}</p>
          ${narrative.highlights?.length ? `
            <div class="ai-highlights-scroll">
              ${narrative.highlights.map(h => `<span class="ai-highlight-pill">${h}</span>`).join('')}
            </div>` : ''}
        </div>`;
    }

    if (risk) {
      html += `
        <div class="ai-section">
          <div class="ai-section-label">
            <span class="ai-section-label-bar"></span>
            ${t('ai_insights.injury_risk')}
            ${riskBadge(risk.overall_risk)}
          </div>
          <p class="ai-narrative">${risk.summary}</p>
          ${risk.risk_flags?.length ? `
            <div class="ai-risk-flags">
              ${risk.risk_flags.map(f => `
                <div class="ai-risk-flag">
                  <span class="ai-risk-group">${f.muscle_group}</span>
                  ${riskBadge(f.risk_level)}
                  <span class="ai-risk-detail">${f.recommendation}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>`;
    }

    if (goals && goals.goals?.length) {
      html += `
        <div class="ai-section">
          <div class="ai-section-label">
            <span class="ai-section-label-bar"></span>
            ${t('ai_insights.weekly_goals')}
          </div>
          <div class="ai-goals">
            ${goals.goals.map(g => `
              <div class="ai-goal-item">
                ${categoryDot(g.category)}
                <div class="ai-goal-content">
                  <strong>${g.goal}</strong>
                  <span class="ai-goal-reason">${g.reasoning}</span>
                </div>
              </div>`).join('')}
          </div>
          ${goals.week_summary ? `<p class="ai-week-summary">${goals.week_summary}</p>` : ''}
        </div>`;
    }

    html += '</div>';
    return html;
  }

  // ── Panel de detalle full-screen ─────────────────────────────
  function _openDetailPanel(data) {
    let panel = document.getElementById('ai-detail-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ai-detail-panel';
      panel.className = 'ai-detail-panel';
      panel.innerHTML = `
        <div class="ai-detail-header">
          <button class="ai-detail-back" id="ai-detail-back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Atrás
          </button>
          <span class="ai-detail-title">Análisis IA</span>
          <div style="width:60px"></div>
        </div>
        <div class="ai-detail-body" id="ai-detail-body"></div>
      `;
      document.body.appendChild(panel);
      panel.querySelector('#ai-detail-back').addEventListener('click', _closeDetailPanel);
    }
    panel.querySelector('#ai-detail-body').innerHTML = _buildFullHTML(data);
    requestAnimationFrame(() => panel.classList.add('ai-detail-panel--open'));
  }

  function _closeDetailPanel() {
    const panel = document.getElementById('ai-detail-panel');
    if (!panel) return;
    panel.classList.remove('ai-detail-panel--open');
  }

  // ── Renderizado compacto en la card del dashboard ────────────
  function renderInsights(data) {
    const el = document.getElementById('ai-insights-content');
    if (!el) return;

    _lastData = data;
    const { narrative, risk, goals } = data;

    // Fila compacta: estado
    const statusRow = narrative ? `
      <div class="ai-compact-row" data-action="detail">
        <span class="ai-compact-label">${t('ai_insights.current_status')}</span>
        <span class="ai-compact-value">${trendIcon(narrative.trend)}
          ${narrative.highlights?.[0] ? `<span class="ai-compact-hint">${narrative.highlights[0]}</span>` : ''}
        </span>
      </div>` : '';

    // Fila compacta: riesgo
    const riskRow = risk ? `
      <div class="ai-compact-row" data-action="detail">
        <span class="ai-compact-label">${t('ai_insights.injury_risk')}</span>
        <span class="ai-compact-value">${riskBadge(risk.overall_risk)}</span>
      </div>` : '';

    // Fila compacta: objetivos
    const goalsRow = goals?.goals?.length ? `
      <div class="ai-compact-row" data-action="detail">
        <span class="ai-compact-label">${t('ai_insights.weekly_goals')}</span>
        <span class="ai-compact-value ai-compact-hint">${goals.goals[0]?.goal || ''}</span>
      </div>` : '';

    const anyData = statusRow || riskRow || goalsRow;
    if (!anyData) { el.innerHTML = `<p class="ai-insights-error">${t('ai_insights.error')}</p>`; return; }

    el.innerHTML = `
      <div class="ai-compact-list">
        ${statusRow}${riskRow}${goalsRow}
      </div>
      <button class="ai-compact-cta" id="ai-see-more">
        Ver análisis completo
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    `;

    el.querySelector('#ai-see-more')?.addEventListener('click', () => _openDetailPanel(data));
    el.querySelectorAll('[data-action="detail"]').forEach(row => {
      row.addEventListener('click', () => _openDetailPanel(data));
    });
  }

  function renderError() {
    const el = document.getElementById('ai-insights-content');
    if (el) {
      el.innerHTML = `<p class="ai-insights-error">${t('ai_insights.error')}</p>`;
    }
  }

  function setLoading(state) {
    const el = document.getElementById('ai-insights-content');
    if (el && state) {
      el.innerHTML = `
        <div class="ai-insights-loading">
          <div class="ai-insights-spinner"></div>
          <span>${t('ai_insights.loading')}</span>
        </div>`;
    }
  }

  async function loadInsights(force = false) {
    if (!isLoggedIn()) return;

    const card = document.getElementById('ai-insights-card');
    if (card) card.style.display = '';

    // Check cache (per-language key)
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(_cacheKey()) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          renderInsights(cached.data);
          return;
        }
      } catch (_) {}
    }

    setLoading(true);

    try {
      const data = await fetchInsights();
      localStorage.setItem(_cacheKey(), JSON.stringify({ ts: Date.now(), data }));
      renderInsights(data);
    } catch (err) {
      console.warn('[aiInsights] error:', err);
      renderError();
    }
  }

  function init() {
    // Load on dashboard section activate
    window.addEventListener('hs:section-changed', e => {
      if (e.detail?.section === 'dashboard') loadInsights();
    });

    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh-insights');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => loadInsights(true));
    }

    // Load immediately if on dashboard and logged in
    if (isLoggedIn()) {
      const activeSection = document.querySelector('.section.active');
      if (activeSection?.id === 'section-dashboard') {
        loadInsights();
      }
    }

    // Re-load after login
    window.addEventListener('hs:login', () => loadInsights(true));

    // On language change: try cache for new language, else re-fetch from AI
    document.addEventListener('languagechange', () => {
      const activeSection = document.querySelector('.section.active');
      if (activeSection?.id === 'section-dashboard') {
        loadInsights(false); // will use per-language cache if available
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.aiInsights = { load: loadInsights };
})();
