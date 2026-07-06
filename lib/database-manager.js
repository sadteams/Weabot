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
  ai: {
    settings: {
      enabled: true,
      model: 'gemini-3.5-flash',
      provider: 'gemini',
      maxHistory: 20,
      temperature: 0.82,
      topP: 0.95,
      maxTokens: 2048,
      thinkingLevel: 'minimal',
      allowTools: true,
      proactive: false,
      delivery: {
        enabled: true,
        multiMessage: true,
        typingPresence: true,
        maxMessages: 2,
        minSecondMessageLength: 120,
        delayMs: 650,
        followUpChance: 0.22,
      },
      expressions: {
        enabled: true,
        reactions: true,
        extraText: true,
        stickers: true,
        voice: true,
        cooldownMs: 120000,
        stickerCooldownMs: 300000,
        voiceCooldownMs: 300000,
        extraTextChance: 0.35,
        stickerChance: 0.28,
      },
    },
    sessions: {},
    histories: {},
    memories: {},
    toolCalls: {},
    usage: {},
  },
};

const dbFiles = {
  users: 'users.json',
  chats: 'chats.json',
  stats: 'stats.json',
  msgs: 'msgs.json',
  settings: 'settings.json',
  respon: 'respon.json',
  lid: 'lid.json',
  ai: 'ai.json',
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
      data.ai ||= mergeDefaults(defaultDb.ai, data.ai);
      data.ai.settings ||= { ...defaultDb.ai.settings };
      data.ai.sessions ||= {};
      data.ai.histories ||= {};
      data.ai.memories ||= {};
      data.ai.toolCalls ||= {};
      data.ai.usage ||= {};
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
