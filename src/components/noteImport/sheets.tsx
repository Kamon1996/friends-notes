import { useState, type ReactNode } from 'react';
import { ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { FriendPickerModal, FriendStrip } from '@/components/FriendPicker';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { PickerTrigger } from '@/components/form/PickerTrigger';
import { ExpandRow, FormCard, MonthPanel, PinIcon, SmallChip } from '@/components/form/parts';
import { REPEAT_PRESETS, sameRepeat } from '@/components/reminderForm/useReminderForm';
import { Button, GrowingInput, IconButton, Segmented, useTheme } from '@/components/ui';
import { addInterval, formatDate, formatRepeat, parseISODate } from '@/lib/dates';
import { birthdayConflict, canAdd, dayMonth, missingOf, type DateTo, type ItemPatch, type ReviewItem } from '@/lib/noteReview';
import type { NoteDraft } from '@/lib/noteTasks';
import { dayWord, friendChoices, shortTime } from '@/lib/reminderForm';
import type { Friend, ISODate, Reminder, TimeOfDay } from '@/lib/types';
import { MISSING_LABEL } from './parts';

/** Частые сроки одной таблеткой — как в форме дела. */
function quickDays(today: ISODate): { label: string; date: ISODate }[] {
  const weekday = parseISODate(today).getDay();
  return [
    { label: 'Сегодня', date: today },
    { label: 'Завтра', date: addInterval(today, 'day', 1) },
    { label: 'В субботу', date: addInterval(today, 'day', ((6 - weekday + 7) % 7) || 7) },
    { label: 'Через неделю', date: addInterval(today, 'day', 7) },
  ];
}

function DayPicker({ value, today, onPick }: { value: ISODate | null; today: ISODate; onPick: (date: ISODate) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {quickDays(today).map((q) => (
          <SmallChip key={q.label} label={q.label} selected={value === q.date} onPress={() => onPick(q.date)} />
        ))}
      </View>
      <View style={{ marginHorizontal: -12, marginBottom: -12 }}>
        <MonthPanel
          value={value ?? today}
          today={today}
          onChange={onPick}
          footer={
            <PickerTrigger mode="date" value={value ?? today} onChange={onPick} label="Другая дата">
              <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 18, color: colors.accentText }}>Другая дата…</Text>
            </PickerTrigger>
          }
        />
      </View>
    </>
  );
}

function Quote({ text }: { text: string }) {
  const { s, colors, fonts } = useTheme();
  return (
    <View style={{ backgroundColor: colors.chip, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 2 }}>
      <Text style={[s.sectionLabel, { fontSize: 11 }]}>Из заметки</Text>
      <Text style={{ fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>«{text}»</Text>
    </View>
  );
}

function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  const { s, fonts } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[s.h2, { flex: 1, fontFamily: fonts.display }]} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      <IconButton icon="close" label="Закрыть" onPress={onClose} />
    </View>
  );
}

/**
 * «Когда?» — один вопрос вместо целой формы. Открывается после свайпа «Добавить» по записи без срока и по
 * «Поставить всем». Выбрал день — готово.
 */
export function WhenSheet({
  open,
  title,
  quote,
  usualTime,
  today,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  quote?: string;
  /** Время, которое получат дела без названного времени. */
  usualTime: TimeOfDay;
  today: ISODate;
  onPick: (date: ISODate) => void;
  onClose: () => void;
}) {
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  // Пока шторка уезжает, в ней остаётся то, что было.
  const [shown, setShown] = useState({ title, quote });
  if (open && (shown.title !== title || shown.quote !== quote)) setShown({ title, quote });
  return (
    <Sheet visible={open} onClose={onClose} style={{ padding: 20, paddingTop: 10, paddingBottom: 20 + insets.bottom, gap: 14 }}>
      <SheetHandle />
      <SheetHead title={shown.title} onClose={onClose} />
      {!!shown.quote && <Quote text={shown.quote} />}
      <DayPicker value={null} today={today} onPick={onPick} />
      <Text style={s.caption}>Если время в заметке не названо — напомню в твоё обычное, в {shortTime(usualTime)}.</Text>
    </Sheet>
  );
}

type RowKey = 'date' | 'time' | 'repeat' | 'who' | 'note';
const TIMES: TimeOfDay[] = ['09:00', '10:00', '12:00', '15:00', '19:00', '21:00'];
const DEST: { value: DateTo; label: string }[] = [
  { value: 'friend', label: 'В карточку' },
  { value: 'new', label: 'Новый друг' },
  { value: 'reminder', label: 'Напомнить' },
];

/**
 * Запись целиком: цитата из заметки и те же поля, что у обычного дела, — строками, которые раскрываются на месте.
 * Решение тут же: «Убрать» или «Добавить». Пока чего-то не хватает, кнопка говорит, чего именно.
 */
export function ItemSheet({
  item,
  friends,
  reminders,
  today,
  usualTime,
  onEdit,
  onAdd,
  onSkip,
  onClose,
}: {
  item: ReviewItem | null;
  friends: Friend[];
  reminders: Reminder[];
  today: ISODate;
  usualTime: TimeOfDay;
  onEdit: (patch: ItemPatch) => void;
  onAdd: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Пока шторка уезжает, в ней остаётся последняя запись.
  const [shown, setShown] = useState<ReviewItem | null>(item);
  if (item && item !== shown) setShown(item);
  const [openRow, setOpenRow] = useState<RowKey | null>(null);
  const [searching, setSearching] = useState(false);
  // Открыли другую запись — строки сворачиваются, а у неполной сразу раскрыто то, чего не хватает.
  const [forId, setForId] = useState<string | null>(null);
  if (item && item.id !== forId) {
    setForId(item.id);
    const miss = missingOf(item);
    setOpenRow(miss.includes('repeat') ? 'repeat' : miss.includes('date') ? 'date' : miss.includes('person') ? 'who' : null);
  }
  if (!shown) return null;

  const d: NoteDraft = shown.draft;
  const friend = friends.find((f) => f.id === shown.friendId);
  const missing = missingOf(shown);
  const task = d.type === 'task';
  const toggle = (key: RowKey) => setOpenRow((cur) => (cur === key ? null : key));
  const warn = colors.warn;
  const pickDay = (date: ISODate) => {
    onEdit({ date });
    setOpenRow(null);
  };
  const pickWho = (id: string | null) => {
    onEdit({ friendId: id, known: friends.find((f) => f.id === id)?.birthday ?? null, ...(task ? {} : { to: id ? 'friend' : shown.to }) });
    setOpenRow(null);
  };
  const body = (children: ReactNode) => <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>{children}</View>;

  const whoValue = friend ? friend.name : d.person ? `${d.person} · нет в друзьях` : task ? 'Для себя' : null;
  const conflict = birthdayConflict(shown);
  const addTitle = canAdd(shown) ? (shown.state === 'add' ? 'Готово' : 'Добавить') : missing[0] === 'conflict' ? 'Сначала реши с датой' : `Сначала: ${MISSING_LABEL[missing[0]].toLowerCase()}`;

  return (
    <>
      <Sheet visible={!!item} onClose={onClose} style={{ paddingTop: 10, paddingBottom: 16 + insets.bottom }}>
        <SheetHandle />
        <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
          <SheetHead title={task ? 'Запись из заметки' : d.type === 'birthday' ? 'День рождения' : 'Важная дата'} onClose={onClose} />
        </View>
        <ScrollView style={{ maxHeight: height * 0.62 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 6, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!!d.quote && <Quote text={d.quote} />}
          {d.type !== 'birthday' && (
            <FormCard style={missing.includes('title') ? { borderColor: colors.danger, borderWidth: 1.5 } : undefined}>
              <GrowingInput
                singleLine
                maxLines={3}
                value={d.title}
                onChangeText={(title) => onEdit({ title })}
                placeholder={task ? 'Что сделать' : 'Что за дата'}
                accessibilityLabel={task ? 'Что сделать' : 'Что за дата'}
                style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 16, fontSize: 16.5, fontFamily: fonts.medium }}
              />
            </FormCard>
          )}
          <FormCard>
            <ExpandRow
              icon="calendar"
              iconColor={d.date ? undefined : warn}
              label={task ? (d.kind === 'repeat' ? 'Ближайший раз' : 'Срок') : 'День'}
              value={d.date ? (task ? dayWord(d.date, today) : dayMonth(d.date)) : 'выбери'}
              valueColor={d.date ? undefined : warn}
              open={openRow === 'date'}
              onToggle={() => toggle('date')}
              first
            >
              {body(<DayPicker value={d.date} today={today} onPick={pickDay} />)}
            </ExpandRow>
            {task && (
              <ExpandRow
                icon={d.kind === 'due' ? 'bellRing' : 'clock'}
                label={d.kind === 'due' ? 'Напомнить' : 'Время'}
                value={d.time ? `в ${shortTime(d.time)}` : `в ${shortTime(usualTime)} · обычное`}
                valueColor={d.time ? undefined : colors.text3}
                open={openRow === 'time'}
                onToggle={() => toggle('time')}
              >
                {body(
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <SmallChip label="Обычное" selected={!d.time} onPress={() => onEdit({ time: null })} />
                      {[...new Set([...TIMES, ...(d.time ? [d.time] : [])])].sort().map((t) => (
                        <SmallChip key={t} label={shortTime(t)} selected={d.time === t} onPress={() => onEdit({ time: t })} />
                      ))}
                    </View>
                    <PickerTrigger mode="time" value={d.time ?? usualTime} onChange={(time) => onEdit({ time })} label="Выбрать время" style={{ borderRadius: 16 }}>
                      <PinIcon icon="clock" />
                    </PickerTrigger>
                  </View>,
                )}
              </ExpandRow>
            )}
            {task && (
              <ExpandRow
                icon="repeat"
                iconColor={missing.includes('repeat') ? warn : undefined}
                label="Повтор"
                value={d.repeat ? formatRepeat(d.repeat) : d.kind === 'repeat' ? 'как часто?' : 'нет'}
                valueColor={missing.includes('repeat') ? warn : d.repeat ? undefined : colors.text3}
                open={openRow === 'repeat'}
                onToggle={() => toggle('repeat')}
              >
                {body(
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <SmallChip label="Нет" selected={d.kind !== 'repeat'} onPress={() => onEdit({ repeat: null })} />
                    {REPEAT_PRESETS.map((p) => (
                      <SmallChip
                        key={p.label}
                        label={p.label}
                        selected={sameRepeat(p.repeat, d.repeat)}
                        onPress={() => {
                          onEdit({ repeat: p.repeat });
                          // «Как часто» выбрано, а срока ещё нет — раскрываем его: это следующее, чего не хватает.
                          if (!d.date) setOpenRow('date');
                        }}
                      />
                    ))}
                  </View>,
                )}
              </ExpandRow>
            )}
            {!task && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.separator, gap: 8 }}>
                <Text style={[s.label, { paddingHorizontal: 0, marginBottom: 0 }]}>Куда положить</Text>
                <Segmented options={DEST} value={shown.to} onChange={(to) => onEdit({ to })} />
              </View>
            )}
            {(task || shown.to === 'friend') && (
              <ExpandRow
                leading={friend ? <Avatar friend={friend} size={36} /> : undefined}
                icon="person"
                iconColor={missing.includes('person') ? warn : undefined}
                label={task ? 'Для кого' : 'Чья дата'}
                value={whoValue ?? 'выбери друга'}
                valueColor={missing.includes('person') ? warn : friend ? undefined : colors.text3}
                open={openRow === 'who'}
                onToggle={() => toggle('who')}
              >
                {body(
                  <FriendStrip
                    choices={friendChoices(friends, reminders, shown.friendId)}
                    total={friends.length}
                    value={shown.friendId}
                    onChange={pickWho}
                    onSearch={() => setSearching(true)}
                  />,
                )}
              </ExpandRow>
            )}
            {!task && shown.to !== 'friend' && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.separator, gap: 8 }}>
                <Text style={[s.label, { paddingHorizontal: 0, marginBottom: 0 }]}>Как зовут</Text>
                <GrowingInput singleLine value={d.person ?? ''} onChangeText={(person) => onEdit({ person })} placeholder="Имя" accessibilityLabel="Как зовут" />
              </View>
            )}
            {task && (
              <ExpandRow
                icon="note"
                label="Заметка"
                value={d.note.trim() ? d.note.trim().split('\n')[0] : 'Добавить'}
                valueColor={d.note.trim() ? undefined : colors.text3}
                open={openRow === 'note'}
                onToggle={() => toggle('note')}
              >
                {body(<GrowingInput minLines={2} maxLines={6} value={d.note} onChangeText={(note) => onEdit({ note })} placeholder="Детали, ссылка, адрес…" accessibilityLabel="Заметка" />)}
              </ExpandRow>
            )}
          </FormCard>
          {conflict && friend && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.warnSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.text }}>
                В карточке «{friend.name}» уже записан день рождения: {formatDate(conflict, false)}. Заменить на {d.date ? dayMonth(d.date) : ''}? Или положи дату напоминанием.
              </Text>
              <Switch value={!!shown.replace} onValueChange={(replace) => onEdit({ replace })} accessibilityLabel="Заменить день рождения" />
            </View>
          )}
          {!d.sure && <Text style={[s.caption, { paddingHorizontal: 4 }]}>Под вопросом: в заметке это звучит как мысль, а не как решённое дело.</Text>}
          {d.check.includes('date') && <Text style={[s.caption, { paddingHorizontal: 4 }]}>Проверь срок: в заметке он назван неточно, день подобран.</Text>}
          {d.check.includes('person') && <Text style={[s.caption, { paddingHorizontal: 4 }]}>Проверь, для кого: в этой фразе человек не назван, он взят из соседней.</Text>}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
          <Button title={shown.state === 'skip' ? 'Вернуть' : 'Убрать'} variant="secondary" onPress={onSkip} style={{ flex: 1 }} />
          <Button title={addTitle} onPress={shown.state === 'add' ? onClose : onAdd} disabled={!canAdd(shown)} style={{ flex: 1.5 }} />
        </View>
      </Sheet>
      <FriendPickerModal open={searching} friends={friends} value={shown.friendId} onPick={pickWho} onClose={() => setSearching(false)} />
    </>
  );
}
