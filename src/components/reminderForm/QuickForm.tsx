import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FriendStrip } from '@/components/FriendPicker';
import { PRIORITY_ICON } from '@/components/ReminderRow';
import { PickerTrigger } from '@/components/form/PickerTrigger';
import { ChipStrip, ExpandRow, FormCard, FormSection, MonthPanel, Panel, PinIcon, StripRow, WeekStrip } from '@/components/form/parts';
import { GrowingInput, Segmented, useTheme } from '@/components/ui';
import { completeReminder, reopenReminder } from '@/lib/events';
import { dayWord } from '@/lib/reminderForm';
import { PRIORITY_LABELS, formatMinutes } from '@/lib/reminderList';
import type { ISODate } from '@/lib/types';
import { CustomRepeat, FormScaffold, FormSwitch, MinutesChips, PriorityChips, RepeatDays } from './shared';
import { KINDS, type ReminderFormModel } from './useReminderForm';

/** Какая строка «Деталей» раскрыта. Открыта всегда одна. */
type Section = 'who' | 'priority' | 'minutes' | 'note';

/**
 * «Быстрая» форма дела. «Когда» — лентами: срок, время и «заранее» меняют почти всегда, поэтому выбор в одно нажатие.
 * «Детали» — строками со значением: их трогают редко, строка раскрывается на месте. Шторок нет.
 */
export function QuickForm({ form }: { form: ReminderFormModel }) {
  const { existing, r, set, setR, kind, friend, today, setKind, pickTime, timeChips, advanceChips, repeatChips, customRepeat } = form;
  const { s, colors, fonts } = useTheme();
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (section: Section) => setOpen((cur) => (cur === section ? null : section));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const pickDay = (date: ISODate) => {
    form.pickDate(date);
    setCalendarOpen(false);
  };
  const pickWho = (id: string | null) => {
    form.pickFriend(id);
    setOpen(null);
  };
  const muted = colors.text3;
  const priorityColor = r.priority === 3 ? colors.danger : r.priority === 2 ? colors.warn : undefined;

  return (
    <FormScaffold form={form} onPickFriend={pickWho}>
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
            <WeekStrip value={r.date} today={today} onChange={pickDay} />
          </StripRow>
          {calendarOpen && (
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
          {kind === 'repeat' && (
            <StripRow label="Повтор">
              <ChipStrip label="Как часто" chips={repeatChips} />
            </StripRow>
          )}
          {kind === 'repeat' && form.days && (
            <Panel>
              <RepeatDays form={form} />
            </Panel>
          )}
          {kind === 'repeat' && customRepeat && r.repeat && (
            <Panel>
              <CustomRepeat form={form} />
            </Panel>
          )}
          {/* Несколько сразу: «за день» и «за час» — два уведомления. */}
          <StripRow label="Заранее">
            <ChipStrip label="Напомнить заранее" chips={advanceChips} />
          </StripRow>
        </FormCard>
        <Text style={[s.caption, { marginTop: 8, paddingHorizontal: 16 }]}>{form.summary}</Text>

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
                choices={form.choices}
                total={form.friends.length}
                value={r.friendId}
                onChange={pickWho}
                onSearch={() => {
                  // Окно поиска закрывает форму целиком — кружки под ним больше не нужны.
                  form.setSearching(true);
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
            <Panel>
              <PriorityChips form={form} onPick={() => setOpen(null)} />
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
            <Panel>
              <MinutesChips form={form} onPick={() => setOpen(null)} />
            </Panel>
          </ExpandRow>
          {form.calendar !== null && <ExpandRow icon="calendar" label="В календаре" trailing={<FormSwitch label="В календаре" value={form.calendar} onChange={(v) => set('calendar', v)} />} />}
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
            <ExpandRow icon="check" label="Выполнено" trailing={<FormSwitch label="Выполнено" value={r.done} onChange={(v) => setR((prev) => (v ? completeReminder(prev) : reopenReminder(prev)))} />} />
          )}
        </FormCard>
    </FormScaffold>
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
