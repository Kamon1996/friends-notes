import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './ui';

const nativeDriver = Platform.OS !== 'web';
/** Если окно так и не сообщило, что показалось, — выезжаем сами. */
const START_FALLBACK_MS = 300;
/** Стянул дальше этого (или на треть высоты) — закрываем; ближе — возвращаем на место. */
const SWIPE_CLOSE_PX = 120;
/** Резкий короткий взмах тоже закрывает; скорость — в точках за миллисекунду. */
const SWIPE_CLOSE_SPEED = 0.6;

/**
 * Шторка снизу. Фон плавно темнеет на месте, а выезжает только сама шторка; закрывается в обратном порядке.
 * Встроенная анимация Modal «slide» тащит снизу весь экран вместе с затемнением — это выглядит как наезжающий слой.
 * Пока шторка уезжает, её содержимое остаётся на экране: не прячь его сразу по `visible`, держи последнее показанное.
 *
 * Выезд начинается только когда окно уже на экране и высота шторки измерена. Иначе первые кадры съедает открытие
 * окна, а путь считается от высоты экрана: шторка сначала ползёт за краем, а потом прыжком догоняет своё место.
 *
 * Закрывается четырьмя способами: фон, системная «Назад», своя кнопка и свайп вниз — за любое место шторки.
 * Исключение — прокручиваемый список внутри: там палец листает список, а тянуть шторку можно за шапку и кнопки.
 */
export function Sheet({
  visible,
  onClose,
  children,
  style,
  dim = 0.5,
  closeLabel = 'Закрыть',
  swipeToClose = true,
}: {
  visible: boolean;
  /** Нажатие на фон и системная «Назад». */
  onClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Насколько темнеет фон. */
  dim?: number;
  closeLabel?: string;
  /** Смахнуть вниз — закрыть. Выключай только там, где внутри свой вертикальный жест. */
  swipeToClose?: boolean;
}) {
  const { colors } = useTheme();
  const { height: screen } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [ready, setReady] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  // Высота шторки живёт в анимированном значении: её смена не перестраивает анимацию и не роняет кадр.
  const [sheetH] = useState(() => new Animated.Value(screen));
  // Насколько шторку стянули пальцем.
  const [drag] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => Animated.add(Animated.multiply(sheetH, progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })), drag));
  // Тянешь шторку вниз — фон светлеет вместе с ней.
  const [dimOpacity] = useState(() => Animated.multiply(progress, drag.interpolate({ inputRange: [0, 480], outputRange: [1, 0.25], extrapolate: 'clamp' })));
  const gate = useRef({ shown: false, measured: false });
  // Жест: где палец начал, где был в прошлый раз и с какой скоростью идёт вниз.
  const touch = useRef({ x: 0, y: 0, lastY: 0, lastT: 0, vy: 0 });
  const sheetHeight = useRef(0);
  const visibleNow = useRef(visible);
  useEffect(() => {
    visibleNow.current = visible;
  }, [visible]);
  const back = () => Animated.spring(drag, { toValue: 0, bounciness: 0, speed: 18, useNativeDriver: nativeDriver }).start();
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
      drag.setValue(0);
      setReady(false);
      setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, ready, progress, sheetH, drag, screen]);

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
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})`, opacity: dimOpacity }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={closeLabel} />
        <Animated.View
          // Запоминаем начало касания, но само касание не забираем: кнопки и поля внутри работают как обычно.
          onStartShouldSetResponderCapture={(e) => {
            const { pageX, pageY } = e.nativeEvent;
            touch.current = { x: pageX, y: pageY, lastY: pageY, lastT: Date.now(), vy: 0 };
            return false;
          }}
          // Забираем только уверенное движение вниз: боковые свайпы и нажатия остаются содержимому.
          onMoveShouldSetResponder={(e) => {
            if (!swipeToClose) return false;
            const dy = e.nativeEvent.pageY - touch.current.y;
            return dy > 8 && dy > Math.abs(e.nativeEvent.pageX - touch.current.x) * 1.5;
          }}
          onResponderTerminationRequest={() => false}
          onResponderMove={(e) => {
            const t = touch.current;
            const now = Date.now();
            const y = e.nativeEvent.pageY;
            if (now > t.lastT) t.vy = (y - t.lastY) / (now - t.lastT);
            t.lastY = y;
            t.lastT = now;
            drag.setValue(Math.max(0, y - t.y));
          }}
          onResponderRelease={(e) => {
            const dy = e.nativeEvent.pageY - touch.current.y;
            const far = dy > Math.min(SWIPE_CLOSE_PX, sheetHeight.current * 0.3);
            const fast = touch.current.vy > SWIPE_CLOSE_SPEED && dy > 24;
            if (!far && !fast) return back();
            onClose();
            // Закрытие могли отменить (вопрос про несохранённое) — тогда шторка возвращается на место.
            setTimeout(() => visibleNow.current && back(), 150);
          }}
          onResponderTerminate={back}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h <= 0) return;
            sheetHeight.current = h;
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
