import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/Avatar';
import { friendSubtitle } from '@/components/FriendRow';
import { Icon } from '@/components/Icon';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { useTheme } from '@/components/ui';
import { todayISO } from '@/lib/dates';
import type { Gender } from '@/lib/gender';
import type { Friend } from '@/lib/types';
import { riddleHint, voice } from '@/lib/voice';
import { AiIcon } from './AiIcon';
import { genderTone } from './palette';

/** Насколько смахнуть, чтобы карточка ушла, px. */
const SWIPE = 110;

/**
 * «Кто это?» — карточки тех, кого по имени не понять, по одной. Влево или «Женщина», вправо или «Мужчина».
 * На карточке — почему не угадать, дата рождения и заметки: так проще вспомнить, кто это.
 */
export function RiddleCards({
  visible,
  friends,
  onPick,
  onDone,
  onClose,
}: {
  visible: boolean;
  friends: readonly Friend[];
  onPick: (f: Friend, g: Gender) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const { s, colors, fonts, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [title] = useState(() => voice.say('gender.cards') ?? 'Кто это?');
  const hints = useMemo(() => new Map(friends.map((f) => [f.id, riddleHint(f.name)])), [friends]);
  const today = todayISO();
  const x = useSharedValue(0);
  const busy = useSharedValue(0);
  const current = friends[index];

  const commit = (g: Gender) => {
    const f = friends[index];
    if (!f) return;
    onPick(f, g);
    x.set(0);
    busy.set(0);
    if (index + 1 >= friends.length) onDone();
    else setIndex(index + 1);
  };
  const fly = (dir: -1 | 1) => {
    'worklet';
    busy.set(1);
    x.set(withTiming(dir * 520, { duration: 220 }, (done) => {
      if (done) scheduleOnRN(commit, dir < 0 ? 'f' : 'm');
    }));
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      if (!busy.get()) x.set(e.translationX);
    })
    .onEnd((e) => {
      if (busy.get()) return;
      if (Math.abs(x.get()) > SWIPE || Math.abs(e.velocityX) > 900) fly(x.get() < 0 || (x.get() === 0 && e.velocityX < 0) ? -1 : 1);
      else x.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { rotate: `${x.get() / 22}deg` }] }));
  const femTint = useAnimatedStyle(() => ({ opacity: interpolate(-x.get(), [0, SWIPE], [0, 1], 'clamp') }));
  const malTint = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [0, SWIPE], [0, 1], 'clamp') }));
  useEffect(() => {
    if (visible) return;
    x.set(0);
    busy.set(0);
  }, [visible, x, busy]);

  const tone = (g: Gender) => genderTone(scheme, g);
  const notes = (f: Friend) =>
    [f.flowers, f.food, f.gifts, f.notes]
      .map((t) => (t ?? '').trim().split('\n')[0])
      .filter(Boolean)
      .map((t) => (t.length > 28 ? `${t.slice(0, 27)}…` : t))
      .slice(0, 3);

  const card = (f: Friend, depth: number, interactive: boolean) => {
    const inner = (
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <AiIcon size={26} />
          <View style={{ flex: 1, backgroundColor: colors.chip, borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 11, paddingVertical: 7 }}>
            <Text style={[s.body, { fontSize: 14, lineHeight: 19 }]}>{hints.get(f.id)}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ borderRadius: 999, padding: 3, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.text3 }}>
            <Avatar friend={f} size={72} />
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.text, textAlign: 'center' }} numberOfLines={2}>
            {f.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="cake" size={15} color={colors.text2} />
            <Text style={s.muted}>{friendSubtitle(f, today)}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 2 }}>
            {notes(f).map((n) => (
              <Text key={n} style={[s.muted, { backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' }]}>
                {n}
              </Text>
            ))}
          </View>
        </View>
      </View>
    );
    const base = {
      position: 'absolute' as const,
      left: 22,
      right: 22,
      top: 0,
      minHeight: 300,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 24,
      overflow: 'hidden' as const,
    };
    if (!interactive) {
      return (
        <View key={f.id + depth} style={[base, { transform: [{ translateY: depth * 16 }, { scale: 1 - depth * 0.05 }], opacity: 1 - depth * 0.35 }]} pointerEvents="none">
          {inner}
        </View>
      );
    }
    return (
      <GestureDetector key={f.id} gesture={pan}>
        <Animated.View entering={FadeIn.duration(160)} style={[base, { boxShadow: '0 14px 34px rgba(0,0,0,0.25)' }, cardStyle]}>
          {inner}
          {(['f', 'm'] as const).map((g) => (
            <Animated.View
              key={g}
              pointerEvents="none"
              style={[
                { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: tone(g).bg, borderWidth: 2, borderColor: tone(g).ring, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
                g === 'f' ? femTint : malTint,
              ]}
            >
              <Text style={{ fontFamily: fonts.display, fontSize: 24, letterSpacing: 2, color: tone(g).ring, borderWidth: 3, borderColor: tone(g).ring, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 2, transform: [{ rotate: g === 'f' ? '-8deg' : '8deg' }] }}>
                {g === 'f' ? 'ЖЕНЩИНА' : 'МУЖЧИНА'}
              </Text>
            </Animated.View>
          ))}
        </Animated.View>
      </GestureDetector>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} style={{ paddingTop: 10, paddingBottom: insets.bottom + 20 }}>
      <GestureHandlerRootView>
        <SheetHandle />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 24, paddingTop: 14, paddingBottom: 14 }}>
          <Text style={[s.h2, { flex: 1, fontSize: 24, lineHeight: 30 }]}>{title}</Text>
          {friends.length > 1 && (
            <Text style={[s.muted, { fontSize: 14 }]}>
              {Math.min(index + 1, friends.length)} из {friends.length}
            </Text>
          )}
        </View>
        <View style={{ height: 340 }}>
          {current &&
            friends
              .slice(index, index + 3)
              .map((f, d) => ({ f, d }))
              .reverse()
              .map(({ f, d }) => card(f, d, d === 0))}
        </View>
        {current && (
          <View style={{ flexDirection: 'row', gap: 4, padding: 4, marginHorizontal: 22, borderRadius: 18, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.hairline }}>
            {(['f', 'm'] as const).map((g) => (
              <Pressable
                key={g}
                onPress={() => !busy.get() && fly(g === 'f' ? -1 : 1)}
                accessibilityRole="button"
                accessibilityLabel={`${current.name}: ${g === 'f' ? 'женщина' : 'мужчина'}`}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 54,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? tone(g).bg : 'transparent',
                  borderWidth: 1.5,
                  borderColor: pressed ? tone(g).ring : 'transparent',
                })}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: tone(g).fg }}>{g === 'f' ? '♀ Женщина' : 'Мужчина ♂'}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </GestureHandlerRootView>
    </Sheet>
  );
}
