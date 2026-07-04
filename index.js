import { spawn }  from 'child_process';
import path       from 'path';
import { fileURLToPath } from 'url';
import logger from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let isRunning = false;

function start(file) {
  if (isRunning) return;
  isRunning = true;

  const args = [path.join(__dirname, file), ...process.argv.slice(2)];
  const p = spawn(process.argv[0], args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  let requestedReset = false;

  p.on('message', (data) => {
    if (data === 'reset') {
      requestedReset = true;
      p.kill();
    } else if (data === 'uptime') {
      p.send(process.uptime());
    }
  });

  p.on('exit', (code, signal) => {
    isRunning = false;
    if (requestedReset) {
      logger.warn('process', 'main reset requested, restarting');
      setTimeout(() => start('main.js'), 500);
      return;
    }
    if (code === 0) {
      logger.warn('process', `main exited cleanly${signal ? ` (${signal})` : ''}, not restarting`);
      return;
    }
    logger.warn('process', `main exited with code ${code}${signal ? ` (${signal})` : ''}, restarting`);
    setTimeout(() => start('main.js'), 2_000);
  });

  p.on('error', (err) => {
    logger.error('process', 'spawn error', err.message);
    p.kill();
    isRunning = false;
    setTimeout(() => start('main.js'), 2_000);
  });
}

start('main.js');
