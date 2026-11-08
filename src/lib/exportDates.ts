import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { buildIcs } from './ics';
import type { AppData } from './types';

export const EXPORT_FILE_NAME = 'druzya-dni-rozhdeniya.ics';

/** Файл .ics со всеми датами — в меню «Поделиться»: его можно отправить себе и импортировать в Google Календарь. */
export async function exportDates(data: AppData): Promise<void> {
  const file = new File(Paths.cache, EXPORT_FILE_NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(buildIcs(data));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: 'Даты друзей для календаря', UTI: 'public.calendar-event' });
}
