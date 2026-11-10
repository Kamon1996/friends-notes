import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { FriendPickerModal, FriendStrip } from '@/components/FriendPicker';
import { PRIORITY_ICON } from '@/components/ReminderRow';
import { PickerTrigger } from '@/components/form/PickerTrigger';
import { ChipStrip, ExpandRow, FormCard, FormSection, MonthPanel, Panel, PinIcon, SmallChip, StripRow, WeekStrip, type StripChip } from '@/components/form/parts';
import { Button, Empty, GrowingInput, Segmented, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { addInterval, formatRepeat } from '@/lib/dates';
import { calendarCandidate, inCalendar, smartCalendarOn } from '@/lib/calendarAi';
import { completeReminder, reopenReminder } from '@/lib/events';
import { DEFAULT_TIME, timeSuggestions, titleTemplates, usualAdvance, type TaskKind, type TitleTemplate } from '@/lib/habits';
import { dayWord, friendChoices, shortTime, whenSummary } from '@/lib/reminderForm';
import { DURATIONS, PRIORITY_LABELS, formatMinutes } from '@/lib/reminderList';
import { newId, useStore } from '@/lib/store';
import type { Advance, ISODate, Priority, Reminder, Repeat, RepeatUnit, TimeOfDay } from '@/lib/types';

const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'due', label: 'До срока' },
  { value: 'at', label: 'Дата и время' },
  { value: 'repeat', label: 'Повторять' },
];
const PRIORITIES: { value: Priority | 0; label: string }[] = [
  { value: 0, label: 'Нет' },
  ...([1, 2, 3] as const).map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
];

const REPEAT_PRESETS: { label: string; repeat: Repeat }[] = [
  { label: 'Каждый день', repeat: { every: 1, unit: 'day' } },
  { label: 'Каждую неделю', repeat: { every: 1, unit: 'week' } },
  { label: 'Раз в 2 недели', repeat: { every: 2, unit: 'week' } },
  { label: 'Каждый месяц', repeat: { every: 1, unit: 'month' } },
  { label: 'Раз в 2 месяца', repeat: { every: 2, unit: 'month' } },
  { label: 'Каждый год', repeat: { every: 1, unit: 'year' } },
];

const UNITS: { unit: RepeatUnit; label: string }[] = [
  { unit: 'day', label: 'дни' },
  { unit: 'week', label: 'недели' },
  { unit: 'month', label: 'месяцы' },
  { unit: 'year', label: 'годы' },
];

const ADVANCES: { value: Advance; label: string }[] = [
  { value: 0, label: 'Нет' },
  { value: 60, label: 'За час' },
  { value: 1440, label: 'За день' },
  { value: 4320, label: 'За 3 дня' },
  { value: 10080, label: 'За неделю' },
];

const sameRepeat = (a: Repeat | null, b: Repeat | null) => a === b || (!!a && !!b && a.every === b.every && a.unit === b.unit);

/** Какая строка «Деталей» раскрыта. Открыта всегда одна. */
type Section = 'who' | 'priority' | 'minutes' | 'note';

export default function EditReminderScreen() {
  const { ready, data } = useStore();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const exists = !!id && data.reminders.some((r) => r.id === id);
  // Форму уже показали: если дело удаляют прямо из неё, экран закрывается с формой, а не мигает «не найдено».
  const [opened, setOpened] = useState(false);
  if (ready && exists && !opened) setOpened(true);
  // Ждём загрузки данных, иначе при открытии из уведомления форма стартует пустой.
  if (!ready) return null;
  // Старое уведомление или ссылка на удалённое напоминание — не подсовываем пустую форму «Новое напоминание».
  if (id && !exists && !opened) return <ReminderNotFound />;
  return <ReminderForm />;
}

/** Ближайший ровный час — время по умолчанию для события на сегодня. */
function nextHour(now = new Date()): TimeOfDay {
  const h = now.getHours() + 1;
  return h > 23 ? '23:59' : `${String(h).padStart(2, '0')}:00`;
}

function ReminderNotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Напоминание' }} />
      <Empty icon="bell" title="Напоминание не найдено" text="Возможно, его уже удалили или отметили и убрали.">
        <Button title="К напоминаниям" variant="secondary" onPress={() => router.replace('/')} style={{ marginTop: 8 }} />
      </Empty>
    </>
  );
}

/**
 * Форма дела. «Когда» — лентами: срок, время и «заранее» меняют почти всегда, поэтому выбор в одно нажатие.
 * «Детали» — строками со значением: их трогают редко, строка раскрывается на месте. Шторок нет.
 * Время, «заранее» и шаблоны названий подсказывает `habits` — по тому, как человек уже заводил дела.
 */
function ReminderForm() {
  // Из календаря: дата выбранного дня, «Дата и время», и сразу в календаре.
  const params = useLocalSearchParams<{ id?: string; friendId?: string; date?: string; kind?: string; calendar?: string }>();
  const { data, today, saveReminder, deleteReminder } = useStore();
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
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
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (section: Section) => setOpen((cur) => (cur === section ? null : section));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  // Шаблоны подбираем для того, кого выбрал сам человек: свой шаблон может подставить друга, и лента не должна от этого меняться.
  const [templateFriendId, setTemplateFriendId] = useState(r.friendId);
  const [titleMissing, setTitleMissing] = useState(false);
  // Название подставлено шаблоном — лента шаблонов остаётся: можно передумать и нажать соседний.
  const [fromTemplate, setFromTemplate] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
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

  const pickDate = (date: ISODate) => {
    set('date', date);
    setCalendarOpen(false);
  };
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
    setOpen(null);
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

  const save = () => {
    if (!r.title.trim()) {
      setTitleMissing(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (leaving.current) return;
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
  };

  const remove = async () => {
    if (!(await confirm('Удалить напоминание?', r.title))) return;
    if (leaving.current) return;
    leaving.current = true;
    deleteReminder(r.id);
    router.back();
  };

  const muted = colors.text3;
  const priorityColor = r.priority === 3 ? colors.danger : r.priority === 2 ? colors.warn : undefined;
  const toggleSwitch = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.accent, false: colors.checkbox }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? 'Напоминание' : 'Новое напоминание' }} />
      <ScrollView ref={scrollRef} style={s.screen} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <FormCard style={titleMissing ? { borderColor: colors.danger, borderWidth: 1.5 } : undefined}>
          <GrowingInput
            singleLine
            maxLines={3}
            value={r.title}
            onChangeText={(v) => {
              set('title', v);
              setFromTemplate(false);
              if (v.trim()) setTitleMissing(false);
            }}
            // Имя в подсказку не подставляем: «написать Александра» — не тот падеж, а склонять имена мы не умеем.
            placeholder={friend ? 'Например, написать или поздравить' : 'Например, сдать отчёт'}
            accessibilityLabel="Что сделать"
            autoFocus={!existing}
            style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 16, fontSize: 16.5, fontFamily: fonts.medium }}
          />
          {showTemplates && (
            <View style={{ paddingLeft: 12, paddingBottom: 12 }}>
              <ChipStrip label="Шаблоны" chips={templateChips} />
            </View>
          )}
        </FormCard>
        {titleMissing && <Text style={[s.caption, { color: colors.danger, marginTop: 6, paddingHorizontal: 16 }]}>Напиши, что нужно сделать.</Text>}

        <FormSection title="Когда" />
        <FormCard>
          <View style={{ padding: 10, paddingBottom: 4 }}>
            <Segmented options={KINDS} value={kind} onChange={setKind} />
          </View>
          <StripRow
            label={kind === 'due' ? 'Срок' : 'Дата'}
            sub={dayWord(r.date, today)}
            first
            pinned={
              <SmallChipButton label={calendarOpen ? 'Скрыть календарь' : 'Открыть календарь'} onPress={() => setCalendarOpen((v) => !v)}>
                <PinIcon icon="calendar" active={calendarOpen} />
              </SmallChipButton>
            }
          >
            <WeekStrip value={r.date} today={today} onChange={pickDate} />
          </StripRow>
          {calendarOpen && (
            <MonthPanel
              value={r.date}
              today={today}
              onChange={pickDate}
              footer={
                <PickerTrigger mode="date" value={r.date} onChange={pickDate} label="Другая дата">
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 18, color: colors.accentText }}>Другая дата…</Text>
                </PickerTrigger>
              }
            />
          )}
          <StripRow
            label="Время"
            pinned={
              <PickerTrigger mode="time" value={r.time} onChange={pickTime} label="Выбрать время" style={{ borderRadius: 16 }}>
                <PinIcon icon="clock" />
              </PickerTrigger>
            }
          >
            <ChipStrip label="Время" chips={timeChips} />
          </StripRow>
          {kind === 'due' && (
            <StripRow label="Заранее">
              <ChipStrip label="Напомнить заранее" chips={advanceChips} />
            </StripRow>
          )}
          {kind === 'repeat' && (
            <StripRow label="Повтор">
              <ChipStrip label="Как часто" chips={repeatChips} />
            </StripRow>
          )}
          {kind === 'repeat' && customRepeat && r.repeat && (
            <Panel style={{ gap: 10 }}>
              <View style={[s.row, { gap: 10 }]}>
                <Text style={s.body}>Каждые</Text>
                <TextInput
                  value={everyText ?? String(r.repeat.every)}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, '').slice(0, 3);
                    setEveryText(digits);
                    const n = parseInt(digits, 10);
                    if (n >= 1) set('repeat', { ...r.repeat!, every: Math.min(365, n) });
                  }}
                  onBlur={() => setEveryText(null)}
                  accessibilityLabel="Каждые сколько"
                  maxLength={3}
                  keyboardType="number-pad"
                  style={[s.input, { width: 64, textAlign: 'center', paddingVertical: 6, minHeight: 40 }]}
                />
                <Text style={[s.muted, { flex: 1 }]}>{formatRepeat(r.repeat)}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {UNITS.map((u) => (
                  <SmallChip key={u.unit} label={u.label} selected={r.repeat?.unit === u.unit} onPress={() => set('repeat', { ...r.repeat!, unit: u.unit })} />
                ))}
              </View>
            </Panel>
          )}
        </FormCard>
        <Text style={[s.caption, { marginTop: 8, paddingHorizontal: 16 }]}>{whenSummary({ ...r, repeat: kind === 'repeat' ? r.repeat : null, kind: kind === 'at' ? 'at' : undefined }, today)}</Text>

        <FormSection title="Детали" />
        <FormCard>
          <ExpandRow
            first
            leading={friend ? <Avatar friend={friend} size={36} /> : undefined}
            icon="person"
            label="Для кого"
            value={friend ? friend.name : 'Для себя'}
            open={open === 'who'}
            onToggle={() => toggle('who')}
          >
            <Panel style={{ paddingHorizontal: 6 }}>
              <FriendStrip
                choices={friendChoices(data.friends, others, r.friendId)}
                total={data.friends.length}
                value={r.friendId}
                onChange={pickFriend}
                onSearch={() => {
                  // Окно поиска закрывает форму целиком — кружки под ним больше не нужны.
                  setSearching(true);
                  setOpen(null);
                }}
              />
            </Panel>
          </ExpandRow>
          <ExpandRow
            icon={r.priority ? PRIORITY_ICON[r.priority] : 'chevronsUp'}
            iconColor={priorityColor}
            label="Важность"
            value={r.priority ? PRIORITY_LABELS[r.priority] : 'Не задана'}
            valueColor={r.priority ? priorityColor : muted}
            open={open === 'priority'}
            onToggle={() => toggle('priority')}
          >
            {/* Стрелки — как в списке дел: вниз — низкая, вверх — средняя, двойная — важно. Таблетками, а не переключателем:
                четыре подписи со значками в одну строку на узком экране не помещаются. */}
            <Panel style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {PRIORITIES.map((o) => (
                <SmallChip
                  key={o.value}
                  label={o.label}
                  icon={o.value ? PRIORITY_ICON[o.value] : undefined}
                  iconColor={o.value === 3 ? colors.danger : o.value === 2 ? colors.warn : colors.text3}
                  selected={(r.priority ?? 0) === o.value}
                  onPress={() => {
                    set('priority', o.value || undefined);
                    setOpen(null);
                  }}
                />
              ))}
            </Panel>
          </ExpandRow>
          <ExpandRow
            icon="stopwatch"
            label="Сколько займёт"
            value={r.minutes ? formatMinutes(r.minutes) : 'Не задано'}
            valueColor={r.minutes ? undefined : muted}
            open={open === 'minutes'}
            onToggle={() => toggle('minutes')}
          >
            <Panel style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[undefined, ...DURATIONS].map((m) => (
                <SmallChip
                  key={m ?? 0}
                  label={m ? formatMinutes(m) : 'Не задано'}
                  selected={(r.minutes ?? undefined) === m}
                  onPress={() => {
                    set('minutes', m);
                    setOpen(null);
                  }}
                />
              ))}
            </Panel>
          </ExpandRow>
          {calendarCandidate(r) && <ExpandRow icon="calendar" label="В календаре" trailing={toggleSwitch('В календаре', inCalendar(r, smart), (v) => set('calendar', v))} />}
          <ExpandRow
            icon="note"
            label="Заметка"
            value={r.note.trim() ? r.note.trim().split('\n')[0] : 'Добавить'}
            valueColor={r.note.trim() ? undefined : muted}
            open={open === 'note'}
            onToggle={() => toggle('note')}
          >
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <GrowingInput minLines={3} value={r.note} onChangeText={(v) => set('note', v)} placeholder="Детали, ссылка, адрес…" accessibilityLabel="Заметка" autoFocus style={{ backgroundColor: colors.bg }} />
            </View>
          </ExpandRow>
          {existing && !r.repeat && (
            <ExpandRow icon="check" label="Выполнено" trailing={toggleSwitch('Выполнено', r.done, (v) => setR((prev) => (v ? completeReminder(prev) : reopenReminder(prev))))} />
          )}
        </FormCard>

        {existing && <Button title="Удалить" variant="danger" onPress={remove} style={{ marginTop: 12 }} />}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 + insets.bottom, backgroundColor: colors.bg }}>
        <Button title="Сохранить" onPress={save} />
      </View>
      <FriendPickerModal open={searching} friends={data.friends} value={r.friendId} onPick={pickFriend} onClose={() => setSearching(false)} />
    </KeyboardAvoidingView>
  );
}

/** Кнопка вокруг значка в конце ленты (календарь): цель касания не меньше 44. */
function SmallChipButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}
