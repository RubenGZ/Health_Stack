'use strict';
var AdminTables = (function() {
  var _currentTable = null;
  var _currentPage = 1;

  function load() {
    AdminAPI.getTableList().then(function(tables) {
      var list = document.getElementById('tables-list');
      if (!list) return;
      list.innerHTML = tables.map(function(t) {
        return '<div class="table-item" data-name="' + t.table_name + '" style="padding:10px 16px;cursor:pointer;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">' +
          '<span>' + t.table_name + '</span>' +
          '<span class="tag">' + (t.approx_count || 0).toLocaleString() + ' rows</span>' +
        '</div>';
      }).join('');
      list.querySelectorAll('.table-item').forEach(function(item) {
        item.addEventListener('click', function() {
          list.querySelectorAll('.table-item').forEach(function(i) { i.style.background = ''; });
          this.style.background = 'rgba(0,212,170,0.1)';
          _currentTable = this.dataset.name;
          _currentPage = 1;
          loadTableData();
        });
      });
    });
  }

  function loadTableData() {
    if (!_currentTable) return;
    document.getElementById('table-data-title').textContent = _currentTable;
    AdminAPI.getTableData(_currentTable, _currentPage, 50).then(function(rows) {
      renderTableData(rows);
    }).catch(function(e) { console.error('Table data error:', e); });
  }

  function renderTableData(rows) {
    var container = document.getElementById('table-data-container');
    if (!container) return;
    if (!rows.length) { container.innerHTML = '<div class="empty-state">No hay datos</div>'; return; }
    var cols = Object.keys(rows[0]);
    var html = '<table class="admin-table"><thead><tr>' +
      cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function(row) {
        return '<tr>' + cols.map(function(c) {
          var v = row[c];
          if (v === null || v === undefined) return '<td>—</td>';
          if (v === '[ENCRYPTED]') return '<td><span class="tag" style="color:#da3633">[ENCRYPTED]</span></td>';
          if (v === '[HASH]') return '<td><span class="tag" style="color:#7d8590">[HASH]</span></td>';
          var str = String(v);
          if (str.length > 60) str = str.substring(0, 60) + '…';
          return '<td>' + str + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';
    html += '<div class="pagination">' +
      '<button class="btn btn-ghost" id="table-prev" ' + (_currentPage === 1 ? 'disabled' : '') + '>← Anterior</button>' +
      '<span style="color:#7d8590;font-size:0.875rem">Página ' + _currentPage + '</span>' +
      '<button class="btn btn-ghost" id="table-next" ' + (rows.length < 50 ? 'disabled' : '') + '>Siguiente →</button>' +
    '</div>';
    container.innerHTML = html;
    var prev = document.getElementById('table-prev');
    var next = document.getElementById('table-next');
    if (prev) prev.addEventListener('click', function() { if (_currentPage > 1) { _currentPage--; loadTableData(); } });
    if (next) next.addEventListener('click', function() { _currentPage++; loadTableData(); });
  }

  return { load: load };
})();
