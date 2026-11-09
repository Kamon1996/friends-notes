import { withLayoutContext } from 'expo-router/build/layouts/withLayoutContext';
import { CommonActions, TabActions, TabRouter, createNavigatorFactory, useNavigationBuilder } from 'expo-router/build/react-navigation/core/index';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions, type ColorValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/lib/themeContext';
import { ropeWaves, type RopeWave } from '@/lib/tabRope';
import { PagerLock, TabBarSeam } from './pagerLock';
import { settleDuration } from './settle';
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
 *
 * Плавность: после свайпа экран доезжает на UI-потоке со скоростью пальца, нижняя панель сразу подсвечивает новую
 * вкладку и пускает волну по ниточке, а сама смена вкладки (и перерисовка экранов) — когда экран уже доехал.
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
  const { colors } = useTheme();
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

  // Сдвиг ряда экранов в px: −index·w в покое, плюс палец. `from` — вкладка, к которой ряд едет или стоит.
  const x = useSharedValue(-index * w);
  const from = useSharedValue(index);
  // Сменилась вкладка не жестом (нажатие в панели, ссылка) — доезжаем. После жеста ряд уже на месте: вторую
  // анимацию поверх первой не запускаем — от неё и было дёрганье в конце.
  useEffect(() => {
    if (from.get() === index) return;
    from.set(index);
    x.set(withTiming(-index * w, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [index, w, x, from]);
  useEffect(() => {
    x.set(-from.get() * w);
  }, [w, x, from]);

  // Запреты листания — у каждой вкладки свои: режим выбора в «Напоминаниях» не мешает листать с «Календаря».
  const [locks, setLocks] = useState<Record<string, number>>({});
  const namesKey = names.join('|');
  const lockers = useMemo(
    () =>
      Object.fromEntries(
        namesKey.split('|').map((name) => [
          name,
          () => {
            setLocks((l) => ({ ...l, [name]: (l[name] ?? 0) + 1 }));
            return () => setLocks((l) => ({ ...l, [name]: Math.max(0, (l[name] ?? 1) - 1) }));
          },
        ]),
      ),
    [namesKey],
  );
  const locked = (locks[names[index]] ?? 0) > 0;
  // Шторка экрана у самой панели — панель без верхней линии (у каждой вкладки свой счётчик).
  const [seams, setSeams] = useState<Record<string, number>>({});
  const seamers = useMemo(
    () =>
      Object.fromEntries(
        namesKey.split('|').map((name) => [
          name,
          () => {
            setSeams((l) => ({ ...l, [name]: (l[name] ?? 0) + 1 }));
            return () => setSeams((l) => ({ ...l, [name]: Math.max(0, (l[name] ?? 1) - 1) }));
          },
        ]),
      ),
    [namesKey],
  );
  const seamless = (seams[names[index]] ?? 0) > 0;

  // Панель — сразу: подсветка новой вкладки и волна по ниточке (перерисовывается только панель).
  const [bar] = useState(createPreviewBus);
  const preview = bar.emit;
  const jump = (to: number) => {
    const name = names[to];
    if (!name) return;
    // Клавиатура с прошлой вкладки не должна висеть над новой: экраны теперь не выгружаются.
    Keyboard.dismiss();
    navigation.dispatch({ ...TabActions.jumpTo(name), target: state.key });
  };
  const press = (to: number) => {
    preview(to, index);
    jump(to);
  };

  const pan = Gesture.Pan()
    .enabled(!locked && count > 1)
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
    .onEnd((e, success) => {
      'worklet';
      const at = from.get();
      let to = at;
      // Жест отменён (перехватил другой) — возвращаемся на место.
      if (success && (e.translationX < -w / 3 || e.velocityX < -600)) to = Math.min(count - 1, at + 1);
      else if (success && (e.translationX > w / 3 || e.velocityX > 600)) to = Math.max(0, at - 1);
      const target = -to * w;
      const ms = settleDuration(target - x.get(), e.velocityX);
      if (to === at) {
        x.set(withTiming(target, { duration: ms, easing: Easing.out(Easing.cubic) }));
        return;
      }
      from.set(to);
      scheduleOnRN(preview, to, at);
      // Вкладку меняем, когда экран доехал (или анимацию перебили новым свайпом): перерисовка не мешает движению.
      x.set(withTiming(target, { duration: ms, easing: Easing.out(Easing.cubic) }, () => scheduleOnRN(jump, to)));
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <NavigationContent>
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
                    <PagerLock.Provider value={lockers[name]}>
                      <TabBarSeam.Provider value={seamers[name]}>{route ? descriptors[route.key]?.render() : null}</TabBarSeam.Provider>
                    </PagerLock.Provider>
                  </View>
                );
              })}
            </Animated.View>
          </View>
        </GestureDetector>
        <TabBar
          bus={bar}
          index={index}
          width={w}
          seamless={seamless}
          items={names.map((name) => {
            const route = routeOf(name);
            const o = ((route && descriptors[route.key]?.options) ?? { title: '' }) as PagerTabOptions;
            return { name, title: o.title ?? '', icon: o.tabBarIcon };
          })}
          onPress={press}
        />
      </View>
    </NavigationContent>
  );
}

/** «Подсвети вкладку `to` и пусти волну от `at`» — от жеста к панели, до того, как вкладка сменится на самом деле. */
type PreviewBus = ReturnType<typeof createPreviewBus>;
function createPreviewBus() {
  const listeners = new Set<(to: number, at: number) => void>();
  return {
    emit: (to: number, at: number) => listeners.forEach((l) => l(to, at)),
    subscribe: (l: (to: number, at: number) => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

/**
 * Нижняя панель с «ниточкой». Своё состояние: подсветка и волна меняются без перерисовки экранов.
 */
function TabBar({
  bus,
  index,
  width,
  seamless,
  items,
  onPress,
}: {
  bus: PreviewBus;
  index: number;
  width: number;
  /** Над панелью — шторка экрана: верхняя линия цветом фона (толщина та же — ничего не сдвигается). */
  seamless: boolean;
  items: { name: string; title: string; icon?: PagerTabOptions['tabBarIcon'] }[];
  onPress: (i: number) => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(index);
  const [shownIndex, setShownIndex] = useState(index);
  // Вкладка сменилась снаружи — подсветка за ней.
  if (shownIndex !== index) {
    setShownIndex(index);
    setActive(index);
  }
  const [waves, setWaves] = useState<Record<number, RopeWave>>({});
  useEffect(
    () =>
      bus.subscribe((to, at) => {
        setActive(to);
        if (to !== at && !reduceMotion) setWaves((w) => ropeWaves(w, at, to));
      }),
    [bus, reduceMotion],
  );
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderTopColor: seamless ? colors.card : colors.hairline,
        borderTopWidth: StyleSheet.hairlineWidth * 2,
        paddingBottom: insets.bottom,
      }}
    >
      {/* Иконки 24 px с отступом 7 сверху: центр — на 19, нитка чуть ниже. */}
      <TabRope width={width} count={items.length} y={21} edge={17} waves={waves} rest={colors.checkbox} glow={colors.accent} />
      {items.map((item, i) => {
        const focused = i === active;
        const color = focused ? colors.accent : colors.text3;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              if (!focused) onPress(i);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 7, paddingBottom: 6, minHeight: 54, gap: 2 }}
          >
            {item.icon?.({ color, focused })}
            <Text style={{ fontFamily: fonts.medium, fontSize: 11, color }} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Навигатор для app/(tabs)/_layout.tsx. Создаётся при первом рендере, а не при загрузке модуля: роуты грузятся, пока
 * expo-router ещё сам инициализируется, и withLayoutContext в этот момент недоступен.
 */
export function createPagerTabs() {
  return withLayoutContext(createNavigatorFactory(PagerTabsNavigator)().Navigator);
}
