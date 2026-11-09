import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** Вкладки по порядку — как в нижней панели. */
const TABS = ['/', '/friends', '/calendar'] as const;
export type TabPath = (typeof TABS)[number];

/** Сколько провести пальцем или как быстро, чтобы перейти. */
const DISTANCE = 70;
const VELOCITY = 650;

/**
 * Свайп между вкладками: влево — следующая, вправо — прошлая. Экран чуть едет за пальцем, переход — сдвигом вкладок.
 * Карточки со свайпом (напоминания, друзья) сдвигаются раньше — их жест выигрывает, вкладка не меняется. Вертикальная
 * прокрутка не мешает: жест сдаётся, как только палец пошёл вверх-вниз.
 */
export function TabSwipe({ tab, enabled = true, children }: { tab: TabPath; enabled?: boolean; children: ReactNode }) {
  const x = useSharedValue(0);
  const index = TABS.indexOf(tab);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
          // Крайние вкладки тянутся слабее — дальше идти некуда.
          const edge = (e.translationX > 0 && index === 0) || (e.translationX < 0 && index === TABS.length - 1);
          x.set(e.translationX * (edge ? 0.08 : 0.22));
        })
        .onEnd((e) => {
          const next =
            e.translationX < -DISTANCE || e.velocityX < -VELOCITY ? index + 1 : e.translationX > DISTANCE || e.velocityX > VELOCITY ? index - 1 : index;
          if (next !== index && next >= 0 && next < TABS.length) router.navigate(TABS[next]);
        })
        .onFinalize(() => {
          x.set(withTiming(0, { duration: 180 }));
        }),
    [enabled, index, x],
  );
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
