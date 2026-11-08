import { View } from 'react-native';

import { AiButton } from '@/components/ai/AiIcon';
import { TelegramImportCard } from '@/components/TelegramImportCard';
import { Chip, IconButton, ScreenHeader, SearchField, useTheme } from '@/components/ui';
import { daysBetween, nextAnniversary, plural } from '@/lib/dates';
import type { FriendSort } from '@/lib/friendList';
import type { Friend } from '@/lib/types';

/** Шапка списка «Друзья»: заголовок с кнопками, поиск, сортировка и карточка импорта из Telegram. */
export function FriendsHeader({
  friends,
  today,
  selecting = false,
  aiBusy,
  onAi,
  onImport,
  onSettings,
  query,
  onQuery,
  sort,
  onSort,
}: {
  friends: readonly Friend[];
  today: string;
  /** Режим выбора: шапка остаётся на месте, но прячется — панель действий ложится поверх, и список не прыгает. */
  selecting?: boolean;
  aiBusy: boolean;
  onAi: () => void;
  onImport: () => void;
  onSettings: () => void;
  query: string;
  onQuery: (q: string) => void;
  sort: FriendSort;
  onSort: (s: FriendSort) => void;
}) {
  const { s } = useTheme();
  const n = friends.length;
  const inMonth = friends.filter((f) => f.birthday && daysBetween(today, nextAnniversary(f.birthday, today)) <= 30).length;
  const subtitle = n
    ? `${n} ${plural(n, 'человек', 'человека', 'человек')}${inMonth ? ` · ${inMonth} ${plural(inMonth, 'день рождения', 'дня рождения', 'дней рождения')} в ближайший месяц` : ''}`
    : undefined;
  return (
    <View>
      <View
        style={{
          opacity: selecting ? 0 : 1,
          pointerEvents: selecting ? 'none' : 'auto',
        }}
        importantForAccessibility={selecting ? 'no-hide-descendants' : 'auto'}
      >
        <ScreenHeader
          title="Друзья"
          subtitle={subtitle}
          right={
            <>
              {n > 0 && <AiButton busy={aiBusy} onPress={onAi} />}
              <IconButton icon="import" label="Импорт друзей" onPress={onImport} />
              <IconButton icon="sliders" label="Настройки" onPress={onSettings} />
            </>
          }
        />
      </View>
      {n > 0 && (
        <View style={{ padding: 20, paddingTop: 14, paddingBottom: 16, gap: 10 }}>
          <SearchField value={query} onChangeText={onQuery} placeholder="Поиск по имени" />
          <View style={s.chips}>
            <Chip label="По имени" selected={sort === 'name'} onPress={() => onSort('name')} />
            <Chip label="Скоро день рождения" icon="cake" selected={sort === 'date'} onPress={() => onSort('date')} />
          </View>
        </View>
      )}
      <TelegramImportCard style={{ marginHorizontal: 20, marginBottom: 12 }} />
    </View>
  );
}
