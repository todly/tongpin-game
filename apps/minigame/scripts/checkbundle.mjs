import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../dist/', import.meta.url);
const meta = JSON.parse(await readFile(new URL('meta.json', root), 'utf8'));
// Only fflate's browser-only pure JS entry is allowed; emitted bundle remains standalone.
for (const input of Object.keys(meta.inputs)) assert(!/node_modules|apps\/(web|miniprogram)|server/.test(input) || /node_modules\/fflate\/esm\/browser\.js$/.test(input), `不允许的运行依赖：${input}`);
for (const output of Object.values(meta.outputs)) assert.equal(output.imports.length, 0, '产物不能包含外部依赖');
const source = await readFile(new URL('game.js', root), 'utf8');
assert(!/\b(document|window|HTMLElement|uni)\b|node:|require\(/.test(source), '产物包含禁止的运行依赖');
assert.equal(JSON.parse(await readFile(new URL('project.config.json', root))).compileType, 'game');
console.log('小游戏独立 bundle 检查通过。');
