import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import Stream, { Readable } from 'stream';

export function filename(pathURL = import.meta, rmPrefix = os.platform() !== 'win32') {
  const value = pathURL.url || pathURL;
  if (!rmPrefix) return /file:\/\//.test(value) ? value : pathToFileURL(value).href;
  return /file:\/\//.test(value) ? fileURLToPath(value) : value;
}

export function dirname(pathURL = import.meta) {
  const file = filename(pathURL, true);
  if (/\/$/.test(file)) return file.replace(/\/$/, '');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return file.replace(/\/$/, '');
  return path.dirname(file);
}

export function requireFrom(pathURL = import.meta) {
  return createRequire(pathURL.url || pathURL);
}

export function checkFileExists(file) {
  return fs.promises.access(file, fs.constants.F_OK).then(() => true).catch(() => false);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jidNumber(jid) {
  return String(jid || '').split('@')[0].replace(/[^0-9]/g, '');
}

export function isLid(jid) {
  return /@lid$/i.test(String(jid || ''));
}

export function isPn(jid) {
  return /@s\.whatsapp\.net$/i.test(String(jid || ''));
}

export function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

export function formatSize(bytes = 0) {
  bytes = Number(bytes) || 0;
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function pick(object, keys = []) {
  return Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));
}

export function saveStreamToFile(stream, file) {
  return new Promise((resolve, reject) => {
    const writable = stream.pipe(fs.createWriteStream(file));
    writable.once('finish', () => {
      resolve();
      writable.destroy();
    });
    writable.once('error', (error) => {
      reject(error);
      writable.destroy();
    });
  });
}

const kDestroyed = Symbol('kDestroyed');
const kIsReadable = Symbol('kIsReadable');

export function isNodeStream(stream) {
  return !!(stream && (stream._readableState || stream._writableState || typeof stream.write === 'function' || typeof stream.pipe === 'function'));
}

export function isReadableStream(stream) {
  if (typeof Stream.isReadable === 'function') return Stream.isReadable(stream);
  if (stream && stream[kIsReadable] != null) return stream[kIsReadable];
  if (!isNodeStream(stream)) return false;
  if (stream.destroyed || stream[kDestroyed]) return false;
  return stream instanceof Readable || stream.readable !== false;
}

export function installLibsignalLogFilter() {
  if (global.__libsignalLogFilterInstalled) return;
  global.__libsignalLogFilterInstalled = true;
  const shouldIgnore = (args) => {
    const text = args.map((arg) => typeof arg === 'string' ? arg : '').join(' ');
    return /Closing session:|Opening session:|Removing old closed session:|Closing open session in favor of incoming prekey bundle|Session already closed|Session already open/i.test(text);
  };
  const originalInfo = console.info.bind(console);
  const originalWarn = console.warn.bind(console);
  console.info = (...args) => { if (!shouldIgnore(args)) originalInfo(...args); };
  console.warn = (...args) => { if (!shouldIgnore(args)) originalWarn(...args); };
}

export default {
  filename,
  dirname,
  requireFrom,
  checkFileExists,
  ensureDir,
  readJson,
  writeJson,
  delay,
  jidNumber,
  isLid,
  isPn,
  normalizePhone,
  formatSize,
  pick,
  saveStreamToFile,
  isReadableStream,
  installLibsignalLogFilter,
};
