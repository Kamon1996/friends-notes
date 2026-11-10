import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './ui';

const nativeDriver = Platform.OS !== 'web';
/** Если окно так и не сообщило, что показалось, — выезжаем сами. */
const START_FALLBACK_MS = 300;

/**
 * Шторка снизу. Фон плавно темнеет на месте, а выезжает только сама шторка; закрывается в обратном порядке.
 * Встроенная анимация Modal «slide» тащит снизу весь экран вместе с затемнением — это выглядит как наезжающий слой.
 * Пока шторка уезжает, её содержимое остаётся на экране: не прячь его сразу по `visible`, держи последнее показанное.
 *
 * Выезд начинается только когда окно уже на экране и высота шторки измерена. Иначе первые кадры съедает открытие
 * окна, а путь считается от высоты экрана: шторка сначала ползёт за краем, а потом прыжком догоняет своё место.
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
  const [ready, setReady] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  // Высота шторки живёт в анимированном значении: её смена не перестраивает анимацию и не роняет кадр.
  const [sheetH] = useState(() => new Animated.Value(screen));
  const [translateY] = useState(() => Animated.multiply(sheetH, progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })));
  const gate = useRef({ shown: false, measured: false });
  // Открыли — сразу показываем Modal; закроем его сами, когда шторка доедет вниз.
  if (visible && !mounted) setMounted(true);

  const arm = () => {
    if (gate.current.shown && gate.current.measured) setReady(true);
  };

  useEffect(() => {
    if (!mounted || ready) return;
    const t = setTimeout(() => setReady(true), START_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [mounted, ready]);

  useEffect(() => {
    if (!mounted) return;
    // Ждём окно и размер. Закрыть можно и не дождавшись: тогда просто убираем невидимую шторку.
    if (visible && !ready) return;
    const anim = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : ready ? 200 : 0,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: nativeDriver,
    });
    anim.start(({ finished }) => {
      if (!finished || visible) return;
      gate.current = { shown: false, measured: false };
      // Следующее содержимое может быть выше: до замера держим шторку целиком за краем.
      sheetH.setValue(screen);
      setReady(false);
      setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, ready, progress, sheetH, screen]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={() => {
        gate.current.shown = true;
        arm();
      }}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})`, opacity: progress }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={closeLabel} />
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h <= 0) return;
            sheetH.setValue(h);
            gate.current.measured = true;
            arm();
          }}
          style={[{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, style, { transform: [{ translateY }] }]}
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
