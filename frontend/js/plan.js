/* ============================================================
   plan.js — Plan management & feature gating
   Tiers: free | pro | elite
   Phase system: progressive nav unlocks
   Beta mode: full access for testers (hs_beta_mode=true)
   ============================================================ */

var Plan = (function () {
  'use strict';

  function _t(key) { return (window.t && window.t(key)) || key; }

  var LS_KEY         = 'hs_plan';           // 'free' | 'pro' | 'elite'
  var LS_BETA        = 'hs_beta_mode';      // 'true' → full access, no restrictions
  var LS_FIRST_USE   = 'hs_first_use';      // timestamp ms, set on first launch
  var LS_SESS_COUNT  = 'hs_session_count';  // int, incremented on each workout saved

  // ── Phase system ────────────────────────────────────────────
  // Phase 1 = always visible (MVP core)
  // Phase 2 = visible after 2+ days since first use
  // Phase 3 = locked until consistency milestones
  var NAV_PHASES = {
    // Phase 3 — beta mode only (o consistency milestones / elite)
    'planner': 3, 'rehab': 3, 'records': 3, 'suplementos': 3,
    'timing': 3, 'deload': 3, 'bodycomp': 3,
    'fatigue': 3, 'plateau': 3, 'sessionreplay': 3,
    'receipt': 3, 'ranked': 3,
  };

  // Features unlocked by consistency milestones (Idea 1)
  // key = sectionId, value = { sessions: N, label: '...' }
  var CONSISTENCY_MILESTONES = {
    'sessionreplay': { sessions: 20,  label: 'Session Replay',       months: 1  },
    'bodycomp':      { sessions: 80,  label: 'Body Comp Forecast',    months: 6  },
    'receipt':       { sessions: 180, label: 'Athlete Receipt',       months: 12 },
  };

  function isBeta()      { return localStorage.getItem(LS_BETA) === 'true'; }
  function enableBeta()  {
    localStorage.setItem(LS_BETA, 'true');
    if (get() === 'free') set('pro'); // beta testers get pro features
    init();
    _showToast('Modo beta activado — acceso completo habilitado');
  }
  function disableBeta() {
    localStorage.removeItem(LS_BETA);
    init();
    _showToast('Modo beta desactivado');
  }

  function _showToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:#c4a561;color:#fff;padding:10px 18px;border-radius:8px;font-size:.85rem;' +
      'z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 3000);
  }

  function getDaysSinceFirstUse() {
    var stored = localStorage.getItem(LS_FIRST_USE);
    if (!stored) {
      localStorage.setItem(LS_FIRST_USE, String(Date.now()));
      return 0;
    }
    return Math.floor((Date.now() - parseInt(stored, 10)) / 86400000);
  }

  function getSessionCount() {
    return parseInt(localStorage.getItem(LS_SESS_COUNT) || '0', 10);
  }

  function incrementSessionCount() {
    var n = getSessionCount() + 1;
    localStorage.setItem(LS_SESS_COUNT, String(n));
    _checkConsistencyUnlocks(n);
    return n;
  }

  function _checkConsistencyUnlocks(count) {
    Object.keys(CONSISTENCY_MILESTONES).forEach(function(sid) {
      var m = CONSISTENCY_MILESTONES[sid];
      if (count >= m.sessions) {
        var key = 'hs_unlocked_' + sid;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          _triggerUnlockCelebration(sid, m.label);
        }
      }
    });
  }

  function isConsistencyUnlocked(sectionId) {
    return localStorage.getItem('hs_unlocked_' + sectionId) === 'true';
  }

  function _triggerUnlockCelebration(sectionId, featureLabel) {
    var banner = document.getElementById('unlock-celebration');
    if (!banner) return;
    var lbl = banner.querySelector('#unlock-feature-name');
    if (lbl) lbl.textContent = featureLabel;
    banner.style.display = 'flex';
    applyPhasedNav();
    setTimeout(function() { banner.style.display = 'none'; }, 5000);
  }

  function canSeeSection(sectionId) {
    if (isBeta()) return true;
    var phase = NAV_PHASES[sectionId] || 1;
    if (phase === 1) return true;
    if (phase === 2) return getDaysSinceFirstUse() >= 2;
    if (phase === 3) {
      // Check consistency unlock
      if (isConsistencyUnlocked(sectionId)) return true;
      // Fallback: elite plan sees everything
      if (isElite()) return true;
      return false;
    }
    return true;
  }

  function applyPhasedNav() {
    document.querySelectorAll('.nav-item[data-section]').forEach(function(el) {
      var sid = el.getAttribute('data-section');
      el.style.display = canSeeSection(sid) ? '' : 'none';
    });
    // Hide group labels when all items below them are hidden
    document.querySelectorAll('.nav-group-label').forEach(function(label) {
      var sib = label.nextElementSibling;
      var anyVisible = false;
      while (sib && !sib.classList.contains('nav-group-label') && !sib.id) {
        if (sib.classList.contains('nav-item') && sib.style.display !== 'none') {
          anyVisible = true; break;
        }
        sib = sib.nextElementSibling;
      }
      label.style.display = anyVisible ? '' : 'none';
    });
    // Update consistency progress widget if present
    _updateConsistencyWidget();
  }

  function _updateConsistencyWidget() {
    var widget = document.getElementById('consistency-progress-widget');
    if (!widget) return;
    var count = getSessionCount();
    // Find next milestone
    var milestones = Object.keys(CONSISTENCY_MILESTONES)
      .map(function(sid) { return Object.assign({ sid: sid }, CONSISTENCY_MILESTONES[sid]); })
      .sort(function(a, b) { return a.sessions - b.sessions; });
    var next = milestones.filter(function(m) { return count < m.sessions; })[0];
    var completed = milestones.filter(function(m) { return count >= m.sessions; }).length;
    if (!next) {
      widget.querySelector('#cp-label').textContent = 'Todo desbloqueado';
      widget.querySelector('#cp-bar-fill').style.width = '100%';
      widget.querySelector('#cp-count').textContent = count + ' sesiones';
      return;
    }
    var pct = Math.min(100, Math.round((count / next.sessions) * 100));
    widget.querySelector('#cp-label').textContent =
      next.label + ' — ' + count + ' / ' + next.sessions + ' sesiones';
    widget.querySelector('#cp-bar-fill').style.width = pct + '%';
    widget.querySelector('#cp-count').textContent =
      (next.sessions - count) + ' sesiones para desbloquear';
    widget.querySelector('#cp-milestones-done').textContent =
      completed + ' / ' + milestones.length + ' desbloqueados';
  }

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
  var COLORS   = { free: '#64748b', pro: '#c4a561', elite: '#f59e0b' };

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
      var locked = !isBeta() && rank(current) < rank(REQUIRED[sid]);
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
    getDaysSinceFirstUse(); // ensure first-use timestamp is set
    updateBadge();
    applyNavLocks();
    applyFeatureLocks();
    applyPhasedNav();
  }

  return {
    get:                    get,
    set:                    set,
    can:                    can,
    isPro:                  isPro,
    isElite:                isElite,
    requiredFor:            requiredFor,
    showUpgradeModal:       showUpgradeModal,
    updateBadge:            updateBadge,
    applyNavLocks:          applyNavLocks,
    applyFeatureLocks:      applyFeatureLocks,
    applyPhasedNav:         applyPhasedNav,
    canSeeSection:          canSeeSection,
    isBeta:                 isBeta,
    enableBeta:             enableBeta,
    disableBeta:            disableBeta,
    getSessionCount:        getSessionCount,
    incrementSessionCount:  incrementSessionCount,
    isConsistencyUnlocked:  isConsistencyUnlocked,
    CONSISTENCY_MILESTONES: CONSISTENCY_MILESTONES,
    init:                   init,
  };
})();
