/// <reference types="node" />
// Праздники стран в календаре: база в приложении, выбор стран, слияние одного праздника нескольких стран, «дальше».
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { calendarEvents, nextEvents } from '../calendar';
import {
  HOLIDAY_COUNTRIES,
  HOLIDAY_YEARS,
  defaultHolidayCountries,
  deviceHolidayCountry,
  formatHolidayDays,
  holidayCountries,
  holidayCountryCount,
  holidayDatesInYear,
  holidayInfo,
  holidayName,
  holidaysIn,
} from '../holidays';
import { DEFAULT_SETTINGS, type Settings } from '../types';

const settings = (holidayCountries?: string[]): Settings => ({ ...DEFAULT_SETTINGS, holidayCountries });
const empty = { friends: [], reminders: [] };

describe('база', () => {
  test('страны с флагом и русским названием; у каждой есть праздники на все годы базы', () => {
    assert.ok(HOLIDAY_COUNTRIES.length >= 20);
    for (const c of HOLIDAY_COUNTRIES) {
      assert.match(c.code, /^[A-Z]{2}$/);
      assert.match(c.name, /[а-яё]/i, c.code);
      assert.ok(c.flag, c.code);
      assert.ok(holidayCountryCount(c.code) > 0, c.code);
      for (let y = HOLIDAY_YEARS[0]; y <= HOLIDAY_YEARS[1]; y++) {
        assert.ok(holidaysIn([c.code], `${y}-01-01`, `${y}-12-31`).length > 0, `${c.code} ${y}`);
      }
    }
  });
  test('у каждого праздника — русское название; ссылка — только на русскую Википедию', () => {
    for (const c of HOLIDAY_COUNTRIES) {
      for (const h of holidaysIn([c.code], `${HOLIDAY_YEARS[0]}-01-01`, `${HOLIDAY_YEARS[0]}-12-31`)) {
        const info = holidayInfo(h.id);
        assert.ok(info, h.id);
        assert.match(info.name, /[а-яё]/i, `${h.id}: ${info.name}`);
        if (info.url) assert.match(info.url, /^https:\/\/ru\.wikipedia\.org\/wiki\//, h.id);
        assert.ok(!info.text.includes('́'), `${h.id}: без ударений`);
      }
    }
  });
  test('Россия: День народного единства 4 ноября, Новогодние каникулы — несколько дней, Рождество 7 января', () => {
    const nov = holidaysIn(['RU'], '2026-11-01', '2026-11-30');
    assert.deepEqual(
      nov.map((h) => [h.date, holidayName(h.id)]),
      [['2026-11-04', 'День народного единства']],
    );
    const jan = holidaysIn(['RU'], '2027-01-01', '2027-01-08').map((h) => `${h.date.slice(8)} ${holidayName(h.id)}`);
    assert.ok(jan.includes('07 Рождество Христово'), jan.join(', '));
    assert.ok(jan.filter((x) => x.includes('Новогодние каникулы')).length >= 5, jan.join(', '));
  });
  test('переносы выходных и «в счёт» — не праздники', () => {
    for (const c of HOLIDAY_COUNTRIES) {
      for (const h of holidaysIn([c.code], `${HOLIDAY_YEARS[0]}-01-01`, `${HOLIDAY_YEARS[1]}-12-31`)) {
        assert.doesNotMatch(holidayInfo(h.id)!.en, /substitut|day off|observed|in lieu/i, h.id);
      }
    }
  });
  test('исламские праздники на будущие годы — с пометкой «дата примерная»', () => {
    const later = holidaysIn(['AE'], `${HOLIDAY_YEARS[1]}-01-01`, `${HOLIDAY_YEARS[1]}-12-31`).filter((h) => /eid/i.test(holidayInfo(h.id)!.en));
    assert.ok(later.length > 0);
    assert.ok(later.every((h) => h.estimated));
    // Дата без «~» — точная, и сам «~» в дату не попадает.
    assert.ok(holidaysIn(['RU'], '2026-01-01', '2026-12-31').every((h) => !h.estimated && /^\d{4}-\d{2}-\d{2}$/.test(h.date)));
  });
});

describe('какие страны', () => {
  test('выбранные — в порядке списка стран; незнакомые коды и пустой выбор — ничего', () => {
    assert.deepEqual(holidayCountries(settings(['US', 'RU', 'XX'])), ['RU', 'US']);
    assert.deepEqual(holidayCountries(settings([])), []);
    assert.deepEqual(holidayCountries(settings(undefined)), []);
    assert.deepEqual(holidayCountries(undefined), []);
  });
  test('страна телефона по языку системы — если есть в базе', () => {
    assert.equal(deviceHolidayCountry('ru-RU'), 'RU');
    assert.equal(deviceHolidayCountry('be_BY'), 'BY');
    assert.equal(deviceHolidayCountry('zh-Hant-TW'), null);
    assert.equal(deviceHolidayCountry('ru'), null);
    assert.deepEqual(defaultHolidayCountries('kk-KZ'), ['KZ']);
    assert.deepEqual(defaultHolidayCountries('pt-BR'), []);
  });
});

describe('в календаре', () => {
  test('праздник — событие дня, сверху; без выбранных стран праздников нет', () => {
    const friends = [{ id: 'a', name: 'Аня', emoji: '', birthday: '1995-11-04', phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0 }];
    const ev = calendarEvents({ friends, reminders: [], settings: settings(['RU']) } as never, '2026-11-04', '2026-11-04');
    assert.deepEqual(
      ev.map((e) => e.kind),
      ['holiday', 'birthday'],
    );
    assert.equal(calendarEvents({ friends, reminders: [], settings: settings([]) } as never, '2026-11-04', '2026-11-04').length, 1);
    assert.equal(calendarEvents({ friends, reminders: [] } as never, '2026-11-04', '2026-11-04').length, 1);
  });
  test('один праздник нескольких стран в один день — одно событие со всеми странами', () => {
    const ev = calendarEvents({ ...empty, settings: settings(['RU', 'BY', 'KZ']) }, '2027-03-08', '2027-03-08');
    const women = ev.filter((e) => e.kind === 'holiday' && e.name === 'Международный женский день');
    assert.equal(women.length, 1);
    assert.deepEqual(
      women[0].kind === 'holiday' && women[0].holidays.map((h) => h.country),
      ['RU', 'KZ'],
    );
  });
  test('«дальше»: многодневный праздник — один раз, первым днём', () => {
    const next = nextEvents({ ...empty, settings: settings(['RU']) }, '2026-12-25', 5);
    assert.deepEqual(
      next.map((e) => `${e.date} ${e.kind === 'holiday' ? e.name : ''}`),
      ['2027-01-01 Новогодние каникулы', '2027-01-07 Рождество Христово', '2027-02-23 День защитника Отечества'],
    );
  });
});

test('дни праздника в году и подпись: «1–6 и 8 января», через месяцы — через запятую', () => {
  const id = holidaysIn(['RU'], '2027-01-01', '2027-01-01')[0].id;
  assert.equal(formatHolidayDays(holidayDatesInYear(id, 2027)), '1–6 и 8 января');
  assert.equal(formatHolidayDays(['2026-12-31', '2027-01-01', '2027-01-02']), '31 декабря, 1–2 января');
  assert.equal(formatHolidayDays(['2026-05-01']), '1 мая');
  assert.equal(formatHolidayDays(['2026-05-01', '2026-05-03', '2026-05-09']), '1, 3 и 9 мая');
});
