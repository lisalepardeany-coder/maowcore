// Plugin loader for v2.2.0 — lets third-party (or first-party) plugins
// register slash commands, WS handlers, and dashboard pages without
// modifying the core.
//
// Plugin shape:
//   plugins/<name>/index.js exports:
//     {
//       id:        'unique-plugin-id',
//       name:      'Display name',
//       version:   '1.0.0',
//       slashCommands?: [ ...same shape as commands/ folder ],
//       wsActions?: { actionName: (ctx, msg) => {} },
//       httpRoutes?: { 'GET /api/plugin/foo': (req, res) => {} },
//       onLoad?: (ctx) => {},     // optional init
//     }
//
// Loaded automatically at startup from `plugins/` if present.

const fs = require('node:fs');
const path = require('node:path');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');

const loadAll = (ctx) => {
  const loaded = [];
  if (!fs.existsSync(PLUGINS_DIR)) return loaded;
  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginPath = path.join(PLUGINS_DIR, entry.name, 'index.js');
    if (!fs.existsSync(pluginPath)) continue;
    try {
      // Cache-bust so /reload-style flows pick up fresh code.
      delete require.cache[require.resolve(pluginPath)];
      const plugin = require(pluginPath);
      if (!plugin.id || !plugin.name) {
        console.warn(`[plugin-loader] Skipping ${entry.name}: missing id/name`);
        continue;
      }
      if (typeof plugin.onLoad === 'function') plugin.onLoad(ctx);
      loaded.push({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version || '0.0.0',
        slashCommandCount: plugin.slashCommands?.length || 0,
        wsActionCount: Object.keys(plugin.wsActions || {}).length,
        httpRouteCount: Object.keys(plugin.httpRoutes || {}).length,
        path: pluginPath,
        plugin,
      });
      console.log(`[plugin-loader] Loaded "${plugin.name}" v${plugin.version || '?'} from ${entry.name}`);
    } catch (e) {
      console.warn(`[plugin-loader] Failed to load ${entry.name}: ${e.message}`);
    }
  }
  return loaded;
};

module.exports = { loadAll, PLUGINS_DIR };
