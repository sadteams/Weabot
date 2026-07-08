/*─────────────────────────────────────────
  lib/database-manager.js - Mongoose MongoDB
─────────────────────────────────────────*/

import mongoose from 'mongoose';
import { makeInMemoryStore } from './store.js';
export { makeInMemoryStore } from './store.js';

const MONGO_URL = "mongodb+srv://Kangsad01:190804@cluster0.acuv2cj.mongodb.net"

// helper buat encode/decode key karena mongo gaboleh ada .
const encodeKey = (key) => key.replace(/\./g, '_DOT_')
const decodeKey = (key) => key.replace(/_DOT_/g, '.')

// Schema Default biar sama kayak lowdb kamu
const userSchema = new mongoose.Schema({
    exp: { type: Number, default: 0, set: v => isNaN(v) ? 0 : Number(v) },
    money: { type: Number, default: 0, set: v => isNaN(v) ? 0 : Number(v) },
    limit: { type: Number, default: 10, set: v => isNaN(v) ? 10 : Number(v) },
    lastclaim: { type: Number, default: 0, set: v => isNaN(v) ? 0 : Number(v) },
    registered: { type: Boolean, default: false },
    name: String,
}, { _id: false })

const chatSchema = new mongoose.Schema({}, { _id: false, strict: false })
const statsSchema = new mongoose.Schema({}, { _id: false, strict: false })
const msgsSchema = new mongoose.Schema({}, { _id: false, strict: false })
const responSchema = new mongoose.Schema({}, { _id: false, strict: false })

const settingsSchema = new mongoose.Schema({
    blockcmd: { type: [String], default: [] }
}, { _id: false })

const lidSchema = new mongoose.Schema({
    lids: { type: Object, default: {} },
    phones: { type: Object, default: {} }
}, { _id: false })

const dbSchema = new mongoose.Schema({
    users: { type: Map, of: userSchema, default: {} },
    chats: { type: Map, of: chatSchema, default: {} },
    stats: { type: Map, of: statsSchema, default: {} },
    msgs: { type: Map, of: msgsSchema, default: {} },
    settings: { type: settingsSchema, default: {} },
    respon: { type: Map, of: responSchema, default: {} },
    lid: { type: lidSchema, default: {} },
}, { timestamps: true })

const DB = mongoose.model('Database', dbSchema)

export const defaultDb = {
  users: {},
  chats: {},
  stats: {},
  msgs: {},
  settings: { blockcmd: [] },
  respon: {},
  lid: { lids: {}, phones: {} },
};

function encodeMap(obj) {
  return new Map(Object.entries(obj).map(([k, v]) => [encodeKey(k), v]))
}

function decodeMap(map) {
  if(!map) return {}
  return Object.fromEntries([...map.entries()].map(([k, v]) => [decodeKey(k), v]))
}

export function createDatabase({ chain } = {}) {
  const db = {
    READ: false,
    data: null,
    chain: null,

    async read() {
      if(mongoose.connection.readyState!== 1) {
        await mongoose.connect(MONGO_URL)
        console.log('✅ MongoDB Connected')
      }

      let data = await DB.findOne()
      if(!data) {
        data = await DB.create(defaultDb) 
      }

      // ubah Map jadi Object + decode key
      this.data = {
        users: decodeMap(data.users),
        chats: decodeMap(data.chats),
        stats: decodeMap(data.stats),
        msgs: decodeMap(data.msgs),
        settings: data.settings,
        respon: decodeMap(data.respon),
        lid: data.lid,
      }
      this.chain = chain? chain(this.data) : null;
      this.READ = true
    },

    async write(data = this.data) {
      if (!data) return;

      // ubah Object jadi Map + encode key
      await DB.updateOne({}, {
        users: encodeMap(data.users),
        chats: encodeMap(data.chats),
        stats: encodeMap(data.stats),
        msgs: encodeMap(data.msgs),
        settings: data.settings,
        respon: encodeMap(data.respon),
        lid: data.lid,
      }, { upsert: true })
    },
  };
  return db;
}

export function createStore({ rootDir, file, maxMessages } = {}) {
  const storeFile = file || 'database/store.json';
  return makeInMemoryStore({ file: storeFile, maxMessages });
}