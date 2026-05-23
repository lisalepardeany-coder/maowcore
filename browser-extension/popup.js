const el = (id) => document.getElementById(id);

chrome.storage.sync.get(['botUrl']).then(({ botUrl }) => {
  el('bot-url').value = botUrl || 'http://127.0.0.1:8765';
});

el('save').addEventListener('click', async () => {
  const v = el('bot-url').value.trim();
  await chrome.storage.sync.set({ botUrl: v });
  el('status').textContent = '✦ Saved.';
});
