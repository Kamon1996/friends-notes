import { calendarItems } from './calendarPlan';
import type { AppData } from './types';

/**
 * Файл .ics (iCalendar, RFC 5545) со всеми датами друзей: его понимают Google Календарь, Apple и Outlook.
 * Годовщины — с повтором «каждый год», 29 февраля — «последний день февраля», так что в невисокосный год это 28-е.
 */
export function buildIcs(data: AppData, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Druzya//friends-notes//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText('Друзья — дни рождения')}`,
  ];
  for (const item of calendarItems(data)) {
    const start = item.date.replace(/-/g, '');
    const next = new Date(Date.UTC(+item.date.slice(0, 4), +item.date.slice(5, 7) - 1, +item.date.slice(8, 10) + 1));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.key}@friends-notes`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
      ...(item.yearly ? [item.leapDay ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY'] : []),
      `SUMMARY:${escapeText(item.title)}`,
      `DESCRIPTION:${escapeText(item.notes)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Текст в iCalendar: обратный слэш, точка с запятой, запятая и перевод строки экранируются. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Строки длиннее 75 байт (UTF-8) переносятся: продолжение начинается с пробела. Символы не разрываются. */
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // у продолжения первый байт — пробел
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
