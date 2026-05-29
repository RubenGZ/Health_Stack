/**
 * adminSecurity.js — Security Lab para el Admin Panel
 * =====================================================
 * Módulo Black Hat / White Hat: ejecuta 17 ataques automatizados
 * contra la propia aplicación y muestra resultados en tiempo real.
 *
 * Uso:
 *   import { initSecurityLab } from './adminSecurity.js';
 *   initSecurityLab();
 */

'use strict';

const SECURITY_API = '/api/v1/security-lab';

const STATUS_CONFIG = {
  BLOCKED:    { icon: '🛡️', label: 'Bloqueado',     css: 'status-blocked'    },
  VULNERABLE: { icon: '🚨', label: 'Vulnerable',    css: 'status-vulnerable' },
  WARNING:    { icon: '⚠️', label: 'Advertencia',  css: 'status-warning'    },
  SKIPPED:    { icon: '⏭️', label: 'Saltado',       css: 'status-skipped'    },
};

const SEVERITY_CONFIG = {
  CRITICAL: { css: 'sev-critical', label: 'CRÍTICO' },
  HIGH:     { css: 'sev-high',     label: 'ALTO'    },
  MEDIUM:   { css: 'sev-medium',   label: 'MEDIO'   },
  LOW:      { css: 'sev-low',      label: 'BAJO'    },
  INFO:     { css: 'sev-info',     label: 'INFO'    },
};

const GRADE_CONFIG = {
  A: { css: 'grade-a', label: 'A', desc: 'Excelente' },
  B: { css: 'grade-b', label: 'B', desc: 'Bueno' },
  C: { css: 'grade-c', label: 'C', desc: 'Aceptable' },
  D: { css: 'grade-d', label: 'D', desc: 'Deficiente' },
  F: { css: 'grade-f', label: 'F', desc: 'Crítico' },
};

// ─── Estado ──────────────────────────────────────────────────────────────────

let _running = false;
let _lastReport = null;

// ─── HTML del módulo ─────────────────────────────────────────────────────────

function renderSecurityLabHTML() {
  return `
<div class="security-lab-container">

  <!-- Header y score -->
  <div class="security-lab-header">
    <div class="security-lab-title-row">
      <div>
        <h3 class="security-lab-title">🛡️ Security Lab</h3>
        <p class="security-lab-subtitle">17 ataques automatizados Black Hat · Contramedidas White Hat</p>
      </div>
      <button id="sl-run-btn" class="sl-btn sl-btn-primary" onclick="window.SecurityLab.runAudit()">
        <span class="sl-btn-icon">⚔️</span>
        <span id="sl-run-label">Lanzar Auditoría</span>
      </button>
    </div>

    <!-- Score card (oculto hasta primer run) -->
    <div id="sl-score-card" class="sl-score-card" style="display:none">
      <div class="sl-score-left">
        <div id="sl-grade-badge" class="sl-grade-badge grade-a">A</div>
        <div>
          <div id="sl-score-value" class="sl-score-value">100</div>
          <div class="sl-score-label">Security Score</div>
        </div>
      </div>
      <div class="sl-score-stats">
        <div class="sl-stat sl-stat-blocked">
          <span id="sl-count-blocked">0</span>
          <span>🛡️ Bloqueados</span>
        </div>
        <div class="sl-stat sl-stat-vulnerable">
          <span id="sl-count-vulnerable">0</span>
          <span>🚨 Vulnerables</span>
        </div>
        <div class="sl-stat sl-stat-warning">
          <span id="sl-count-warning">0</span>
          <span>⚠️ Advertencias</span>
        </div>
        <div class="sl-stat sl-stat-skipped">
          <span id="sl-count-skipped">0</span>
          <span>⏭️ Saltados</span>
        </div>
      </div>
      <div id="sl-summary-text" class="sl-summary-text"></div>
    </div>
  </div>

  <!-- Progress bar (visible durante el run) -->
  <div id="sl-progress-bar" class="sl-progress-bar" style="display:none">
    <div class="sl-progress-track">
      <div id="sl-progress-fill" class="sl-progress-fill" style="width:0%"></div>
    </div>
    <div id="sl-progress-label" class="sl-progress-label">Iniciando ataques…</div>
  </div>

  <!-- Filtros por categoría -->
  <div id="sl-filters" class="sl-filters" style="display:none">
    <button class="sl-filter-btn active" data-filter="all" onclick="window.SecurityLab.filterResults('all', this)">Todos</button>
    <button class="sl-filter-btn" data-filter="VULNERABLE" onclick="window.SecurityLab.filterResults('VULNERABLE', this)">🚨 Vulnerables</button>
    <button class="sl-filter-btn" data-filter="WARNING" onclick="window.SecurityLab.filterResults('WARNING', this)">⚠️ Advertencias</button>
    <button class="sl-filter-btn" data-filter="BLOCKED" onclick="window.SecurityLab.filterResults('BLOCKED', this)">🛡️ Bloqueados</button>
  </div>

  <!-- Lista de resultados -->
  <div id="sl-results-list" class="sl-results-list"></div>

  <!-- Estado vacío -->
  <div id="sl-empty-state" class="sl-empty-state">
    <div class="sl-empty-icon">🔒</div>
    <div class="sl-empty-title">Security Lab listo</div>
    <div class="sl-empty-desc">
      Ejecuta la auditoría para lanzar 17 ataques automatizados:<br>
      JWT confusion · AES nonce reuse · IDOR · SQL injection · CORS · RGPD Art. 9 y más
    </div>
  </div>

</div>`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

function injectSecurityLabStyles() {
  if (document.getElementById('sl-styles')) return;
  const style = document.createElement('style');
  style.id = 'sl-styles';
  style.textContent = `
/* Security Lab Container */
.security-lab-container { display: flex; flex-direction: column; gap: 16px; }

/* Header */
.security-lab-header { background: var(--hs-surface); border: 1px solid var(--hs-border); border-radius: var(--hs-r-lg); padding: 20px; }
.security-lab-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.security-lab-title { font-size: 1.2rem; font-weight: 700; color: var(--hs-text); margin: 0 0 4px 0; }
.security-lab-subtitle { font-size: 0.8rem; color: var(--hs-text-2); margin: 0; }

/* Score Card */
.sl-score-card { border-top: 1px solid var(--hs-border); padding-top: 16px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.sl-score-left { display: flex; align-items: center; gap: 12px; }
.sl-grade-badge { font-size: 2rem; font-weight: 900; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: var(--hs-r-md); flex-shrink: 0; }
.grade-a { background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 2px solid rgba(34,197,94,0.3); }
.grade-b { background: rgba(196, 165, 97, 0.15); color: var(--hs-accent); border: 2px solid rgba(196,165,97,0.3); }
.grade-c { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 2px solid rgba(251,191,36,0.3); }
.grade-d { background: rgba(249, 115, 22, 0.15); color: #f97316; border: 2px solid rgba(249,115,22,0.3); }
.grade-f { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 2px solid rgba(239,68,68,0.3); }
.sl-score-value { font-size: 1.8rem; font-weight: 800; color: var(--hs-text); line-height: 1; font-feature-settings: "tnum"; }
.sl-score-label { font-size: 0.7rem; color: var(--hs-text-2); text-transform: uppercase; letter-spacing: 0.05em; }
.sl-score-stats { display: flex; gap: 12px; flex-wrap: wrap; }
.sl-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; }
.sl-stat span:first-child { font-size: 1.4rem; font-weight: 800; font-feature-settings: "tnum"; }
.sl-stat span:last-child { font-size: 0.65rem; color: var(--hs-text-2); text-align: center; }
.sl-stat-vulnerable span:first-child { color: #ef4444; }
.sl-stat-warning span:first-child { color: #fbbf24; }
.sl-stat-blocked span:first-child { color: #22c55e; }
.sl-summary-text { font-size: 0.8rem; color: var(--hs-text-2); flex: 1; min-width: 200px; line-height: 1.5; }

/* Button */
.sl-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: var(--hs-r-md); font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; font: inherit; transition: all 150ms ease; white-space: nowrap; }
.sl-btn:active { transform: scale(0.97); }
.sl-btn-primary { background: var(--hs-accent); color: #07070f; box-shadow: 0 4px 16px rgba(196,165,97,0.25); }
.sl-btn-primary:hover { background: #d4b97a; }
.sl-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.sl-btn-icon { font-size: 1rem; }

/* Progress */
.sl-progress-bar { background: var(--hs-surface); border: 1px solid var(--hs-border); border-radius: var(--hs-r-lg); padding: 16px; }
.sl-progress-track { background: var(--hs-surface-2); border-radius: 999px; height: 6px; overflow: hidden; margin-bottom: 8px; }
.sl-progress-fill { height: 100%; background: linear-gradient(90deg, var(--hs-accent), #d4b97a); border-radius: 999px; transition: width 400ms ease; }
.sl-progress-label { font-size: 0.78rem; color: var(--hs-text-2); }

/* Filters */
.sl-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.sl-filter-btn { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--hs-border); background: transparent; color: var(--hs-text-2); font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: all 150ms ease; }
.sl-filter-btn:hover, .sl-filter-btn.active { background: var(--hs-accent-dim); color: var(--hs-accent); border-color: var(--hs-accent); }

/* Results */
.sl-results-list { display: flex; flex-direction: column; gap: 8px; }
.sl-attack-card { background: var(--hs-surface); border: 1px solid var(--hs-border); border-radius: var(--hs-r-md); overflow: hidden; transition: border-color 150ms ease; }
.sl-attack-card:hover { border-color: rgba(196,165,97,0.3); }
.sl-attack-card.is-vulnerable { border-left: 3px solid #ef4444; }
.sl-attack-card.is-warning   { border-left: 3px solid #fbbf24; }
.sl-attack-card.is-blocked   { border-left: 3px solid #22c55e; }
.sl-attack-card.is-skipped   { border-left: 3px solid rgba(255,255,255,0.15); opacity: 0.6; }

.sl-attack-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; user-select: none; }
.sl-attack-header:hover { background: rgba(255,255,255,0.02); }
.sl-attack-status-icon { font-size: 1.1rem; flex-shrink: 0; width: 24px; text-align: center; }
.sl-attack-info { flex: 1; min-width: 0; }
.sl-attack-name { font-size: 0.88rem; font-weight: 600; color: var(--hs-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sl-attack-meta { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.sl-attack-id { font-size: 0.68rem; font-family: monospace; background: var(--hs-surface-2); padding: 1px 5px; border-radius: 4px; color: var(--hs-text-3); }
.sl-attack-category { font-size: 0.72rem; color: var(--hs-text-2); }
.sl-attack-duration { font-size: 0.68rem; color: var(--hs-text-3); margin-left: auto; font-feature-settings: "tnum"; }
.sl-attack-status-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; flex-shrink: 0; }
.status-blocked    { background: rgba(34,197,94,0.15);  color: #22c55e; }
.status-vulnerable { background: rgba(239,68,68,0.15);  color: #ef4444; }
.status-warning    { background: rgba(251,191,36,0.15); color: #fbbf24; }
.status-skipped    { background: rgba(255,255,255,0.05); color: var(--hs-text-3); }

.sl-severity-badge { font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.sev-critical { background: rgba(239,68,68,0.2);  color: #ef4444; }
.sev-high     { background: rgba(249,115,22,0.2); color: #f97316; }
.sev-medium   { background: rgba(251,191,36,0.2); color: #fbbf24; }
.sev-low      { background: rgba(34,197,94,0.2);  color: #22c55e; }
.sev-info     { background: rgba(148,163,184,0.2); color: #94a3b8; }

/* Detail panel */
.sl-attack-detail { display: none; padding: 0 16px 16px 16px; border-top: 1px solid var(--hs-border); }
.sl-attack-detail.expanded { display: block; }
.sl-detail-section { margin-top: 12px; }
.sl-detail-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--hs-text-3); margin-bottom: 4px; }
.sl-detail-text { font-size: 0.82rem; color: var(--hs-text-2); line-height: 1.5; }
.sl-detail-finding { color: var(--hs-text); font-size: 0.82rem; line-height: 1.5; }
.sl-detail-recommendation { color: #22c55e; font-size: 0.82rem; line-height: 1.5; }
.sl-proof-box { background: var(--hs-surface-2); border-radius: var(--hs-r-sm); padding: 10px 12px; margin-top: 4px; }
.sl-proof-box pre { font-size: 0.72rem; color: var(--hs-text-2); margin: 0; font-family: 'Fira Code', monospace; white-space: pre-wrap; word-break: break-all; }

/* Empty state */
.sl-empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; text-align: center; }
.sl-empty-icon { font-size: 3rem; margin-bottom: 12px; }
.sl-empty-title { font-size: 1rem; font-weight: 700; color: var(--hs-text); margin-bottom: 8px; }
.sl-empty-desc { font-size: 0.82rem; color: var(--hs-text-2); line-height: 1.6; max-width: 400px; }

/* Shimmer para cards mientras cargan */
@keyframes sl-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.sl-skeleton {
  background: linear-gradient(90deg, var(--hs-surface) 25%, var(--hs-surface-2) 50%, var(--hs-surface) 75%);
  background-size: 200% 100%;
  animation: sl-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--hs-r-md);
  height: 60px;
}
`;
  document.head.appendChild(style);
}

// ─── Render de resultados ─────────────────────────────────────────────────────

function renderAttackCard(result, index) {
  const statusCfg = STATUS_CONFIG[result.status] || STATUS_CONFIG.SKIPPED;
  const severityCfg = SEVERITY_CONFIG[result.severity] || SEVERITY_CONFIG.INFO;
  const cardClass = result.status.toLowerCase();

  const proofHTML = result.proof
    ? `<div class="sl-detail-section">
        <div class="sl-detail-label">Evidencia técnica</div>
        <div class="sl-proof-box"><pre>${JSON.stringify(result.proof, null, 2)}</pre></div>
      </div>`
    : '';

  return `
<div class="sl-attack-card is-${cardClass}" data-status="${result.status}" data-index="${index}">
  <div class="sl-attack-header" onclick="window.SecurityLab.toggleDetail(${index})">
    <div class="sl-attack-status-icon">${statusCfg.icon}</div>
    <div class="sl-attack-info">
      <div class="sl-attack-name">${escapeHtml(result.name)}</div>
      <div class="sl-attack-meta">
        <span class="sl-attack-id">${result.id}</span>
        <span class="sl-attack-category">${escapeHtml(result.category)}</span>
        <span class="sl-severity-badge ${severityCfg.css}">${severityCfg.label}</span>
      </div>
    </div>
    <span class="sl-attack-duration">${result.duration_ms}ms</span>
    <span class="sl-attack-status-badge ${statusCfg.css}">${statusCfg.label}</span>
  </div>
  <div id="sl-detail-${index}" class="sl-attack-detail">
    <div class="sl-detail-section">
      <div class="sl-detail-label">Descripción del ataque (Black Hat)</div>
      <div class="sl-detail-text">${escapeHtml(result.description)}</div>
    </div>
    <div class="sl-detail-section">
      <div class="sl-detail-label">Resultado (White Hat)</div>
      <div class="sl-detail-finding">${escapeHtml(result.finding)}</div>
    </div>
    <div class="sl-detail-section">
      <div class="sl-detail-label">Recomendación</div>
      <div class="sl-detail-recommendation">${escapeHtml(result.recommendation)}</div>
    </div>
    ${proofHTML}
  </div>
</div>`;
}

function renderSkeletons(count = 6) {
  return Array.from({ length: count }, (_, i) =>
    `<div class="sl-skeleton" style="height:60px; margin-bottom:8px; animation-delay:${i * 0.1}s"></div>`
  ).join('');
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

async function runAudit() {
  if (_running) return;
  _running = true;

  const runBtn = document.getElementById('sl-run-btn');
  const runLabel = document.getElementById('sl-run-label');
  const progressBar = document.getElementById('sl-progress-bar');
  const progressFill = document.getElementById('sl-progress-fill');
  const progressLabel = document.getElementById('sl-progress-label');
  const resultsList = document.getElementById('sl-results-list');
  const emptyState = document.getElementById('sl-empty-state');
  const filters = document.getElementById('sl-filters');
  const scoreCard = document.getElementById('sl-score-card');

  // UI: inicio
  runBtn.disabled = true;
  runLabel.textContent = 'Ejecutando…';
  emptyState.style.display = 'none';
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';
  progressLabel.textContent = 'Iniciando batería de ataques…';
  resultsList.innerHTML = renderSkeletons(8);

  // Simular progreso mientras la API trabaja
  const ATTACK_LABELS = [
    'A: JWT Algorithm Confusion…',
    'A: JWT none Algorithm…',
    'A: Token Expirado…',
    'B: AES-GCM Nonce Reuse…',
    'B: Master Key entropía…',
    'B: HKDF separación…',
    'C: IDOR health records…',
    'C: Admin escalation…',
    'D: SQL Injection…',
    'D: Mass Assignment…',
    'E: Rate Limit Bypass…',
    'E: User Enumeration…',
    'F: PII en prompts IA…',
    'F: Pseudonimización AEPD…',
    'G: Security Headers…',
    'G: CORS wildcard…',
    'G: Reset token URL…',
  ];

  let progressStep = 0;
  const progressInterval = setInterval(() => {
    if (progressStep < ATTACK_LABELS.length) {
      const pct = Math.round(((progressStep + 1) / ATTACK_LABELS.length) * 90);
      progressFill.style.width = `${pct}%`;
      progressLabel.textContent = ATTACK_LABELS[progressStep];
      progressStep++;
    }
  }, 600);

  try {
    const token = localStorage.getItem('hs_admin_token') || localStorage.getItem('access_token') || '';

    const resp = await fetch(`${SECURITY_API}/run-audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    clearInterval(progressInterval);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Error desconocido' }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const report = await resp.json();
    _lastReport = report;

    // UI: completado
    progressFill.style.width = '100%';
    progressLabel.textContent = `✅ Auditoría completada — ${report.total_attacks} ataques en ~${Math.round(report.results.reduce((s, r) => s + r.duration_ms, 0) / 1000)}s`;

    setTimeout(() => {
      progressBar.style.display = 'none';
    }, 2000);

    // Actualizar score card
    updateScoreCard(report);
    scoreCard.style.display = 'flex';

    // Renderizar resultados
    renderResults(report.results);
    filters.style.display = 'flex';

  } catch (err) {
    clearInterval(progressInterval);
    progressBar.style.display = 'none';
    resultsList.innerHTML = `
      <div style="text-align:center; padding:32px; color:#ef4444;">
        <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
        <div style="font-weight:600;">Error al ejecutar auditoría</div>
        <div style="font-size:0.82rem; color:var(--hs-text-2); margin-top:4px;">${escapeHtml(err.message)}</div>
        <div style="font-size:0.75rem; color:var(--hs-text-3); margin-top:8px;">Comprueba que el backend está activo y el token admin es válido.</div>
      </div>`;
    emptyState.style.display = 'none';
  } finally {
    _running = false;
    runBtn.disabled = false;
    runLabel.textContent = '🔄 Re-ejecutar Auditoría';
  }
}

function updateScoreCard(report) {
  const gradeCfg = GRADE_CONFIG[report.grade] || GRADE_CONFIG.F;
  const gradeBadge = document.getElementById('sl-grade-badge');
  gradeBadge.textContent = report.grade;
  gradeBadge.className = `sl-grade-badge ${gradeCfg.css}`;

  document.getElementById('sl-score-value').textContent = report.score;
  document.getElementById('sl-count-blocked').textContent = report.blocked;
  document.getElementById('sl-count-vulnerable').textContent = report.vulnerable;
  document.getElementById('sl-count-warning').textContent = report.warning;
  document.getElementById('sl-count-skipped').textContent = report.skipped;
  document.getElementById('sl-summary-text').textContent = report.summary;
}

function renderResults(results) {
  const list = document.getElementById('sl-results-list');

  // Ordenar: VULNERABLE primero, luego WARNING, luego el resto
  const sorted = [...results].sort((a, b) => {
    const order = { VULNERABLE: 0, WARNING: 1, BLOCKED: 2, SKIPPED: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  list.innerHTML = sorted.map((r, i) => renderAttackCard(r, i)).join('');
}

function filterResults(filter, btn) {
  // Actualizar botones
  document.querySelectorAll('.sl-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Mostrar/ocultar cards
  document.querySelectorAll('.sl-attack-card').forEach(card => {
    if (filter === 'all' || card.dataset.status === filter) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function toggleDetail(index) {
  const detail = document.getElementById(`sl-detail-${index}`);
  if (detail) detail.classList.toggle('expanded');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initSecurityLab() {
  injectSecurityLabStyles();

  const section = document.getElementById('section-security');
  if (!section) return;

  section.innerHTML = renderSecurityLabHTML();

  // Exponer funciones en window para los onclick del HTML
  window.SecurityLab = {
    runAudit,
    filterResults,
    toggleDetail,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { initSecurityLab };
