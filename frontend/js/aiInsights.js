/**
 * aiInsights.js — Dashboard AI Insights card
 * Fetches biomarker narrative, injury risk and weekly goals
 * from /api/v1/ai-insights/* and renders them in the dashboard card.
 */

(function () {
  'use strict';

  const BASE = '/api/v1/ai-insights';
  const CACHE_KEY = 'ai_insights_cache';
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  function getToken() {
    return localStorage.getItem('access_token') || '';
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  async function fetchInsights() {
    const token = getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const [narrative, risk, goals] = await Promise.allSettled([
      fetch(`${BASE}/biomarker-narrative`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${BASE}/injury-risk`,         { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${BASE}/weekly-goals`,         { headers }).then(r => r.ok ? r.json() : null),
    ]);

    return {
      narrative: narrative.status === 'fulfilled' ? narrative.value : null,
      risk:      risk.status === 'fulfilled'      ? risk.value      : null,
      goals:     goals.status === 'fulfilled'     ? goals.value     : null,
    };
  }

  function trendIcon(trend) {
    const map = {
      improving:         '<span style="color:#22c55e">↑</span>',
      declining:         '<span style="color:#ef4444">↓</span>',
      stable:            '<span style="color:#f59e0b">→</span>',
      insufficient_data: '<span style="color:#6b7280">?</span>',
    };
    return map[trend] || '';
  }

  function riskBadge(level) {
    const map = {
      low:    'background:rgba(34,197,94,0.15);color:#22c55e',
      medium: 'background:rgba(245,158,11,0.15);color:#f59e0b',
      high:   'background:rgba(239,68,68,0.15);color:#ef4444',
    };
    const label = { low: 'Bajo', medium: 'Medio', high: 'Alto' };
    return `<span class="ai-risk-badge" style="${map[level] || ''}">${label[level] || level}</span>`;
  }

  function categoryIcon(cat) {
    const map = {
      weight:   '⚖️',
      training: '🏋️',
      nutrition: '🥗',
      recovery: '😴',
    };
    return map[cat] || '🎯';
  }

  function renderInsights(data) {
    const el = document.getElementById('ai-insights-content');
    if (!el) return;

    const { narrative, risk, goals } = data;
    let html = '<div class="ai-insights-sections">';

    // ── Biomarker narrative ──────────────────────────────────────
    if (narrative && narrative.narrative) {
      html += `
        <div class="ai-section">
          <div class="ai-section-label">📊 Estado actual ${trendIcon(narrative.trend)}</div>
          <p class="ai-narrative">${narrative.narrative}</p>
          ${narrative.highlights?.length ? `
            <ul class="ai-highlights">
              ${narrative.highlights.map(h => `<li>${h}</li>`).join('')}
            </ul>` : ''}
        </div>`;
    }

    // ── Injury risk ──────────────────────────────────────────────
    if (risk) {
      html += `
        <div class="ai-section">
          <div class="ai-section-label">🛡️ Riesgo de lesión ${riskBadge(risk.overall_risk)}</div>
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

    // ── Weekly goals ─────────────────────────────────────────────
    if (goals && goals.goals?.length) {
      html += `
        <div class="ai-section">
          <div class="ai-section-label">🎯 Objetivos de esta semana</div>
          <div class="ai-goals">
            ${goals.goals.map(g => `
              <div class="ai-goal-item">
                <span class="ai-goal-icon">${categoryIcon(g.category)}</span>
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
    el.innerHTML = html;
  }

  function renderError() {
    const el = document.getElementById('ai-insights-content');
    if (el) {
      el.innerHTML = '<p class="ai-insights-error">No se pudo cargar el análisis. Inténtalo más tarde.</p>';
    }
  }

  function setLoading(state) {
    const el = document.getElementById('ai-insights-content');
    if (el && state) {
      el.innerHTML = `
        <div class="ai-insights-loading">
          <div class="ai-insights-spinner"></div>
          <span>Generando tu análisis personalizado…</span>
        </div>`;
    }
  }

  async function loadInsights(force = false) {
    if (!isLoggedIn()) return;

    const card = document.getElementById('ai-insights-card');
    if (card) card.style.display = '';

    // Check cache
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          renderInsights(cached.data);
          return;
        }
      } catch (_) {}
    }

    setLoading(true);

    try {
      const data = await fetchInsights();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      renderInsights(data);
    } catch (err) {
      console.warn('[aiInsights] error:', err);
      renderError();
    }
  }

  function init() {
    // Load on dashboard section activate
    document.addEventListener('sectionChanged', e => {
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
    document.addEventListener('userLoggedIn', () => loadInsights(true));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.aiInsights = { load: loadInsights };
})();
