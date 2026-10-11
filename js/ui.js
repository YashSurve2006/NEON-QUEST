/* NEON QUEST - ui.js
 * DOM screens and overlays: main menu, level select, how-to-play, high scores,
 * settings, pause / level-clear / game-over / victory, touch controls, PWA install.
 */
(function (NQ) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const store = NQ.store;
  const G = NQ.game;

  const SCREENS = ['s-menu', 's-levels', 's-howto', 's-scores', 's-settings'];
  const OVERLAYS = ['o-pause', 'o-clear', 'o-over', 'o-win'];
  // (the endless run and campaign share these overlays; text is set per mode in fill*())
  const GAME_STATES = ['intro', 'play', 'paused', 'dying', 'clear', 'over', 'win'];

  // ------------------------------------------------------------ settings
  const DEFAULTS = { music: 50, sfx: 70, mute: false, shake: true, touch: 'auto', name: 'PLAYER' };
  NQ.settings = Object.assign({}, DEFAULTS, store.get('settings', {}));

  function saveSettings() {
    store.set('settings', NQ.settings);
    NQ.audio.set(NQ.settings.music / 100, NQ.settings.sfx / 100, NQ.settings.mute);
    paintMute();
  }

  function paintMute() {
    $('#u-mute').textContent = NQ.settings.mute ? '🔇' : '🔊';
  }

  function toggleMute() {
    NQ.settings.mute = !NQ.settings.mute;
    saveSettings();
    toast(NQ.settings.mute ? 'Sound off' : 'Sound on');
  }

  function bindSettings() {
    const s = NQ.settings;
    $('#set-music').value = s.music; $('#out-music').textContent = s.music;
    $('#set-sfx').value = s.sfx; $('#out-sfx').textContent = s.sfx;
    $('#set-mute').checked = s.mute;
    $('#set-shake').checked = s.shake;
    $('#set-touch').value = s.touch;
    $('#set-name').value = s.name === 'PLAYER' ? '' : s.name;
    $('#set-music').oninput = (e) => { NQ.settings.music = +e.target.value; $('#out-music').textContent = e.target.value; saveSettings(); };
    $('#set-sfx').oninput = (e) => { NQ.settings.sfx = +e.target.value; $('#out-sfx').textContent = e.target.value; saveSettings(); NQ.audio.sfx('click'); };
    $('#set-mute').onchange = (e) => { NQ.settings.mute = e.target.checked; saveSettings(); };
    $('#set-shake').onchange = (e) => { NQ.settings.shake = e.target.checked; saveSettings(); };
    $('#set-touch').onchange = (e) => { NQ.settings.touch = e.target.value; saveSettings(); syncTouch(); };
    $('#set-name').onchange = (e) => {
      NQ.settings.name = (e.target.value || '').trim().slice(0, 12) || 'PLAYER';
      saveSettings(); toast('Name saved: ' + NQ.settings.name);
    };
  }

  // ------------------------------------------------------------ helpers
  let toastT = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function touchEnabled() {
    if (NQ.settings.touch === 'on') return true;
    if (NQ.settings.touch === 'off') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function isPortraitPhone() {
    return window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 900;
  }

  function syncTouch() {
    const st = G.state;
    const inGame = GAME_STATES.includes(st);
    const showTouch = inGame && touchEnabled() && (st === 'intro' || st === 'play');
    $('#touch').classList.toggle('hidden', !showTouch);
    $('#util').classList.toggle('hidden', !inGame);
    $('#rotate').classList.toggle('hidden', !(showTouch && isPortraitPhone()));
    if (!showTouch) for (const k in NQ.touch) NQ.touch[k] = false;
  }

  function hideAll() {
    for (const id of SCREENS.concat(OVERLAYS)) $('#' + id).classList.add('hidden');
  }

  function show(id) { $('#' + id).classList.remove('hidden'); }

  // ------------------------------------------------------------ state sync
  let backTo = 'menu';

  NQ.ui = {
    onState(st) {
      hideAll();
      document.body.classList.toggle('in-menu', st === 'menu');
      document.body.classList.toggle('in-game', GAME_STATES.includes(st));
      switch (st) {
        case 'menu': show('s-menu'); refreshMenu(); break;
        case 'paused': show('o-pause'); break;
        case 'clear': fillClear(); show('o-clear'); if (G.mode === 'campaign') unlockUpTo(G.levelNo + 1); break;
        case 'over': fillOver(); show('o-over'); break;
        case 'win': fillWin(); show('o-win'); break;
        default: break;
      }
      syncTouch();
      if (st === 'menu') NQ.render.resize();
    },
  };

  // ------------------------------------------------------------ navigation
  function open(name, back) {
    hideAll();
    backTo = back || 'menu';
    if (name === 'levels') renderLevels();
    if (name === 'scores') renderScores();
    if (name === 'settings') bindSettings();
    show('s-' + name);
    const first = $('#s-' + name + ' button, #s-' + name + ' input, #s-' + name + ' select');
    if (first) first.focus({ preventScroll: true });
  }

  function back() {
    hideAll();
    if (backTo === 'pause' && G.state === 'paused') show('o-pause');
    else show('s-menu');
    if (!$('#o-pause').classList.contains('hidden')) $('#o-pause .primary').focus();
  }

  function refreshMenu() {
    const scores = store.get('scores', []);
    $('#best-overall').textContent = scores.length ? scores[0].score.toLocaleString() : '0';
  }

  // ------------------------------------------------------------ levels
  function maxLevel() { return store.get('maxLevel', 1); }
  function unlockUpTo(n) {
    const cap = Math.min(n, NQ.LEVELS.length);
    if (cap > maxLevel()) store.set('maxLevel', cap);
  }

  const ART = {
    meadow: ['#4fb8ff', '#bfeeff', '🌼'],
    cavern: ['#0a1330', '#2a5aa0', '❄️'],
    volcano: ['#3a0a14', '#ff7a2e', '🌋'],
  };

  function renderLevels() {
    const grid = $('#level-grid');
    const best = store.get('best', {});
    const mx = maxLevel();
    grid.innerHTML = '';
    NQ.LEVELS.forEach((L, i) => {
      const n = i + 1, locked = n > mx, [a, b, icon] = ART[L.theme];
      const card = document.createElement('button');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.setAttribute('aria-label', 'Level ' + n + ': ' + L.name + (locked ? ' (locked)' : ''));
      const bs = best['L' + n];
      card.innerHTML =
        '<div class="art" style="background:linear-gradient(160deg,' + a + ',' + b + ')">' +
        '<div style="position:absolute;left:14px;bottom:8px;font-size:2.4rem">' + icon + '</div>' +
        (locked ? '<div class="lock-tag">🔒</div>' : '') + '</div>' +
        '<div class="body"><h3>' + n + '. ' + L.name + '</h3><p>' + L.sub + '</p>' +
        '<div class="best">' + (bs ? 'Best: ' + bs.score.toLocaleString() + ' · ' + bs.secs + 's' : 'Not cleared yet') + '</div></div>';
      card.onclick = () => {
        if (locked) { toast('Clear the previous level to unlock this one'); return; }
        hideAll();
        G.newGame(n);
      };
      grid.appendChild(card);
    });
  }

  // ------------------------------------------------------------ high scores
  function renderScores() {
    const list = store.get('scores', []);
    const host = $('#score-table');
    if (!list.length) { host.innerHTML = '<p class="empty">No runs yet. Go play!</p>'; return; }
    const rows = list.map((r, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name || 'PLAYER') + '</td>' +
      '<td class="num">' + r.score.toLocaleString() + '</td><td>' + (r.mode === 'endless' ? 'Stage ' + r.level : 'L' + r.level) + '</td>' +
      '<td>' + (r.kind === 'win' ? '🏆 Won' : r.mode === 'endless' ? '∞ Endless' : 'Game over') + '</td><td>' + r.secs + 's</td><td>' + r.date + '</td></tr>').join('');
    host.innerHTML = '<table class="scores"><thead><tr><th>#</th><th>Name</th><th class="num">Score</th><th>Level</th><th>Result</th><th>Time</th><th>Date</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  // ------------------------------------------------------------ summaries
  function row(label, value) { return '<div><span>' + label + '</span><b>' + value + '</b></div>'; }

  function fillClear() {
    const s = G.summary;
    if (!s) return;
    const endless = G.mode === 'endless';
    $('#clear-title').textContent = endless ? 'STAGE CLEAR!' : 'LEVEL COMPLETE!';
    $('#btn-next').textContent = endless ? 'Next stage ▶' : 'Next level ▶';
    $('#clear-summary').innerHTML =
      row(endless ? 'Stage ' + G.stage : 'Level', s.level) +
      row('Time', s.secs + 's') +
      row('Coins', s.coins + ' / ' + s.coinsTotal) +
      row('Time bonus', '+' + s.timeBonus) +
      row('No-damage bonus', s.noHit ? '+' + s.noHit : '–') +
      row('All coins bonus', s.perfect ? '+' + s.perfect : '–') +
      '<div class="total">Total score&nbsp;<b>' + s.total.toLocaleString() + '</b></div>';
  }

  function fillOver() {
    const st = G.stats || {}, endless = G.mode === 'endless';
    $('#over-title').textContent = endless ? 'RUN OVER' : 'GAME OVER';
    $('#btn-retry').textContent = endless ? '∞ New run' : '↺ Retry level';
    $('#over-summary').innerHTML =
      (endless
        ? row('Stage reached', G.stage + ' · ' + G.level.name) + row('Stages cleared', (G.run && G.run.cleared) || 0)
        : row('Level', G.level.name)) +
      row('Score', G.score.toLocaleString()) +
      row('Coins', G.coinsGot + ' / ' + G.coinsTotal) +
      row('Stomps', st.stomps || 0) +
      row('Dash smashes', st.smashes || 0) +
      row('Hits taken', st.hits || 0) +
      '<div class="total" style="grid-column:1/-1;font-size:.95rem;color:#9fb3d1">' +
      (endless
        ? 'Your score is saved to high scores. A new run starts at 0, with new worlds and obstacles.'
        : 'Retry gives you 4 lives and resets this level\'s score.') + '</div>';
  }

  function fillWin() {
    const st = G.stats || {};
    $('#win-summary').innerHTML =
      row('Final score', '<span>' + G.score.toLocaleString() + '</span>') +
      row('Coins (last level)', G.coinsGot + ' / ' + G.coinsTotal) +
      row('Stomps (last level)', st.stomps || 0) +
      row('Time (last level)', (G.summary ? G.summary.secs : 0) + 's');
  }

  // ------------------------------------------------------------ buttons
  function wireButtons() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      NQ.audio.sfx('click');
      const act = b.dataset.act;
      switch (act) {
        case 'play': G.newRun(); break;
        case 'levels': open('levels', 'menu'); break;
        case 'howto': open('howto', b.dataset.back || 'menu'); break;
        case 'scores': open('scores', 'menu'); break;
        case 'settings': open('settings', b.dataset.back || 'menu'); break;
        case 'back': back(); break;
        case 'resume': G.resume(); break;
        case 'restart': hideAll(); G.restartStage(); break;
        case 'quit': hideAll(); G.quit(); break;
        case 'next': G.next(); break;
        case 'retry': G.retry(); break;
        case 'newgame': G.newRun(); break;
        default: break;
      }
    });

    $('#btn-clear-scores').onclick = () => {
      if (confirm('Delete all high scores?')) { store.set('scores', []); renderScores(); toast('High scores cleared'); }
    };
    $('#btn-reset').onclick = () => {
      if (confirm('Reset all progress (scores, best times, level unlocks)?')) {
        store.set('scores', []); store.set('best', {}); store.set('maxLevel', 1);
        toast('Progress reset'); refreshMenu();
      }
    };

    $$('[data-hold]').forEach((b) => {
      const key = b.dataset.hold;
      const on = (e) => {
        e.preventDefault();
        NQ.audio.unlock();
        NQ.touch[key] = true;
        b.classList.add('down');
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      };
      const off = () => { NQ.touch[key] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    $('#u-pause').onclick = () => G.pause();
    $('#u-mute').onclick = toggleMute;
    $('#u-full').onclick = toggleFullscreen;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el).catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  // ------------------------------------------------------------ keyboard
  addEventListener('keydown', (e) => {
    const st = G.state;
    if (e.code === 'KeyM' && !e.repeat) toggleMute();
    if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
    if (e.code === 'KeyH' && !e.repeat && (st === 'menu' || st === 'paused')) {
      if (st === 'paused') { hideAll(); }
      open('howto', st === 'paused' ? 'pause' : 'menu');
    }
    if (e.code === 'Escape' && !e.repeat) {
      const screenOpen = SCREENS.some((id) => id !== 's-menu' && !$('#' + id).classList.contains('hidden'));
      if (screenOpen) { e.preventDefault(); back(); }
    }
    if (e.code === 'Enter' && !e.repeat && (st === 'clear' || st === 'over' || st === 'win')) {
      const btn = document.querySelector('#o-' + (st === 'clear' ? 'clear' : st === 'over' ? 'over' : 'win') + ' .primary');
      if (btn) btn.click();
    }
  });

  // ------------------------------------------------------------ PWA
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#btn-install').classList.remove('hidden');
  });
  $('#btn-install').onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) { /* ignore */ }
    deferredPrompt = null;
    $('#btn-install').classList.add('hidden');
  };
  addEventListener('appinstalled', () => toast('Installed! Open NEON QUEST from your home screen'));

  function registerSW() {
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ------------------------------------------------------------ boot
  addEventListener('pointerdown', () => NQ.audio.unlock(), { passive: true });
  addEventListener('resize', syncTouch);
  wireButtons();
  bindSettings();
  saveSettings();
  refreshMenu();
  NQ.boot();
  syncTouch();
  registerSW();
})(window.NQ = window.NQ || {});
