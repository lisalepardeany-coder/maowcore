// Minimal i18n. Per-guild locale stored in config; falls back to en.
const { getGuild } = require('./config');

const LOCALES = {
  en: {
    noQueue: '◌ No active transmission.',
    notInVoice: '◌ Board a voice channel first.',
    paused: '⏸  Transmission suspended.',
    resumed: '▶  Transmission resumed.',
    skipped: '⏭  Warping to next signal',
    stopped: '⏹  Engines offline.',
    leaving: '⌬  Disengaging — returning to the void.',
  },
  es: {
    noQueue: '◌ No hay transmisión activa.',
    notInVoice: '◌ Únete a un canal de voz primero.',
    paused: '⏸  Transmisión suspendida.',
    resumed: '▶  Transmisión reanudada.',
    skipped: '⏭  Saltando a la siguiente señal',
    stopped: '⏹  Motores apagados.',
    leaving: '⌬  Desconectándose.',
  },
  fr: {
    noQueue: '◌ Aucune transmission active.',
    notInVoice: '◌ Rejoignez d\'abord un canal vocal.',
    paused: '⏸  Transmission suspendue.',
    resumed: '▶  Transmission reprise.',
    skipped: '⏭  Passage au signal suivant',
    stopped: '⏹  Moteurs éteints.',
    leaving: '⌬  Déconnexion.',
  },
  de: {
    noQueue: '◌ Keine aktive Übertragung.',
    notInVoice: '◌ Tritt zuerst einem Sprachkanal bei.',
    paused: '⏸  Übertragung pausiert.',
    resumed: '▶  Übertragung fortgesetzt.',
    skipped: '⏭  Sprung zum nächsten Signal',
    stopped: '⏹  Triebwerke aus.',
    leaving: '⌬  Trenne Verbindung.',
  },
  ja: {
    noQueue: '◌ アクティブな送信はありません。',
    notInVoice: '◌ まずボイスチャンネルに参加してください。',
    paused: '⏸  送信を一時停止しました。',
    resumed: '▶  送信を再開しました。',
    skipped: '⏭  次の信号へ',
    stopped: '⏹  エンジン停止。',
    leaving: '⌬  接続を切断します。',
  },
  pt: {
    noQueue: '◌ Sem transmissão ativa.',
    notInVoice: '◌ Entre num canal de voz primeiro.',
    paused: '⏸  Transmissão pausada.',
    resumed: '▶  Transmissão retomada.',
    skipped: '⏭  Indo para o próximo sinal',
    stopped: '⏹  Motores desligados.',
    leaving: '⌬  Desconectando.',
  },
};

const t = (guildId, key) => {
  const locale = getGuild(guildId)?.locale || 'en';
  return LOCALES[locale]?.[key] || LOCALES.en[key] || key;
};

module.exports = { t, LOCALES: Object.keys(LOCALES) };
