import { roleAllows } from './roles.js';
import { filterSecureTools } from './security-policy.js';

function commandToString(command) {
  if (!command) return '';
  if (typeof command === 'string') return command;
  if (command instanceof RegExp) return command.toString();
  if (Array.isArray(command)) return command.map(commandToString).filter(Boolean).join(', ');
  return String(command);
}

function firstHelp(plugin) {
  if (Array.isArray(plugin.help)) return plugin.help[0] || '';
  return plugin.help || '';
}

function normalizeToolName(name) {
  return String(name || '')
    .replace(/^\/+|\.js$/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function pluginEntry(name, plugin) {
  const ai = plugin.ai || {};
  const toolName = ai.name || normalizeToolName(name);
  const description = plugin.description || ai.description || firstHelp(plugin) || commandToString(plugin.command);
  const permissions = ai.permissions || (plugin.rowner ? ['owner'] : plugin.owner ? ['owner'] : plugin.premium ? ['premium', 'owner'] : ['user', 'premium', 'owner']);

  return {
    id: name,
    name: toolName,
    pluginName: name,
    description,
    help: plugin.help || [],
    tags: plugin.tags || [],
    command: commandToString(plugin.command),
    enabled: plugin.disabled !== true,
    aiEnabled: ai.tool === true,
    risk: ai.risk || (plugin.owner || plugin.rowner ? 'high' : 'low'),
    permissions,
    parameters: ai.parameters || {},
    examples: ai.examples || [],
  };
}

export function getPluginCatalog({ roleInfo, includeDisabled = false, includeUnsafe = false, includeInsecure = false } = {}) {
  const entries = Object.entries(global.plugins || {})
    .map(([name, plugin]) => pluginEntry(name, plugin))
    .filter((entry) => includeDisabled || entry.enabled)
    .filter((entry) => includeUnsafe || entry.aiEnabled)
    .filter((entry) => !roleInfo || roleAllows(entry.permissions, roleInfo));
  return includeInsecure ? entries : filterSecureTools(entries, roleInfo);
}

export function getToolDefinitions({ roleInfo } = {}) {
  return getPluginCatalog({ roleInfo })
    .map((entry) => ({
      type: 'function',
      function: {
        name: entry.name,
        description: entry.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(Object.entries(entry.parameters).map(([key, schema]) => {
            const { required, ...propertySchema } = schema || {};
            return [key, propertySchema];
          })),
          required: Object.entries(entry.parameters)
            .filter(([, schema]) => schema?.required === true)
            .map(([key]) => key),
        },
      },
    }));
}

export function getGeminiToolDefinitions({ roleInfo } = {}) {
  const declarations = getPluginCatalog({ roleInfo })
    .map((entry) => ({
      name: entry.name,
      description: entry.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(entry.parameters).map(([key, schema]) => {
          const { required, ...propertySchema } = schema || {};
          return [key, propertySchema];
        })),
        required: Object.entries(entry.parameters)
          .filter(([, schema]) => schema?.required === true)
          .map(([key]) => key),
      },
    }));

  return declarations.length ? [{ functionDeclarations: declarations }] : [];
}

export function findToolByName(toolName, roleInfo) {
  return getPluginCatalog({ roleInfo }).find((entry) => entry.name === toolName || entry.pluginName === toolName);
}
