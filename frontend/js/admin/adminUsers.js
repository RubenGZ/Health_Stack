'use strict';
var AdminUsers = (function() {
  var _offset = 0;
  var _limit = 20;
  var _allUsers = [];
  var _ownId = null;

  function parseJwt(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch(e) { return null; }
  }

  function getOwnId() {
    if (_ownId) return _ownId;
    var p = parseJwt(localStorage.getItem('hs_access_token') || '');
    _ownId = p ? p.sub : null;
    return _ownId;
  }

  function badge(cls, text) {
    return '<span class="badge badge-' + cls + '">' + text + '</span>';
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', {day:'2-digit',month:'short',year:'numeric'});
  }

  function renderTable(users) {
    var tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay usuarios</td></tr>'; return; }
    var ownId = getOwnId();
    tbody.innerHTML = users.map(function(u) {
      var isSelf = u.id === ownId;
      var selfTitle = isSelf ? ' title="No puedes modificar tu propia cuenta"' : '';
      var disabledAttr = isSelf ? ' disabled' : '';
      return '<tr>' +
        '<td><span class="tag">' + u.id.substring(0,8) + '</span></td>' +
        '<td>' + u.email + '</td>' +
        '<td>' + (u.display_name || '—') + '</td>' +
        '<td>' + badge(u.role, u.role) + '</td>' +
        '<td>' + badge(u.plan, u.plan) + '</td>' +
        '<td>' + badge(u.is_active ? 'active' : 'suspended', u.is_active ? 'Activo' : 'Suspendido') + '</td>' +
        '<td>' + formatDate(u.last_login_at) + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-ghost btn-toggle-active"' + selfTitle + disabledAttr + ' data-id="' + u.id + '" data-active="' + u.is_active + '">' + (u.is_active ? 'Suspender' : 'Activar') + '</button> ' +
          '<button class="btn btn-ghost btn-toggle-role"' + selfTitle + disabledAttr + ' data-id="' + u.id + '" data-role="' + u.role + '">' + (u.role === 'admin' ? '→ User' : '→ Admin') + '</button> ' +
          '<button class="btn btn-primary btn-change-plan"' + selfTitle + disabledAttr + ' data-id="' + u.id + '" data-plan="' + u.plan + '">Plan</button>' +
        '</td></tr>';
    }).join('');
    bindActions();
  }

  function bindActions() {
    document.querySelectorAll('.btn-toggle-active').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var active = this.dataset.active === 'true';
        AdminAPI.patchUser(id, {is_active: !active}).then(function() { load(); }).catch(function(e) { alert(e.message); });
      });
    });
    document.querySelectorAll('.btn-toggle-role').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var role = this.dataset.role;
        var newRole = role === 'admin' ? 'user' : 'admin';
        if (!confirm('¿Cambiar rol a ' + newRole + '?')) return;
        AdminAPI.patchUser(id, {role: newRole}).then(function() { load(); }).catch(function(e) { alert(e.message); });
      });
    });
    document.querySelectorAll('.btn-change-plan').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showPlanModal(this.dataset.id, this.dataset.plan);
      });
    });
  }

  function showPlanModal(userId, currentPlan) {
    var overlay = document.getElementById('plan-modal-overlay');
    var radios = overlay.querySelectorAll('input[name="plan-radio"]');
    radios.forEach(function(r) { r.checked = r.value === currentPlan; });
    overlay.style.display = 'flex';
    overlay.dataset.userId = userId;
  }

  function hidePlanModal() {
    document.getElementById('plan-modal-overlay').style.display = 'none';
  }

  function load() {
    AdminAPI.getUsers(_offset, _limit).then(function(users) {
      _allUsers = users;
      applyFilter();
      updatePagination(users.length);
    }).catch(function(e) { console.error('Users error:', e); });
  }

  function applyFilter() {
    var q = (document.getElementById('users-search') ? document.getElementById('users-search').value : '').toLowerCase();
    var filtered = q ? _allUsers.filter(function(u) { return u.email.toLowerCase().includes(q); }) : _allUsers;
    renderTable(filtered);
  }

  function updatePagination(count) {
    var info = document.getElementById('users-page-info');
    if (info) info.textContent = 'Mostrando ' + (_offset + 1) + '–' + (_offset + count);
    var prevBtn = document.getElementById('users-prev');
    var nextBtn = document.getElementById('users-next');
    if (prevBtn) prevBtn.disabled = _offset === 0;
    if (nextBtn) nextBtn.disabled = count < _limit;
  }

  document.addEventListener('DOMContentLoaded', function() {
    var searchInput = document.getElementById('users-search');
    if (searchInput) searchInput.addEventListener('input', applyFilter);

    var prevBtn = document.getElementById('users-prev');
    var nextBtn = document.getElementById('users-next');
    if (prevBtn) prevBtn.addEventListener('click', function() { if (_offset > 0) { _offset -= _limit; load(); } });
    if (nextBtn) nextBtn.addEventListener('click', function() { _offset += _limit; load(); });

    var confirmBtn = document.getElementById('plan-modal-confirm');
    var cancelBtn = document.getElementById('plan-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', hidePlanModal);
    if (confirmBtn) confirmBtn.addEventListener('click', function() {
      var overlay = document.getElementById('plan-modal-overlay');
      var selected = overlay.querySelector('input[name="plan-radio"]:checked');
      if (!selected) return;
      AdminAPI.patchUser(overlay.dataset.userId, {plan: selected.value}).then(function() {
        hidePlanModal();
        load();
      }).catch(function(e) { alert(e.message); });
    });
  });

  return { load: load };
})();
