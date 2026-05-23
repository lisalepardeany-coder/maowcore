// MaowCore browser-extension background worker.
// Adds "Queue in MaowCore" to the right-click menu on links + selected text.

const DEFAULTS = { botUrl: 'http://127.0.0.1:8765' };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'maowcore-queue-link',
    title: '✦ Queue in MaowCore',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'maowcore-queue-selection',
    title: '✦ Search & queue in MaowCore: "%s"',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'maowcore-queue-page',
    title: '✦ Queue current page URL in MaowCore',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://*.youtube.com/*',
      'https://youtu.be/*',
      'https://open.spotify.com/*',
      'https://soundcloud.com/*',
    ],
  });
});

const getBotUrl = async () => {
  const { botUrl } = await chrome.storage.sync.get(['botUrl']);
  return botUrl || DEFAULTS.botUrl;
};

const queueViaWs = async (query) => {
  const botUrl = await getBotUrl();
  const wsUrl = botUrl.replace(/^http/, 'ws') + '/';
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(wsUrl); } catch (e) { return reject(e); }
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('WS timeout')); }, 5000);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'cmd', action: 'play', query }));
      setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 300);
      clearTimeout(timer);
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error('WS error')); };
  });
};

const notify = (title, message, level = 'info') => {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message,
  });
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let query = null;
  if (info.menuItemId === 'maowcore-queue-link') query = info.linkUrl;
  else if (info.menuItemId === 'maowcore-queue-selection') query = info.selectionText;
  else if (info.menuItemId === 'maowcore-queue-page') query = info.pageUrl || tab?.url;
  if (!query) return;
  try {
    await queueViaWs(query);
    notify('✦ Queued', query.length > 60 ? query.slice(0, 57) + '…' : query, 'success');
  } catch (e) {
    notify('▲ Queue failed', e.message || 'Bot not reachable.', 'error');
  }
});
