/**
 * Decap preSave: auto-assign `order` for new poems so they land at the top
 * of their category without colliding with existing integers.
 *
 * Rule: if order is blank/missing → (min order in same category) − 1.
 * If the category has no poems yet → 1.
 * Existing / manually entered order values are left unchanged.
 */
(function () {
  var POEM_COLLECTIONS = {
    poems_new: true,
    poems_rookie: true,
    poems_notice: true,
  };

  function parseOrder(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).trim());
    return Number.isFinite(n) ? n : null;
  }

  function isBlankOrder(v) {
    return v == null || v === '';
  }

  function extractPoemsArray(text) {
    var trimmed = String(text || '').trim();
    var eq = trimmed.indexOf('=');
    if (eq < 0) return null;
    var jsonPart = trimmed.slice(eq + 1).trim();
    if (jsonPart.charAt(jsonPart.length - 1) === ';') {
      jsonPart = jsonPart.slice(0, -1).trim();
    }
    try {
      return JSON.parse(jsonPart);
    } catch (e) {
      return null;
    }
  }

  function minOrderInCategory(poems, category, excludeId) {
    var min = null;
    if (!Array.isArray(poems)) return null;
    for (var i = 0; i < poems.length; i++) {
      var p = poems[i];
      if (!p || p.category !== category) continue;
      if (excludeId != null && Number(p.id) === Number(excludeId)) continue;
      var o = parseOrder(p.order);
      if (o == null) continue;
      if (min == null || o < min) min = o;
    }
    return min;
  }

  function fetchPublishedPoems() {
    function load(url) {
      return fetch(url + '?_=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error(url + ' ' + res.status);
          return res.text();
        })
        .then(function (text) {
          var poems = extractPoemsArray(text);
          if (!poems) throw new Error('could not parse ' + url);
          return poems;
        });
    }
    // Prefer light index; poems.js is the same light alias for back-compat.
    return load('/poems-index.js').catch(function () {
      return load('/poems.js');
    });
  }

  CMS.registerEventListener({
    name: 'preSave',
    handler: function (event) {
      var entry = event.entry;
      var collection = entry.get('collection');
      if (!POEM_COLLECTIONS[collection]) return entry.get('data');

      var data = entry.get('data');
      if (!isBlankOrder(data.get('order'))) return data;

      var category = data.get('category') || '';
      var excludeId = data.get('id');

      return fetchPublishedPoems()
        .then(function (poems) {
          var min = minOrderInCategory(poems, category, excludeId);
          var next = min == null ? 1 : min - 1;
          // Keep one decimal place when min was fractional (e.g. 0.5 → -0.5).
          if (Math.abs(next % 1) > 1e-9) {
            next = Math.round(next * 10) / 10;
          }
          return data.set('order', next);
        })
        .catch(function () {
          // Offline / parse failure: still put new posts above typical defaults.
          return data.set('order', 0);
        });
    },
  });
})();
