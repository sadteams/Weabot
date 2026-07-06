import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const gameDir = path.join(rootDir, 'database', 'games');

const timeout = 120000;
const defaultExp = 4999;
const defaultMoney = 20;
const threshold = 0.72;
const cache = new Map();

export const gameDefinitions = [
  { id: 'asahotak', command: ['asahotak'], title: 'Asah Otak', file: 'asahotak.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'caklontong', command: ['caklontong', 'lontong'], title: 'Cak Lontong', file: 'caklontong.json', kind: 'text', exp: 4500, money: 20 },
  { id: 'family100', command: ['family100', 'fam100'], title: 'Family 100', file: 'family100.json', kind: 'family', exp: 6500, money: 35 },
  { id: 'siapakahaku', command: ['siapakahaku', 'siapaku'], title: 'Siapakah Aku', file: 'siapakahaku.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'susunkata', command: ['susunkata'], title: 'Susun Kata', file: 'susunkata.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'tebakbendera', command: ['tebakbendera', 'bendera'], title: 'Tebak Bendera', file: 'tebakbendera.json', kind: 'image', exp: 4000, money: 20 },
  { id: 'tebakbendera2', command: ['tebakbendera2', 'bendera2'], title: 'Tebak Bendera 2', file: 'tebakbendera2.json', kind: 'image', exp: 4000, money: 20 },
  { id: 'tebakgambar', command: ['tebakgambar'], title: 'Tebak Gambar', file: 'tebakgambar.json', kind: 'image', exp: 5000, money: 25 },
  { id: 'tebakkabupaten', command: ['tebakkabupaten', 'kabupaten'], title: 'Tebak Kabupaten', file: 'tebakkabupaten.json', kind: 'image', exp: 4500, money: 20 },
  { id: 'tebakkalimat', command: ['tebakkalimat'], title: 'Tebak Kalimat', file: 'tebakkalimat.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'tebakkata', command: ['tebakkata', 'tebak'], title: 'Tebak Kata', file: 'tebakkata.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'tebakkimia', command: ['tebakkimia', 'kimia'], title: 'Tebak Kimia', file: 'tebakkimia.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'tebaklirik', command: ['tebaklirik', 'lirik'], title: 'Tebak Lirik', file: 'tebaklirik.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'tebaktebakan', command: ['tebaktebakan', 'tebakan'], title: 'Tebak Tebakan', file: 'tebaktebakan.json', kind: 'text', exp: 3500, money: 15 },
  { id: 'tekateki', command: ['tekateki', 'ttk'], title: 'Teka Teki', file: 'tekateki.json', kind: 'text', exp: 3500, money: 15 },
];

export const allGameCommands = gameDefinitions.flatMap((game) => game.command);
export const gameByCommand = new Map(gameDefinitions.flatMap((game) => game.command.map((cmd) => [cmd, game])));

function state(conn) {
  conn.game ||= {};
  conn.game.sessions ||= {};
  conn.game.pools ||= {};
  return conn.game;
}

export function loadGameData(file) {
  if (cache.has(file)) return cache.get(file);
  const full = path.join(gameDir, file);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  cache.set(file, data);
  return data;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

export function shuffleArray(input) {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function pickQuestion(conn, def) {
  const data = loadGameData(def.file);
  const s = state(conn);
  const key = def.id;
  const currentPool = s.pools[key];
  if (!Array.isArray(currentPool) || !currentPool.length || currentPool.some((index) => !data[index])) {
    s.pools[key] = shuffleArray(data.map((_, index) => index));
  }
  const index = s.pools[key].pop();
  return data[index] || data[randomInt(data.length)];
}

export function normalizeAnswer(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a = '', b = '') {
  a = normalizeAnswer(a);
  b = normalizeAnswer(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

export function similarity(a = '', b = '') {
  a = normalizeAnswer(a);
  b = normalizeAnswer(b);
  const longest = Math.max(a.length, b.length);
  if (!longest) return 1;
  return (longest - levenshtein(a, b)) / longest;
}

export function makeHint(answer = '') {
  return String(answer || '').trim().replace(/[AIUEOaiueo0-9]/g, '_');
}

export function mapGameQuestion(def, item) {
  if (def.id === 'family100') {
    const answers = (item.jawaban || []).map((answer) => String(answer).trim()).filter(Boolean);
    return {
      title: def.title,
      question: item.soal,
      answers,
      normalizedAnswers: answers.map(normalizeAnswer),
      found: Array(answers.length).fill(false),
      kind: 'family',
      hint: answers.map((answer) => makeHint(answer)).join(', '),
      raw: item,
    };
  }
  if (def.id === 'tebakbendera' || def.id === 'tebakbendera2') {
    return { title: def.title, question: 'Negara apakah bendera ini?', answer: item.name, image: item.img, hint: makeHint(item.name), raw: item };
  }
  if (def.id === 'tebakgambar') {
    return { title: def.title, question: 'Tebak maksud dari gambar berikut.', answer: item.jawaban, image: item.img, hint: makeHint(item.jawaban), description: item.deskripsi, raw: item };
  }
  if (def.id === 'tebakkabupaten') {
    return { title: def.title, question: 'Lambang kabupaten/kota manakah ini?', answer: item.title, image: item.url, hint: makeHint(item.title), raw: item };
  }
  if (def.id === 'tebakkimia') {
    return { title: def.title, question: 'Apa lambang kimia dari unsur berikut?\n' + item.unsur, answer: item.lambang, hint: makeHint(item.lambang), raw: item };
  }
  if (def.id === 'susunkata') {
    return { title: def.title, question: item.soal, answer: item.jawaban, hint: makeHint(item.jawaban), extra: item.tipe ? 'Tipe: ' + item.tipe : '', raw: item };
  }
  return {
    title: def.title,
    question: item.soal,
    answer: item.jawaban,
    hint: makeHint(item.jawaban),
    description: item.deskripsi,
    raw: item,
  };
}

function userRecord(jid) {
  global.db.data.users ||= {};
  global.db.data.users[jid] ||= {};
  const user = global.db.data.users[jid];
  user.exp = Number(user.exp || 0);
  user.money = Number(user.money || 0);
  return user;
}

export function addGameReward(jid, exp, money) {
  const user = userRecord(jid);
  user.exp += Number(exp || 0);
  user.money += Number(money || 0);
  return user;
}

export function formatGameHeader(game, usedPrefix = '.') {
  const timeoutSecond = Math.round((game.timeoutMs || timeout) / 1000);
  return [
    '┌─⊷ *' + game.title.toUpperCase() + '*',
    game.extra ? '▢ ' + game.extra : '',
    '▢ Timeout: ' + timeoutSecond + ' detik',
    '▢ Bonus: ' + game.exp + ' XP + $' + game.money,
    '▢ Balas pesan soal atau ketik jawaban langsung',
    '└──────────────',
    '',
    game.question,
    '',
    'Gunakan *' + usedPrefix + 'hintgame* untuk hint.',
    'Gunakan *' + usedPrefix + 'stopgame* untuk berhenti.',
  ].filter(Boolean).join('\n');
}

export function formatFamilyQuestion(game, usedPrefix = '.') {
  return [
    '┌─⊷ *FAMILY 100*',
    '▢ Jawaban: ' + game.answers.length,
    '▢ Timeout: ' + Math.round((game.timeoutMs || timeout) / 1000) + ' detik',
    '▢ Bonus selesai: ' + game.exp + ' XP + $' + game.money,
    '└──────────────',
    '',
    game.question,
    '',
    game.answers.map((_, i) => (i + 1) + '. ' + (game.found[i] ? game.answers[i] : '___')).join('\n'),
    '',
    'Gunakan *' + usedPrefix + 'hintgame* untuk hint.',
    'Gunakan *' + usedPrefix + 'stopgame* untuk berhenti.',
  ].join('\n');
}

export function formatFamilyBoard(game) {
  return [
    '🎮 *FAMILY 100*',
    '',
    game.question,
    '',
    game.answers.map((answer, i) => (i + 1) + '. ' + (game.found[i] ? '✅ ' + answer : '___')).join('\n'),
  ].join('\n');
}

export function getGameDefinition(idOrCommand = '') {
  const value = String(idOrCommand || '').toLowerCase();
  return gameDefinitions.find((game) => game.id === value) || gameByCommand.get(value) || null;
}

export async function startGame({ conn, m, command, gameId, usedPrefix = '.' }) {
  const def = gameId ? getGameDefinition(gameId) : gameByCommand.get(String(command || '').toLowerCase());
  if (!def) return false;

  const s = state(conn);
  const id = m.chat;
  if (s.sessions[id]) {
    const active = s.sessions[id];
    await conn.reply(m.chat, 'Masih ada game *' + active.title + '* yang belum selesai. Ketik *' + usedPrefix + 'stopgame* untuk berhenti.', active.message || m);
    return true;
  }

  const item = pickQuestion(conn, def);
  const game = mapGameQuestion(def, item);
  game.id = def.id;
  game.command = command;
  game.exp = def.exp || defaultExp;
  game.money = def.money || defaultMoney;
  game.timeoutMs = def.timeout || timeout;
  game.startedAt = Date.now();
  game.sender = m.sender;

  const caption = game.kind === 'family' ? formatFamilyQuestion(game, usedPrefix) : formatGameHeader(game, usedPrefix);
  const msg = game.image
    ? await conn.sendImage(m.chat, game.image, caption, m)
    : await conn.reply(m.chat, caption, m);

  game.message = msg;
  game.messageIds = [msg?.key?.id].filter(Boolean);
  game.timeout = setTimeout(() => timeoutGame(conn, m.chat), game.timeoutMs);
  s.sessions[id] = game;
  return true;
}

export async function timeoutGame(conn, chat) {
  const s = state(conn);
  const game = s.sessions[chat];
  if (!game) return;
  delete s.sessions[chat];
  if (game.kind === 'family') {
    const missing = game.answers.filter((_, i) => !game.found[i]);
    await conn.reply(chat, '⏳ Waktu habis!\n\nJawaban yang belum terjawab:\n' + missing.map((answer) => '• ' + answer).join('\n'), game.message);
    return;
  }
  const note = game.description ? '\n\n' + game.description : '';
  await conn.reply(chat, '⏳ Waktu habis!\nJawabannya adalah *' + game.answer + '*' + note, game.message);
}

function findActiveGame(conn, chat) {
  for (const def of gameDefinitions) {
    const session = conn[def.id];
    if (session?.[chat]) return { def, session, game: session[chat] };
  }
  const legacy = state(conn).sessions[chat];
  if (legacy) return { def: getGameDefinition(legacy.id), session: state(conn).sessions, game: legacy };
  return null;
}

export async function stopGame(conn, chat, quoted) {
  const active = findActiveGame(conn, chat);
  if (!active) return false;
  const { session, game } = active;
  clearTimeout(game.timeout);
  delete session[chat];
  await conn.reply(chat, '✅ Game *' + game.title + '* dihentikan.\nJawaban: *' + (game.answer || game.answers?.join(', ')) + '*', quoted || game.msg || game.message);
  return true;
}

export async function hintGame(conn, chat, quoted) {
  const active = findActiveGame(conn, chat);
  if (!active) return false;
  const { game } = active;
  if (game.kind === 'family') {
    const remaining = game.answers.filter((_, i) => !game.found[i]).map(makeHint);
    await conn.reply(chat, '🔍 *Hint:*\n' + remaining.join('\n'), quoted || game.msg || game.message);
    return true;
  }
  await conn.reply(chat, '🔍 *Hint:* ' + game.hint, quoted || game.msg || game.message);
  return true;
}

function isReplyToGame(m, game) {
  if (!m.quoted) return true;
  if (!game.messageIds?.length) return true;
  return game.messageIds.includes(m.quoted.id);
}

export async function answerGame(conn, m, { prefix = '.', gameId } = {}) {
  const game = state(conn).sessions[m.chat];
  if (!game) return false;
  if (gameId && game.id !== gameId) return false;
  const text = String(m.text || '').trim();
  if (!text || text.startsWith(prefix)) return false;
  if (!isReplyToGame(m, game)) return false;

  if (game.kind === 'family') return answerFamily(conn, m, game, text);
  return answerSingle(conn, m, game, text);
}

async function answerSingle(conn, m, game, text) {
  const answer = normalizeAnswer(game.answer);
  const value = normalizeAnswer(text);
  if (value === answer) {
    clearTimeout(game.timeout);
    delete state(conn).sessions[m.chat];
    const jid = conn.getJid ? conn.getJid(m.sender) : m.sender;
    addGameReward(jid, game.exp, game.money);
    await conn.reply(m.chat, '✅ *Benar!* 🎉\nJawaban: *' + game.answer + '*\n+' + game.exp + ' XP & +$' + game.money + ' telah ditambahkan.', m);
    return true;
  }
  if (similarity(value, answer) >= threshold) {
    await conn.reply(m.chat, '⚠️ *Hampir benar!* Coba lagi.', m);
    return true;
  }
  await conn.reply(m.chat, '❌ *Salah!*', m);
  return true;
}

async function answerFamily(conn, m, game, text) {
  const value = normalizeAnswer(text);
  const index = game.normalizedAnswers.findIndex((answer, i) => !game.found[i] && answer === value);
  if (index < 0) {
    const near = game.normalizedAnswers.some((answer, i) => !game.found[i] && similarity(value, answer) >= threshold);
    await conn.reply(m.chat, near ? '⚠️ *Hampir benar!* Coba lagi.' : '❌ *Salah!*', m);
    return true;
  }

  game.found[index] = true;
  const jid = conn.getJid ? conn.getJid(m.sender) : m.sender;
  const partialExp = Math.max(250, Math.floor(game.exp / game.answers.length));
  const partialMoney = Math.max(1, Math.floor(game.money / game.answers.length));
  addGameReward(jid, partialExp, partialMoney);

  if (game.found.every(Boolean)) {
    clearTimeout(game.timeout);
    delete state(conn).sessions[m.chat];
    addGameReward(jid, game.exp, game.money);
    await conn.reply(m.chat, '✅ *Selesai!* Semua jawaban Family 100 ditemukan.\n\n' + formatFamilyBoard(game) + '\n\nBonus selesai: +' + game.exp + ' XP & +$' + game.money, m);
    return true;
  }

  await conn.reply(m.chat, '✅ *Benar!* +' + partialExp + ' XP & +$' + partialMoney + '\n\n' + formatFamilyBoard(game), m);
  return true;
}

export function gameMenu(prefix = '.') {
  return [
    '*Daftar Game*',
    '',
    ...gameDefinitions.map((game) => '• ' + prefix + game.command[0] + ' - ' + game.title),
    '',
    'Helper:',
    '• ' + prefix + 'hintgame',
    '• ' + prefix + 'stopgame',
  ].join('\n');
}
