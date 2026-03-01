(() => {
  'use strict';

  const STORAGE_KEY = 'typenova-progress-v1';
  const SESSION_SECONDS = 60;
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

  const WORD_BANK = {
    easy: 'time work people place world point spell clean hello quick every small happy river night light warm clever skill typing mobile learn practice daily focus'.split(' '),
    medium: 'adaptive velocity monitor friction gradient premium discover language keyboard rhythm session measure advance balance animate context localstorage efficient challenge'.split(' '),
    hard: 'juxtaposition zephyr keyboard-driven semi-colon punctuation! efficient, scalable. extraordinary hyperfocus interoperability asynchronous resilience futuristic'.split(' ')
  };

  const KEY_LAYOUT = [
    [['`','~'],['1','!'],['2','@'],['3','#'],['4','$'],['5','%'],['6','^'],['7','&'],['8','*'],['9','('],['0',')'],['-','_'],['=','+'],['Backspace','Backspace','wide-4']],
    [['Tab','Tab','wide-3'],['q'],['w'],['e'],['r'],['t'],['y'],['u'],['i'],['o'],['p'],['[','{'],[']','}'],['\\','|']],
    [['Caps','Caps','wide-4'],['a'],['s'],['d'],['f'],['g'],['h'],['j'],['k'],['l'],[';',':'],['\'','"'],['Enter','Enter','wide-4']],
    [['Shift','Shift','wide-5'],['z'],['x'],['c'],['v'],['b'],['n'],['m'],[',','<'],['.','>'],['/','?'],['Shift','Shift','wide-5']],
    [['Ctrl','Ctrl','wide-3'],['Alt','Alt','wide-3'],['Space',' ','space'],['Alt','Alt','wide-3'],['Ctrl','Ctrl','wide-3']]
  ];

  const state = {
    theme: 'dark',
    aiMode: true,
    sound: false,
    difficulty: 'medium',
    customMode: false,
    customText: '',
    prompt: '',
    idx: 0,
    startedAt: 0,
    timeLeft: SESSION_SECONDS,
    timerId: null,
    totalTyped: 0,
    correctTyped: 0,
    errors: 0,
    streak: 0,
    bestStreak: 0,
    weakMap: {},
    heatMap: {},
    xp: 0,
    level: 1,
    achievements: [],
    history: [],
    chart: null
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    appRoot: $('appRoot'), typingSection: $('typingSection'), promptText: $('promptText'), promptWrap: $('promptWrap'), hiddenInput: $('hiddenInput'),
    wpm: $('wpm'), accuracy: $('accuracy'), errors: $('errors'), streak: $('streak'), timer: $('timer'), weakLetters: $('weakLetters'), xpLevel: $('xpLevel'),
    difficulty: $('difficulty'), aiMode: $('aiMode'), soundMode: $('soundMode'), customMode: $('customMode'), customText: $('customText'),
    newSessionBtn: $('newSessionBtn'), retryBtn: $('retryBtn'), themeToggle: $('themeToggle'), focusToggle: $('focusToggle'),
    keyboard: $('keyboard'), exportBtn: $('exportBtn'), resetBtn: $('resetBtn'),
    summaryModal: $('summaryModal'), finalWpm: $('finalWpm'), finalAccuracy: $('finalAccuracy'), finalErrors: $('finalErrors'), finalStreak: $('finalStreak'),
    errorBreakdown: $('errorBreakdown'), summaryRetry: $('summaryRetry'), summaryNew: $('summaryNew'), summaryClose: $('summaryClose'), performanceChart: $('performanceChart')
  };

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.theme = raw.theme || state.theme;
      state.aiMode = raw.aiMode ?? state.aiMode;
      state.sound = raw.sound ?? state.sound;
      state.customText = raw.customText || '';
      state.difficulty = raw.difficulty || state.difficulty;
      state.weakMap = raw.weakMap || {};
      state.heatMap = raw.heatMap || {};
      state.xp = raw.xp || 0;
      state.level = raw.level || 1;
      state.achievements = raw.achievements || [];
      state.history = raw.history || [];
    } catch (_) {}
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: state.theme, aiMode: state.aiMode, sound: state.sound, customText: state.customText, difficulty: state.difficulty,
      weakMap: state.weakMap, heatMap: state.heatMap, xp: state.xp, level: state.level, achievements: state.achievements, history: state.history
    }));
  }

  function renderPrompt() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < state.prompt.length; i++) {
      const ch = document.createElement('span');
      ch.textContent = state.prompt[i];
      if (i < state.idx) ch.className = 'correct';
      if (i === state.idx) ch.classList.add('active');
      frag.appendChild(ch);
    }
    els.promptText.innerHTML = '';
    els.promptText.appendChild(frag);
    const active = els.promptText.querySelector('.active');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    highlightNextKey();
  }

  function pickWeakLetters(limit = 5) {
    return Object.entries(state.weakMap).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
  }

  function generateWord() {
    const source = WORD_BANK[state.difficulty];
    if (!state.aiMode || !Object.keys(state.weakMap).length) return source[Math.floor(Math.random() * source.length)];
    const weak = pickWeakLetters(3);
    for (let i = 0; i < 6; i++) {
      const candidate = source[Math.floor(Math.random() * source.length)];
      if (weak.some((l) => candidate.toLowerCase().includes(l))) return candidate;
    }
    return source[Math.floor(Math.random() * source.length)];
  }

  function generatePrompt() {
    if (state.customMode && state.customText.trim().length > 30) return state.customText.trim();
    const words = [];
    for (let i = 0; i < 70; i++) words.push(generateWord());
    return words.join(' ');
  }

  function updateStats() {
    const elapsedMins = Math.max((Date.now() - state.startedAt) / 60000, 1 / 60);
    const wpm = Math.round((state.correctTyped / 5) / elapsedMins);
    const accuracy = state.totalTyped ? Math.max(0, Math.round((state.correctTyped / state.totalTyped) * 100)) : 100;
    els.wpm.textContent = String(Math.max(0, wpm));
    els.accuracy.textContent = `${accuracy}%`;
    els.errors.textContent = String(state.errors);
    els.streak.textContent = String(state.streak);
    els.timer.textContent = `${state.timeLeft}s`;
    const weak = pickWeakLetters(4);
    els.weakLetters.textContent = weak.length ? weak.join(', ') : '—';
    els.xpLevel.textContent = `${state.xp} / ${state.level}`;
  }

  function awardXP() {
    const acc = parseInt(els.accuracy.textContent, 10) || 0;
    const sessionXP = Math.max(10, Math.round((parseInt(els.wpm.textContent, 10) || 0) + acc / 3 - state.errors));
    state.xp += sessionXP;
    const newLevel = 1 + Math.floor(state.xp / 250);
    if (newLevel > state.level) state.achievements.push(`Level ${newLevel} reached`);
    if (acc >= 98) state.achievements.push('Sharpshooter: 98%+ accuracy');
    if ((parseInt(els.wpm.textContent, 10) || 0) >= 60) state.achievements.push('Speedster: 60+ WPM');
    state.level = newLevel;
    state.achievements = [...new Set(state.achievements)].slice(-12);
  }

  function finishSession() {
    clearInterval(state.timerId);
    state.timerId = null;
    awardXP();
    const finalWpm = parseInt(els.wpm.textContent, 10) || 0;
    const finalAccuracy = els.accuracy.textContent;
    state.history.push({ t: new Date().toLocaleTimeString(), wpm: finalWpm, accuracy: parseInt(finalAccuracy, 10) || 0 });
    state.history = state.history.slice(-20);
    persist();

    els.finalWpm.textContent = String(finalWpm);
    els.finalAccuracy.textContent = finalAccuracy;
    els.finalErrors.textContent = String(state.errors);
    els.finalStreak.textContent = String(state.bestStreak);

    const topErrors = Object.entries(state.weakMap).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => `${k}:${v}`).join(' · ');
    els.errorBreakdown.textContent = `Error breakdown: ${topErrors || 'No significant errors'} | Achievements: ${state.achievements.slice(-3).join(', ') || 'None yet'}`;
    openSummary();
    drawChart();
  }

  function tick() {
    state.timeLeft -= 1;
    updateStats();
    if (state.timeLeft <= 0) finishSession();
  }

  function beginTimerIfNeeded() {
    if (state.timerId) return;
    state.startedAt = Date.now();
    state.timerId = setInterval(tick, 1000);
  }

  function registerMistake(expected) {
    const key = expected.toLowerCase();
    if (LETTERS.includes(key)) state.weakMap[key] = (state.weakMap[key] || 0) + 1;
    state.heatMap[key] = (state.heatMap[key] || 0) + 1;
  }

  function playClick(ok = true) {
    if (!state.sound) return;
    const ctx = playClick.ctx || (playClick.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = ok ? 650 : 180;
    gain.gain.value = 0.02;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  function onType(char) {
    if (!state.prompt || state.timeLeft <= 0) return;
    beginTimerIfNeeded();

    const expected = state.prompt[state.idx];
    state.totalTyped += 1;

    const spans = els.promptText.querySelectorAll('span');
    const current = spans[state.idx];
    if (!current) return;

    if (char === expected) {
      state.correctTyped += 1;
      state.idx += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      keyFeedback(char, true);
      playClick(true);
    } else {
      current.classList.remove('correct');
      current.classList.add('incorrect');
      state.errors += 1;
      state.streak = 0;
      registerMistake(expected);
      keyFeedback(char, false);
      playClick(false);
    }

    if (state.idx >= state.prompt.length) {
      state.prompt += ' ' + generatePrompt().slice(0, 120);
    }

    renderPrompt();
    paintHeatmap();
    updateStats();
    persist();
  }

  function normalizeKey(e) {
    if (e.key === ' ') return ' ';
    if (e.key === 'Spacebar') return ' ';
    return e.key.length === 1 ? e.key : e.key;
  }

  function keyIdFromLabel(label) {
    if (label === ' ') return 'Space';
    return label;
  }

  function keyFeedback(key, good) {
    const k = keyIdFromLabel(key.length === 1 ? key : key);
    const target = els.keyboard.querySelector(`[data-key="${CSS.escape(k)}"]`) || els.keyboard.querySelector(`[data-key="${CSS.escape(String(key).toLowerCase())}"]`);
    if (!target) return;
    target.classList.add(good ? 'hit-correct' : 'hit-wrong');
    setTimeout(() => target.classList.remove('hit-correct', 'hit-wrong'), 180);
  }

  function highlightPhysical(key, down) {
    const k = key === ' ' ? 'Space' : key;
    const nodes = els.keyboard.querySelectorAll(`[data-key="${CSS.escape(k)}"], [data-key="${CSS.escape(String(k).toLowerCase())}"]`);
    nodes.forEach((node) => node.classList.toggle('physical', down));
  }

  function highlightNextKey() {
    els.keyboard.querySelectorAll('.key.active').forEach((k) => k.classList.remove('active'));
    const next = state.prompt[state.idx];
    const key = next === ' ' ? 'Space' : next;
    const node = els.keyboard.querySelector(`[data-key="${CSS.escape(key)}"], [data-key="${CSS.escape(String(key).toLowerCase())}"]`);
    node?.classList.add('active');
  }

  function buildKeyboard() {
    els.keyboard.innerHTML = '';
    KEY_LAYOUT.forEach((rowDef) => {
      const row = document.createElement('div');
      row.className = 'kb-row';
      rowDef.forEach((item) => {
        const [label, key = label, width = ''] = item;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `key ${width} ${key === ' ' ? 'space' : ''}`.trim();
        btn.dataset.key = key;
        btn.textContent = label;
        btn.addEventListener('click', () => {
          if (label.length === 1 || key === ' ') onType(key);
          els.hiddenInput.focus();
        });
        row.appendChild(btn);
      });
      els.keyboard.appendChild(row);
    });
  }

  function paintHeatmap() {
    const max = Math.max(1, ...Object.values(state.heatMap), ...Object.values(state.weakMap));
    els.keyboard.querySelectorAll('.key').forEach((k) => {
      const id = k.dataset.key?.toLowerCase();
      const count = state.heatMap[id] || state.weakMap[id] || 0;
      const intensity = Math.min(1, count / max);
      if (intensity > 0) {
        const hue = 45 - intensity * 45;
        k.style.backgroundColor = `hsla(${hue}, 85%, ${58 - intensity * 18}%, .85)`;
      } else {
        k.style.backgroundColor = '';
      }
      k.classList.toggle('weak', count >= Math.ceil(max * 0.5) && count > 1);
    });
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
  }

  function resetSession(keepPrompt = false) {
    clearInterval(state.timerId);
    Object.assign(state, {
      idx: 0, startedAt: 0, timeLeft: SESSION_SECONDS, timerId: null,
      totalTyped: 0, correctTyped: 0, errors: 0, streak: 0, bestStreak: 0
    });
    if (!keepPrompt) state.prompt = generatePrompt();
    renderPrompt();
    updateStats();
    els.hiddenInput.value = '';
    els.hiddenInput.focus();
  }

  function exportProgress() {
    const payload = localStorage.getItem(STORAGE_KEY) || '{}';
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'typenova-progress.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openSummary() {
    els.summaryModal.classList.add('open');
    els.summaryModal.setAttribute('aria-hidden', 'false');
  }

  function closeSummary() {
    els.summaryModal.classList.remove('open');
    els.summaryModal.setAttribute('aria-hidden', 'true');
  }

  function drawChart() {
    if (!window.Chart) return;
    state.chart?.destroy();
    const labels = state.history.map((h) => h.t);
    const wpmData = state.history.map((h) => h.wpm);
    const accData = state.history.map((h) => h.accuracy);
    state.chart = new Chart(els.performanceChart, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'WPM', data: wpmData, borderColor: '#5ce1e6', tension: .3 },
          { label: 'Accuracy', data: accData, borderColor: '#f6c453', tension: .3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: getComputedStyle(document.body).color } } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function wireEvents() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return;
      if (e.key === 'Escape') return closeSummary();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = normalizeKey(e);
      if (k.length === 1 || k === ' ') {
        e.preventDefault();
        highlightPhysical(k, true);
        onType(k);
      }
    });
    document.addEventListener('keyup', (e) => highlightPhysical(normalizeKey(e), false));

    els.typingSection.addEventListener('click', () => els.hiddenInput.focus());
    els.newSessionBtn.addEventListener('click', () => resetSession(false));
    els.retryBtn.addEventListener('click', () => resetSession(true));
    els.summaryRetry.addEventListener('click', () => { closeSummary(); resetSession(true); });
    els.summaryNew.addEventListener('click', () => { closeSummary(); resetSession(false); });
    els.summaryClose.addEventListener('click', closeSummary);

    els.difficulty.addEventListener('change', () => { state.difficulty = els.difficulty.value; persist(); resetSession(false); });
    els.aiMode.addEventListener('change', () => { state.aiMode = els.aiMode.checked; persist(); });
    els.soundMode.addEventListener('change', () => { state.sound = els.soundMode.checked; persist(); });
    els.customMode.addEventListener('change', () => { state.customMode = els.customMode.checked; resetSession(false); persist(); });
    els.customText.addEventListener('input', () => { state.customText = els.customText.value; persist(); });

    els.themeToggle.addEventListener('click', () => { setTheme(state.theme === 'dark' ? 'light' : 'dark'); persist(); });
    els.focusToggle.addEventListener('click', () => els.appRoot.classList.toggle('focus-mode'));
    els.exportBtn.addEventListener('click', exportProgress);
    els.resetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      Object.keys(state.weakMap).forEach((k) => delete state.weakMap[k]);
      Object.keys(state.heatMap).forEach((k) => delete state.heatMap[k]);
      state.xp = 0; state.level = 1; state.achievements = []; state.history = [];
      paintHeatmap(); updateStats();
    });
  }

  function initPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  function init() {
    loadState();
    setTheme(state.theme);
    els.aiMode.checked = state.aiMode;
    els.soundMode.checked = state.sound;
    els.customText.value = state.customText;
    els.difficulty.value = state.difficulty;
    buildKeyboard();
    paintHeatmap();
    wireEvents();
    resetSession(false);
    initPWA();
  }

  window.addEventListener('load', init);
})();
