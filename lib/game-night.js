// Game night minigames for v2.7.0 — quiz, trivia, name-that-tune.
// Stateless aside from active-session tracking; each session lives in
// memory only (lost on bot restart, which is fine for game nights).

const crypto = require('node:crypto');

const sessions = new Map();  // sessionId → state

const newId = () => crypto.randomBytes(6).toString('hex');

// === Quiz / trivia ===
// Question shape: { q: '...', choices: ['a', 'b', 'c', 'd'], answer: <index> }
const startQuiz = ({ guildId, channelId, questions, hostUserId }) => {
  if (!Array.isArray(questions) || !questions.length) throw new Error('questions[] required');
  const id = newId();
  const session = {
    id, kind: 'quiz', guildId, channelId, hostUserId,
    questions, currentIndex: 0,
    scores: {},   // userId → correct count
    startedAt: Date.now(),
    status: 'live',
  };
  sessions.set(id, session);
  return session;
};

const submitAnswer = (sessionId, userId, choice) => {
  const s = sessions.get(sessionId);
  if (!s || s.status !== 'live') throw new Error('Session not found or ended');
  const q = s.questions[s.currentIndex];
  if (!q) throw new Error('No active question');
  const correct = Number(choice) === q.answer;
  if (correct) {
    s.scores[userId] = (s.scores[userId] || 0) + 1;
  }
  return { correct, current: s.currentIndex, scores: s.scores };
};

const nextQuestion = (sessionId) => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session not found');
  s.currentIndex++;
  if (s.currentIndex >= s.questions.length) {
    s.status = 'finished';
    s.finishedAt = Date.now();
  }
  return s;
};

const endSession = (sessionId) => {
  const s = sessions.get(sessionId);
  if (s) { s.status = 'finished'; s.finishedAt = Date.now(); }
  return s;
};

const getSession = (id) => sessions.get(id) || null;
const listSessions = (guildId) => [...sessions.values()].filter((s) => !guildId || s.guildId === guildId);

// === Name-that-tune ===
// Pulls 10 random songs from the library, plays a 10s clip of each via the
// existing DisTube pipeline, players guess the name.
const buildNameThatTune = ({ library, count = 10 }) => {
  const songs = library.list();
  if (songs.length < count) throw new Error(`Need at least ${count} songs in library (have ${songs.length})`);
  const picks = [];
  const used = new Set();
  while (picks.length < count && picks.length < songs.length) {
    const i = Math.floor(Math.random() * songs.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push(songs[i]);
  }
  return picks.map((s) => ({
    songId: s.id,
    file: s.file,
    answer: s.name,
    // Plausible distractor names — other library entries shuffled.
    choices: shuffle([s.name, ...sampleOthers(songs, s.id, 3)]),
  }));
};

const sampleOthers = (songs, excludeId, n) => {
  const pool = songs.filter((s) => s.id !== excludeId).map((s) => s.name);
  shuffle(pool);
  return pool.slice(0, n);
};
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

module.exports = { startQuiz, submitAnswer, nextQuestion, endSession, getSession, listSessions, buildNameThatTune };
