// Только кодировщик (матрица модулей), без рендереров для Node/canvas.
import { create as createQr } from 'qrcode/lib/core/qrcode';

export interface QrShape {
  /** Число модулей по стороне (без тихой зоны). */
  size: number;
  /** SVG-путь со всеми тёмными модулями, 1 модуль = 1 единица. */
  path: string;
  /** Матрица: isDark(row, col). */
  isDark: (row: number, col: number) => boolean;
}

/** Строит QR-код для строки (уровень коррекции M). */
export function buildQr(value: string): QrShape {
  const symbol = createQr(value, { errorCorrectionLevel: 'M' });
  const size: number = symbol.modules.size;
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (symbol.modules.get(y, x)) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return { size, path: parts.join(''), isDark: (row, col) => !!symbol.modules.get(row, col) };
}
