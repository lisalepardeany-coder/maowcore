const fmtClock = (sec) => {
  if (sec == null || Number.isNaN(sec)) return '—';
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const fmtTotal = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const progressBar = (cur, total, length = 18) => {
  if (!total) return '─'.repeat(length);
  const ratio = Math.min(1, Math.max(0, cur / total));
  const pos = Math.floor(ratio * length);
  return '─'.repeat(pos) + '◆' + '─'.repeat(Math.max(0, length - pos - 1));
};

const truncate = (str, n) => (str.length > n ? str.slice(0, n - 1) + '…' : str);

const LOOP_LABELS = {
  short: { 0: 'off', 1: 'signal', 2: 'queue' },
  long: { 0: 'disengaged', 1: 'current signal', 2: 'whole manifest' },
};

const loopLabel = (mode, style = 'short') => LOOP_LABELS[style]?.[mode] ?? LOOP_LABELS.short[0];

module.exports = { fmtClock, fmtTotal, progressBar, truncate, loopLabel };
