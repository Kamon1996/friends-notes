import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { useStore } from '@/lib/store';
import type { Reminder } from '@/lib/types';

/**
 * «Вернуть» сделанное — спокойным синим, а не зелёным «Сделано»: другое действие — другой цвет. Белый текст на нём
 * читается (контраст 4.9:1) в обеих темах.
 */
export const RESTORE_BLUE = '#3F78AE';

/** Удаление напоминания с вопросом; false — передумали. */
export async function removeReminder(r: Pick<Reminder, 'id' | 'title'>, remove: (id: string) => void): Promise<boolean> {
  if (!(await confirm(`Удалить «${r.title}»?`, 'Отменить это будет нельзя.'))) return false;
  remove(r.id);
  return true;
}

/**
 * Подсказка «по строке можно провести»: первая строка чуть отъезжает вправо (зелёный край с галочкой, у сделанного —
 * синий с «Вернуть») и влево (красный с корзиной). Раз за запуск, пока человек сам ни разу не провёл по строке, и не
 * больше трёх раз всего.
 */
export const SWIPE_HINT_KEY = 'friends-notes/swipe-hint';
const HINT_TIMES = 3;
const PEEK = 44;
let hintTaken = false;

async function takeHint(): Promise<boolean> {
  if (hintTaken) return false;
  hintTaken = true;
  try {
    const shown = Number(await AsyncStorage.getItem(SWIPE_HINT_KEY)) || 0;
    if (shown >= HINT_TIMES) return false;
    await AsyncStorage.setItem(SWIPE_HINT_KEY, String(shown + 1));
    return true;
  } catch {
    return false;
  }
}

/** Провёл сам — значит, знает: больше не показываем. */
const learned = () => AsyncStorage.setItem(SWIPE_HINT_KEY, String(HINT_TIMES)).catch(() => {});

/**
 * Строка напоминания со свайпами. Вправо — «Сделано» (у сделанного — «Вернуть»): срабатывает сам, как только
 * кнопка открылась (зелёная «Сделано», синяя «Вернуть»). Влево — только открывает красную «Удалить»; удаление — по
 * нажатию и с вопросом.
 */
export function ReminderSwipe({ reminder, enabled = true, hint = false, children }: { reminder: Reminder; enabled?: boolean; hint?: boolean; children: ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  const { setRemindersDone, deleteReminder } = useStore();
  const { colors, fonts } = useTheme();
  const { done } = reminder;
  const onDone = () => setRemindersDone([reminder.id], !done);

  const action = (bg: string, icon: 'check' | 'repeat' | 'trash', label: string, onPress: () => void) => (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 92, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.85 : 1 })}
    >
      <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={2} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      leftThreshold={48}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: colors.card }}
      // Направление — куда сдвинули строку (react-native-gesture-handler 3): 'right' — свайп вправо, открылась левая,
      // зелёная кнопка. Было 'left' — и свайп влево к «Удалить» отмечал сделанным.
      onSwipeableOpen={(direction) => {
        learned();
        if (direction === 'right') {
          onDone();
          ref.current?.close();
        }
      }}
      renderLeftActions={() =>
        action(done ? RESTORE_BLUE : colors.success, done ? 'repeat' : 'check', done ? 'Вернуть' : 'Сделано', () => {
          onDone();
          ref.current?.close();
        })
      }
      renderRightActions={() =>
        action(colors.danger, 'trash', 'Удалить', async () => {
          if (!(await removeReminder(reminder, deleteReminder))) ref.current?.close();
        })
      }
    >
      {hint && enabled ? <Peek done={done}>{children}</Peek> : children}
    </ReanimatedSwipeable>
  );
}

/** Строка, которая один раз «подглядывает» вправо и влево — показывает, что под ней. */
function Peek({ done, children }: { done: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    takeHint().then((ok) => {
      if (!ok || !alive) return;
      const out = (to: number) => withTiming(to, { duration: 320, easing: Easing.out(Easing.cubic) });
      const back = () => withDelay(500, withTiming(0, { duration: 260, easing: Easing.inOut(Easing.cubic) }));
      x.set(withDelay(800, withSequence(out(PEEK), back(), withDelay(200, out(-PEEK)), back())));
    });
    return () => {
      alive = false;
    };
  }, [reduced, x]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const underStyle = useAnimatedStyle(() => ({ opacity: x.get() === 0 ? 0 : 1 }));
  return (
    <View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { flexDirection: 'row' }, underStyle]}>
        <View style={{ flex: 1, backgroundColor: done ? RESTORE_BLUE : colors.success, justifyContent: 'center', paddingLeft: 13 }}>
          <Icon name={done ? 'repeat' : 'check'} size={18} color="#FFFFFF" strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1, backgroundColor: colors.danger, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 13 }}>
          <Icon name="trash" size={18} color="#FFFFFF" strokeWidth={2} />
        </View>
      </Animated.View>
      <Animated.View style={[{ backgroundColor: colors.card }, rowStyle]}>{children}</Animated.View>
    </View>
  );
}
