/// <reference types="node" />
// Для пользователя определение пола и другие ИИ-функции — «магия»: в интерфейсе, «Что нового» и политике
// конфиденциальности не называем, какие сервисы, модели и библиотеки стоят за ними.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { CHANGELOG } from '../changelog';

const ROOT = path.join(__dirname, '..', '..', '..');
const SECRET = /Genderize|Gemini|OpenRouter|Hugging ?Face|Groq|ML ?Kit|Llama|Gemma|Mistral|DeepSeek|Qwen|Nemotron|AICore/;

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, ext) : ext.test(e.name) ? [p] : [];
  });
}

test('экраны и компоненты не называют ИИ-сервисы', () => {
  for (const f of [...files(path.join(ROOT, 'src/app'), /\.tsx?$/), ...files(path.join(ROOT, 'src/components'), /\.tsx?$/)]) {
    const m = fs.readFileSync(f, 'utf8').match(SECRET);
    assert.equal(m, null, `${path.relative(ROOT, f)}: «${m?.[0]}»`);
  }
});

test('«Что нового» не называет ИИ-сервисы и не рассказывает, как всё устроено', () => {
  for (const r of CHANGELOG) for (const item of r.items) assert.doesNotMatch(item, SECRET, `${r.version}: ${item}`);
});

test('политика конфиденциальности говорит о сторонних сервисах, но не называет их', () => {
  const html = fs.readFileSync(path.join(ROOT, 'docs/privacy.html'), 'utf8');
  assert.doesNotMatch(html, SECRET);
  assert.match(html, /сторонним сервисам/);
  assert.match(html, /third-party services/);
});
