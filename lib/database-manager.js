/*─────────────────────────────────────────
  lib/database-manager.js - lowdb modular JSON db
─────────────────────────────────────────*/

import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

import { makeInMemoryStore } from './store.js';
import { ensureDir } from './helper.js';

export { makeInMemoryStore } from './store.js';

export const defaultDb = {
  users: {},
  chats: {},
  stats: {},
  msgs: {},
  settings: { blockcmd: [] },
  respon: {},
  lid: { lids: {}, phones: {} },
};

const dbFiles = {
  users: 'users.json',
  chats: 'chats.json',
  stats: 'stats.json',
  msgs: 'msgs.json',
  settings: 'settings.json',
  respon: 'respon.json',
  lid: 'lid.json',
};

function mergeDefaults(defaultValue, value) {
  if (Array.isArray(defaultValue)) return Array.isArray(value) ? value : defaultValue;
  if (!defaultValue || typeof defaultValue !== 'object') return value ?? defaultValue;
  return { ...defaultValue, ...(value && typeof value === 'object' ? value : {}) };
}

function createLowJson(file, defaults) {
  return new Low(new JSONFile(file), defaults);
}

export function createDatabase({ rootDir, chain } = {}) {
  const databaseDir = path.join(rootDir, 'database');
  const files = Object.fromEntries(Object.entries(dbFiles).map(([key, file]) => [key, path.join(databaseDir, file)]));
  const sections = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, createLowJson(file, defaultDb[key])])) ;

  const db = {
    READ: false,
    data: null,
    dir: databaseDir,
    files,
    sections,
    chain: null,

    async read() {
      ensureDir(databaseDir);
      const data = {};

      for (const [key, section] of Object.entries(this.sections)) {
        await section.read();
        section.data = mergeDefaults(defaultDb[key], section.data);
        data[key] = section.data;
      }

      data.settings ||= {};
      data.settings.blockcmd ||= [];
      data.lid ||= {};
      data.lid.lids ||= {};
      data.lid.phones ||= {};
      this.data = data;
      this.chain = chain ? chain(this.data) : null;
    },

    async write(data = this.data) {
      if (!data) return;
      ensureDir(databaseDir);
      for (const [key, section] of Object.entries(this.sections)) {
        section.data = mergeDefaults(defaultDb[key], data[key]);
        await section.write();
      }
    },
  };

  return db;
}

export function createStore({ rootDir, file, maxMessages } = {}) {
  const storeFile = file || path.join(rootDir, 'database', 'store.json');
  return makeInMemoryStore({ file: storeFile, maxMessages });
}
