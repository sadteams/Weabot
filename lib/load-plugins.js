import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import logger from './logger.js';

const fileToAliases = new Map(); // Simpen mapping file -> [alias1, alias2]

async function scanDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory()? scanDir(fullPath) : fullPath;
  }));
  return files.flat();
}

async function importPlugin(file) {
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return mod.default || mod;
}

function relativePlugin(rootDir, file) {
  return './' + file.replace(rootDir, '').replace(/^[/\\]+/, '').replaceAll(path.sep, '/');
}

function registerPlugin(file, plugin, rootDir) {
  const rel = relativePlugin(rootDir, file);

  // 1. Ambil semua alias dari command regex/array/string
  let aliases = [];
  if (plugin.command instanceof RegExp) {
    // /^(tt|tiktok|ttdl)$/i -> ['tt', 'tiktok', 'ttdl']
    aliases = [...plugin.command.source.replace(/^\^|$$|\(|\)|\?:|\\w/g, '').split('|')];
  } else if (Array.isArray(plugin.command)) {
    aliases = plugin.command;
  } else if (typeof plugin.command === 'string') {
    aliases = [plugin.command];
  } else {
    aliases = [path.basename(file, '.js')]; // fallback
  }

  fileToAliases.set(file, aliases);
  global.plugins[rel] = plugin; // Key = path file

  // 2. Daftarin semua alias ke global.commands
  for (const alias of aliases) {
    global.commands[alias] = plugin;
  }
}
function unregisterPlugin(file, rootDir) {
  const rel = relativePlugin(rootDir, file);
  const aliases = fileToAliases.get(file) || [];
  delete global.plugins[rel];
  for (const alias of aliases) {
    delete global.commands[alias];
  }
  fileToAliases.delete(file);
}

export async function loadPlugins({ rootDir, pluginDir = path.join(rootDir, 'plugins') }) {
  global.plugins = {}; // -> '/plugins/...js': handler
  global.commands = {}; // -> 'tt': handler, 'tiktok': handler
  fileToAliases.clear();

  const files = (await scanDir(pluginDir)).filter((file) => file.endsWith('.js') &&!path.basename(file).startsWith('_'));
  for (const file of files) {
    try {
      const plugin = await importPlugin(file);
      registerPlugin(file, plugin, rootDir);
    } catch (error) {
      const rel = relativePlugin(rootDir, file);
      logger.error('plugins', `load failed ${rel}`, error.message);
    }
  }

  logger.success('plugins', `loaded ${Object.keys(global.plugins).length} file, ${Object.keys(global.commands).length} command`);
  return { plugins: global.plugins, commands: global.commands };
}

export function watchPlugins({ rootDir, pluginDir = path.join(rootDir, 'plugins') }) {
  const watcher = chokidar.watch(pluginDir, { persistent: true, ignoreInitial: true });

  watcher
   .on('add', async (file) => {
      if (!file.endsWith('.js')) return;
      try { registerPlugin(file, await importPlugin(file), rootDir); logger.info('plugins', `added ${file}`); }
      catch (error) { logger.error('plugins', `add failed`, error.message); }
    })
   .on('change', async (file) => {
      if (!file.endsWith('.js')) return;
      unregisterPlugin(file, rootDir); // Hapus semua alias lama
      try { registerPlugin(file, await importPlugin(file), rootDir); logger.info('plugins', `reloaded ${file}`); }
      catch (error) { logger.error('plugins', `reload failed`, error.message); }
    })
   .on('unlink', (file) => {
      unregisterPlugin(file, rootDir);
      logger.warn('plugins', `removed ${file}`);
    });

  return watcher;
}

export default loadPlugins;