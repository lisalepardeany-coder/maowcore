// MaowCore Portable window. Talks to the app only through window.maow.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let S = null;
  let envAutoOpened = false;

  const toast = (text, bad) => {
    const t = $('toast'); t.textContent = text; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3000);
  };
  // Every action returns { ok, value | error }.
  const act = async (name, ...args) => {
    const r = await window.maow[name](...args);
    if (!r.ok) { toast(r.error, true); throw new Error(r.error); }
    return r.value;
  };

  const LABEL = { online: 'Online', starting: 'Starting…', restarting: 'Restarting…', stopping: 'Stopping…', stopped: 'Stopped', external: 'Running outside the app' };
  const CHECKS = [
    ['node', 'Node.js', 'node', 'Install'],
    ['packages', 'Bot packages', 'packages', 'Install'],
    ['native', 'Database & voice parts', 'native', 'Rebuild'],
    ['ffmpeg', 'ffmpeg (audio)', 'packages', 'Install'],
    ['ytdlp', 'yt-dlp (YouTube)', 'ytdlp', 'Install'],
    ['env', 'Bot settings (.env)', null, 'Fill in'],
  ];

  const render = (s) => {
    S = s;
    $('ver').textContent = `v${s.version}`;
    const hasBot = !!s.settings.botDir;
    $('welcome').hidden = hasBot;
    $('home').hidden = !hasBot;
    $('actions').hidden = !hasBot;
    const st = s.runner.state;
    $('status').dataset.s = st;
    const panelUp = !!s.runner.health;
    const noDiscord = st === 'starting' && panelUp && !s.runner.health.botTag && Date.now() - (s.runner.startedAt || 0) > 20000;
    $('status-text').textContent = noDiscord ? 'Panel up · not connected to Discord (check the token)'
      : `${LABEL[st] || st}${s.runner.health?.botTag ? ` · ${s.runner.health.botTag}` : ''}`;
    const running = !!s.runner.pid;
    const busy = !!s.busy;
    $('btn-start').hidden = running;
    $('btn-start').disabled = busy || st === 'external';
    $('btn-restart').hidden = !running; $('btn-restart').disabled = busy;
    $('btn-stop').hidden = !running;
    $('btn-panel').disabled = !(panelUp || st === 'online' || st === 'external');
    $('ban-external').hidden = !s.external || running;
    $('ban-autostart').hidden = !s.oldAutostart || s.external;
    $('ban-busy').hidden = !busy;
    $('busy-text').textContent = busy ? `${s.busy}… (see the log below)` : '';
    $('btn-setup-all').disabled = busy;

    if (!hasBot) {
      $('detected').hidden = !s.detected;
      $('detected-path').textContent = s.detected || '';
      $('fresh-card').hidden = !s.bundled;
      return;
    }
    $('bot-dir').textContent = s.settings.botDir;
    $('data-dir').textContent = s.base;
    const c = s.check || {};
    $('checks').innerHTML = CHECKS.filter(([k]) => c[k]).map(([k, label, stepName, verb]) => {
      const it = c[k];
      return `<div class="check-row ${it.ok ? 'ok' : 'bad'}"><span class="ic">${it.ok ? '✓' : '✕'}</span>
        <div class="grow"><div>${esc(label)}</div><div class="detail">${esc(it.detail || '')}</div></div>
        ${it.ok ? '' : `<button data-step="${stepName || ''}" data-k="${k}" ${busy ? 'disabled' : ''}>${verb}</button>`}</div>`;
    }).join('');
    $('checks').querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.k === 'env') return openEnv();
      act('step', b.dataset.step).catch(() => {});
    }));
    const envOk = c.env?.ok;
    $('env-summary').innerHTML = envOk ? `Token set · panel on port ${esc(c.env.port)}` : '<b>Needs your bot token and application ID.</b>';
    if (!envOk && !envAutoOpened && $('env-form').hidden && c.node?.ok && c.packages?.ok) { envAutoOpened = true; openEnv(); }
    $('opt-login').checked = !!s.loginItem;
    $('opt-autobot').checked = !!s.settings.autoStartBot;
    $('opt-tray').checked = !!s.settings.closeToTray;
    $('opt-hidden').checked = !!s.settings.startHidden;
  };

  // ===== Log =====
  const logEl = $('log');
  const addLog = (e) => {
    const line = document.createElement('div');
    if (e.stream === 'err') line.className = 'err';
    if (e.stream === 'app') line.className = 'app';
    if (e.stream === 'setup') line.className = 'setup';
    line.textContent = `${new Date(e.ts).toLocaleTimeString()}  ${e.text}`;
    logEl.appendChild(line);
    while (logEl.childElementCount > 600) logEl.firstChild.remove();
    if ($('log-follow').checked) logEl.scrollTop = logEl.scrollHeight;
  };

  // ===== Settings form =====
  const openEnv = () => {
    $('env-form').hidden = false;
    $('env-port').value = S?.check?.env?.port || '';
    $('env-token').focus();
  };
  $('btn-edit-env').addEventListener('click', openEnv);
  $('btn-env-cancel').addEventListener('click', () => { $('env-form').hidden = true; });
  $('env-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = { DISCORD_TOKEN: $('env-token').value, CLIENT_ID: $('env-client').value, OWNER_USER_ID: $('env-owner').value, CONTROL_PORT: $('env-port').value };
    if (values.CLIENT_ID && !/^\d{15,22}$/.test(values.CLIENT_ID.trim())) return toast('The application ID is a long number.', true);
    if (values.CONTROL_PORT && !/^\d{2,5}$/.test(values.CONTROL_PORT.trim())) return toast('The port is a number like 8765.', true);
    await act('saveEnv', values).catch(() => null);
    $('env-token').value = '';
    $('env-form').hidden = true;
    toast('Saved.');
  });

  // ===== Buttons =====
  $('btn-start').addEventListener('click', () => act('start').catch(() => {}));
  $('btn-stop').addEventListener('click', () => act('stop').catch(() => {}));
  $('btn-restart').addEventListener('click', () => act('restart').catch(() => {}));
  $('btn-panel').addEventListener('click', () => act('openPanel').catch(() => {}));
  $('btn-setup-all').addEventListener('click', () => act('setupAll').then(() => toast('Setup finished.')).catch(() => {}));
  $('btn-takeover').addEventListener('click', () => act('takeover').catch(() => {}));
  $('btn-old-autostart').addEventListener('click', async () => {
    if (!confirm('Turn off the old auto-start script? (It is renamed to “.disabled”, so you can bring it back.) Turn on “Start with Windows” below instead.')) return;
    await act('disableOldAutostart').catch(() => {});
    refresh();
  });
  $('btn-open-bot').addEventListener('click', () => act('openPath', 'bot'));
  $('btn-open-data').addEventListener('click', () => act('openPath', 'data'));
  $('btn-open-logs').addEventListener('click', () => act('openPath', 'logs'));
  $('btn-change-bot').addEventListener('click', async () => {
    if (S?.runner?.pid && !confirm('Stop the bot and pick another folder?')) return;
    if (S?.runner?.pid) await act('stop');
    await act('resetBotFolder');
  });
  $('btn-use-detected').addEventListener('click', () => act('useExisting', S.detected).catch(() => {}));
  $('btn-choose-existing').addEventListener('click', async () => {
    const dir = await act('chooseFolder', 'Choose your MaowCore bot folder');
    if (dir) act('useExisting', dir).catch(() => {});
  });
  $('btn-install-fresh').addEventListener('click', async () => {
    const dir = await act('chooseFolder', 'Choose an empty folder for the bot');
    if (dir) act('installFresh', dir).then(() => toast('Installed! Now fill in the bot settings.')).catch(() => {});
  });
  for (const [id, key] of [['opt-login', 'loginItem'], ['opt-autobot', 'autoStartBot'], ['opt-tray', 'closeToTray'], ['opt-hidden', 'startHidden']]) {
    $(id).addEventListener('change', (e) => act('setOption', key, e.target.checked).then(render).catch(() => {}));
  }

  // ===== Tabs =====
  const showTab = (name) => {
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    for (const t of ['overview', 'terminal', 'maint']) $(`tab-${t}`).hidden = t !== name;
    if (name === 'terminal') { $('term-line').focus(); termInfo(); }
    if (name === 'maint') { loadBackups(); checkApp(); }
  };
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ===== Terminal =====
  const out = $('term-out');
  const termWrite = ({ text, kind }) => {
    const span = document.createElement('span');
    if (kind && kind !== 'out') span.className = kind;
    span.textContent = text;
    out.appendChild(span);
    while (out.childNodes.length > 2000) out.firstChild.remove();
    out.scrollTop = out.scrollHeight;
  };
  const history = []; let hIdx = -1;
  const setCwd = (cwd) => { const parts = String(cwd).split(/[\\/]+/).filter(Boolean); $('term-cwd').textContent = `PS ${parts.length > 3 ? `…\\${parts.slice(-2).join('\\')}` : cwd}>`; $('term-cwd').title = cwd; };
  const termInfo = () => window.maow.termInfo().then((r) => { if (r.ok) { setCwd(r.value.cwd); history.splice(0, history.length, ...r.value.history); } });
  window.maow.onTermData(termWrite);
  window.maow.onTermPrompt(setCwd);
  window.maow.onTermClear(() => { out.textContent = ''; });
  const runLine = (line) => { history.push(line); hIdx = -1; window.maow.termRun(line); };
  $('term-form').addEventListener('submit', (e) => { e.preventDefault(); const line = $('term-line').value; $('term-line').value = ''; runLine(line); });
  $('term-line').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); hIdx = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1); $('term-line').value = history[hIdx]; }
    if (e.key === 'ArrowDown' && hIdx >= 0) { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); $('term-line').value = history[hIdx] || ''; if (hIdx >= history.length) hIdx = -1; }
    if (e.key === 'c' && e.ctrlKey && !window.getSelection().toString()) { e.preventDefault(); window.maow.termStop(); }
  });
  $('term-stop').addEventListener('click', () => window.maow.termStop());
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => runLine(b.dataset.cmd)));

  // ===== Maintenance =====
  const fmtMB = (n) => `${(n / 1048576).toFixed(1)} MB`;
  const loadBackups = async () => {
    const r = await window.maow.backups();
    const list = r.ok ? r.value : [];
    const box = $('backup-list');
    box.innerHTML = list.length ? '' : 'No backups yet.';
    list.slice(0, 14).forEach((b) => {
      const row = document.createElement('div'); row.className = 'bk-row';
      row.innerHTML = `<div class="grow">${esc(new Date(b.at).toLocaleString())}<div class="muted small">${esc(b.name)} · ${fmtMB(b.size)}</div></div><button>Restore</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Restore the backup from ${new Date(b.at).toLocaleString()}?\n\nThe bot stops for a moment and settings go back to that point.`)) return;
        await act('restoreBackup', b.name).then(() => toast('Restored.')).catch(() => {});
      });
      box.appendChild(row);
    });
  };
  $('btn-backup-now').addEventListener('click', () => act('backupNow').then(() => { toast('Backup made.'); loadBackups(); }).catch(() => {}));
  $('btn-update-bot').addEventListener('click', async () => {
    if (!confirm('Update the bot now? It makes a backup first, and the bot restarts afterwards.')) return;
    showTab('overview');
    await act('updateBot').then(() => toast('Bot updated.')).catch(() => {});
  });
  const checkApp = async () => {
    const r = await window.maow.checkAppUpdate();
    if (!r.ok) return;
    const { current, update, portable } = r.value;
    $('app-update-info').textContent = update ? `Version ${update.version} is ready (you have ${current}).` : `You have the newest version (${current}).${portable ? '' : ' (Self-update only works in the portable .exe.)'}`;
    $('btn-check-app').textContent = update ? 'Update now' : 'Check';
    $('btn-check-app').classList.toggle('primary', !!update);
    showUpdate(update);
  };
  const showUpdate = (u) => { $('ban-update').hidden = !u; if (u) $('update-text').textContent = `MaowCore ${u.version} is ready to install.`; };
  const doUpdate = async () => {
    if (!confirm('Update MaowCore now? The app closes, updates itself and opens again (the bot restarts too).')) return;
    await act('applyAppUpdate').catch(() => {});
  };
  $('btn-check-app').addEventListener('click', () => ($('btn-check-app').textContent === 'Update now' ? doUpdate() : checkApp()));
  $('btn-update-now').addEventListener('click', doUpdate);
  $('btn-update-dir').addEventListener('click', () => act('setUpdateDir').then(checkApp).catch(() => {}));
  window.maow.onAppUpdate(showUpdate);

  const refresh = () => act('state').then(render).catch(() => {});
  window.maow.onState(render);
  window.maow.onLog(addLog);
  window.maow.logs().then((r) => (r.ok ? r.value : []).forEach(addLog));
  refresh();
})();
