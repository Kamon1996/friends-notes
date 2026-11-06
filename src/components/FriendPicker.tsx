import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDate, hasYear } from '@/lib/dates';
import type { Friend } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Chip, IconButton, ListRow, SearchField, Separator, useTheme } from './ui';

/** До скольких друзей показываем всех чипами; дальше — выбранный плюс кнопка «Выбрать друга». */
const INLINE_LIMIT = 5;

/** Выбор «для кого» напоминание: чипы для короткого списка, окно с поиском — для длинного. */
export function FriendPicker({ friends, value, onChange }: { friends: Friend[]; value: string | null; onChange: (id: string | null) => void }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...friends].sort((a, b) => a.name.localeCompare(b.name, 'ru')), [friends]);
  const selected = friends.find((f) => f.id === value) ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((f) => f.name.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const inline = friends.length <= INLINE_LIMIT;

  return (
    <View style={s.chips}>
      <Chip label="Для себя" icon="person" selected={!value} onPress={() => onChange(null)} />
      {inline
        ? sorted.map((f) => <Chip key={f.id} label={f.name} selected={value === f.id} leading={<Avatar friend={f} size={28} />} onPress={() => onChange(f.id)} />)
        : selected && <Chip label={selected.name} selected leading={<Avatar friend={selected} size={28} />} onPress={() => setOpen(true)} />}
      {!inline && <Chip label={selected ? 'Другой друг' : 'Выбрать друга'} icon="people" onPress={() => setOpen(true)} />}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[s.screen, { paddingTop: insets.top }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingVertical: 6, gap: 8 }}>
            <Text style={[s.h2, { flex: 1 }]}>Для кого</Text>
            <IconButton icon="close" label="Закрыть" onPress={() => setOpen(false)} />
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
              <Pressable onPress={() => pick(null)} style={({ pressed }) => [s.row, s.rowPad, { opacity: pressed ? 0.6 : 1 }]}>
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
                trailing={value === item.id ? <Icon name="check" size={20} color={colors.accent} strokeWidth={2.2} /> : undefined}
                style={{ paddingHorizontal: 0, paddingVertical: 10 }}
              />
            )}
            ListEmptyComponent={<Text style={[s.muted, { textAlign: 'center', paddingTop: 24 }]}>Никого не нашлось</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}
