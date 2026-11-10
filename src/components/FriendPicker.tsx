import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDate, hasYear } from '@/lib/dates';
import { byName, favoritesFirst } from '@/lib/friendList';
import { filterByName, prepareQuery } from '@/lib/search';
import type { Friend } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { IconButton, ListRow, SearchField, Separator, useTheme } from './ui';

/** Окно «Для кого» с поиском — когда друзей больше, чем помещается кружками. */
export function FriendPickerModal({ open, friends, value, onPick, onClose }: { open: boolean; friends: Friend[]; value: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...friends].sort(favoritesFirst(byName)), [friends]);
  const visible = useMemo(() => {
    const q = prepareQuery(query);
    return q ? filterByName(sorted, q, (f) => f.name) : sorted;
  }, [sorted, query]);
  const close = () => {
    onClose();
    setQuery('');
  };
  const pick = (id: string | null) => {
    onPick(id);
    close();
  };

  return (
      <Modal visible={open} animationType="slide" onRequestClose={close}>
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingVertical: 6, gap: 8 }}>
          <Text style={[s.h2, { flex: 1 }]}>Для кого</Text>
          <IconButton icon="close" label="Закрыть" onPress={close} />
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Имя" />
        </View>
        <FlatList
          data={visible}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={() => <Separator inset={70} />}
          ListHeaderComponent={
            <Pressable onPress={() => pick(null)} style={({ pressed }) => [s.row, { paddingVertical: 10, opacity: pressed ? 0.6 : 1 }]}>
              <View style={[s.iconCircle, { width: 44, height: 44, borderRadius: 22 }]}>
                <Icon name="person" size={22} color={colors.text2} />
              </View>
              <Text style={[s.title, { flex: 1 }]}>Для себя</Text>
              {!value && <Icon name="check" size={20} color={colors.accent} strokeWidth={2.2} />}
            </Pressable>
          }
          renderItem={({ item }) => (
            <ListRow
              onPress={() => pick(item.id)}
              leading={<Avatar friend={item} size={44} />}
              title={<Text style={{ fontFamily: fonts.displayMedium, fontSize: 17, color: colors.text }} numberOfLines={1}>{item.name}</Text>}
              subtitle={item.birthday ? formatDate(item.birthday, hasYear(item.birthday)) : undefined}
              trailing={
                item.favorite || value === item.id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {item.favorite && <Icon name="star" size={16} color={colors.accent} fill={colors.accent} />}
                    {value === item.id && <Icon name="check" size={20} color={colors.accent} strokeWidth={2.2} />}
                  </View>
                ) : undefined
              }
              style={{ paddingHorizontal: 0, paddingVertical: 10 }}
            />
          )}
          ListEmptyComponent={<Text style={[s.muted, { textAlign: 'center', paddingTop: 24 }]}>Никого не нашлось</Text>}
        />
      </View>
    </Modal>
  );
}

/** «Для кого» прямо в форме: «Для себя», недавние и избранные друзья кружками; остальных находят поиском. */
export function FriendStrip({ choices, total, value, onChange, onSearch }: { choices: Friend[]; total: number; value: string | null; onChange: (id: string | null) => void; onSearch: () => void }) {
  const { colors, fonts } = useTheme();
  const item = (key: string, name: string, on: boolean, onPress: () => void, face: ReactNode, a11y: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ width: 60, alignItems: 'center', gap: 5, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ padding: 2, borderRadius: 26, borderWidth: 2, borderColor: on ? colors.accent : 'transparent' }}>{face}</View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: on ? fonts.semibold : fonts.body, fontSize: 12, lineHeight: 16, color: on ? colors.accentText : colors.text2 }}>
        {name}
      </Text>
    </Pressable>
  );
  const round = (icon: 'person' | 'search') => (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} color={colors.text2} />
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 2 }}>
      {item('self', 'Для себя', !value, () => onChange(null), round('person'), 'Для себя')}
      {/* Друзей больше, чем кружков, — поиск стоит вторым, а не в конце ленты, где его не видно. */}
      {total > choices.length && item('search', 'Найти', false, onSearch, round('search'), 'Найти друга')}
      {choices.map((f) => item(f.id, f.name.trim().split(/\s+/)[0], value === f.id, () => onChange(f.id), <Avatar friend={f} size={44} />, f.name))}
    </ScrollView>
  );
}
