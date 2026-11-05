/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import jsQR from 'jsqr';

import { buildQr } from '../qr';

/** Растрирует QR в RGBA (как это сделает экран) и декодирует настоящим декодером. */
function decode(value: string): string | null {
  const qr = buildQr(value);
  const scale = 4;
  const quiet = 2;
  const total = (qr.size + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(total * total * 4).fill(255);
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.isDark(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((row + quiet) * scale + dy) * total + (col + quiet) * scale + dx;
          rgba[px * 4] = 0;
          rgba[px * 4 + 1] = 0;
          rgba[px * 4 + 2] = 0;
        }
      }
    }
  }
  return jsQR(rgba, total, total)?.data ?? null;
}

test('QR-код со ссылкой входа Telegram читается декодером', () => {
  const link = 'tg://login?token=AQAAAABxYzEyMzQ1Njc4OTBhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eg';
  assert.equal(decode(link), link);
  const qr = buildQr(link);
  assert.ok(qr.size >= 21 && qr.size % 4 === 1, `странный размер ${qr.size}`);
  assert.ok(qr.path.startsWith('M0 0h1v1h-1z')); // левый верхний поисковый узор
});
