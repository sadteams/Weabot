import './config.js';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import { fileURLToPath } from 'url';
import lodash from 'lodash';

import { handler, participantsUpdate } from './handler.js';
import connect from './lib/connection.js';
import { createDatabase, createStore } from './lib/database-manager.js';
import { loadPlugins, watchPlugins } from './lib/load-plugins.js';
import clearSessions from './lib/clear-sessions.js';
import clearTmp from './lib/clear-tmp.js';
import logger from './lib/logger.js';
import { getQueue } from './lib/queue.js';
import { installLibsignalLogFilter } from './lib/helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _ = lodash;
installLibsignalLogFilter();

const appDefaults = {
  name: 'Bot',
  version: '1.0.0',
  thumbnail: '',
};

global.namebot = global.wm || appDefaults.name;
global.version = appDefaults.version;
global.thumb = appDefaults.thumbnail;

global.opts = yargs(hideBin(process.argv))
  .option('pairing', {
    type: 'boolean',
    default: undefined,
    describe: 'Login memakai pairing code',
  })
  .option('qr', {
    type: 'boolean',
    default: false,
    describe: 'Login memakai QR terminal',
  })
  .option('phone', {
    type: 'string',
    describe: 'Nomor WA untuk pairing code, contoh: 62895xxx',
  })
  .option('clear-session', {
    type: 'boolean',
    default: false,
    describe: 'Hapus file session sebelum bot dijalankan',
  })
  .option('clear-tmp', {
    type: 'boolean',
    default: false,
    describe: 'Hapus file tmp sebelum bot dijalankan',
  })
  .option('autoread', { type: 'boolean', default: false })
  .option('queue', { type: 'boolean', default: true, describe: 'Proses pesan satu per satu lewat queue' })
  .option('queque', { type: 'boolean', default: true, describe: 'Alias lama untuk queue' })
  .option('queue-concurrency', { type: 'number', default: 1, describe: 'Jumlah pekerjaan handler paralel' })
  .option('queue-interval', { type: 'number', default: 150, describe: 'Jeda antar pekerjaan queue dalam ms' })
  .option('noprefix', { type: 'boolean', default: false })
  .exitProcess(false)
  .parse();

global.prefix = new RegExp('^[xzXZ/!#$%+^=.\-]');

global.queueConcurrency = Math.max(1, Number(global.opts.queueConcurrency || 1));
global.queueInterval = Math.max(0, Number(global.opts.queueInterval || 150));
global.handlerQueue = getQueue('handler', { concurrency: global.queueConcurrency, interval: global.queueInterval });
logger.info('queue', 'handler queue ready', `concurrency ${global.queueConcurrency}, interval ${global.queueInterval}ms`);

global.db = createDatabase({ rootDir: __dirname, chain: _.chain });
global.loadDatabase = async () => {
  if (global.db.data !== null) return;
  global.db.READ = true;
  await global.db.read();
  global.db.READ = false;
};

await global.loadDatabase();
setInterval(() => {
  if (typeof global.db?.write !== 'function') {
    logger.error('database', 'write method is unavailable');
    return;
  }
  global.db.write(global.db.data || {});
}, 30_000);

global.store = createStore({ rootDir: __dirname });
try {
  global.store.readFromFile();
} catch (error) {
  logger.warn('store', 'failed to read store', error.message);
}
setInterval(() => {
  try {
    global.store.writeToFile();
  } catch (error) {
    logger.warn('store', 'failed to write store', error.message);
  }
}, 10_000);

if (global.opts.clearSession) await clearSessions(__dirname);
if (global.opts.clearTmp) await clearTmp(__dirname);

await loadPlugins({ rootDir: __dirname });
watchPlugins({ rootDir: __dirname });

connect({
  store: global.store,
  onMessagesUpsert: handler,
  onParticipantsUpdate: participantsUpdate,
}).catch((error) => {
  logger.error('runtime', 'fatal error', error.stack || error.message);
  process.exit(1);
});

process.on('uncaughtException', (error) => logger.error('runtime', 'uncaught exception', error.stack || error.message));
process.on('unhandledRejection', (error) => logger.error('runtime', 'unhandled rejection', error?.stack || String(error)));
