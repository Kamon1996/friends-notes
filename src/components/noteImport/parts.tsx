import { useRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { ListRow, useTheme } from '@/components/ui';
import { formatDayShort, formatRepeat } from '@/lib/dates';
import { dayMonth, daysLeft, missingOf, type ReviewItem } from '@/lib/noteReview';
import { shortTime } from '@/lib/reminderForm';
import type { Friend, ISODate } from '@/lib/types';

const RING = 44;
/** «Убрать» — спокойный серо-коричневый: решение обратимо, это не удаление. */
const SKIP_BG = '#6B5D52';

/** Чего не хватает записи — словом для таблетки справа и подписи кнопки. */
export const MISSING_LABEL: Record<string, string> = { date: 'Срок', repeat: 'Как часто', person: 'Кто', title: 'Название', conflict: 'Другая дата' };

/**
 * Слева в строке — срок, как в «Напоминаниях»: сколько дней осталось. Срока нет — пунктир с календарём (у привычки
 * без «как часто» — с повтором): видно, что поле ждёт человека. У дня рождения и важной даты — торт.
 */
export function DraftRing({ item, friend, today }: { item: ReviewItem; friend?: Friend; today: ISODate }) {
  const { colors, fonts } = useTheme();
  const d = item.draft;
  const missing = missingOf(item);
  const person = d.type !== 'task';
  let inner: ReactNode;
  let border: object;
  if (person) {
    inner = <Icon name="cake" size={19} color={colors.accentText} strokeWidth={1.9} />;
    border = { backgroundColor: colors.tint };
  } else if (missing.includes('repeat') || missing.includes('date')) {
    inner = <Icon name={missing.includes('repeat') ? 'repeat' : 'calendar'} size={18} color={colors.warn} strokeWidth={2} />;
    border = { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.warn };
  } else {
    const left = daysLeft(d.date as ISODate, today);
    inner =
      left.n === 0 ? (
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.text }}>
          сег.
        </Text>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 17, color: colors.text, fontVariant: ['tabular-nums'] }}>
            {left.n}
          </Text>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.body, fontSize: 8.5, lineHeight: 10, color: colors.text3 }}>
            {left.unit}
          </Text>
        </View>
      );
    border = { borderWidth: 2.5, borderColor: colors.hairline };
  }
  return (
    <View style={{ width: RING, height: RING }}>
      <View style={[{ width: RING, height: RING, borderRadius: RING / 2, alignItems: 'center', justifyContent: 'center' }, border]}>{inner}</View>
      {friend && (
        <View style={{ position: 'absolute', right: -5, bottom: -4, borderRadius: 11, borderWidth: 2, borderColor: colors.card }}>
          <Avatar friend={friend} size={18} />
        </View>
      )}
    </View>
  );
}

/** Таблетка «чего не хватает»: пунктиром, как пустое обязательное поле. */
export function NeedPill({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.warn, backgroundColor: colors.warnSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.warn }}>
        {text}
      </Text>
    </View>
  );
}

const DEST: Record<ReviewItem['to'], string> = { friend: 'в карточку', new: 'новым другом', reminder: 'напоминанием' };

/** Вторая строка записи: когда и для кого. Чего в заметке не было — так и пишем. */
export function draftMeta(item: ReviewItem, friend: Friend | undefined, today: ISODate): string {
  const d = item.draft;
  if (d.type !== 'task') {
    // Имя уже стоит в названии строки — здесь только куда попадёт дата.
    const to = item.to === 'friend' ? (friend ? 'в карточку друга' : 'выбери друга') : DEST[item.to];
    return [d.date ? dayMonth(d.date) : 'день не назван', to].join(' · ');
  }
  const parts: string[] = [];
  if (d.kind === 'repeat') parts.push(d.repeat ? formatRepeat(d.repeat) : 'привычка');
  if (d.date) parts.push(`${d.kind === 'repeat' ? 'с ' : ''}${formatDayShort(d.date, today)}`);
  else if (d.kind !== 'repeat') parts.push('срок не назван');
  if (d.time) parts.push(d.kind === 'due' ? `до ${shortTime(d.time)}` : shortTime(d.time));
  const who = friend?.name ?? d.person ?? '';
  if (who) parts.push(who);
  return parts.join(' · ');
}

/**
 * Строка-запись. На проверке: свайп вправо — «Добавить», влево — «Убрать» (как «Сделано» и «Удалить» в напоминаниях).
 * В «Добавить» — только влево. Нажатие открывает шторку с полями. Для экранного диктора те же решения — действиями.
 */
export function NoteRow({
  item,
  friend,
  today,
  onPress,
  onAdd,
  onSkip,
}: {
  item: ReviewItem;
  friend?: Friend;
  today: ISODate;
  onPress: () => void;
  onAdd: () => void;
  onSkip: () => void;
}) {
  const { s, colors, fonts } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const d = item.draft;
  const missing = missingOf(item);
  const title = d.type === 'birthday' ? `День рождения${d.person || friend ? ` — ${friend?.name ?? d.person}` : ''}` : d.title;
  const asked = !d.sure || d.check.length > 0;

  const action = (bg: string, icon: IconName, label: string, side: 'left' | 'right', onAct: () => void) => (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        onAct();
        ref.current?.close();
      }}
      style={({ pressed }) => ({ width: 104, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.85 : 1 })}
    >
      <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={2.2} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );

  const row = (
    <ListRow
      onPress={onPress}
      leading={<DraftRing item={item} friend={friend} today={today} />}
      accessibilityLabel={`${title}. ${draftMeta(item, friend, today)}${missing.length ? `. Не хватает: ${missing.map((m) => MISSING_LABEL[m]).join(', ')}` : ''}`}
      accessibilityActions={item.state === 'todo' ? [{ name: 'add', label: 'Добавить' }, { name: 'skip', label: 'Убрать' }] : [{ name: 'skip', label: 'Убрать' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'add' ? onAdd() : onSkip())}
      title={
        <Text style={s.title} numberOfLines={2}>
          {title}
        </Text>
      }
      subtitle={
        <Text style={[s.muted, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
          {draftMeta(item, friend, today)}
          {asked && item.state === 'todo' && <Text style={{ color: colors.warn }}> · {d.sure ? 'проверь' : 'под вопросом'}</Text>}
        </Text>
      }
      trailing={
        item.state === 'add' ? (
          <View accessibilityLabel="Добавится">
            <Icon name="check" size={20} color={colors.success} strokeWidth={2.8} />
          </View>
        ) : missing.length ? (
          <NeedPill text={MISSING_LABEL[missing[0]]} />
        ) : undefined
      }
    />
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      leftThreshold={56}
      rightThreshold={56}
      overshootLeft={false}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: colors.card }}
      // 'right' — строку сдвинули вправо, открылась левая кнопка (react-native-gesture-handler 3).
      onSwipeableOpen={(direction) => {
        ref.current?.close();
        // Решение — после того как строка поехала на место: она тут же переезжает в другой раздел, и жест
        // не должен обрываться на исчезнувшей строке.
        setTimeout(direction === 'right' ? onAdd : onSkip, 160);
      }}
      renderLeftActions={item.state === 'todo' ? () => action(colors.success, 'check', 'Добавить', 'left', onAdd) : undefined}
      renderRightActions={() => action(SKIP_BG, 'close', 'Убрать', 'right', onSkip)}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

/** Убранная запись: зачёркнутой строкой с «Вернуть». */
export function SkippedRow({ title, onRestore }: { title: string; onRestore: () => void }) {
  const { s, colors, fonts } = useTheme();
  return (
    <View style={[s.row, s.rowPad]}>
      <View style={{ width: RING, alignItems: 'center' }}>
        <Icon name="close" size={18} color={colors.text3} strokeWidth={2} />
      </View>
      <Text style={[s.title, { flex: 1, color: colors.text3, textDecorationLine: 'line-through', fontFamily: fonts.body }]} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onRestore} accessibilityRole="button" accessibilityLabel={`Вернуть: ${title}`} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.accentText }}>Вернуть</Text>
      </Pressable>
    </View>
  );
}
