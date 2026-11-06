/* Ползунок «до/после» на страницах альбомов (tools/gen-gost-pages.js → блок «До и после»).
   Тянуть мышью или пальцем, стрелки ←/→ (Shift — шаг крупнее), Home/End.
   Переключатели: этаж (data-floor), что показать после (data-kind: мебель / декор),
   режим (data-mode: разделить / только как есть / только как будет), лупа — во весь экран. Без зависимостей. */
(function () {
  'use strict';
  function stage(el, onMove) {
    var before = el.querySelector('.cmp-b');
    var handle = el.querySelector('.cmp-h');
    var p = 50, drag = false;
    function set(v, quiet) {
      p = Math.max(0, Math.min(100, v));
      el.style.setProperty('--p', p + '%');
      handle.setAttribute('aria-valuenow', Math.round(p));
      handle.setAttribute('aria-valuetext', p < 3 ? 'как будет' : p > 97 ? 'как есть' : Math.round(p) + '% — как есть');
      if (!quiet) onMove(p);
    }
    function at(e) {
      var r = el.getBoundingClientRect();
      set((e.clientX - r.left) / r.width * 100);
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      drag = true; el.classList.add('is-drag');
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      at(e); handle.focus({ preventScroll: true });
    });
    el.addEventListener('pointermove', function (e) { if (drag) at(e); });
    function stop() { drag = false; el.classList.remove('is-drag'); }
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    handle.addEventListener('keydown', function (e) {
      var s = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(p - s);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(p + s);
      else if (e.key === 'Home') set(0);
      else if (e.key === 'End') set(100);
      else return;
      e.preventDefault();
    });
    set(50, true);
    return { set: set, el: el, before: before, get p() { return p; } };
  }

  function box(root) {
    var modes = [].slice.call(root.querySelectorAll('[data-mode]:not(.cmp-zoom)'));
    function markMode(p) {
      root.classList.add('touched');
      var m = p >= 99.5 ? 'before' : p <= 0.5 ? 'after' : 'split';
      modes.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === m ? 'true' : 'false'); });
    }
    var stages = [].map.call(root.querySelectorAll('.cmp-stage'), function (el) { return stage(el, markMode); });
    var caps = root.querySelectorAll('.cmp-cap');
    var floorBtns = [].slice.call(root.querySelectorAll('[data-floor]:not(.cmp-stage)'));
    var kindBtns = [].slice.call(root.querySelectorAll('[data-kind]:not(.cmp-stage)'));
    var floor = stages[0].el.getAttribute('data-floor');
    var kind = stages[0].el.getAttribute('data-kind');
    var cur = 0;
    function find(f, k) {
      for (var i = 0; i < stages.length; i++) {
        var e = stages[i].el;
        if (e.getAttribute('data-floor') === f && (k == null || e.getAttribute('data-kind') === k)) return i;
      }
      return -1;
    }
    function render() {
      var i = find(floor, kind);
      if (i < 0) { i = find(floor, null); kind = stages[i].el.getAttribute('data-kind'); }
      var p = stages[cur].p;
      cur = i;
      stages.forEach(function (s, k) { s.el.hidden = k !== i; });
      [].forEach.call(caps, function (c, k) { c.hidden = k !== i; });
      stages[i].set(p, true);
      floorBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-floor') === floor ? 'true' : 'false'); });
      kindBtns.forEach(function (b) {
        var k = b.getAttribute('data-kind');
        b.disabled = find(floor, k) < 0;
        b.setAttribute('aria-pressed', k === kind ? 'true' : 'false');
      });
    }
    floorBtns.forEach(function (b) { b.addEventListener('click', function () { floor = b.getAttribute('data-floor'); render(); }); });
    kindBtns.forEach(function (b) { b.addEventListener('click', function () { kind = b.getAttribute('data-kind'); render(); }); });
    [].forEach.call(root.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        if (m === 'full') {
          var f = root.querySelector('.cmp-frame');
          if (document.fullscreenElement) document.exitFullscreen();
          else if (f.requestFullscreen) f.requestFullscreen();
          else window.open(stages[cur].before.querySelector('img').getAttribute('src'), '_blank');
          return;
        }
        stages[cur].set(m === 'before' ? 100 : m === 'after' ? 0 : 50);
      });
    });
    render();
  }
  [].forEach.call(document.querySelectorAll('[data-cmp]'), box);
})();
