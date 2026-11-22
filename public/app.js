(function () {
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // 年齢確認
  var yes = document.getElementById('age-yes');
  if (yes) yes.addEventListener('click', function () {
    try { localStorage.setItem('age_ok', '1'); } catch (e) {}
    document.documentElement.classList.remove('age-pending');
  });

  // NGジャンル
  var ng = store.get('ng', []);
  var cards = $$('.row, .tile');
  var filters = {};

  function apply() {
    var hiddenByNg = 0;
    cards.forEach(function (el) {
      var gs = (el.getAttribute('data-g') || '').split('|');
      var isNg = ng.some(function (n) { return gs.indexOf(n) >= 0; });
      var price = parseFloat(el.dataset.price), rev = parseFloat(el.dataset.rev), off = parseFloat(el.dataset.off);
      var out = (filters.rev45 && !(rev >= 4.5)) || (filters.u1000 && !(price <= 1000)) || (filters.sale && !(off > 0));
      if (isNg) hiddenByNg++;
      el.hidden = isNg || (el.classList.contains('row') && out);
    });
    $$('[data-ng-note]').forEach(function (n) {
      n.hidden = !hiddenByNg;
      n.innerHTML = 'NGジャンルで' + hiddenByNg + '件を非表示（<a href="/ng/">設定</a>）';
    });
    $$('[data-ng]').forEach(function (b) { b.setAttribute('aria-pressed', ng.indexOf(b.dataset.ng) >= 0 ? 'true' : 'false'); });
  }

  $$('[data-ng]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = ng.indexOf(b.dataset.ng);
      if (i >= 0) ng.splice(i, 1); else ng.push(b.dataset.ng);
      store.set('ng', ng); apply();
    });
  });
  $$('[data-ng-clear]').forEach(function (b) { b.addEventListener('click', function () { ng = []; store.set('ng', ng); apply(); }); });

  // 並び替えと絞り込み
  $$('[data-tools]').forEach(function (bar) {
    var list = document.querySelector('.list');
    if (!list) return;
    var rows = $$('.row', list);
    rows.forEach(function (r, i) { r.dataset.i = i; });
    var sel = bar.querySelector('[data-sort]');
    sel.addEventListener('change', function () {
      var k = sel.value;
      var val = function (r) { var v = parseFloat(r.dataset[k]); return isNaN(v) ? null : v; };
      var desc = k === 'off' || k === 'rev';
      rows.slice().sort(function (a, b) {
        if (!k) return a.dataset.i - b.dataset.i;
        var x = val(a), y = val(b);
        if (x === null && y === null) return a.dataset.i - b.dataset.i;
        if (x === null) return 1;
        if (y === null) return -1;
        return (desc ? y - x : x - y) || a.dataset.i - b.dataset.i;
      }).forEach(function (r) { list.appendChild(r); });
    });
    $$('[data-f]', bar).forEach(function (b) {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        filters[b.dataset.f] = !filters[b.dataset.f];
        b.setAttribute('aria-pressed', filters[b.dataset.f] ? 'true' : 'false');
        apply();
      });
    });
  });

  apply();
})();
