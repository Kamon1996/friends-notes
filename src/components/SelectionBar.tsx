import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from './Icon';
import { IconButton, useTheme } from './ui';

export interface SelectionAction {
  icon: IconName;
  label: string;
  color?: string;
  fill?: string;
  onPress: () => void;
}

/**
 * Панель режима выбора (долгое нажатие на строку): закрыть, счётчик и действия над отмеченными.
 * Лежит поверх списка на месте заголовка и не уезжает при прокрутке; при прокрутке снизу появляется линия.
 */
export function SelectionBar({ count, actions, scrolled, onClose }: { count: number; actions: SelectionAction[]; scrolled: boolean; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.bg,
        paddingTop: insets.top + 12,
        paddingBottom: 6,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: scrolled ? colors.hairline : 'transparent',
      }}
    >
      <IconButton icon="close" label="Снять выделение" onPress={onClose} />
      <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.text, flex: 1, paddingLeft: 4 }} accessibilityLabel={`Выбрано: ${count}`}>
        {count}
      </Text>
      {actions.map((a) => (
        <IconButton key={a.label} icon={a.icon} label={a.label} color={a.color} fill={a.fill} onPress={a.onPress} />
      ))}
    </View>
  );
}
