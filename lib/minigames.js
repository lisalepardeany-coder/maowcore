'use strict';
// lib/minigames.js — content banks for /fun songguess (emoji → song TITLE; titles
// are facts, no lyrics reproduced) and /fun daily (engagement prompts).

// Each: emoji clue, four song-title options, and the correct index.
const SONG_EMOJI = [
  { e: '🚀👨', a: ['Space Oddity', 'Rocket Man', 'Starman', 'Fireflies'], i: 1 },
  { e: '👁️🐯', a: ['Eye of the Tiger', 'Roar', 'Survivor', 'Thunderstruck'], i: 0 },
  { e: '🪜😇', a: ['Highway to Hell', 'Stairway to Heaven', 'Paradise City', 'Heaven'], i: 1 },
  { e: '🌧️💜', a: ['Purple Haze', 'November Rain', 'Purple Rain', 'Set Fire to the Rain'], i: 2 },
  { e: '🍦🍦👶', a: ['Cold as Ice', 'Ice Ice Baby', 'Baby', 'Vanilla'], i: 1 },
  { e: '💃👑', a: ['Killer Queen', 'Dancing Queen', 'Drama Queen', 'Queen Bee'], i: 1 },
  { e: '🔥💧🌧️', a: ['Firework', 'Set Fire to the Rain', 'Burn', 'Rain on Me'], i: 1 },
  { e: '🌙🚶', a: ['Man on the Moon', 'Walking on the Moon', 'Moonwalk', 'Fly Me to the Moon'], i: 1 },
  { e: '👋', a: ['Hello', 'Hey Jude', 'Wave', 'Goodbye'], i: 0 },
  { e: '🐦🆓', a: ['Blackbird', 'Free Bird', 'Bird Set Free', 'Fly Away'], i: 1 },
  { e: '⚡🌩️', a: ['Thunder', 'Thunderstruck', 'Lightning', 'Shock Me'], i: 1 },
  { e: '🛣️😈', a: ['Highway to Hell', 'Life is a Highway', 'Hell on Wheels', 'Road to Nowhere'], i: 0 },
];
const randomSong = () => SONG_EMOJI[Math.floor(Math.random() * SONG_EMOJI.length)];

// Open-ended daily prompts (mix of questions + would-you-rathers). Picked
// deterministically by the day so everyone gets the same one.
const DAILY_QUESTIONS = [
  'Would you rather be able to fly 🕊️ or be invisible 👻?',
  'What\'s the best game you\'ve played this year? 🎮',
  'Coffee ☕ or tea 🍵 — and why?',
  'Would you rather fight 100 duck-sized horses 🐴 or 1 horse-sized duck 🦆?',
  'What\'s a hill you\'ll die on? ⛰️',
  'If you could main one game forever, what would it be? 🕹️',
  'Would you rather have unlimited money 💰 or unlimited time ⏳?',
  'What song is stuck in your head right now? 🎵',
  'Best movie of all time — go. 🎬',
  'Would you rather time-travel to the past or the future? ⏰',
  'What\'s your comfort food? 🍜',
  'Cats 🐱 or dogs 🐶?',
  'Would you rather always be 10 minutes late or 20 minutes early?',
  'What\'s a skill you wish you had? ✨',
  'Pineapple on pizza 🍍🍕 — yes or no?',
  'Would you rather explore space 🚀 or the deep ocean 🌊?',
  'What show are you binging lately? 📺',
  'Early bird 🌅 or night owl 🌙?',
  'Would you rather never use social media again or never watch another show?',
  'What\'s the best advice you\'ve ever gotten? 💬',
  'If you won the lottery tomorrow, first purchase? 🎰',
  'Would you rather be a famous streamer or a famous musician? 🎤',
  'Favourite emoji and why? 😄',
  'What\'s your hidden talent? 🤫',
];
const dailyQuestion = (date = new Date()) => {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86_400_000);
  return DAILY_QUESTIONS[dayOfYear % DAILY_QUESTIONS.length];
};

module.exports = { SONG_EMOJI, randomSong, DAILY_QUESTIONS, dailyQuestion };
