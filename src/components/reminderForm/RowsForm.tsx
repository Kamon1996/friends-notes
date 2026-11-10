import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { FriendStrip } from '@/components/FriendPicker';
import { Icon } from '@/components/Icon';
import { PRIORITY_ICON } from '@/components/ReminderRow';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { PickerTrigger } from '@/components/form/PickerTrigger';
import { ExpandRow, FormCard, FormSection, MonthPanel, PinIcon, SmallChip, type StripChip } from '@/components/form/parts';
import { Button, GrowingInput, IconButton, Segmented, useTheme } from '@/components/ui';
import { addInterval, formatRepeat, parseISODate } from '@/lib/dates';
import { completeReminder, reopenReminder } from '@/lib/events';
import { dayWord, shortTime } from '@/lib/reminderForm';
import { PRIORITY_LABELS, formatMinutes } from '@/lib/reminderList';
import type { ISODate } from '@/lib/types';
import { CustomRepeat, FormScaffold, FormSwitch, MinutesChips, PriorityChips } from './shared';
import { ADVANCES, KINDS, type ReminderFormModel } from './useReminderForm';

/** Что выбирают в шторке. */
type SheetKey = 'date' | 'time' | 'repeat' | 'who' | 'priority' | 'minutes' | 'note';

/**
 * Форма дела «строками»: как «Настройки» и карточка друга. В строке — значение, по нажатию — шторка с выбором.
 * Так открывается готовое дело: его читают целиком и правят по одному полю. Можно выбрать и для новых дел.
 */
export function RowsForm({ form }: { form: ReminderFormModel }) {
  const { existing, r, set, setR, kind, friend, today, setKind, customRepeat } = form;
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  // Пока шторка уезжает, в ней остаётся то, что было.
  const [shown, setShown] = useState<SheetKey>('date');
  if (sheet && sheet !== shown) setShown(sheet);
  const close = () => setSheet(null);

  const muted = colors.text3;
  const priorityColor = r.priority === 3 ? colors.danger : r.priority === 2 ? colors.warn : undefined;
  const chevron = <Icon name="chevronRight" size={16} color={colors.text3} strokeWidth={2.2} />;
  const advance = ADVANCES.find((a) => a.value === r.advance);
  // «Напомнить: в 10:00 · за день» у дел «до срока»; у встреч и повторов — просто время.
  const remind = kind !== 'due' ? shortTime(r.time) : `в ${shortTime(r.time)}${r.daily ? ' · каждый день' : r.advance && advance ? ` · ${advance.label.toLowerCase()}` : ''}`;
  const dateLabel = kind === 'due' ? 'Срок' : kind === 'repeat' ? 'Ближайший раз' : 'Дата';
  const timeLabel = kind === 'due' ? 'Напомнить' : 'Время';

  const pickDay = (date: ISODate) => {
    form.pickDate(date);
    close();
  };
  const pickWho = (id: string | null) => {
    form.pickFriend(id);
    close();
  };

  const row = (key: SheetKey, props: { icon?: Parameters<typeof ExpandRow>[0]['icon']; leading?: ReactNode; label: string; value: string; valueColor?: string; iconColor?: string; first?: boolean }) => (
    <ExpandRow {...props} trailing={chevron} onToggle={() => setSheet(key)} />
  );
  const wrap = (chips: StripChip[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {chips.map(({ key, ...c }) => (
        <SmallChip key={key} {...c} />
      ))}
    </View>
  );
  const label = (text: string) => <Text style={[s.label, { paddingHorizontal: 0, marginBottom: 0 }]}>{text}</Text>;

  // Ближайшая суббота: сегодня суббота — следующая.
  const weekday = parseISODate(today).getDay();
  const quickDays: { label: string; date: ISODate }[] = [
    { label: 'Сегодня', date: today },
    { label: 'Завтра', date: addInterval(today, 'day', 1) },
    { label: 'В субботу', date: addInterval(today, 'day', ((6 - weekday + 7) % 7) || 7) },
    { label: 'Через неделю', date: addInterval(today, 'day', 7) },
  ];

  const titles: Record<SheetKey, string> = { date: dateLabel, time: timeLabel, repeat: 'Повтор', who: 'Для кого', priority: 'Важность', minutes: 'Сколько займёт', note: 'Заметка' };
  const done = <Button title="Готово" onPress={close} />;
  const content: Record<SheetKey, () => ReactNode> = {
    date: () => (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {quickDays.map((q) => (
            <SmallChip key={q.label} label={q.label} selected={r.date === q.date} onPress={() => pickDay(q.date)} />
          ))}
        </View>
        <View style={{ marginHorizontal: -12, marginBottom: -12 }}>
          <MonthPanel
            value={r.date}
            today={today}
            onChange={pickDay}
            footer={
              <PickerTrigger mode="date" value={r.date} onChange={pickDay} label="Другая дата">
                <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 18, color: colors.accentText }}>Другая дата…</Text>
              </PickerTrigger>
            }
          />
        </View>
      </>
    ),
    time: () => (
      <>
        {kind === 'due' && label('Во сколько')}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1 }}>{wrap(form.timeChips)}</View>
          <PickerTrigger mode="time" value={r.time} onChange={form.pickTime} label="Выбрать время" style={{ borderRadius: 16 }}>
            <PinIcon icon="clock" />
          </PickerTrigger>
        </View>
        {kind === 'due' && (
          <>
            {label('Напомнить заранее')}
            {wrap(form.advanceChips)}
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.soft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Icon name="bellRing" size={16} color={colors.accentText} strokeWidth={2} />
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.accentText }}>{form.summary}</Text>
        </View>
        {done}
      </>
    ),
    repeat: () => (
      <>
        {wrap(form.repeatChips)}
        {customRepeat && <CustomRepeat form={form} />}
        {done}
      </>
    ),
    who: () => (
      <FriendStrip
        choices={form.choices}
        total={form.friends.length}
        value={r.friendId}
        onChange={pickWho}
        onSearch={() => {
          close();
          form.setSearching(true);
        }}
      />
    ),
    priority: () => <PriorityChips form={form} onPick={close} />,
    minutes: () => <MinutesChips form={form} onPick={close} />,
    note: () => (
      <>
        <GrowingInput minLines={3} maxLines={8} value={r.note} onChangeText={(v) => set('note', v)} placeholder="Детали, ссылка, адрес…" accessibilityLabel="Заметка" autoFocus style={{ backgroundColor: colors.bg }} />
        {done}
      </>
    ),
  };

  return (
    <FormScaffold form={form} onPickFriend={pickWho}>
      <FormSection title="Когда" />
      <FormCard>
        <View style={{ padding: 10, paddingBottom: 4 }}>
          <Segmented options={KINDS} value={kind} onChange={setKind} />
        </View>
        {kind === 'repeat' && row('repeat', { icon: 'repeat', label: 'Повтор', value: formatRepeat(r.repeat), first: true })}
        {row('date', { icon: 'calendar', label: dateLabel, value: dayWord(r.date, today), first: kind !== 'repeat' })}
        {row('time', { icon: kind === 'due' ? 'bellRing' : 'clock', label: timeLabel, value: remind })}
      </FormCard>
      <Text style={[s.caption, { marginTop: 8, paddingHorizontal: 16 }]}>{form.summary}</Text>

      <FormSection title="Детали" />
      <FormCard>
        {row('who', { leading: friend ? <Avatar friend={friend} size={36} /> : undefined, icon: 'person', label: 'Для кого', value: friend ? friend.name : 'Для себя', first: true })}
        {row('priority', {
          icon: r.priority ? PRIORITY_ICON[r.priority] : 'chevronsUp',
          iconColor: priorityColor,
          label: 'Важность',
          value: r.priority ? PRIORITY_LABELS[r.priority] : 'Не задана',
          valueColor: r.priority ? priorityColor : muted,
        })}
        {row('minutes', { icon: 'stopwatch', label: 'Сколько займёт', value: r.minutes ? formatMinutes(r.minutes) : 'Не задано', valueColor: r.minutes ? undefined : muted })}
        {form.calendar !== null && <ExpandRow icon="calendar" label="В календаре" trailing={<FormSwitch label="В календаре" value={form.calendar} onChange={(v) => set('calendar', v)} />} />}
        {row('note', { icon: 'note', label: 'Заметка', value: r.note.trim() ? r.note.trim().split('\n')[0] : 'Добавить', valueColor: r.note.trim() ? undefined : muted })}
        {existing && !r.repeat && (
          <ExpandRow icon="check" label="Выполнено" trailing={<FormSwitch label="Выполнено" value={r.done} onChange={(v) => setR((prev) => (v ? completeReminder(prev) : reopenReminder(prev)))} />} />
        )}
      </FormCard>

      <Sheet visible={sheet !== null} onClose={close} style={{ padding: 20, paddingTop: 10, paddingBottom: 20 + insets.bottom, gap: 14 }}>
        <SheetHandle />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[s.h2, { flex: 1, fontFamily: fonts.display }]} accessibilityRole="header">
            {titles[shown]}
          </Text>
          <IconButton icon="close" label="Закрыть" onPress={close} />
        </View>
        {content[shown]()}
      </Sheet>
    </FormScaffold>
  );
}
