import { useMemo, useState } from 'react';
import { FlatList, Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NETWORKS, NETWORK_GROUPS, searchNetworks, type Network } from '@/lib/socials';
import { NetworkBadge } from './NetworkBadge';
import { GroupedRow, IconButton, ListRow, SearchField, useTheme } from './ui';

type Row = { key: string; type: 'label'; title: string } | { key: string; type: 'net'; network: Network; first: boolean; last: boolean };

/** Экран «Какая сеть?»: поиск и весь каталог по группам. */
export function NetworkPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (n: Network) => void }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const rows = useMemo<Row[]>(() => {
    const found = searchNetworks(query);
    const q = query.trim();
    const groups = q ? [['all', 'Найдено'] as const] : NETWORK_GROUPS;
    const out: Row[] = [];
    for (const [id, title] of groups) {
      const items = q ? found : found.filter((n) => n.group === id);
      if (!items.length) continue;
      out.push({ key: `g-${id}`, type: 'label', title });
      items.forEach((n, i) => out.push({ key: n.id, type: 'net', network: n, first: i === 0, last: i === items.length - 1 }));
    }
    return out;
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <IconButton icon="close" label="Закрыть" onPress={onClose} />
          <Text style={{ flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 18, color: colors.text }}>Какая сеть?</Text>
          <View style={{ width: 44 }} />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}
          ListHeaderComponent={
            <View style={{ paddingBottom: 6 }}>
              <SearchField value={query} onChangeText={setQuery} placeholder="Найти сеть" />
            </View>
          }
          ListEmptyComponent={<Text style={[s.muted, { padding: 12 }]}>{`Такой сети в списке нет. Вставь ссылку на профиль — сохраним как сайт. Всего сетей: ${NETWORKS.length}.`}</Text>}
          renderItem={({ item }) =>
            item.type === 'label' ? (
              <Text style={[s.sectionLabel, { paddingTop: 14, paddingBottom: 6 }]}>{item.title}</Text>
            ) : (
              <GroupedRow first={item.first} last={item.last} inset={62}>
                <ListRow
                  onPress={() => onSelect(item.network)}
                  leading={<NetworkBadge network={item.network.id} />}
                  title={item.network.name}
                  subtitle={item.network.domains[0] ?? 'ссылок на профиль нет, только ник'}
                  chevron
                  style={{ paddingVertical: 9 }}
                />
              </GroupedRow>
            )
          }
        />
      </View>
    </Modal>
  );
}
