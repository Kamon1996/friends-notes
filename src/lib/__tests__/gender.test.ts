/// <reference types="node" />
// Пол по имени без интернета: только уверенные случаи; сомнительное остаётся «не знаем» и уходит дальше.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { countryByPhone, firstNameForLookup, genderFromName, nameWords } from '../gender';
import { FEMALE_NAMES, MALE_NAMES } from '../genderNames';

const g = (name: string) => genderFromName(name);

describe('пол по имени', () => {
  test('имена из базы: полные, уменьшительные, казахские, с «ё»', () => {
    for (const n of ['Анна', 'Аня', 'Маша', 'Алёна', 'Айгерим', 'Алуа', 'Динара', 'Нино']) assert.equal(g(n), 'f', n);
    for (const n of ['Дмитрий', 'Дима', 'Серёжа', 'Нурлан', 'Ерлан', 'Илья', 'Никита', 'Лёша']) assert.equal(g(n), 'm', n);
  });

  test('регистр, эмодзи, скобки, пометки рядом с именем не мешают', () => {
    assert.equal(g('АНЯ 🌸'), 'f');
    assert.equal(g('Вова (сантехник)'), 'm');
    assert.equal(g('Аня Йога'), 'f');
    assert.equal(g('Аня Магазин'), 'f', 'имя из базы главнее «-ин» в конце пометки');
  });

  test('родные: «Мама», «Бабуля», «Брат», «Дед»', () => {
    for (const n of ['Мама', 'мамуля', 'Бабушка Валя', 'Сестрёнка', 'Тёща']) assert.equal(g(n), 'f', n);
    for (const n of ['Папа', 'Батя', 'Дедушка', 'Брат', 'Муж']) assert.equal(g(n), 'm', n);
  });

  test('отчество и казахские «кызы/улы»', () => {
    assert.equal(g('Иванова Мария Петровна'), 'f');
    assert.equal(g('Петров Иван Сергеевич'), 'm');
    assert.equal(g('Саша Ильинична'), 'f');
    assert.equal(g('Айдана Нурланкызы'), 'f');
    assert.equal(g('Ерасыл Серикулы'), 'm');
    assert.equal(g('Серик улы'), 'm', 'отдельное «улы»');
    assert.equal(g('Жанар кызы'), 'f', 'отдельное «кызы»');
  });

  test('неоднозначное имя + фамилия по окончанию — по фамилии', () => {
    assert.equal(g('Саша Иванова'), 'f');
    assert.equal(g('Женя Петров'), 'm');
    assert.equal(g('Валя Смирнова'), 'f');
    assert.equal(g('Слава Кузнецов'), 'm');
    assert.equal(g('Женя Ковальская'), 'f');
  });

  test('не уверены — не знаем: неоднозначные имена, прозвища, иностранные, одна фамилия, противоречия', () => {
    for (const n of ['Саша', 'Женя', 'Валя', 'Алуашка', 'Котик', 'Саша Ким', 'Женя Шевченко', 'Петрова', 'Иванов', 'Anna', 'John Smith', '', '🙂', 'Анна Сергеевич', 'Мама Вова']) {
      assert.equal(g(n), null, n);
    }
  });

  test('в базе нет неоднозначных имён и одно имя не записано в оба пола', () => {
    for (const n of ['саша', 'женя', 'валя', 'шура', 'слава', 'сева', 'ника', 'мишель', 'ким', 'алекс', 'тоша']) {
      assert.ok(!FEMALE_NAMES.has(n) && !MALE_NAMES.has(n), n);
    }
    for (const n of FEMALE_NAMES) assert.ok(!MALE_NAMES.has(n), `${n} в обоих списках`);
  });

  test('слова имени: только буквы и дефисы', () => {
    assert.deepEqual(nameWords('Анна-Мария (работа) 😊 2'), ['анна-мария', 'работа']);
  });
});

describe('что уходит в Genderize', () => {
  test('страна по номеру: Казахстан, Россия, Беларусь, Украина', () => {
    assert.equal(countryByPhone('+7 707 606 39 03'), 'KZ');
    assert.equal(countryByPhone('87771234567'), 'KZ');
    assert.equal(countryByPhone('+7 999 123-45-67'), 'RU');
    assert.equal(countryByPhone('+375 29 111-22-33'), 'BY');
    assert.equal(countryByPhone('+380501234567'), 'UA');
    assert.equal(countryByPhone(''), undefined);
    assert.equal(countryByPhone('+49 30 123456'), undefined);
  });

  test('только имя: без фамилии, отчества и пометок', () => {
    assert.equal(firstNameForLookup('Саша Ким'), 'Саша');
    assert.equal(firstNameForLookup('Иванова Саша'), 'Саша');
    assert.equal(firstNameForLookup('Алуашка 🌷'), 'Алуашка');
    assert.equal(firstNameForLookup('John Smith'), 'John');
    assert.equal(firstNameForLookup('🙂'), null);
  });
});

describe('пол в сохранённых данных', () => {
  test('берём только «f»/«m» и известный источник; мусор отбрасываем', async () => {
    const { normalizeData } = await import('../storage');
    const base = { id: 'a', name: 'Аня' };
    const [ok, bad, none] = normalizeData({ friends: [{ ...base, gender: 'f', genderBy: 'gemini' }, { ...base, id: 'b', gender: 'x', genderBy: 'hack' }, { ...base, id: 'c' }] }).friends;
    assert.deepEqual([ok.gender, ok.genderBy], ['f', 'gemini']);
    assert.ok(!('gender' in bad) && !('genderBy' in bad));
    assert.ok(!('gender' in none));
  });
});

describe('пол нового или изменённого друга', () => {
  test('по имени — сразу; переименовали — пересчитали; вручную и от сервисов — не трогаем', async () => {
    const { withNameGender } = await import('../gender');
    assert.deepEqual(withNameGender({ name: 'Аня' }), { name: 'Аня', gender: 'f', genderBy: 'names' });
    assert.deepEqual(withNameGender({ name: 'Андрей', gender: 'f' as const, genderBy: 'names' as const }), { name: 'Андрей', gender: 'm', genderBy: 'names' });
    assert.deepEqual(withNameGender({ name: 'Саша', gender: 'f' as const, genderBy: 'names' as const }), { name: 'Саша' }, 'имя стало неоднозначным — пол не придумываем');
    assert.deepEqual(withNameGender({ name: 'Саша' }), { name: 'Саша' });
    const manual = { name: 'Андрей', gender: 'f' as const, genderBy: 'manual' as const };
    assert.equal(withNameGender(manual), manual);
    const unset = { name: 'Аня', genderBy: 'manual' as const };
    assert.equal(withNameGender(unset), unset, '«Не указан» вручную — не заполняем сами');
    const ai = { name: 'Алуашка', gender: 'f' as const, genderBy: 'gemini' as const };
    assert.equal(withNameGender(ai), ai);
  });
});
