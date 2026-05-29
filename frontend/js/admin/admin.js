'use strict';
(function() {
  var TOKEN_KEY = 'hs_access_token';

  // ── Shared JWT parser (exported to window so other modules can use it) ──────
  function parseJwt(token) {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch(e) { return null; }
  }
  window.AdminParseJwt = parseJwt;

  // ── Auth ─────────────────────────────────────────────────────────────────────
  function checkAuth() {
    var token   = localStorage.getItem(TOKEN_KEY);
    if (!token) { location.href = '/'; return false; }
    var payload = parseJwt(token);
    if (!payload || payload.role !== 'admin') { location.href = '/'; return false; }
    var el = document.getElementById('admin-user-email');
    if (el) el.textContent = payload.email || 'Admin';
    return true;
  }

  // ── Section load cache (avoid reloading on every nav click) ──────────────────
  var _sectionLoaded = {};

  // ── Navigation ───────────────────────────────────────────────────────────────
  function navigate(section) {
    document.querySelectorAll('.admin-section').forEach(function(s) { s.style.display = 'none'; });
    document.querySelectorAll('.admin-nav-item').forEach(function(n) { n.classList.remove('active'); });

    var sec = document.getElementById('section-' + section);
    if (sec) sec.style.display = 'block';
    var nav = document.querySelector('[data-section="' + section + '"]');
    if (nav) nav.classList.add('active');

    // Load section — use cache flags where applicable
    if (section === 'overview' && typeof AdminStats !== 'undefined') {
      AdminStats.load();   // AdminStats manages its own _loaded flag
    }
    if (section === 'users' && typeof AdminUsers !== 'undefined') {
      AdminUsers.load();   // always refresh user list on nav
    }
    if (section === 'tables' && typeof AdminTables !== 'undefined' && !_sectionLoaded.tables) {
      AdminTables.load();
      _sectionLoaded.tables = true;
    }
    if (section === 'metrics' && typeof AdminMetrics !== 'undefined') {
      AdminMetrics.load();  // AdminMetrics manages its own _loaded flag
    }
    if (section === 'health' && typeof AdminHealth !== 'undefined') {
      AdminHealth.load();   // AdminHealth manages its own _loaded flag
    }
    if (section === 'system' && typeof AdminSystem !== 'undefined') {
      AdminSystem.load();   // always re-run system check on nav
    }
    if (section === 'security' && !_sectionLoaded.security) {
      // Inicializar Security Lab (renderiza la UI en section-security)
      import('/js/admin/adminSecurity.js').then(function(mod) {
        mod.initSecurityLab();
        _sectionLoaded.security = true;
      }).catch(function(e) { console.error('adminSecurity load error:', e); });
    }
  }

  // ── Logout ───────────────────────────────────────────────────────────────────
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('hs_refresh_token');
    localStorage.removeItem('hs_user');
    location.href = '/';
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    document.getElementById('admin-loading').style.display = 'none';
    document.getElementById('admin-app').style.display     = 'flex';

    document.querySelectorAll('.admin-nav-item').forEach(function(item) {
      item.addEventListener('click', function() { navigate(this.dataset.section); });
    });
    document.getElementById('admin-logout-btn').addEventListener('click', logout);

    navigate('overview');
  });
})();
