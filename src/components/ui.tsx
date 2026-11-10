import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/themeContext';
import { Icon, type IconName } from './Icon';

export { useTheme } from '@/lib/themeContext';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { s } = useTheme();
  return <View style={[s.card, style]}>{children}</View>;
}

/** Группа строк в одной карточке с разделителями между ними. */
export function Group({ children, style, inset = 66 }: { children: ReactNode; style?: StyleProp<ViewStyle>; inset?: number }) {
  const { s } = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.group, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <Separator inset={inset} />}
          {child}
        </View>
      ))}
    </View>
  );
}

export function Separator({ inset = 66 }: { inset?: number }) {
  const { s } = useTheme();
  return <View style={[s.separator, { marginLeft: inset }]} />;
}

/** Заголовок секции: мелкие капители слева и, если нужно, действие справа. */
export function SectionTitle({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { s } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: -8, minHeight: 20 }, style]}>
      <Text style={s.sectionLabel}>{children}</Text>
      {right}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { s } = useTheme();
  return <Text style={s.label}>{children}</Text>;
}

/** Многострочные поля растут вместе с текстом сами (так работает нативный TextInput без фиксированной высоты). */
type GrowProps = {
  /** Сколько строк видно, пока поле пустое. */
  minLines?: number;
  /** Дальше этого поле не растёт, а прокручивается внутри. Нет — растёт с текстом. */
  maxLines?: number;
  /** Текст без переносов (название, имя): Enter закрывает клавиатуру, вставленные переносы становятся пробелами. */
  singleLine?: boolean;
};

const LINE = 22;
const PAD_Y = 12;

/**
 * Поле, которое растёт вместе с текстом: длинное название видно целиком, а не уезжает за край. На телефоне растёт само
 * (многострочное поле с minHeight/maxHeight), в браузере — по высоте содержимого.
 */
export function GrowingInput({ minLines = 1, maxLines, singleLine = false, style, onChangeText, onContentSizeChange, ...props }: TextInputProps & GrowProps) {
  const { s, colors } = useTheme();
  // Строка растёт вместе с системным шрифтом — и границы поля тоже: иначе третья строка обрезалась бы пополам.
  const { fontScale } = useWindowDimensions();
  const line = LINE * Math.max(1, Math.min(fontScale, props.maxFontSizeMultiplier || Infinity));
  const minH = Math.max(50, Math.ceil(minLines * line + PAD_Y * 2 + 2));
  const maxH = maxLines ? Math.ceil(maxLines * line + PAD_Y * 2 + 2) : undefined;
  const [webH, setWebH] = useState(minH);
  const web = Platform.OS === 'web';
  const change = (v: string) => {
    // В браузере поле само не сжимается: стёрли текст — начинаем с малой высоты, содержимое тут же вернёт нужную.
    if (web && v.length < (props.value?.length ?? 0)) setWebH(minH);
    onChangeText?.(singleLine ? v.replace(/\s*\n\s*/g, ' ') : v);
  };
  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      multiline
      submitBehavior={singleLine ? 'blurAndSubmit' : undefined}
      returnKeyType={singleLine ? 'done' : undefined}
      onChangeText={change}
      onContentSizeChange={(e) => {
        // +2 — рамка: без неё поле на два пикселя ниже текста и прокручивается внутри.
        if (web) setWebH(Math.min(maxH ?? Infinity, Math.max(minH, Math.ceil(e.nativeEvent.contentSize.height) + 2)));
        onContentSizeChange?.(e);
      }}
      {...props}
      style={[s.input, { lineHeight: LINE, textAlignVertical: 'top', minHeight: minH, maxHeight: maxH }, web && { height: webH }, style]}
    />
  );
}

/**
 * Поле с подписью. `grow` — растёт с текстом (см. GrowingInput); многострочное (`multiline`) растёт всегда, от трёх
 * строк.
 */
export function Field({ label, grow, minLines, maxLines, singleLine, ...props }: TextInputProps & GrowProps & { label: string; grow?: boolean }) {
  const { s, colors } = useTheme();
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      {grow || props.multiline ? (
        <GrowingInput minLines={minLines ?? (props.multiline ? 3 : 1)} maxLines={maxLines} singleLine={singleLine} {...props} />
      ) : (
        <TextInput placeholderTextColor={colors.placeholder} {...props} style={[s.input, props.style]} />
      )}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  style,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { s, colors } = useTheme();
  const box: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline }
      : variant === 'soft'
        ? { backgroundColor: colors.soft }
        : variant === 'ghost' || variant === 'danger'
          ? { backgroundColor: 'transparent', minHeight: 44 }
          : {};
  const textColor = disabled
    ? colors.text2
    : variant === 'primary'
      ? colors.onAccent
      : variant === 'danger'
        ? colors.danger
        : variant === 'soft' || variant === 'ghost'
          ? colors.accentText
          : colors.text;
  // Неактивная кнопка — не «выцветшая» акцентная, а спокойная серая с читаемой подписью.
  const disabledBox: ViewStyle = variant === 'ghost' || variant === 'danger' ? {} : { backgroundColor: colors.chip, borderWidth: 0 };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.button, box, disabled && disabledBox, pressed && !disabled && { opacity: 0.7 }, style]}
    >
      {icon && <Icon name={icon} size={18} color={textColor} strokeWidth={2} />}
      <Text style={[s.buttonText, { color: textColor }, variant === 'ghost' && { fontSize: 15 }]}>{title}</Text>
    </Pressable>
  );
}

/** Круглая кнопка-иконка 44×44 (цели касания не меньше 44). */
export function IconButton({
  icon,
  onPress,
  label,
  color,
  fill,
  size = 22,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  fill?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={color ?? colors.text} fill={fill} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  leading,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  leading?: ReactNode;
}) {
  const { s, colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [s.chip, { maxWidth: '100%' }, selected && s.chipSelected, leading ? { paddingLeft: 4 } : null, pressed && { opacity: 0.7 }]}
    >
      {leading}
      {icon && <Icon name={icon} size={15} color={selected ? colors.bg : colors.text} strokeWidth={2} />}
      <Text style={[s.chipText, { flexShrink: 1 }, selected && s.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Переключатель из нескольких вариантов в одну строку: «До срока / Дата и время / Повторять». */
/** Переключатель «один из». У варианта может быть значок (`icon`) своего цвета (`iconColor`); у выбранного — цвета подписи. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; icon?: IconName; iconColor?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: colors.chip, borderRadius: 14, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 40,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 3,
              paddingHorizontal: o.icon ? 2 : 4,
              backgroundColor: on ? colors.text : 'transparent',
              opacity: pressed && !on ? 0.6 : 1,
            })}
          >
            {o.icon && <Icon name={o.icon} size={14} strokeWidth={2.8} color={on ? colors.bg : (o.iconColor ?? colors.text2)} />}
            {/* На узком экране подпись со значком («Средняя») не влезает — слегка уменьшаем шрифт, а не режем слово. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.2}
              style={{ flexShrink: 1, fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14, color: on ? colors.bg : colors.text2 }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type Tone = 'accent' | 'solid' | 'neutral' | 'success' | 'danger' | 'warn' | 'info';

/** Маленький ярлык: «через 3 дня», «сегодня», «уже добавлен». */
export function Tag({ text, tone = 'neutral', style }: { text: string; tone?: Tone; style?: StyleProp<TextStyle> }) {
  const { colors, fonts } = useTheme();
  const palette: Record<Tone, { bg: string; fg: string }> = {
    accent: { bg: colors.soft, fg: colors.accentText },
    solid: { bg: colors.accent, fg: colors.onAccent },
    neutral: { bg: colors.chip, fg: colors.text2 },
    success: { bg: colors.successSoft, fg: colors.success },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    info: { bg: colors.infoSoft, fg: colors.info },
  };
  const p = palette[tone];
  return (
    <Text
      style={[
        {
          backgroundColor: p.bg,
          color: p.fg,
          fontFamily: fonts.semibold,
          fontSize: 11,
          lineHeight: 14,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          overflow: 'hidden',
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
}

export function SwitchRow({
  label,
  sub,
  value,
  onChange,
  icon,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
}) {
  const { s, colors } = useTheme();
  return (
    <View style={[s.row, { paddingVertical: 8, minHeight: 48 }]}>
      {icon && (
        <View style={s.iconCircle}>
          <Icon name={icon} size={18} color={colors.text2} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.body}>{label}</Text>
        {sub && <Text style={s.muted}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.checkbox }}
        thumbColor="#fff"
        {...({ activeThumbColor: '#fff' } as object)}
      />
    </View>
  );
}

/** Кнопки в ряд; если места не хватает (крупный системный шрифт, узкий экран) — переносятся на новую строку. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>;
}

export function Fab({ onPress, label = 'Добавить' }: { onPress: () => void; label?: string }) {
  const { s, colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [s.fab, pressed && { opacity: 0.8 }]}>
      <Icon name="plus" size={26} color={colors.onAccent} strokeWidth={2.2} />
    </Pressable>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: ReactNode }) {
  const { s, colors } = useTheme();
  return (
    <View style={s.empty}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={s.h2}>{title}</Text>
      <Text style={[s.muted, { fontSize: 14, lineHeight: 20, textAlign: 'center' }]}>{text}</Text>
      {children}
    </View>
  );
}

export function Checkbox({ checked, onPress, done }: { checked: boolean; onPress: () => void; done?: boolean }) {
  const { s, colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={[s.checkbox, checked && (done ? s.checkboxDone : s.checkboxChecked)]}
    >
      {checked && <Icon name="check" size={14} color={done ? '#fff' : colors.onAccent} strokeWidth={3} />}
    </Pressable>
  );
}

/** Шапка вкладки: крупный серифный заголовок, подпись и кнопки справа. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 12, paddingLeft: 20, paddingRight: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <View style={{ gap: 3, paddingTop: 4, flex: 1 }}>
        <Text style={s.h1}>{title}</Text>
        {subtitle ? <Text style={[s.muted, { fontSize: 14 }]}>{subtitle}</Text> : null}
      </View>
      {right && <View style={{ flexDirection: 'row' }}>{right}</View>}
    </View>
  );
}

/** Универсальная строка списка: слева иконка или аватар, справа текст или стрелка. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  onLongPress,
  chevron,
  titleStyle,
  subtitleStyle,
  style,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Действия для экранного диктора — например, то, что зрячий делает свайпом. */
  accessibilityActions?: ComponentProps<typeof Pressable>['accessibilityActions'];
  onAccessibilityAction?: ComponentProps<typeof Pressable>['onAccessibilityAction'];
}) {
  const { s, colors } = useTheme();
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        {typeof title === 'string' ? <Text style={[s.title, titleStyle]}>{title}</Text> : title}
        {subtitle ? typeof subtitle === 'string' ? <Text style={[s.muted, subtitleStyle]}>{subtitle}</Text> : subtitle : null}
      </View>
      {trailing}
      {chevron && <Icon name="chevronRight" size={18} color={colors.checkbox} strokeWidth={2} />}
    </>
  );
  if (!onPress && !onLongPress) return <View style={[s.row, s.rowPad, style]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={({ pressed }) => [s.row, s.rowPad, pressed && { opacity: 0.6 }, style]}>
      {body}
    </Pressable>
  );
}

/** Галочка в углу аватара: строка выбрана (режим выбора в списках друзей и напоминаний). */
export function SelectedBadge() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        right: -3,
        bottom: -3,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.success,
        borderWidth: 2,
        borderColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

/** Кружок с иконкой — для строк списков. */
export function IconCircle({ icon, tone = 'neutral', size = 36 }: { icon: IconName; tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warn'; size?: number }) {
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.chip, fg: colors.text2 },
    accent: { bg: colors.soft, fg: colors.accent },
    info: { bg: colors.infoSoft, fg: colors.info },
    success: { bg: colors.successSoft, fg: colors.success },
    warn: { bg: colors.warnSoft, fg: colors.warn },
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: map.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={Math.round(size / 2)} color={map.fg} />
    </View>
  );
}

/**
 * Строка внутри «виртуальной» группы для FlatList: первая и последняя получают скругления,
 * между соседями — разделитель. Так длинные списки остаются виртуализированными.
 */
export function GroupedRow({ first, last, inset = 66, children }: { first: boolean; last: boolean; inset?: number; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[groupedRowStyle(first, last), { backgroundColor: colors.card, borderColor: colors.hairline }]}>
      {!first && <Separator inset={inset} />}
      {children}
    </View>
  );
}

/** Форма строки в группе-карточке (рамка и скругления), без цветов: их задаёт тот, кто рисует. */
export function groupedRowStyle(first: boolean, last: boolean): ViewStyle {
  return {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: first ? 1 : 0,
    borderBottomWidth: last ? 1 : 0,
    borderTopLeftRadius: first ? 20 : 0,
    borderTopRightRadius: first ? 20 : 0,
    borderBottomLeftRadius: last ? 20 : 0,
    borderBottomRightRadius: last ? 20 : 0,
    overflow: 'hidden',
  };
}

/** Текстовое поле поиска с иконкой. */
export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const { s, colors } = useTheme();
  return (
    <View style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0, minHeight: 46 }]}>
      <Icon name="search" size={20} color={colors.text3} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={{ flex: 1, fontSize: 15, fontFamily: s.body.fontFamily, color: colors.text, paddingVertical: 10 }}
      />
    </View>
  );
}
