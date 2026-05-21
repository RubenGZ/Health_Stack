/* ============================================================
   plan.js — Plan management & feature gating
   Tiers: free | pro | elite
   ============================================================ */

var Plan = (function () {
  'use strict';

  function _t(key) { return (window.t && window.t(key)) || key; }

  var LS_KEY = 'hs_plan'; // 'free' | 'pro' | 'elite'

  // Minimum plan required per section ID
  var REQUIRED = {
    'timing':        'pro',
    'records':       'pro',
    'receipt':       'pro',
    'fatigue':       'elite',
    'plateau':       'elite',
    'sessionreplay': 'elite',
    'bodycomp':      'elite',
    'deload':        'elite',
  };

  // Rest Timer FAB and Macro Autopilot tab → Pro
  // (handled separately since they're not full sections)

  var ORDER    = { free: 0, pro: 1, elite: 2 };
  var LABELS   = { free: 'Starter', pro: 'Pro', elite: 'Elite' };
  var COLORS   = { free: '#64748b', pro: '#6c63ff', elite: '#f59e0b' };

  function getFeatureNames() {
    return {
      'timing':        _t('plan.feat_timing'),
      'records':       _t('plan.feat_records'),
      'receipt':       _t('plan.feat_receipt'),
      'fatigue':       _t('plan.feat_fatigue'),
      'plateau':       _t('plan.feat_plateau'),
      'sessionreplay': _t('plan.feat_sessionreplay'),
      'bodycomp':      _t('plan.feat_bodycomp'),
      'deload':        _t('plan.feat_deload'),
      'restimer':      _t('plan.feat_restimer'),
      'autopilot':     _t('plan.feat_autopilot'),
    };
  }

  function getProPerks()   { return [_t('plan.perk_timing'), _t('plan.perk_records'), _t('plan.perk_receipt'), _t('plan.perk_restimer'), _t('plan.perk_autopilot')]; }
  function getElitePerks() { return [_t('plan.perk_fatigue'), _t('plan.perk_plateau'), _t('plan.perk_sessionreplay'), _t('plan.perk_bodycomp'), _t('plan.perk_deload')]; }

  // ── Core getters ────────────────────────────────────────────
  function get()  { return localStorage.getItem(LS_KEY) || 'free'; }
  function set(p) { localStorage.setItem(LS_KEY, p); }

  function rank(p)   { return ORDER[p] !== undefined ? ORDER[p] : 0; }
  function isPro()   { return rank(get()) >= 1; }
  function isElite() { return rank(get()) >= 2; }

  function can(sectionId) {
    var req = REQUIRED[sectionId];
    if (!req) return true;
    return rank(get()) >= rank(req);
  }

  function requiredFor(sectionId) {
    return REQUIRED[sectionId] || null;
  }

  // ── Upgrade modal ───────────────────────────────────────────
  function showUpgradeModal(featureKey, onUnlock) {
    var needPlan  = REQUIRED[featureKey] || 'pro';
    var isEliteFt = needPlan === 'elite';
    var featName  = getFeatureNames()[featureKey] || featureKey;
    var perks     = isEliteFt ? getElitePerks() : getProPerks();
    var color     = isEliteFt ? COLORS.elite : COLORS.pro;
    var icon      = isEliteFt ? '' : '';
    var label     = isEliteFt ? 'Elite' : 'Pro';

    var existing = document.getElementById('plan-upgrade-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id        = 'plan-upgrade-modal';
    overlay.className = 'plan-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', _t('plan.aria_upgrade'));

    overlay.innerHTML = [
      '<div class="plan-modal">',
        '<button class="plan-modal-close" id="plan-modal-close" aria-label="' + _t('plan.aria_close') + '">✕</button>',

        '<div class="plan-modal-icon" style="color:' + color + '">' + icon + '</div>',
        '<div class="plan-modal-badge" style="background:' + color + '">Plan ' + label + '</div>',

        '<h2 class="plan-modal-title">' + featName + '</h2>',
        '<p class="plan-modal-desc">' + _t('plan.desc').replace('{feat}', '<strong>' + featName + '</strong>').replace('{plan}', '<strong>' + label + '</strong>') + '</p>',

        '<ul class="plan-modal-perks">',
          perks.map(function (p) {
            return '<li><span class="plan-modal-check" style="color:' + color + '">✓</span> ' + p + '</li>';
          }).join(''),
        '</ul>',

        '<div class="plan-modal-actions">',
          '<a href="https://healthstack.pro/#pricing" target="_blank" rel="noopener"',
          '   class="btn btn--primary plan-modal-cta" style="--btn-bg:' + color + '">',
            _t('plan.see_pricing'),
          '</a>',
          '<button class="plan-modal-demo" id="plan-modal-demo">',
            _t('plan.demo_btn'),
          '</button>',
        '</div>',

        '<p class="plan-modal-note">',
          _t('plan.already_account') + ' <a href="https://healthstack.pro/login" target="_blank">' + _t('plan.login_link') + '</a>',
        '</p>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    document.getElementById('plan-modal-close').focus();

    // Close handlers
    document.getElementById('plan-modal-close').addEventListener('click', function () {
      overlay.remove();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    });

    // Demo mode — activate Elite for this session (sessionStorage, not localStorage)
    document.getElementById('plan-modal-demo').addEventListener('click', function () {
      set('elite');
      overlay.remove();
      updateBadge();
      applyNavLocks();
      applyFeatureLocks();
      if (typeof onUnlock === 'function') onUnlock();
    });
  }

  // ── Plan badge (user chip) ──────────────────────────────────
  function updateBadge() {
    var plan  = get();
    var badge = document.getElementById('plan-badge');
    if (!badge) return;
    if (plan === 'free') {
      badge.style.display = 'none';
      return;
    }
    badge.textContent    = LABELS[plan];
    badge.style.display  = '';
    badge.style.background = COLORS[plan];
    badge.className      = 'plan-badge plan-badge--' + plan;
  }

  // ── Nav item lock icons ─────────────────────────────────────
  function applyNavLocks() {
    var current = get();
    Object.keys(REQUIRED).forEach(function (sid) {
      var el = document.querySelector('[data-section="' + sid + '"].nav-item');
      if (!el) return;
      var locked = rank(current) < rank(REQUIRED[sid]);
      el.classList.toggle('nav-item--locked', locked);

      var lockEl = el.querySelector('.nav-lock-icon');
      if (locked && !lockEl) {
        var span = document.createElement('span');
        span.className        = 'nav-lock-icon';
        span.textContent      = '';
        span.setAttribute('aria-hidden', 'true');
        el.appendChild(span);
      } else if (!locked && lockEl) {
        lockEl.remove();
      }
    });
  }

  // ── Feature-level locks (FAB, tabs) ────────────────────────
  function applyFeatureLocks() {
    var pro = isPro();

    // Rest Timer FAB
    var fab = document.getElementById('rest-timer-fab');
    if (fab) fab.style.display = pro ? '' : 'none';

    // Macro Autopilot tab
    var autoTab = document.querySelector('.stab[data-tab="autopilot"]');
    if (autoTab) {
      autoTab.classList.toggle('stab--locked', !pro);
      var lockSpan = autoTab.querySelector('.tab-lock-icon');
      if (!pro && !lockSpan) {
        var sp = document.createElement('span');
        sp.className   = 'tab-lock-icon';
        sp.textContent = '';
        sp.setAttribute('aria-hidden', 'true');
        autoTab.appendChild(sp);
      } else if (pro && lockSpan) {
        lockSpan.remove();
      }
    }
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    updateBadge();
    applyNavLocks();
    applyFeatureLocks();
  }

  return {
    get:              get,
    set:              set,
    can:              can,
    isPro:            isPro,
    isElite:          isElite,
    requiredFor:      requiredFor,
    showUpgradeModal: showUpgradeModal,
    updateBadge:      updateBadge,
    applyNavLocks:    applyNavLocks,
    applyFeatureLocks:applyFeatureLocks,
    init:             init,
  };
})();
