/// <reference types="node" />
// Ворклеты (функции с 'worklet', которые считаются на UI-потоке) не должны брать значения по умолчанию из констант:
// плагин ворклетов не переносит такие константы на UI-поток, и на телефоне это падение
// «ReferenceError: Property 'WHEEL' doesn't exist» (так упала 1.28.0 на «Поле друзей»).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

test('у ворклетов нет значений по умолчанию из констант', () => {
  const bad: string[] = [];
  for (const file of files(ROOT)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes("'worklet'")) continue;
    const re = /function\s+(\w+)\s*\(([^)]*)\)[^{]*\{\s*'worklet';/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      // параметр вида `x = ИМЯ…` (а не `x = 900`) — ссылка на значение, которое на UI-поток не попадёт
      for (const param of m[2].split(',')) {
        const def = param.split('=')[1];
        if (def !== undefined && /^\s*[A-Za-z_$]/.test(def) && !/^\s*(true|false|null|undefined)\b/.test(def)) bad.push(`${file.slice(ROOT.length + 1)}: ${m[1]}(${param.trim()})`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('проверка действительно находит такие ворклеты', () => {
  const sample = "export function f(a: number, b = LIMIT.max): number {\n  'worklet';\n  return a + b;\n}";
  const m = /function\s+(\w+)\s*\(([^)]*)\)[^{]*\{\s*'worklet';/.exec(sample);
  assert.ok(m && /=\s*[A-Za-z_$]/.test(m[2]));
});
