import { buildIcs } from './ics';
import type { AppData } from './types';

export const EXPORT_FILE_NAME = 'druzya-dni-rozhdeniya.ics';

/** В браузере файл просто скачивается. */
export async function exportDates(data: AppData): Promise<void> {
  const url = URL.createObjectURL(new Blob([buildIcs(data)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
