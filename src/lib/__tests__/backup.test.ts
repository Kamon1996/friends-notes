/// <reference types="node" />
// Резервная копия: что попадает в файл, что из него берём обратно и как отбиваем чужие и испорченные файлы.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BACKUP_FORMAT,
  BACKUP_KIND,
  MAX_BACKUP_CHARS,
  MAX_PHOTO_CHARS,
  backupFileName,
  buildBackup,
  describeBackup,
  imageMime,
  parseBackup,
  restoredData,
  restoredPhotoName,
  sanitizeSettings,
} from '../backup';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend, type Reminder } from '../types';

const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const friend = (patch: Partial<Friend> = {}): Friend => ({
  id: 'a',
  name: 'Аня Смирнова',
  emoji: '',
  birthday: '1995-11-07',
  phone: '+7 999 123-45-67',
  food: 'Суши',
  flowers: 'Пионы',
  gifts: 'Kindle\nКниги',
  notes: 'Любит настолки',
  dates: [{ id: 'd1', title: 'Свадьба', date: '2021-12-22', yearly: true }],
  createdAt: 1,
  photoUri: 'file:///data/user/0/com.kamon1996.friendsnotes/files/avatars/a-1-big.jpg',
  thumbUri: 'file:///data/user/0/com.kamon1996.friendsnotes/files/avatars/a-1.jpg',
  ...patch,
});
const reminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  title: 'Купить цветы',
  note: '',
  friendId: 'a',
  date: '2026-11-20',
  time: '18:00',
  repeat: { every: 2, unit: 'month' },
  advance: 0,
  done: false,
  createdAt: 1,
  ...patch,
});
const DATA: AppData = {
  ...EMPTY_DATA,
  friends: [friend(), friend({ id: 'b', name: 'Игорь', photoUri: null, thumbUri: null })],
  reminders: [reminder()],
  settings: { ...DEFAULT_SETTINGS, theme: 'dark', accentDark: 'eucalyptus', eventTime: '09:30', calendarSync: true, lastSeenVersion: '1.22.0' },
};
const NOW = new Date('2026-11-08T09:15:00Z');
const file = (patch: Record<string, unknown> = {}) => JSON.stringify({ kind: BACKUP_KIND, format: BACKUP_FORMAT, createdAt: NOW.toISOString(), appVersion: '1.24.0', data: DATA, photos: {}, ...patch });
const parsed = (text: string) => {
  const r = parseBackup(text);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('сохранение', () => {
  test('в файле всё, кроме путей к фото: сами фото — отдельно, только для друзей из данных', () => {
    const raw = JSON.parse(buildBackup(DATA, { a: JPEG, ghost: JPEG, b: '' }, NOW, '1.24.0'));
    assert.deepEqual([raw.kind, raw.format, raw.createdAt, raw.appVersion], [BACKUP_KIND, BACKUP_FORMAT, '2026-11-08T09:15:00.000Z', '1.24.0']);
    assert.deepEqual(Object.keys(raw.photos), ['a'], 'фото удалённого друга и пустые — не нужны');
    assert.ok(raw.data.friends.every((f: Friend) => !('photoUri' in f) && !('thumbUri' in f)), 'пути с этого телефона на другом бесполезны');
    assert.equal(raw.data.friends[0].gifts, 'Kindle\nКниги');
    assert.deepEqual(raw.data.reminders, DATA.reminders);
    assert.equal(raw.data.settings.theme, 'dark');
  });

  test('имя файла — с датой, латиницей', () => {
    assert.equal(backupFileName(new Date(2026, 0, 5, 23, 59)), 'druzya-kopiya-2026-01-05.json');
  });

  test('туда и обратно: данные те же, фото на месте', () => {
    const r = parsed(buildBackup(DATA, { a: JPEG }, NOW, '1.24.0'));
    assert.deepEqual(
      r.data.friends.map((f) => [f.id, f.name, f.birthday, f.gifts, f.dates.length, f.photoUri]),
      [
        ['a', 'Аня Смирнова', '1995-11-07', 'Kindle\nКниги', 1, undefined],
        ['b', 'Игорь', '1995-11-07', 'Kindle\nКниги', 1, undefined],
      ],
    );
    assert.deepEqual(r.data.reminders, DATA.reminders);
    assert.deepEqual(r.photos, { a: JPEG });
    assert.equal(r.createdAt?.toISOString(), NOW.toISOString());
    assert.equal(describeBackup(r), '2 друга, 1 напоминание и 1 фото');
  });
});

describe('восстановление: чужие и испорченные файлы', () => {
  const error = (text: string) => {
    const r = parseBackup(text);
    assert.equal(r.ok, false, text.slice(0, 60));
    return r.ok ? '' : r.error;
  };

  test('не JSON, чужой JSON, файл .ics, пустой файл — понятная ошибка', () => {
    assert.match(error('BEGIN:VCALENDAR\r\nEND:VCALENDAR'), /не копия «Друзей»: файл не читается/);
    assert.match(error(''), /не читается/);
    assert.match(error('{"name":"package"}'), /^Это не копия «Друзей»\.$/);
    assert.match(error('[1,2,3]'), /^Это не копия «Друзей»\.$/);
    assert.match(error(JSON.stringify({ kind: BACKUP_KIND, format: 1 })), /^Это не копия «Друзей»\.$/, 'без данных');
  });

  test('копия из более новой версии — просим обновиться, а не портим данные', () => {
    assert.match(error(file({ format: BACKUP_FORMAT + 1 })), /более новой версии/);
    assert.match(error(file({ format: '1' })), /более новой версии/);
  });

  test('пустая копия не может стереть телефон', () => {
    assert.match(error(file({ data: { ...DATA, friends: [], reminders: [] } })), /нет ни друзей, ни напоминаний/);
  });

  test('слишком большой файл не разбираем', () => {
    assert.match(error(' '.repeat(MAX_BACKUP_CHARS + 1)), /слишком большой/);
  });

  test('пути к файлам из копии не берём никогда', () => {
    const r = parsed(file({ data: { ...DATA, friends: [friend({ photoUri: 'file:///data/data/other.app/secret.jpg', thumbUri: 'content://contacts/1' })] } }));
    assert.equal(r.data.friends[0].photoUri, undefined);
    assert.equal(r.data.friends[0].thumbUri, undefined);
  });

  test('фото: только картинки разумного размера и только для друзей из копии', () => {
    const r = parsed(
      file({
        photos: {
          a: JPEG,
          b: PNG,
          ghost: JPEG,
          c: 'PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        },
        data: { ...DATA, friends: [friend(), friend({ id: 'b' }), friend({ id: 'c' })] },
      }),
    );
    assert.deepEqual(Object.keys(r.photos).sort(), ['a', 'b'], 'не картинка (c) и фото чужого id отброшены');
    const big = parsed(file({ photos: { a: `/9j/${'A'.repeat(MAX_PHOTO_CHARS)}` } }));
    assert.deepEqual(big.photos, {}, 'слишком большое фото');
    const broken = parsed(file({ photos: { a: '/9j/не base64!' } }));
    assert.deepEqual(broken.photos, {});
    const notString = parsed(file({ photos: { a: 42 } }));
    assert.deepEqual(notString.photos, {});
  });

  test('повторяющиеся id: берём первую запись; напоминание удалённого друга становится «для себя»', () => {
    const r = parsed(
      file({
        data: {
          ...DATA,
          friends: [friend({ name: 'Первая' }), friend({ name: 'Вторая' }), friend({ id: 'x', name: '   ' })],
          reminders: [reminder(), reminder({ title: 'Дубль' }), reminder({ id: 'r2', friendId: 'нет-такого' })],
        },
      }),
    );
    assert.deepEqual(r.data.friends.map((f) => [f.id, f.name]), [['a', 'Первая'], ['x', 'Без имени']]);
    assert.deepEqual(r.data.reminders.map((x) => [x.id, x.title, x.friendId]), [['r1', 'Купить цветы', 'a'], ['r2', 'Купить цветы', null]]);
  });

  test('кривые записи пропускаем, остальное восстанавливаем', () => {
    const r = parsed(file({ data: { ...DATA, friends: [friend(), { name: 'без id' }, 'строка', null], reminders: [{ id: 'r', date: 5 }] } }));
    assert.deepEqual(r.data.friends.map((f) => f.id), ['a']);
    assert.deepEqual(r.data.reminders, []);
  });

  test('дата копии: кривая — просто без даты', () => {
    assert.equal(parsed(file({ createdAt: 'вчера' })).createdAt, null);
    assert.equal(parsed(file({ createdAt: undefined })).createdAt, null);
  });
});

describe('настройки из копии', () => {
  test('только известные поля и допустимые значения', () => {
    assert.deepEqual(
      sanitizeSettings({ theme: 'neon', accentLight: 'gold', accentDark: 'plum', eventTime: '25:00', eventDayBefore: 'да', crashReports: false, calendarSync: true, showZodiac: false, evil: '<script>' }),
      { ...DEFAULT_SETTINGS, accentDark: 'plum', crashReports: false, calendarSync: true, showZodiac: false },
    );
    assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
    assert.equal(sanitizeSettings({ eventTime: '07:05' }).eventTime, '07:05');
  });

  test('после восстановления «Что нового» — как на этом телефоне, дата последней копии — дата файла', () => {
    const backup = parsed(file());
    const current = { ...EMPTY_DATA, settings: { ...DEFAULT_SETTINGS, lastSeenVersion: '1.24.0' } };
    const next = restoredData(current, backup);
    assert.equal(next.settings.lastSeenVersion, '1.24.0');
    assert.equal(next.settings.lastBackupAt, NOW.toISOString());
    assert.deepEqual([next.settings.theme, next.settings.accentDark, next.settings.eventTime, next.settings.calendarSync], ['dark', 'eucalyptus', '09:30', true]);
    assert.equal(next.friends.length, 2);
  });
});

describe('мелочи', () => {
  test('имя восстановленного фото: только буквы и цифры из id — за папку аватаров не выйти', () => {
    assert.equal(restoredPhotoName('mhxyz12ab', 7, JPEG), 'mhxyz12ab-7-r.jpg');
    assert.equal(restoredPhotoName('../../databases/RKStorage', 7, PNG), '______databases_RKStorage-7-r.png');
    assert.equal(restoredPhotoName('', 7, JPEG), 'friend-7-r.jpg');
    assert.ok(!restoredPhotoName('a/b\\c:d', 1, JPEG).includes('/'));
    assert.equal(restoredPhotoName('x'.repeat(100), 1, JPEG).length, 40 + '-1-r.jpg'.length);
  });

  test('тип картинки по первым байтам', () => {
    assert.equal(imageMime(JPEG), 'image/jpeg');
    assert.equal(imageMime(PNG), 'image/png');
    assert.equal(imageMime('UklGRiQAAABXRUJQVlA4'), 'image/webp');
    assert.equal(imageMime('R0lGODlh'), null, 'GIF не ждём');
  });

  test('описание копии склоняется', () => {
    const d = (friends: number, reminders: number, photos = 0) =>
      describeBackup({ data: { ...EMPTY_DATA, friends: Array(friends).fill(friend()), reminders: Array(reminders).fill(reminder()) }, photos: Object.fromEntries(Array.from({ length: photos }, (_, i) => [`p${i}`, JPEG])) });
    assert.equal(d(1, 0), '1 друг и 0 напоминаний');
    assert.equal(d(21, 2, 5), '21 друг, 2 напоминания и 5 фото');
    assert.equal(d(5, 11), '5 друзей и 11 напоминаний');
  });
});
