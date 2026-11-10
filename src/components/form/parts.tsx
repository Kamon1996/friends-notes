import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { MONTHS, monthGrid } from '@/lib/calendar';
import { daysBetween, formatDateLong, parseISODate, toISODate } from '@/lib/dates';
import type { ISODate } from '@/lib/types';
import { Icon, type IconName } from '../Icon';
import { useTheme } from '../ui';

/**
 * Кирпичики формы дела. Два вида строк в карточке:
 * - `StripRow` — подпись слева, лента вариантов справа: то, что меняют почти всегда (срок, время, «заранее»);
 * - `ExpandRow` — строка со значением, раскрывается на месте: то, что трогают редко (для кого, важность, заметка).
 * Шторок нет: выбор всегда там же, где строка.
 */

/** Ширина колонки подписей в строках-лентах: «Заранее» и «Срок» стоят на одной линии. */
const LABEL_W = 78;

/** Карточка без внутренних отступов: строки сами держат поля и разделители. */
export function FormCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' }, style]}>{children}</View>;
}

/** Строка-лента: подпись, под ней при желании текущее значение, справа — варианты и закреплённая кнопка. */
export function StripRow({ label, sub, first, pinned, children }: { label: string; sub?: string; first?: boolean; pinned?: ReactNode; children: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ paddingLeft: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: colors.separator }}>
        <View style={{ width: LABEL_W }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: colors.text2 }} maxFontSizeMultiplier={1.2}>
            {label}
          </Text>
          {!!sub && (
            <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15, color: colors.accentText }} maxFontSizeMultiplier={1.2}>
              {sub}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        {pinned && <View style={{ paddingLeft: 6, paddingRight: 12 }}>{pinned}</View>}
      </View>
    </View>
  );
}

export interface StripChip {
  key: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Точка — «твоё обычное», а не стандартное значение. */
  own?: boolean;
  leading?: ReactNode;
  icon?: IconName;
  iconColor?: string;
  /** Что скажет экранный диктор, если подписи мало (значок без слов). */
  a11y?: string;
}

/** Маленькая таблетка для лент: выбранная — залита, «своя» — с точкой. */
export function SmallChip({ label, selected, onPress, own, leading, icon, iconColor, a11y, onLayout }: Omit<StripChip, 'key'> & { onLayout?: (x: number, w: number) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout && ((e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width))}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? (own ? `${label}, как обычно` : label)}
      accessibilityState={{ selected }}
      hitSlop={{ top: 7, bottom: 7 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        minHeight: 32,
        paddingHorizontal: leading ? 4 : label ? 11 : 9,
        paddingRight: label ? 11 : 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.text : colors.hairline,
        backgroundColor: selected ? colors.text : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {leading}
      {own && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: selected ? colors.bg : colors.accent }} />}
      {icon && <Icon name={icon} size={14} strokeWidth={2.6} color={selected ? colors.bg : (iconColor ?? colors.text2)} />}
      {!!label && (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 13, lineHeight: 18, color: selected ? colors.bg : colors.text, fontVariant: ['tabular-nums'] }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Лента вариантов в одну строку: листается вбок и сама подъезжает к выбранному. */
export function ChipStrip({ chips, label }: { chips: StripChip[]; label: string }) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const width = useRef(0);
  const offset = useRef(0);
  // Выбранный вариант за краем — подкатываем ленту, чтобы он был виден. Раз на каждое новое значение.
  const shownFor = useRef<string | null>(null);
  const selectedKey = chips.find((c) => c.selected)?.key ?? null;
  const reveal = (key: string, x: number, w: number) => {
    if (key !== selectedKey || shownFor.current === key || !width.current) return;
    shownFor.current = key;
    if (x < offset.current || x + w > offset.current + width.current) ref.current?.scrollTo({ x: Math.max(0, x - 24), animated: false });
  };
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={label}
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.x)}
      scrollEventThrottle={64}
      contentContainerStyle={{ gap: 6, paddingRight: 12, alignItems: 'center' }}
    >
      {chips.map(({ key, ...c }) => (
        <SmallChip key={key} {...c} onLayout={(x, w) => reveal(key, x, w)} />
      ))}
    </ScrollView>
  );
}

/** Круглая кнопка-значок в конце ленты: календарь, часы. */
export function PinIcon({ icon, active }: { icon: IconName; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.hairline,
        backgroundColor: active ? colors.soft : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={16} color={active ? colors.accentText : colors.text2} strokeWidth={2} />
    </View>
  );
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function DayDot({ day, selected, today, dim, size }: { day: number; selected: boolean; today: boolean; dim?: boolean; size: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.text : 'transparent',
        borderWidth: today && !selected ? 1.5 : 0,
        borderColor: colors.accent,
        opacity: dim && !selected ? 0.4 : 1,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: selected || today ? fonts.semibold : fonts.body,
          fontSize: size > 30 ? 14.5 : 13.5,
          lineHeight: 18,
          color: selected ? colors.bg : today ? colors.accentText : colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {day}
      </Text>
    </View>
  );
}

/** Неделя от сегодня — прямо в строке: ближний срок выбирается одним нажатием. */
export function WeekStrip({ value, today, onChange }: { value: ISODate; today: ISODate; onChange: (v: ISODate) => void }) {
  const { colors, fonts } = useTheme();
  const start = parseISODate(today);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <View style={{ flexDirection: 'row' }}>
      {days.map((d) => {
        const iso = toISODate(d);
        const on = iso === value;
        return (
          <Pressable
            key={iso}
            onPress={() => onChange(iso)}
            accessibilityRole="button"
            accessibilityLabel={formatDateLong(iso)}
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}
          >
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.body, fontSize: 10.5, lineHeight: 13, color: on ? colors.accentText : colors.text3 }}>
              {WEEKDAYS[d.getDay()]}
            </Text>
            <DayDot day={d.getDate()} selected={on} today={iso === today} size={28} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Вложенная панель внутри карточки: календарь, свой повтор, выбор друга. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
      <View style={[{ backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.separator, padding: 12 }, style]}>{children}</View>
    </View>
  );
}

const WEEK_HEAD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/**
 * Месяц сеткой — для срока дальше недели. Раскрывается прямо в строке «Срок»; листается стрелками.
 * `footer` — место для «Другая дата»: совсем дальний срок удобнее выбрать в системном календаре.
 */
export function MonthPanel({ value, today, onChange, footer }: { value: ISODate; today: ISODate; onChange: (v: ISODate) => void; footer?: ReactNode }) {
  const { colors, fonts } = useTheme();
  const initial = parseISODate(daysBetween(today, value) >= 0 ? value : today);
  const [shown, setShown] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const move = (delta: number) => setShown(({ year, month }) => ({ year: year + Math.floor((month + delta) / 12), month: (((month + delta) % 12) + 12) % 12 }));
  const cells = monthGrid(shown.year, shown.month);
  // Шестая неделя целиком из следующего месяца — не показываем.
  const rows = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter((row) => row.some((iso) => parseISODate(iso).getMonth() === shown.month));
  const arrow = (icon: IconName, label: string, delta: number) => (
    <Pressable onPress={() => move(delta)} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.5 : 1 })}>
      <Icon name={icon} size={18} color={colors.text2} strokeWidth={2.2} />
    </Pressable>
  );
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 }}>
        <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.text }} accessibilityRole="header">
          {MONTHS[shown.month]} {shown.year}
        </Text>
        {arrow('chevronLeft', 'Предыдущий месяц', -1)}
        {arrow('chevronRight', 'Следующий месяц', 1)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEK_HEAD.map((d) => (
          <Text key={d} maxFontSizeMultiplier={1.1} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: colors.text3 }}>
            {d}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row', marginTop: 3 }}>
          {row.map((iso) => {
            const d = parseISODate(iso);
            if (d.getMonth() !== shown.month) return <View key={iso} style={{ flex: 1 }} />;
            return (
              <Pressable
                key={iso}
                onPress={() => onChange(iso)}
                accessibilityRole="button"
                accessibilityLabel={formatDateLong(iso)}
                accessibilityState={{ selected: iso === value }}
                style={({ pressed }) => ({ flex: 1, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <DayDot day={d.getDate()} selected={iso === value} today={iso === today} dim={iso < today} size={34} />
              </Pressable>
            );
          })}
        </View>
      ))}
      {footer && <View style={{ marginTop: 10, alignItems: 'flex-start' }}>{footer}</View>}
    </Panel>
  );
}

/**
 * Строка со значением, которая раскрывается на месте. Вид как у строк в «Настройках» и карточке друга,
 * но вместо шторки — содержимое прямо под строкой. `trailing` заменяет уголок (переключатель).
 */
export function ExpandRow({
  icon,
  leading,
  label,
  value,
  valueColor,
  iconColor,
  open,
  onToggle,
  first,
  trailing,
  children,
}: {
  icon?: IconName;
  leading?: ReactNode;
  label: string;
  /** Текущее значение справа. `null` — не задано: показываем приглушённо то, что в `empty`. */
  value?: string | null;
  valueColor?: string;
  iconColor?: string;
  open?: boolean;
  onToggle?: () => void;
  first?: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}>
      {leading ?? (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
          {icon && <Icon name={icon} size={18} color={iconColor ?? colors.text2} strokeWidth={iconColor ? 2.4 : 1.9} />}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: first ? 0 : 1, borderTopColor: colors.separator }}>
        <Text style={{ flexShrink: 0, fontFamily: fonts.medium, fontSize: 15.5, lineHeight: 21, color: colors.text }} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ flex: 1, textAlign: 'right', fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: valueColor ?? colors.text2 }}
        >
          {value ?? ''}
        </Text>
        {trailing ?? <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={open ? colors.accentText : colors.text3} strokeWidth={2.2} />}
      </View>
    </View>
  );
  return (
    <View>
      {onToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={value ? `${label}: ${value}` : label}
          accessibilityState={{ expanded: !!open }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {row}
        </Pressable>
      ) : (
        row
      )}
      {open && children}
    </View>
  );
}

/** Подпись раздела над карточкой: «КОГДА», «ДЕТАЛИ». */
export function FormSection({ title }: { title: string }) {
  const { s } = useTheme();
  return <Text style={[s.sectionLabel, { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, letterSpacing: 1.4 }]}>{title}</Text>;
}
