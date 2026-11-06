/* Ползунок «до/после» на страницах альбомов (tools/gen-gost-pages.js → блок «До и после»).
   Тянуть мышью или пальцем, стрелки ←/→ (Shift — шаг крупнее), Home/End; режимы «Разделить / Как есть / Как будет»,
   «Во весь экран». Без зависимостей. */
(function () {
  'use strict';
  function stage(el) {
    var before = el.querySelector('.cmp-b');
    var handle = el.querySelector('.cmp-h');
    var p = 50, drag = false;
    function set(v) {
      p = Math.max(0, Math.min(100, v));
      el.style.setProperty('--p', p + '%');
      handle.setAttribute('aria-valuenow', Math.round(p));
      handle.setAttribute('aria-valuetext', p < 3 ? 'как будет' : p > 97 ? 'как есть' : Math.round(p) + '% — как есть');
    }
    function at(e) {
      var r = el.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      set(x / r.width * 100);
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
    set(50);
    return { set: set, el: el, before: before };
  }

  function box(root) {
    var stages = [].map.call(root.querySelectorAll('.cmp-stage'), stage);
    var tabs = root.querySelectorAll('.cmp-tab');
    var caps = root.querySelectorAll('.cmp-cap');
    var cur = 0;
    function show(i) {
      cur = i;
      stages.forEach(function (s, k) { s.el.hidden = k !== i; });
      [].forEach.call(caps, function (c, k) { c.hidden = k !== i; });
      [].forEach.call(tabs, function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    }
    [].forEach.call(tabs, function (t, k) { t.addEventListener('click', function () { show(k); }); });
    [].forEach.call(root.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        if (m === 'full') {
          var f = root.querySelector('.cmp-frame');
          if (document.fullscreenElement) document.exitFullscreen();
          else if (f.requestFullscreen) f.requestFullscreen();
          else window.open(stages[cur].before.getAttribute('src'), '_blank');
          return;
        }
        stages[cur].set(m === 'before' ? 100 : m === 'after' ? 0 : 50);
      });
    });
    show(0);
  }
  [].forEach.call(document.querySelectorAll('[data-cmp]'), box);
})();
