import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';

import type { StripChip } from '@/components/form/parts';
import { confirm } from '@/lib/confirm';
import { addInterval } from '@/lib/dates';
import { calendarCandidate, inCalendar, smartCalendarOn } from '@/lib/calendarAi';
import { reopenReminder } from '@/lib/events';
import { DEFAULT_TIME, timeSuggestions, titleTemplates, usualAdvance, type TaskKind, type TitleTemplate } from '@/lib/habits';
import { friendChoices, shortTime, whenSummary } from '@/lib/reminderForm';
import { PRIORITY_LABELS } from '@/lib/reminderList';
import { newId, useStore } from '@/lib/store';
import type { Advance, ISODate, Priority, Reminder, Repeat, RepeatUnit, TimeOfDay } from '@/lib/types';

/**
 * Состояние и правила формы дела — общие для обоих её видов: «быстрой» (ленты, выбор в одно нажатие) и «строками»
 * (значения в строках, выбор в шторке). Вид только рисует; что подставить, что сохранить и что подсказать — здесь.
 */

export const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'due', label: 'До срока' },
  { value: 'at', label: 'Дата и время' },
  { value: 'repeat', label: 'Повторять' },
];
export const PRIORITIES: { value: Priority | 0; label: string }[] = [
  { value: 0, label: 'Нет' },
  ...([1, 2, 3] as const).map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
];

export const REPEAT_PRESETS: { label: string; repeat: Repeat }[] = [
  { label: 'Каждый день', repeat: { every: 1, unit: 'day' } },
  { label: 'Каждую неделю', repeat: { every: 1, unit: 'week' } },
  { label: 'Раз в 2 недели', repeat: { every: 2, unit: 'week' } },
  { label: 'Каждый месяц', repeat: { every: 1, unit: 'month' } },
  { label: 'Раз в 2 месяца', repeat: { every: 2, unit: 'month' } },
  { label: 'Каждый год', repeat: { every: 1, unit: 'year' } },
];

export const UNITS: { unit: RepeatUnit; label: string }[] = [
  { unit: 'day', label: 'дни' },
  { unit: 'week', label: 'недели' },
  { unit: 'month', label: 'месяцы' },
  { unit: 'year', label: 'годы' },
];

export const ADVANCES: { value: Advance; label: string }[] = [
  { value: 0, label: 'Нет' },
  { value: 60, label: 'За час' },
  { value: 1440, label: 'За день' },
  { value: 4320, label: 'За 3 дня' },
  { value: 10080, label: 'За неделю' },
];

export const sameRepeat = (a: Repeat | null, b: Repeat | null) => a === b || (!!a && !!b && a.every === b.every && a.unit === b.unit);

/** Ближайший ровный час — время по умолчанию для события на сегодня. */
function nextHour(now = new Date()): TimeOfDay {
  const h = now.getHours() + 1;
  return h > 23 ? '23:59' : `${String(h).padStart(2, '0')}:00`;
}

export function useReminderForm() {
  // Из календаря: дата выбранного дня, «Дата и время», и сразу в календаре.
  const params = useLocalSearchParams<{ id?: string; friendId?: string; date?: string; kind?: string; calendar?: string }>();
  const { data, today, saveReminder, deleteReminder } = useStore();
  const existing = data.reminders.find((x) => x.id === params.id);
  // Привычки считаем по остальным делам: само дело в форме себе не подсказывает.
  const others = useMemo(() => data.reminders.filter((x) => x.id !== params.id), [data.reminders, params.id]);

  const [r, setR] = useState<Reminder>(() => {
    if (existing) return existing;
    const kind0: TaskKind = params.kind === 'at' ? 'at' : 'due';
    const date: ISODate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : addInterval(today, 'day', 1);
    const adv = usualAdvance(data.reminders, data.friends, { kind: kind0 });
    return {
      id: newId(),
      title: '',
      note: '',
      friendId: params.friendId ?? null,
      date,
      // Событие на сегодня — на ближайший час: «сегодня в 10:00» после десяти сразу было бы просроченным и без уведомления.
      // Иначе — привычное время, если оно есть.
      time: kind0 === 'at' && date === today ? nextHour() : (timeSuggestions(data.reminders, data.friends, { kind: kind0 }).usual ?? DEFAULT_TIME),
      repeat: null,
      advance: adv && !adv.daily ? adv.advance : 0,
      ...(adv?.daily ? { daily: true } : {}),
      done: false,
      createdAt: Date.now(),
      ...(kind0 === 'at' ? { kind: 'at' as const } : {}),
      ...(params.calendar === '1' ? { calendar: true } : {}),
    };
  });
  const set = <K extends keyof Reminder>(key: K, value: Reminder[K]) => setR((prev) => ({ ...prev, [key]: value }));
  const kind: TaskKind = r.repeat ? 'repeat' : r.kind === 'at' ? 'at' : 'due';
  const friend = data.friends.find((f) => f.id === r.friendId);
  const smart = smartCalendarOn(data.settings);

  // Что человек уже выбрал сам: привычные значения больше не подставляем поверх его выбора.
  const [touched, setTouched] = useState({ time: false, advance: false });
  const [searching, setSearching] = useState(false);
  // Шаблоны подбираем для того, кого выбрал сам человек: свой шаблон может подставить друга, и лента не должна от этого меняться.
  const [templateFriendId, setTemplateFriendId] = useState(r.friendId);
  const [titleMissing, setTitleMissing] = useState(false);
  // Название подставлено шаблоном — лента шаблонов остаётся: можно передумать и нажать соседний.
  const [fromTemplate, setFromTemplate] = useState(false);
  // Экран уже закрывается: второе нажатие «Сохранить» не должно ни сохранить ещё раз, ни уйти назад на экран дальше.
  const leaving = useRef(false);

  // Повтор, который был до переключения на разовое: вернётся, если передумать.
  const [lastRepeat, setLastRepeat] = useState<Repeat>(r.repeat ?? { every: 1, unit: 'week' });
  const [customRepeat, setCustomRepeat] = useState(() => !!r.repeat && !REPEAT_PRESETS.some((p) => sameRepeat(p.repeat, r.repeat)));
  // «Каждые N»: пока поле в работе, держим набранное как есть — пустое не превращаем в единицу.
  const [everyText, setEveryText] = useState<string | null>(null);

  const setKind = (k: TaskKind) => {
    if (r.repeat) setLastRepeat(r.repeat);
    // Новое дело и время ещё не трогали — ставим привычное для этого вида: у встреч оно своё, у дел «до срока» — своё.
    const usual = !existing && !touched.time ? timeSuggestions(others, data.friends, { kind: k, title: r.title, friendName: friend?.name }).usual : null;
    setR((prev) => ({
      ...prev,
      repeat: k === 'repeat' ? (prev.repeat ?? lastRepeat) : null,
      kind: k === 'at' ? 'at' : undefined,
      ...(usual ? { time: usual } : {}),
    }));
  };

  const pickDate = (date: ISODate) => set('date', date);
  const pickTime = (time: TimeOfDay) => {
    set('time', time);
    setTouched((t) => ({ ...t, time: true }));
  };
  const pickAdvance = (advance: Advance, daily: boolean) => {
    setR((prev) => ({ ...prev, advance, daily }));
    setTouched((t) => ({ ...t, advance: true }));
  };
  const pickFriend = (id: string | null) => {
    set('friendId', id);
    setTemplateFriendId(id);
  };

  // ---------- подсказки по привычкам ----------
  const habit = { kind, title: r.title, friendName: friend?.name };
  const times = timeSuggestions(others, data.friends, habit);
  const templates = titleTemplates(others, data.friends, data.friends.find((f) => f.id === templateFriendId));
  // Шаблоны нужны, пока названия нет или оно само из шаблона; своё название они только загораживали бы.
  const showTemplates = !r.title.trim() || fromTemplate;

  const applyTemplate = (t: TitleTemplate) => {
    setTitleMissing(false);
    setFromTemplate(true);
    if (!t.own) return set('title', t.title);
    // Свой шаблон — название и всё привычное для него: вид дела, время, «заранее», для кого.
    if (t.kind === 'repeat' && t.repeat) setCustomRepeat(!REPEAT_PRESETS.some((p) => sameRepeat(p.repeat, t.repeat ?? null)));
    setR((prev) => ({
      ...prev,
      title: t.title,
      repeat: t.kind === 'repeat' ? (t.repeat ?? prev.repeat ?? lastRepeat) : null,
      kind: t.kind === 'at' ? 'at' : undefined,
      time: t.time ?? prev.time,
      advance: t.kind === 'due' ? (t.advance ?? 0) : prev.advance,
      daily: t.kind === 'due' ? !!t.daily : prev.daily,
      friendId: t.friendId ?? prev.friendId,
    }));
  };

  const timeChips: StripChip[] = [...new Set([...times.chips, r.time])].sort().map((t) => ({
    key: t,
    label: shortTime(t),
    selected: t === r.time,
    own: times.own.includes(t),
    onPress: () => pickTime(t),
  }));
  const advanceChips: StripChip[] = [
    ...ADVANCES.map((a) => ({ key: String(a.value), label: a.label, selected: !r.daily && r.advance === a.value, onPress: () => pickAdvance(a.value, false) })),
    { key: 'daily', label: 'Каждый день до срока', selected: !!r.daily, onPress: () => pickAdvance(0, true) },
  ];
  const repeatChips: StripChip[] = [
    ...REPEAT_PRESETS.map((p) => ({
      key: p.label,
      label: p.label,
      selected: !customRepeat && sameRepeat(p.repeat, r.repeat),
      onPress: () => {
        setCustomRepeat(false);
        set('repeat', p.repeat);
      },
    })),
    {
      key: 'custom',
      label: 'Свой…',
      selected: customRepeat,
      onPress: () => {
        setCustomRepeat(true);
        // Свой интервал начинается с «каждые 3 дня», а не с уже выбранного готового варианта.
        if (!r.repeat || REPEAT_PRESETS.some((p) => sameRepeat(p.repeat, r.repeat))) set('repeat', { every: 3, unit: 'day' });
      },
    },
  ];
  const templateChips: StripChip[] = templates.map((t) => ({
    key: `${t.own ? 'own' : 'std'}-${t.key}`,
    label: t.own && t.time ? `${t.label} · ${shortTime(t.time)}` : t.label,
    selected: r.title === t.title,
    own: t.own,
    a11y: t.own ? `${t.label}, как обычно` : t.label,
    onPress: () => applyTemplate(t),
  }));

  /** Сохранить и закрыть. Нет названия — не сохраняем и возвращаем false: форма покажет подсказку у поля. */
  const save = (): boolean => {
    if (!r.title.trim()) {
      setTitleMissing(true);
      return false;
    }
    if (leaving.current) return true;
    leaving.current = true;
    // Новая дата или другой повтор — новая серия: старый якорь больше не нужен.
    const sameSeries = !!existing && existing.date === r.date && sameRepeat(existing.repeat, r.repeat);
    // У сделанного повторяющегося поменяли ближайший раз или сам повтор — это уже новый раз, он не сделан.
    // Иначе отметка «сделано» съела бы его: дело перенеслось бы ещё на раз вперёд, и напоминание не пришло бы.
    const reopened = !!existing && !!r.repeat && r.done && (!sameSeries || existing.time !== r.time);
    // «Каждый день до срока» — только у дел «до срока», «на дату и время» напоминает само; необязательное — только заданное.
    const { daily, kind: _kind, priority, minutes, ...rest } = r;
    saveReminder({
      ...(reopened ? reopenReminder(rest) : rest),
      ...(kind === 'at' ? { kind: 'at' as const, advance: 0 as const } : {}),
      ...(kind === 'due' && daily ? { daily: true, advance: 0 as const } : {}),
      ...(priority ? { priority } : {}),
      ...(minutes ? { minutes } : {}),
      title: r.title.trim(),
      anchor: sameSeries ? r.anchor : undefined,
    });
    router.back();
    return true;
  };

  const remove = async () => {
    if (!(await confirm('Удалить напоминание?', r.title))) return;
    if (leaving.current) return;
    leaving.current = true;
    deleteReminder(r.id);
    router.back();
  };

  const changeTitle = (v: string) => {
    set('title', v);
    setFromTemplate(false);
    if (v.trim()) setTitleMissing(false);
  };
  const changeEvery = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 3);
    setEveryText(digits);
    const n = parseInt(digits, 10);
    if (n >= 1 && r.repeat) set('repeat', { ...r.repeat, every: Math.min(365, n) });
  };

  return {
    existing,
    r,
    set,
    setR,
    kind,
    friend,
    today,
    friends: data.friends,
    choices: friendChoices(data.friends, others, r.friendId),
    /** В календаре ли дело: решает «умный календарь», человек может поправить. Нет переключателя — null. */
    calendar: calendarCandidate(r) ? inCalendar(r, smart) : null,
    summary: whenSummary({ ...r, repeat: kind === 'repeat' ? r.repeat : null, kind: kind === 'at' ? 'at' : undefined }, today),
    setKind,
    pickDate,
    pickTime,
    pickAdvance,
    pickFriend,
    timeChips,
    advanceChips,
    repeatChips,
    templateChips,
    showTemplates,
    customRepeat,
    everyText: everyText ?? (r.repeat ? String(r.repeat.every) : ''),
    changeEvery,
    resetEvery: () => setEveryText(null),
    titleMissing,
    changeTitle,
    searching,
    setSearching,
    save,
    remove,
  };
}

export type ReminderFormModel = ReturnType<typeof useReminderForm>;
