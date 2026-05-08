'use strict';
(function() {
  var TOKEN_KEY = 'hs_access_token';

  function parseJwt(token) {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    } catch(e) { return null; }
  }

  function checkAuth() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) { location.href = '/'; return false; }
    var payload = parseJwt(token);
    if (!payload || payload.role !== 'admin') { location.href = '/'; return false; }
    // Show user email in topbar
    var el = document.getElementById('admin-user-email');
    if (el) el.textContent = payload.email || 'Admin';
    return true;
  }

  function navigate(section) {
    document.querySelectorAll('.admin-section').forEach(function(s) { s.style.display = 'none'; });
    document.querySelectorAll('.admin-nav-item').forEach(function(n) { n.classList.remove('active'); });
    var sec = document.getElementById('section-' + section);
    if (sec) sec.style.display = 'block';
    var nav = document.querySelector('[data-section="' + section + '"]');
    if (nav) nav.classList.add('active');
    // Lazy load section
    if (section === 'overview' && typeof AdminStats !== 'undefined') AdminStats.load();
    if (section === 'users' && typeof AdminUsers !== 'undefined') AdminUsers.load();
    if (section === 'tables' && typeof AdminTables !== 'undefined') AdminTables.load();
    if (section === 'metrics' && typeof AdminMetrics !== 'undefined') AdminMetrics.load();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('hs_refresh_token');
    localStorage.removeItem('hs_user');
    location.href = '/';
  }

  document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    document.getElementById('admin-loading').style.display = 'none';
    document.getElementById('admin-app').style.display = 'flex';

    document.querySelectorAll('.admin-nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        navigate(this.dataset.section);
      });
    });

    document.getElementById('admin-logout-btn').addEventListener('click', logout);

    navigate('overview');
  });
})();
