import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './ui';

const nativeDriver = Platform.OS !== 'web';

/**
 * Шторка снизу. Фон плавно темнеет на месте, а выезжает только сама шторка; закрывается в обратном порядке.
 * Встроенная анимация Modal «slide» тащит снизу весь экран вместе с затемнением — это выглядит как наезжающий слой.
 * Пока шторка уезжает, её содержимое остаётся на экране: не прячь его сразу по `visible`, держи последнее показанное.
 */
export function Sheet({
  visible,
  onClose,
  children,
  style,
  dim = 0.5,
  closeLabel = 'Закрыть',
}: {
  visible: boolean;
  /** Нажатие на фон и системная «Назад». */
  onClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Насколько темнеет фон. */
  dim?: number;
  closeLabel?: string;
}) {
  const { colors } = useTheme();
  const { height: screen } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(screen);
  const [progress] = useState(() => new Animated.Value(0));
  // Открыли — сразу показываем Modal; закроем его сами, когда шторка доедет вниз.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const anim = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: nativeDriver,
    });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, progress]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})`, opacity: progress }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={closeLabel} />
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[
            { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
            style,
            { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Полоска-«ручка» сверху шторки. */
export function SheetHandle() {
  const { colors } = useTheme();
  return <Animated.View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: 'center' }} />;
}
