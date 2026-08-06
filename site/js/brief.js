// LINEA · бриф-визард → brief.json
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STEPS = ['Объект', 'Помещения', 'Стиль', 'Вопросы', 'Контакты', 'Готово'];
  const STYLES = [
    { key: 'studio',  title: 'На усмотрение студии', note: 'подберём по вашим ответам', sw: ['#EDE7DC', '#C29A5B', '#8A8D80', '#3E3A34'] },
    { key: 'japandi', title: 'Джапанди', note: 'тёплый минимализм, дерево', sw: ['#EDE7DC', '#C8A97A', '#8A8D80', '#A67B5B'] },
    { key: 'scandi',  title: 'Скандинавский', note: 'светло, уютно, функционально', sw: ['#F2F0EA', '#D9BE93', '#9FB4A8', '#C96F4A'] },
    { key: 'minimal', title: 'Минимализм', note: 'чистая геометрия, микроцемент', sw: ['#ECECE8', '#C9BBA6', '#A9A9A3', '#6E6E68'] },
    { key: 'modern',  title: 'Современный', note: 'глубокие акценты, латунь, трек', sw: ['#E9E4DB', '#A97B4F', '#5B6B6D', '#C29A5B'] },
    { key: 'neoclassic', title: 'Неоклассика', note: 'молдинги, симметрия, ёлка', sw: ['#E6E2D8', '#B98A5C', '#8C97A3', '#CBB287'] },
    { key: 'loft',    title: 'Лофт', note: 'бетон, кирпич, металл', sw: ['#D8D3CA', '#9C6B54', '#8B5F3C', '#5E6B5B'] }
  ];
  const ROOM_TYPES = [
    ['living-kitchen', 'Гостиная-кухня'], ['living', 'Гостиная'], ['kitchen', 'Кухня'],
    ['bedroom', 'Спальня'], ['kids', 'Детская'], ['cabinet', 'Кабинет'],
    ['bathroom', 'Санузел'], ['hallway', 'Прихожая']
  ];
  let step = 0, selStyle = 'studio', fileNames = [];

  // шаги
  const stepsEl = $('steps');
  function renderSteps() {
    stepsEl.innerHTML = STEPS.map((t, i) =>
      `<span class="${i === step ? 'on' : i < step ? 'done' : ''}">${i + 1} · ${t}</span>`).join('');
    document.querySelectorAll('.panel').forEach(p => { p.hidden = +p.dataset.step !== step; });
    $('prev').style.visibility = step === 0 || step === 5 ? 'hidden' : 'visible';
    $('next').textContent = step === 4 ? 'Собрать бриф ✓' : 'Далее →';
    $('next').style.display = step === 5 ? 'none' : '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('next').onclick = () => { if (step === 4) buildResult(); step = Math.min(5, step + 1); renderSteps(); };
  $('prev').onclick = () => { step = Math.max(0, step - 1); renderSteps(); };

  // помещения
  const roomsEl = $('rooms');
  function addRoom(name, type, w, l) {
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML = `
      <input type="text" class="r-name" placeholder="Название" value="${name || ''}">
      <select class="r-type">${ROOM_TYPES.map(t => `<option value="${t[0]}"${t[0] === type ? ' selected' : ''}>${t[1]}</option>`).join('')}</select>
      <input type="number" class="r-w" placeholder="шир., м" step="0.1" min="1" value="${w || ''}">
      <input type="number" class="r-l" placeholder="дл., м" step="0.1" min="1" value="${l || ''}">
      <button class="x" type="button" title="Удалить">✕</button>`;
    row.querySelector('.x').onclick = () => row.remove();
    row.querySelector('.r-type').onchange = e => {
      const nameInp = row.querySelector('.r-name');
      if (!nameInp.value) nameInp.value = e.target.selectedOptions[0].textContent;
    };
    roomsEl.appendChild(row);
  }
  $('addRoom').onclick = () => addRoom();
  addRoom('Гостиная-кухня', 'living-kitchen', '', '');
  addRoom('Спальня', 'bedroom', '', '');
  addRoom('Санузел', 'bathroom', '', '');

  // файлы
  $('drop').onclick = () => $('files').click();
  $('drop').ondragover = e => { e.preventDefault(); };
  $('drop').ondrop = e => { e.preventDefault(); takeFiles(e.dataTransfer.files); };
  $('files').onchange = e => takeFiles(e.target.files);
  function takeFiles(list) {
    for (const f of list) fileNames.push(f.name + ' (' + Math.round(f.size / 1024) + ' КБ)');
    $('filelist').textContent = fileNames.length ? '✓ ' + fileNames.join(' · ') : '';
  }

  // стили
  const stylesEl = $('styles');
  stylesEl.innerHTML = STYLES.map(s => `
    <div class="style-card${s.key === 'studio' ? ' sel' : ''}" data-key="${s.key}">
      <div class="sw">${s.sw.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <b>${s.title}</b><small>${s.note}</small>
    </div>`).join('');
  stylesEl.onclick = e => {
    const card = e.target.closest('.style-card'); if (!card) return;
    selStyle = card.dataset.key;
    stylesEl.querySelectorAll('.style-card').forEach(c => c.classList.toggle('sel', c === card));
  };
  // приход со страницы стиля: brief.html?style=japandi — карточка выбрана заранее
  (function preselect() {
    const want = new URLSearchParams(location.search).get('style');
    if (!want || !STYLES.some(s => s.key === want)) return;
    selStyle = want;
    stylesEl.querySelectorAll('.style-card').forEach(c => c.classList.toggle('sel', c.dataset.key === want));
  })();

  // сборка брифа
  function collect() {
    const rooms = [...roomsEl.querySelectorAll('.room-row')].map(r => ({
      name: r.querySelector('.r-name').value || 'Помещение',
      type: r.querySelector('.r-type').value,
      width: +r.querySelector('.r-w').value || 3.5,
      length: +r.querySelector('.r-l').value || 3.0
    }));
    return {
      meta: { created: new Date().toISOString().slice(0, 10), source: 'site-brief-wizard' },
      client: { name: $('cName').value, phone: $('cPhone').value, email: $('cEmail').value },
      object: {
        type: $('objType').value, address: $('objAddr').value,
        area: +$('objArea').value || rooms.reduce((s, r) => s + r.width * r.length, 0),
        ceilingHeight: +$('objH').value || 2.7
      },
      rooms,
      files: fileNames,
      style: {
        name: selStyle === 'studio' ? null : selStyle,
        byStudio: selStyle === 'studio',
        colors: $('stColors').value.split(',').map(s => s.trim()).filter(Boolean),
        references: $('stRefs').value.split(',').map(s => s.trim()).filter(Boolean)
      },
      budget: $('qBudget').value,
      answers: {
        household: $('qWho').value, pets: $('qPets').value, wfh: $('qWfh').value,
        storage: $('qStorage').value, dislikes: $('qDislikes').value,
        timeline: $('qWhen').value, notes: $('qNotes').value
      }
    };
  }
  function buildResult() {
    const brief = collect();
    const json = JSON.stringify(brief, null, 2);
    $('json').textContent = json;
    // человеческая сводка вместо технического дампа
    const o = brief.object, rooms = brief.rooms || [];
    const styleName = brief.style && brief.style.byStudio ? 'на усмотрение студии' : (brief.style && brief.style.title) || (brief.style && brief.style.name) || '—';
    const tier = { econom: 'Практичный', business: 'Оптимальный', premium: 'Премиальный' }[brief.budget] || brief.budget || '—';
    const row = (k, v) => v ? '<div class="srow"><span>' + k + '</span><b>' + String(v).replace(/</g, '&lt;') + '</b></div>' : '';
    const sum = $('summary');
    if (sum) sum.innerHTML =
      row('Объект', (o.type || 'квартира') + (o.address ? ', ' + o.address : '') + (o.area ? ' · ' + o.area + ' м²' : ''))
      + row('Высота потолка', o.ceilingHeight ? o.ceilingHeight + ' м' : '')
      + row('Помещений', rooms.length + ': ' + rooms.map(r => r.name + ' ' + r.width + '×' + r.length + ' м').join(', '))
      + row('Стиль', styleName)
      + row('Класс материалов', tier)
      + row('Файлы', (brief.files || []).length ? (brief.files || []).map(f => f.name).join(', ') : 'приложите ответным письмом')
      + row('Контакты', [brief.client.name, brief.client.phone, brief.client.email].filter(Boolean).join(' · '));
    $('dl').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'brief.json';
      a.click();
    };
    $('mailto').href = 'mailto:hello@linea.studio?subject=' +
      encodeURIComponent('Бриф на дизайн-проект — ' + (brief.client.name || 'клиент')) +
      '&body=' + encodeURIComponent('Бриф во вложении (файл brief.json) или ниже:\n\n' + json.slice(0, 1500));
    try { localStorage.setItem('linea_brief', json); } catch (e) {}
  }

  renderSteps();
})();
