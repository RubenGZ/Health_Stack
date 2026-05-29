/**
 * adminSecurity.js — Security Lab (v2)
 * ======================================
 * Black Hat / White Hat — 17 ataques automatizados.
 * Diseño: dark premium, gold accent, sin emojis como elementos estructurales.
 */

'use strict';

const SECURITY_API = '/api/v1/security-lab';

const STATUS_CONFIG = {
  BLOCKED:    { label: 'Bloqueado',    css: 'sl-blocked',    dot: '#22c55e' },
  VULNERABLE: { label: 'Vulnerable',   css: 'sl-vulnerable', dot: '#ef4444' },
  WARNING:    { label: 'Advertencia',  css: 'sl-warning',    dot: '#f59e0b' },
  SKIPPED:    { label: 'Saltado',      css: 'sl-skipped',    dot: '#475569' },
};

const SEVERITY_CONFIG = {
  CRITICAL: { label: 'CRÍTICO', css: 'sl-sev-crit',   color: '#ef4444' },
  HIGH:     { label: 'ALTO',    css: 'sl-sev-high',   color: '#f97316' },
  MEDIUM:   { label: 'MEDIO',   css: 'sl-sev-med',    color: '#f59e0b' },
  LOW:      { label: 'BAJO',    css: 'sl-sev-low',    color: '#22c55e' },
  INFO:     { label: 'INFO',    css: 'sl-sev-info',   color: '#64748b' },
};

const CATEGORIES = [
  { id: 'jwt',   icon: iconKey(),    label: 'JWT / Auth',       count: 3 },
  { id: 'crypto',icon: iconLock(),   label: 'Cifrado AES',      count: 3 },
  { id: 'access',icon: iconShield(), label: 'Control Acceso',   count: 2 },
  { id: 'inject',icon: iconBug(),    label: 'Inyección',        count: 2 },
  { id: 'rate',  icon: iconSpeed(),  label: 'Rate Limiting',    count: 2 },
  { id: 'rgpd',  icon: iconEye(),    label: 'RGPD Art.9',       count: 2 },
  { id: 'infra', icon: iconServer(), label: 'Infraestructura',  count: 3 },
];

let _running = false;
let _lastReport = null;

// ─────────────────────────────────────────────────────────────────────────────
// SVG Icons (inline, 16×16)
// ─────────────────────────────────────────────────────────────────────────────

function svg(d, extra = '') {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
}
function iconShield()  { return svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'); }
function iconKey()     { return svg('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'); }
function iconLock()    { return svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'); }
function iconBug()     { return svg('<path d="M8 2l1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2 1-3.9 2.5-5M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M18.5 16c1.5 1.1 2.5 3 2.5 5"/>'); }
function iconSpeed()   { return svg('<path d="M12 2v4M6.34 6.34 3.51 3.51M2 12H6M6.34 17.66l-2.83 2.83M12 22v-4M17.66 17.66l2.83 2.83M22 12h-4M17.66 6.34l2.83-2.83"/>'); }
function iconEye()     { return svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'); }
function iconServer()  { return svg('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>'); }
function iconPlay()    { return svg('<polygon points="5 3 19 12 5 21 5 3"/>'); }
function iconChevron() { return svg('<polyline points="6 9 12 15 18 9"/>'); }
function iconCheck()   { return svg('<polyline points="20 6 9 17 4 12"/>'); }
function iconAlert()   { return svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'); }
function iconRefresh() { return svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/>'); }

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('sl-v2-styles')) return;
  const s = document.createElement('style');
  s.id = 'sl-v2-styles';
  s.textContent = `
/* ── Layout ─────────────────────────────────────────────── */
.sl { display:flex; flex-direction:column; gap:20px; padding-bottom:40px; }

/* ── Hero header ────────────────────────────────────────── */
.sl-hero {
  position: relative;
  background: #161b22;
  border: 1px solid #30363d;
  border-top: 2px solid #c4a561;
  border-radius: 16px;
  padding: 28px 28px 24px;
  overflow: hidden;
}
.sl-hero::before {
  content: '';
  position: absolute;
  top: -40px; right: -40px;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(196,165,97,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.sl-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.sl-hero-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #c4a561;
  background: rgba(196,165,97,0.1);
  border: 1px solid rgba(196,165,97,0.2);
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 10px;
}
.sl-hero-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #e2e8f0;
  margin: 0 0 6px 0;
  line-height: 1.1;
}
.sl-hero-sub {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  margin: 0;
  line-height: 1.5;
}

/* ── Run Button ─────────────────────────────────────────── */
.sl-run-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  background: #c4a561;
  color: #07070f;
  border: none;
  border-radius: 12px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  font: inherit;
  transition: all 180ms cubic-bezier(0.4,0,0.2,1);
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 4px 20px rgba(196,165,97,0.3), 0 0 0 1px rgba(196,165,97,0.15);
  letter-spacing: -0.01em;
}
.sl-run-btn:hover:not(:disabled) {
  background: #d4b97a;
  box-shadow: 0 6px 28px rgba(196,165,97,0.45), 0 0 0 1px rgba(196,165,97,0.2);
  transform: translateY(-1px);
}
.sl-run-btn:active:not(:disabled) { transform: scale(0.97) translateY(0); }
.sl-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sl-run-btn svg { flex-shrink: 0; }

/* ── Category chips ─────────────────────────────────────── */
.sl-categories {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sl-cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  transition: all 150ms;
}
.sl-cat-chip svg { opacity: 0.6; }
.sl-cat-chip-count {
  margin-left: 2px;
  font-size: 0.65rem;
  background: rgba(255,255,255,0.08);
  padding: 1px 5px;
  border-radius: 999px;
  font-weight: 700;
}
.sl-cat-chip.sl-cat-done {
  background: rgba(34,197,94,0.08);
  border-color: rgba(34,197,94,0.2);
  color: #22c55e;
}
.sl-cat-chip.sl-cat-done svg { opacity: 1; }
.sl-cat-chip.sl-cat-issue {
  background: rgba(239,68,68,0.08);
  border-color: rgba(239,68,68,0.2);
  color: #ef4444;
}

/* ── Progress bar ───────────────────────────────────────── */
.sl-progress {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 16px 20px;
}
.sl-progress-track {
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 10px;
}
.sl-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #c4a561 0%, #d4b97a 100%);
  border-radius: 999px;
  transition: width 500ms cubic-bezier(0.4,0,0.2,1);
  box-shadow: 0 0 8px rgba(196,165,97,0.5);
}
.sl-progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sl-progress-label {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.45);
  font-variant-numeric: tabular-nums;
}
.sl-progress-pct {
  font-size: 0.78rem;
  font-weight: 700;
  color: #c4a561;
  font-feature-settings: "tnum";
}

/* ── Score panel ────────────────────────────────────────── */
.sl-score-panel {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 24px;
  align-items: center;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 16px;
  padding: 24px 28px;
  animation: sl-fade-in 400ms ease forwards;
}
@keyframes sl-fade-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}

/* Circular score gauge */
.sl-gauge { position: relative; width: 88px; height: 88px; flex-shrink: 0; }
.sl-gauge svg { transform: rotate(-90deg); }
.sl-gauge-track { fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 6; }
.sl-gauge-fill {
  fill: none;
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1), stroke 400ms;
}
.sl-gauge-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
}
.sl-gauge-score {
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: #e2e8f0;
  font-feature-settings: "tnum";
  line-height: 1;
}
.sl-gauge-grade {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Score counters */
.sl-score-counters {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.sl-counter {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sl-counter-value {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  font-feature-settings: "tnum";
  line-height: 1;
}
.sl-counter-label {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.35);
  font-weight: 500;
  white-space: nowrap;
}
.sl-counter-blocked .sl-counter-value  { color: #22c55e; }
.sl-counter-vuln .sl-counter-value     { color: #ef4444; }
.sl-counter-warning .sl-counter-value  { color: #f59e0b; }
.sl-counter-skipped .sl-counter-value  { color: rgba(255,255,255,0.25); }

/* Summary text */
.sl-score-summary {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  line-height: 1.6;
  max-width: 260px;
  text-align: right;
}
.sl-score-summary strong { color: #e2e8f0; font-weight: 600; }

/* ── Filters ─────────────────────────────────────────────── */
.sl-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.sl-filter-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: 4px;
}
.sl-filter-btn {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: transparent;
  color: rgba(255,255,255,0.4);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  font: inherit;
  transition: all 140ms;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sl-filter-btn:hover { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.7); }
.sl-filter-btn.active {
  background: rgba(196,165,97,0.12);
  border-color: rgba(196,165,97,0.3);
  color: #c4a561;
}
.sl-filter-btn.active-red {
  background: rgba(239,68,68,0.1);
  border-color: rgba(239,68,68,0.3);
  color: #ef4444;
}
.sl-filter-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

/* ── Results list ────────────────────────────────────────── */
.sl-results { display: flex; flex-direction: column; gap: 6px; }

/* ── Attack card ─────────────────────────────────────────── */
.sl-card {
  background: #161b22;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 150ms, background 150ms;
  animation: sl-card-in 300ms ease both;
}
@keyframes sl-card-in {
  from { opacity:0; transform:translateY(4px); }
  to   { opacity:1; transform:translateY(0); }
}
.sl-card:hover { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.01); }
.sl-card.sl-vulnerable { border-left: 2px solid #ef4444; }
.sl-card.sl-warning    { border-left: 2px solid #f59e0b; }
.sl-card.sl-blocked    { border-left: 2px solid rgba(34,197,94,0.5); }
.sl-card.sl-skipped    { opacity: 0.55; }

.sl-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  cursor: pointer;
  user-select: none;
}
.sl-card-header:hover { background: rgba(255,255,255,0.015); }

.sl-card-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sl-card-dot.sl-vulnerable { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.5); }
.sl-card-dot.sl-warning    { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.5); }
.sl-card-dot.sl-blocked    { background: #22c55e; }
.sl-card-dot.sl-skipped    { background: rgba(255,255,255,0.2); }

.sl-card-info { flex: 1; min-width: 0; }
.sl-card-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
}
.sl-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sl-card-id {
  font-size: 0.65rem;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-weight: 700;
  background: rgba(255,255,255,0.06);
  padding: 2px 6px;
  border-radius: 4px;
  color: rgba(255,255,255,0.3);
  letter-spacing: 0.04em;
}
.sl-card-category {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.3);
}
.sl-sev-badge {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
}
.sl-sev-crit { background: rgba(239,68,68,0.15);  color: #ef4444; }
.sl-sev-high { background: rgba(249,115,22,0.15); color: #f97316; }
.sl-sev-med  { background: rgba(245,158,11,0.15); color: #f59e0b; }
.sl-sev-low  { background: rgba(34,197,94,0.15);  color: #22c55e; }
.sl-sev-info { background: rgba(100,116,139,0.15); color: #64748b; }

.sl-card-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.sl-status-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
}
.sl-status-badge.sl-blocked    { background: rgba(34,197,94,0.1);  color: #22c55e; }
.sl-status-badge.sl-vulnerable { background: rgba(239,68,68,0.12); color: #ef4444; }
.sl-status-badge.sl-warning    { background: rgba(245,158,11,0.1); color: #f59e0b; }
.sl-status-badge.sl-skipped    { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.25); }

.sl-card-duration {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.2);
  font-feature-settings: "tnum";
  min-width: 40px;
  text-align: right;
}
.sl-card-chevron {
  color: rgba(255,255,255,0.2);
  transition: transform 200ms ease;
  flex-shrink: 0;
}
.sl-card.expanded .sl-card-chevron { transform: rotate(180deg); }

/* Detail panel */
.sl-detail {
  display: none;
  border-top: 1px solid rgba(255,255,255,0.05);
  padding: 16px 20px 16px 36px;
}
.sl-card.expanded .sl-detail { display: block; }
.sl-detail-row { margin-bottom: 14px; }
.sl-detail-row:last-child { margin-bottom: 0; }
.sl-detail-key {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.25);
  margin-bottom: 5px;
}
.sl-detail-val {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.55);
  line-height: 1.6;
}
.sl-detail-finding { color: #e2e8f0; }
.sl-detail-rec { color: #22c55e; }
.sl-detail-proof {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 6px;
}
.sl-detail-proof pre {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(255,255,255,0.4);
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

/* ── Empty state ─────────────────────────────────────────── */
.sl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px 40px;
  text-align: center;
}
.sl-empty-icon-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  margin-bottom: 24px;
}
.sl-empty-icon-bg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(196,165,97,0.06);
  border: 1px solid rgba(196,165,97,0.12);
  animation: sl-pulse 3s ease-in-out infinite;
}
@keyframes sl-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%       { transform: scale(1.1); opacity: 0.6; }
}
.sl-empty-icon-bg-2 {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: rgba(196,165,97,0.03);
  border: 1px solid rgba(196,165,97,0.06);
  animation: sl-pulse 3s ease-in-out infinite 0.5s;
}
.sl-empty-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c4a561;
}
.sl-empty-icon svg { width: 28px; height: 28px; }
.sl-empty-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.sl-empty-desc {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.35);
  line-height: 1.7;
  max-width: 380px;
  margin-bottom: 28px;
}
.sl-empty-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 440px;
}
.sl-empty-chip {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  padding: 4px 10px;
  border-radius: 6px;
}

/* ── Skeleton ────────────────────────────────────────────── */
@keyframes sl-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.sl-skel {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.03) 25%,
    rgba(255,255,255,0.06) 50%,
    rgba(255,255,255,0.03) 75%);
  background-size: 200% 100%;
  animation: sl-shimmer 1.5s ease-in-out infinite;
  border-radius: 12px;
}
`;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML del módulo
// ─────────────────────────────────────────────────────────────────────────────

function buildHTML() {
  const chips = CATEGORIES.map(c => `
    <div class="sl-cat-chip" data-cat="${c.id}">
      ${c.icon}
      ${c.label}
      <span class="sl-cat-chip-count">${c.count}</span>
    </div>`).join('');

  const attackChips = [
    'JWT Confusion', 'None Algorithm', 'Token Expirado',
    'AES Nonce Reuse', 'Master Key', 'HKDF Context',
    'IDOR Records', 'Admin Escalation', 'SQL Injection',
    'Mass Assignment', 'Rate Limit Bypass', 'User Enumeration',
    'PII en IA', 'Pseudonimización', 'Security Headers',
    'CORS Wildcard', 'Reset Token URL',
  ].map(a => `<span class="sl-empty-chip">${a}</span>`).join('');

  return `
<div class="sl">

  <!-- Hero header -->
  <div class="sl-hero">
    <div class="sl-hero-top">
      <div>
        <div class="sl-hero-label">
          ${iconShield()}
          Security Lab · v2.0
        </div>
        <h3 class="sl-hero-title">Auditoría de seguridad<br>automatizada</h3>
        <p class="sl-hero-sub">17 ataques · 7 categorías · Black Hat vs White Hat<br>Solo accesible por administradores</p>
      </div>
      <button id="sl-run-btn" class="sl-run-btn" onclick="window.SecurityLab.runAudit()">
        ${iconPlay()}
        <span id="sl-run-label">Lanzar Auditoría</span>
      </button>
    </div>
    <div class="sl-categories" id="sl-categories">${chips}</div>
  </div>

  <!-- Progress (hidden) -->
  <div id="sl-progress" class="sl-progress" style="display:none">
    <div class="sl-progress-track">
      <div id="sl-progress-fill" class="sl-progress-fill" style="width:0%"></div>
    </div>
    <div class="sl-progress-row">
      <div id="sl-progress-label" class="sl-progress-label">Iniciando…</div>
      <div id="sl-progress-pct" class="sl-progress-pct">0%</div>
    </div>
  </div>

  <!-- Score panel (hidden until first run) -->
  <div id="sl-score-panel" class="sl-score-panel" style="display:none">
    <div class="sl-gauge">
      <svg viewBox="0 0 88 88" width="88" height="88">
        <circle class="sl-gauge-track" cx="44" cy="44" r="36"/>
        <circle id="sl-gauge-fill" class="sl-gauge-fill" cx="44" cy="44" r="36"
          stroke-dasharray="226" stroke-dashoffset="226"/>
      </svg>
      <div class="sl-gauge-center">
        <div id="sl-gauge-score" class="sl-gauge-score">—</div>
        <div id="sl-gauge-grade" class="sl-gauge-grade"></div>
      </div>
    </div>
    <div class="sl-score-counters">
      <div class="sl-counter sl-counter-blocked">
        <div id="sl-cnt-blocked" class="sl-counter-value">0</div>
        <div class="sl-counter-label">Bloqueados</div>
      </div>
      <div class="sl-counter sl-counter-vuln">
        <div id="sl-cnt-vuln" class="sl-counter-value">0</div>
        <div class="sl-counter-label">Vulnerables</div>
      </div>
      <div class="sl-counter sl-counter-warning">
        <div id="sl-cnt-warn" class="sl-counter-value">0</div>
        <div class="sl-counter-label">Advertencias</div>
      </div>
      <div class="sl-counter sl-counter-skipped">
        <div id="sl-cnt-skip" class="sl-counter-value">0</div>
        <div class="sl-counter-label">Saltados</div>
      </div>
    </div>
    <div id="sl-summary" class="sl-score-summary"></div>
  </div>

  <!-- Filters (hidden) -->
  <div id="sl-filters" class="sl-filters" style="display:none">
    <span class="sl-filter-label">Filtrar</span>
    <button class="sl-filter-btn active" data-f="all" onclick="window.SecurityLab.filter('all',this)">Todos</button>
    <button class="sl-filter-btn" data-f="VULNERABLE" onclick="window.SecurityLab.filter('VULNERABLE',this)">
      <span class="sl-filter-dot" style="background:#ef4444"></span> Vulnerables
    </button>
    <button class="sl-filter-btn" data-f="WARNING" onclick="window.SecurityLab.filter('WARNING',this)">
      <span class="sl-filter-dot" style="background:#f59e0b"></span> Advertencias
    </button>
    <button class="sl-filter-btn" data-f="BLOCKED" onclick="window.SecurityLab.filter('BLOCKED',this)">
      <span class="sl-filter-dot" style="background:#22c55e"></span> Bloqueados
    </button>
  </div>

  <!-- Results -->
  <div id="sl-results" class="sl-results"></div>

  <!-- Empty state -->
  <div id="sl-empty" class="sl-empty">
    <div class="sl-empty-icon-wrap">
      <div class="sl-empty-icon-bg-2"></div>
      <div class="sl-empty-icon-bg"></div>
      <div class="sl-empty-icon">${svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 'width="28" height="28"')}</div>
    </div>
    <div class="sl-empty-title">Security Lab listo</div>
    <div class="sl-empty-desc">
      Ejecuta la auditoría completa para verificar que todos los vectores de ataque están bloqueados.<br>Los tests son no destructivos — nunca modifican datos.
    </div>
    <div class="sl-empty-chips">${attackChips}</div>
  </div>

</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderCard(r, i) {
  const sc = STATUS_CONFIG[r.status]   || STATUS_CONFIG.SKIPPED;
  const sv = SEVERITY_CONFIG[r.severity] || SEVERITY_CONFIG.INFO;

  const proofHTML = r.proof
    ? `<div class="sl-detail-row">
        <div class="sl-detail-key">Evidencia</div>
        <div class="sl-detail-proof"><pre>${esc(JSON.stringify(r.proof, null, 2))}</pre></div>
       </div>`
    : '';

  return `
<div class="sl-card ${sc.css}" data-status="${r.status}" data-idx="${i}">
  <div class="sl-card-header" onclick="window.SecurityLab.toggle(${i})">
    <div class="sl-card-dot ${sc.css}"></div>
    <div class="sl-card-info">
      <div class="sl-card-name">${esc(r.name)}</div>
      <div class="sl-card-meta">
        <span class="sl-card-id">${r.id}</span>
        <span class="sl-card-category">${esc(r.category)}</span>
        <span class="sl-sev-badge ${sv.css}">${sv.label}</span>
      </div>
    </div>
    <div class="sl-card-right">
      <span class="sl-card-duration">${r.duration_ms}ms</span>
      <span class="sl-status-badge ${sc.css}">${sc.label}</span>
      <span class="sl-card-chevron">${iconChevron()}</span>
    </div>
  </div>
  <div class="sl-detail">
    <div class="sl-detail-row">
      <div class="sl-detail-key">Descripción del ataque</div>
      <div class="sl-detail-val">${esc(r.description)}</div>
    </div>
    <div class="sl-detail-row">
      <div class="sl-detail-key">Resultado</div>
      <div class="sl-detail-val sl-detail-finding">${esc(r.finding)}</div>
    </div>
    <div class="sl-detail-row">
      <div class="sl-detail-key">Recomendación</div>
      <div class="sl-detail-val sl-detail-rec">${esc(r.recommendation)}</div>
    </div>
    ${proofHTML}
  </div>
</div>`;
}

function renderSkeletons(n = 8) {
  return Array.from({length: n}, (_, i) =>
    `<div class="sl-skel" style="height:56px;margin-bottom:6px;animation-delay:${i*0.07}s"></div>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Score gauge
// ─────────────────────────────────────────────────────────────────────────────

function GRADE_COLOR(g) {
  return { A:'#22c55e', B:'#84cc16', C:'#f59e0b', D:'#f97316', F:'#ef4444' }[g] || '#64748b';
}

function updateGauge(score, grade) {
  const circumference = 226; // 2π×36
  const offset = circumference - (score / 100) * circumference;
  const fill = document.getElementById('sl-gauge-fill');
  if (fill) {
    fill.style.strokeDashoffset = offset;
    fill.style.stroke = GRADE_COLOR(grade);
  }
  const scoreEl = document.getElementById('sl-gauge-score');
  if (scoreEl) scoreEl.textContent = score;
  const gradeEl = document.getElementById('sl-gauge-grade');
  if (gradeEl) {
    gradeEl.textContent = grade;
    gradeEl.style.color = GRADE_COLOR(grade);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category chips update after audit
// ─────────────────────────────────────────────────────────────────────────────

const CAT_MAP = {
  'Autenticación': 'jwt',
  'Cifrado':       'crypto',
  'Control de Acceso': 'access',
  'Inyección':     'inject',
  'Rate Limiting': 'rate',
  'Privacidad RGPD': 'rgpd',
  'Infraestructura': 'infra',
};

function updateCategoryChips(results) {
  const issues = {};
  results.forEach(r => {
    const cat = CAT_MAP[r.category];
    if (!cat) return;
    if (!issues[cat]) issues[cat] = 'ok';
    if (r.status === 'VULNERABLE') issues[cat] = 'vuln';
    else if (r.status === 'WARNING' && issues[cat] !== 'vuln') issues[cat] = 'warn';
  });

  CATEGORIES.forEach(c => {
    const chip = document.querySelector(`.sl-cat-chip[data-cat="${c.id}"]`);
    if (!chip) return;
    chip.classList.remove('sl-cat-done', 'sl-cat-issue');
    const state = issues[c.id];
    if (state === 'vuln' || state === 'warn') chip.classList.add('sl-cat-issue');
    else if (state === 'ok') chip.classList.add('sl-cat-done');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main audit runner
// ─────────────────────────────────────────────────────────────────────────────

const ATTACK_STEPS = [
  'A1 — JWT Algorithm Confusion…',
  'A2 — JWT none Algorithm…',
  'A3 — Token Expirado Replay…',
  'B1 — AES-GCM Nonce Reuse…',
  'B2 — Master Key Entropía…',
  'B3 — HKDF Context Separation…',
  'C1 — IDOR Health Records…',
  'C2 — Admin Escalation…',
  'D1 — SQL Injection…',
  'D2 — Mass Assignment…',
  'E1 — Rate Limit Bypass…',
  'E2 — User Enumeration…',
  'F1 — PII en Prompts IA…',
  'F2 — Pseudonimización AEPD…',
  'G1 — Security Headers…',
  'G2 — CORS Wildcard…',
  'G3 — Reset Token URL…',
];

async function runAudit() {
  if (_running) return;
  _running = true;

  const btn        = document.getElementById('sl-run-btn');
  const label      = document.getElementById('sl-run-label');
  const progressEl = document.getElementById('sl-progress');
  const fillEl     = document.getElementById('sl-progress-fill');
  const labelEl    = document.getElementById('sl-progress-label');
  const pctEl      = document.getElementById('sl-progress-pct');
  const emptyEl    = document.getElementById('sl-empty');
  const resultsEl  = document.getElementById('sl-results');
  const filtersEl  = document.getElementById('sl-filters');
  const scoreEl    = document.getElementById('sl-score-panel');

  // UI reset
  btn.disabled = true;
  label.textContent = 'Ejecutando…';
  emptyEl.style.display  = 'none';
  progressEl.style.display = 'block';
  fillEl.style.width = '0%';
  labelEl.textContent = 'Iniciando batería de ataques…';
  resultsEl.innerHTML = renderSkeletons(10);

  // Animate progress steps
  let step = 0;
  const interval = setInterval(() => {
    if (step < ATTACK_STEPS.length) {
      const pct = Math.round(((step + 1) / ATTACK_STEPS.length) * 88);
      fillEl.style.width = `${pct}%`;
      labelEl.textContent = ATTACK_STEPS[step];
      pctEl.textContent = `${pct}%`;
      step++;
    }
  }, 650);

  try {
    // _hsAdminToken expuesto por admin.js tras checkAuth() — forma más fiable
    const token = window._hsAdminToken
      || localStorage.getItem('hs_access_token')
      || localStorage.getItem('access_token')
      || '';
    const resp = await fetch(`${SECURITY_API}/run-audit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    clearInterval(interval);

    if (!resp.ok) {
      if (resp.status === 401) {
        throw new Error('Sesión expirada. Recarga la página (F5) y vuelve a intentarlo.');
      }
      if (resp.status === 403) {
        throw new Error('Acceso denegado. Solo administradores pueden ejecutar la auditoría.');
      }
      const err = await resp.json().catch(() => ({detail: `HTTP ${resp.status}`}));
      throw new Error(err.detail || `Error ${resp.status}`);
    }

    const report = await resp.json();
    _lastReport = report;

    // Progress: 100%
    fillEl.style.width = '100%';
    pctEl.textContent = '100%';
    labelEl.textContent = `Completado — ${report.total_attacks} ataques · ${report.vulnerable} vulnerabilidades · ${report.warning} advertencias`;

    setTimeout(() => { progressEl.style.display = 'none'; }, 2500);

    // Score panel
    document.getElementById('sl-cnt-blocked').textContent = report.blocked;
    document.getElementById('sl-cnt-vuln').textContent    = report.vulnerable;
    document.getElementById('sl-cnt-warn').textContent    = report.warning;
    document.getElementById('sl-cnt-skip').textContent    = report.skipped;

    const sumEl = document.getElementById('sl-summary');
    sumEl.innerHTML = report.summary.replace(/(ALERTA|vulnerabilidad|Vulnerable)/gi, m => `<strong>${m}</strong>`);

    scoreEl.style.display = 'grid';
    setTimeout(() => updateGauge(report.score, report.grade), 50);

    // Category chips
    updateCategoryChips(report.results);

    // Render results (sorted: VULNERABLE → WARNING → BLOCKED → SKIPPED)
    const order = { VULNERABLE:0, WARNING:1, BLOCKED:2, SKIPPED:3 };
    const sorted = [...report.results].sort((a,b) => (order[a.status]??9)-(order[b.status]??9));
    resultsEl.innerHTML = sorted.map((r, i) => renderCard(r, i)).join('');

    filtersEl.style.display = 'flex';

  } catch (err) {
    clearInterval(interval);
    progressEl.style.display = 'none';
    resultsEl.innerHTML = `
      <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:12px;padding:24px;text-align:center">
        <div style="color:#ef4444;font-size:0.875rem;font-weight:600;margin-bottom:6px">${iconAlert()} Error al ejecutar la auditoría</div>
        <div style="color:rgba(255,255,255,0.35);font-size:0.78rem">${esc(err.message)}</div>
        <div style="color:rgba(255,255,255,0.2);font-size:0.72rem;margin-top:8px">Verifica que el backend está activo y tu token es válido</div>
      </div>`;
    emptyEl.style.display = 'none';
  } finally {
    _running = false;
    btn.disabled = false;
    btn.innerHTML = `${iconRefresh()} <span id="sl-run-label">Re-ejecutar</span>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function filter(val, btn) {
  document.querySelectorAll('.sl-filter-btn').forEach(b => b.classList.remove('active', 'active-red'));
  if (btn) btn.classList.add(val === 'VULNERABLE' ? 'active-red' : 'active');
  document.querySelectorAll('.sl-card').forEach(card => {
    card.style.display = (val === 'all' || card.dataset.status === val) ? '' : 'none';
  });
}

function toggle(idx) {
  const card = document.querySelector(`.sl-card[data-idx="${idx}"]`);
  if (card) card.classList.toggle('expanded');
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

function initSecurityLab() {
  injectStyles();
  const section = document.getElementById('section-security');
  if (!section) return;

  // Preserve h2 title, replace body
  const h2 = section.querySelector('h2');
  section.innerHTML = '';
  if (h2) section.appendChild(h2);

  const container = document.createElement('div');
  container.innerHTML = buildHTML();
  section.appendChild(container.firstElementChild);

  window.SecurityLab = { runAudit, filter, toggle };
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export { initSecurityLab };
