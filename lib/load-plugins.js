import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import logger from './logger.js';

async function scanDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? scanDir(fullPath) : fullPath;
  }));
  return files.flat();
}

async function importPlugin(file) {
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return mod.default || mod;
}

function relativePlugin(rootDir, file) {
  return file.replace(rootDir, '').replaceAll(path.sep, '/');
}

export async function loadPlugins({ rootDir, pluginDir = path.join(rootDir, 'plugins') }) {
  global.plugins = {};

  const files = (await scanDir(pluginDir)).filter((file) => file.endsWith('.js') && !path.basename(file).startsWith('_'));
  for (const file of files) {
    const rel = relativePlugin(rootDir, file);
    try {
      global.plugins[rel] = await importPlugin(file);
    } catch (error) {
      logger.error('plugins', `load failed ${rel}`, error.message);
    }
  }

  global.plugins = Object.fromEntries(
    Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
  );

  logger.success('plugins', `loaded ${Object.keys(global.plugins).length} plugin(s)`);
  return global.plugins;
}

export function watchPlugins({ rootDir, pluginDir = path.join(rootDir, 'plugins') }) {
  const watcher = chokidar.watch(pluginDir, { persistent: true, ignoreInitial: true });

  watcher
    .on('add', async (file) => {
      if (!file.endsWith('.js')) return;
      const rel = relativePlugin(rootDir, file);
      try {
        global.plugins[rel] = await importPlugin(file);
        logger.info('plugins', `added ${rel}`);
      } catch (error) {
        logger.error('plugins', `add failed ${rel}`, error.message);
      }
    })
    .on('change', async (file) => {
      if (!file.endsWith('.js')) return;
      const rel = relativePlugin(rootDir, file);
      try {
        global.plugins[rel] = await importPlugin(file);
        logger.info('plugins', `reloaded ${rel}`);
      } catch (error) {
        logger.error('plugins', `reload failed ${rel}`, error.message);
      }
    })
    .on('unlink', (file) => {
      const rel = relativePlugin(rootDir, file);
      delete global.plugins[rel];
      logger.warn('plugins', `removed ${rel}`);
    });

  return watcher;
}

export default loadPlugins;
