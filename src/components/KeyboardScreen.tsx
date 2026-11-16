import { useState, type ReactNode, type Ref } from 'react';
import { View, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Сколько видно над клавиатурой (и над кнопкой) под строкой, в которой печатаешь. */
const GAP = 16;

/**
 * Экран с полями ввода. Поле, в котором печатаешь, поднимается над клавиатурой, а в многострочном поле экран идёт
 * за курсором: новая строка не уходит под клавиатуру. Кнопка снизу (`footer`) едет вместе с клавиатурой и стоит
 * прямо над ней, а поле — над кнопкой: печатаешь — и видишь и текст, и «Сохранить».
 *
 * Без клавиатуры (и в веб-версии) — обычная прокрутка с кнопкой внизу.
 */
export function KeyboardScreen({
  footer,
  children,
  ref,
  ...props
}: ScrollViewProps & { footer?: ReactNode; children: ReactNode; ref?: Ref<KeyboardAwareScrollViewRef> }) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  // Над клавиатурой кнопка без нижнего отступа под системную полоску: его закрывает клавиатура.
  const footerAbove = footer ? Math.max(0, footerHeight - insets.bottom) : 0;
  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView ref={ref} keyboardShouldPersistTaps="handled" {...props} bottomOffset={footerAbove + GAP}>
        {children}
      </KeyboardAwareScrollView>
      {footer && (
        <KeyboardStickyView offset={{ opened: insets.bottom }}>
          <View onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>{footer}</View>
        </KeyboardStickyView>
      )}
    </View>
  );
}
