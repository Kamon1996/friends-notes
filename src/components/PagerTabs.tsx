import { withLayoutContext } from 'expo-router/build/layouts/withLayoutContext';
import { CommonActions, TabActions, TabRouter, createNavigatorFactory, useNavigationBuilder } from 'expo-router/build/react-navigation/core/index';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type ColorValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/lib/themeContext';
import { PagerLock } from './pagerLock';
import { ropeWaves, type RopeWave } from '@/lib/tabRope';
import { TabRope } from './TabRope';

/** Что вкладка говорит о себе нижней панели. */
export interface PagerTabOptions {
  title?: string;
  tabBarIcon?: (p: { color: ColorValue; focused: boolean }) => ReactNode;
}

/**
 * Вкладки каруселью: все экраны стоят в ряд, при свайпе соседний экран заезжает справа или слева прямо за пальцем;
 * отпустил дальше трети ширины (или быстро) — перелистнулось, иначе — вернулось. Нажатие в нижней панели — тот же
 * сдвиг. Карточки со свайпом, строка фильтров и сетка календаря — свои жесты внутри, они срабатывают раньше и
 * выигрывают; вертикальная прокрутка жест отменяет. Экран может запретить листание (режим выбора) — PagerLock.
 */
function PagerTabsNavigator({
  id,
  initialRouteName,
  children,
  screenOptions,
  backBehavior,
}: {
  id?: string;
  initialRouteName?: string;
  children: ReactNode;
  screenOptions?: PagerTabOptions;
  backBehavior?: 'firstRoute' | 'initialRoute' | 'order' | 'history' | 'none';
}) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, {
    id,
    initialRouteName,
    children,
    screenOptions,
    backBehavior,
  });
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [w, setW] = useState(screenW);
  // Вкладки по порядку объявления. Не открытые ещё вкладки expo-router в состояние не кладёт — подгружаем их сразу,
  // чтобы соседний экран было видно во время свайпа.
  const names = state.routeNames;
  const count = names.length;
  const routeOf = (name: string) => state.routes.find((r) => r.name === name);
  const index = Math.max(0, names.indexOf(state.routes[state.index]?.name ?? names[0]));
  const missing = names.filter((n) => !routeOf(n)).join('|');
  useEffect(() => {
    if (!missing) return;
    for (const name of missing.split('|')) navigation.dispatch({ ...CommonActions.preload(name), target: state.key });
  }, [missing, navigation, state.key]);

  // Сдвиг ряда экранов в px: −index·w в покое, плюс палец.
  const x = useSharedValue(-index * w);
  const from = useSharedValue(index);
  useEffect(() => {
    from.set(index);
    x.set(withTiming(-index * w, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [index, w, x, from]);

  const [locks, setLocks] = useState(0);
  const lock = useMemo(
    () => () => {
      setLocks((n) => n + 1);
      return () => setLocks((n) => n - 1);
    },
    [],
  );

  // «Ниточка»: при переходе по нитке между вкладками бежит волна — от той, с которой ушли.
  const [waves, setWaves] = useState<Record<number, RopeWave>>({});
  const reduceMotion = useReducedMotion();

  const jump = (to: number) => {
    const name = names[to];
    if (!name) return;
    if (to !== index && !reduceMotion) setWaves((w) => ropeWaves(w, index, to));
    navigation.dispatch({ ...TabActions.jumpTo(name), target: state.key });
  };

  const pan = Gesture.Pan()
    .enabled(locks === 0 && count > 1)
    .activeOffsetX([-22, 22])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      'worklet';
      const at = from.get();
      let dx = e.translationX;
      // За крайние вкладки — тянется туго, как резинка.
      if ((at === 0 && dx > 0) || (at === count - 1 && dx < 0)) dx *= 0.25;
      x.set(-at * w + dx);
    })
    .onEnd((e) => {
      'worklet';
      const at = from.get();
      let to = at;
      if (e.translationX < -w / 3 || e.velocityX < -600) to = Math.min(count - 1, at + 1);
      else if (e.translationX > w / 3 || e.velocityX > 600) to = Math.max(0, at - 1);
      x.set(withTiming(-to * w, { duration: 240, easing: Easing.out(Easing.cubic) }));
      if (to !== at) {
        from.set(to);
        scheduleOnRN(jump, to);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <NavigationContent>
      <PagerLock.Provider value={lock}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <GestureDetector gesture={pan}>
            <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
              <Animated.View style={[{ flex: 1, flexDirection: 'row', width: w * count }, rowStyle]}>
                {names.map((name, i) => {
                  const route = routeOf(name);
                  return (
                    <View
                      key={name}
                      style={{ width: w, height: '100%', backgroundColor: colors.bg }}
                      // Невидимые экраны — не для диктора.
                      aria-hidden={i !== index}
                      importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
                      accessibilityElementsHidden={i !== index}
                    >
                      {route ? descriptors[route.key]?.render() : null}
                    </View>
                  );
                })}
              </Animated.View>
            </View>
          </GestureDetector>
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: 'row',
              backgroundColor: colors.card,
              borderTopColor: colors.hairline,
              borderTopWidth: StyleSheet.hairlineWidth * 2,
              paddingBottom: insets.bottom,
            }}
          >
            {/* Иконки 24 px с отступом 7 сверху: центр — на 19, нитка чуть ниже. */}
            <TabRope width={w} count={count} y={21} edge={17} waves={waves} rest={colors.checkbox} glow={colors.accent} />
            {names.map((name, i) => {
              const route = routeOf(name);
              const focused = i === index;
              const o = ((route && descriptors[route.key]?.options) ?? { title: '' }) as PagerTabOptions;
              const color = focused ? colors.accent : colors.text3;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  onPress={() => {
                    if (!focused) jump(i);
                  }}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 7, paddingBottom: 6, minHeight: 54, gap: 2 }}
                >
                  {o.tabBarIcon?.({ color, focused })}
                  <Text style={{ fontFamily: fonts.medium, fontSize: 11, color }} numberOfLines={1}>
                    {o.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </PagerLock.Provider>
    </NavigationContent>
  );
}

/**
 * Навигатор для app/(tabs)/_layout.tsx. Создаётся при первом рендере, а не при загрузке модуля: роуты грузятся, пока
 * expo-router ещё сам инициализируется, и withLayoutContext в этот момент недоступен.
 */
export function createPagerTabs() {
  return withLayoutContext(createNavigatorFactory(PagerTabsNavigator)().Navigator);
}
