'use strict';
var AdminAPI = (function() {
  var TOKEN_KEY = 'hs_access_token';
  var IS_PROD = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  var BASE = IS_PROD ? ('https://' + location.hostname + '/api/v1/admin') : 'http://localhost:8000/api/v1/admin';

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

  function req(path, method, body) {
    method = method || 'GET';
    var opts = {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(BASE + path, opts).then(function(r) {
      if (r.status === 401 || r.status === 403) { location.href = '/'; return; }
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || r.status); });
      return r.json();
    });
  }

  return {
    getOverview:      function() { return req('/stats/overview'); },
    getTimeseries:    function(days) { return req('/stats/timeseries?days=' + (days||30)); },
    getModules:       function() { return req('/stats/modules'); },
    getTableList:     function() { return req('/db/tables'); },
    getTableData:     function(name, page, limit) { return req('/db/tables/' + name + '?page=' + (page||1) + '&limit=' + (limit||50)); },
    getMetrics:       function() { return req('/metrics/technical'); },
    getUsers:         function(offset, limit) { return req('/users?offset=' + (offset||0) + '&limit=' + (limit||20)); },
    patchUser:        function(id, body) { return req('/users/' + id, 'PATCH', body); },
  };
})();
