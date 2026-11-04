import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
let config;
try { config = JSON.parse(await readFile(new URL('config.local.json', root), 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; config = JSON.parse(await readFile(new URL('config.example.json', root), 'utf8')); }
if (process.argv.includes('--production') && (config.mode !== 'cloud' || !config.appid || !config.env || !config.service)) throw new Error('上传构建需要真实小游戏 AppID、云环境和服务名，不能使用本地模式。');
if (!['local','cloud'].includes(config.mode)) throw new Error('连接模式必须为 local 或 cloud。');
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/game.json', root), JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false }));
await writeFile(new URL('dist/project.config.json', root), JSON.stringify({ appid: config.appid, compileType: 'game', projectname: '同频词小游戏', setting: { es6: true, minified: true } }, null, 2));
const options = { entryPoints: [fileURLToPath(new URL('src/main.ts', root))], outfile: fileURLToPath(new URL('dist/game.js', root)), bundle: true, platform: 'neutral', format: 'iife', target: 'es2020', define: { __CONFIG__: JSON.stringify(config) }, metafile: true };
if (process.argv.includes('--watch')) { const ctx = await context(options); await ctx.watch(); }
else { const result = await build(options); await writeFile(new URL('dist/meta.json', root), JSON.stringify(result.metafile)); console.log('小游戏构建完成。'); }
