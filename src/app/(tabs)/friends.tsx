import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AiSheet } from '@/components/ai/AiSheet';
import { TabSwipe } from '@/components/TabSwipe';
import { GenderRun } from '@/components/ai/GenderRun';
import { AiToast } from '@/components/ai/AiToast';
import { FRIEND_ROW_INSET, FriendGroupLabel, FriendRow } from '@/components/FriendRow';
import { FriendsHeader } from '@/components/FriendsHeader';
import { Icon } from '@/components/Icon';
import { SelectionBar } from '@/components/SelectionBar';
import { Button, Empty, Fab, GroupedRow, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { plural, todayISO } from '@/lib/dates';
import { buildFriendList, type FriendListItem, type FriendSort } from '@/lib/friendList';
import { notesPending } from '@/lib/notesAi';
import { useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import { voice } from '@/lib/voice';
import { zodiacShown } from '@/lib/zodiac';

export default function FriendsScreen() {
  const { data, deleteFriends, updateFriends, genderBusy, genderNews, clearGenderNews, readNotes, notesBusy, notesNews, clearNotesNews } = useStore();
  const [aiOpen, setAiOpen] = useState(false);
  // «Пол друзей» идёт прямо здесь, слоем поверх списка: ему нужно, где начинается список, и список — с начала.
  const listRef = useRef<FlatList<FriendListItem>>(null);
  const [headerH, setHeaderH] = useState(0);
  const [genderRun, setGenderRun] = useState(false);
  const { s, colors } = useTheme();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FriendSort>('name');
  // Режим выбора (долгое нажатие на строку): отмеченные друзья, как в Telegram.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selected.size > 0;
  const [scrolled, setScrolled] = useState(false);
  const today = todayISO();

  const items = useMemo(() => buildFriendList(data.friends, query, sort, today), [data.friends, query, sort, today]);

  const n = data.friends.length;
  const notesWaiting = useMemo(() => data.friends.filter((f) => notesPending(f, 'all')).length, [data.friends]);

  // Тихий тост магии: сперва про пол, потом про соцсети из «О себе». Фраза выбирается один раз на новость.
  const toast = useMemo(() => {
    if (genderNews) return voice.say('gender.quiet', { k: genderNews });
    if (notesNews)
      return notesNews.links
        ? voice.say('notes.quiet', {
            n: notesNews.links,
            k: notesNews.withLinks,
          })
        : voice.say('notes.tidy');
    return null;
  }, [genderNews, notesNews]);
  const toastDone = useCallback(() => (genderNews ? clearGenderNews() : clearNotesNews()), [genderNews, clearGenderNews, clearNotesNews]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelected(new Set());

  /** Удаление с подтверждением; возвращает false, если передумали. */
  const remove = async (ids: string[]) => {
    const first = data.friends.find((f) => f.id === ids[0]);
    const title = ids.length === 1 && first ? `Удалить «${first.name}»?` : `Удалить ${ids.length} ${plural(ids.length, 'друга', 'друзей', 'друзей')}?`;
    const text = ids.length === 1 ? 'Вместе с другом удалятся и его напоминания.' : 'Вместе с ними удалятся и их напоминания.';
    if (!(await confirm(title, text))) return false;
    deleteFriends(ids);
    clear();
    return true;
  };

  const allFavorite = [...selected].every((id) => data.friends.find((f) => f.id === id)?.favorite);
  const allMuted = [...selected].every((id) => data.friends.find((f) => f.id === id)?.muted);
  const toggleFavorites = () => {
    updateFriends((f) => (selected.has(f.id) ? { ...f, favorite: !allFavorite } : f));
    clear();
  };
  const toggleMuted = () => {
    updateFriends((f) => (selected.has(f.id) ? { ...f, muted: !allMuted } : f));
    clear();
  };

  return (
    <TabSwipe tab="/friends" enabled={!selecting && !genderRun}>
      <View style={s.screen}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(i) => i.key}
          extraData={selected}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 2)}
          scrollEventThrottle={32}
          ListHeaderComponent={
            <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
              <FriendsHeader
                friends={data.friends}
                today={today}
                selecting={selecting}
                aiBusy={genderBusy}
                onAi={() => setAiOpen(true)}
                onImport={() => router.push('/import')}
                onSettings={() => router.push('/settings')}
                query={query}
                onQuery={setQuery}
                sort={sort}
                onSort={setSort}
              />
            </View>
          }
          renderItem={({ item }) =>
            item.type === 'label' ? (
              <FriendGroupLabel title={item.title} star={item.star} />
            ) : (
              <View style={{ paddingHorizontal: 20 }}>
                <GroupedRow first={item.first} last={item.last} inset={FRIEND_ROW_INSET}>
                  <SwipeToDelete enabled={!selecting} onDelete={() => remove([item.friend.id])}>
                    <FriendRow
                      friend={item.friend}
                      today={today}
                      selected={selected.has(item.friend.id)}
                      selecting={selecting}
                      zodiac={zodiacShown(data.settings)}
                      onPress={selecting ? () => toggle(item.friend.id) : () => router.push(`/friend/${item.friend.id}`)}
                      onLongPress={() => toggle(item.friend.id)}
                    />
                  </SwipeToDelete>
                </GroupedRow>
              </View>
            )
          }
          ListEmptyComponent={
            n === 0 ? (
              <View style={{ gap: 10, padding: 20 }}>
                <Empty icon="people" title="Пока никого" text="Импортируй друзей из контактов телефона вместе с днями рождения — или добавь первого вручную." />
                <Button title="Импорт из контактов" icon="import" onPress={() => router.push('/import')} />
                {telegramAvailable && <Button title="Импорт из Telegram" icon="send" variant="secondary" onPress={() => router.push('/telegram')} />}
              </View>
            ) : (
              <Empty icon="search" title="Никого не нашлось" text="Попробуй другой запрос." />
            )
          }
        />
        {selecting && (
          <SelectionBar
            count={selected.size}
            scrolled={scrolled}
            onClose={clear}
            actions={[
              {
                icon: 'star',
                label: allFavorite ? 'Убрать из избранного' : 'В избранное',
                color: allFavorite ? colors.accent : undefined,
                fill: allFavorite ? colors.accent : undefined,
                onPress: toggleFavorites,
              },
              {
                icon: allMuted ? 'bell' : 'bellOff',
                label: allMuted ? 'Включить уведомления' : 'Выключить уведомления',
                onPress: toggleMuted,
              },
              {
                icon: 'trash',
                label: 'Удалить выбранных',
                color: colors.danger,
                onPress: () => remove([...selected]),
              },
            ]}
          />
        )}
        {!selecting && <Fab onPress={() => router.push('/friend/edit')} label="Добавить друга" />}
        <AiSheet
          visible={aiOpen}
          onClose={() => setAiOpen(false)}
          gender={{
            known: data.friends.filter((f) => f.gender).length,
            total: n,
          }}
          notes={{ waiting: notesWaiting, busy: notesBusy }}
          onNotes={() => readNotes('all')}
          onGender={() => {
            setAiOpen(false);
            // Список — к началу и «по имени»: слой «Пола друзей» рисует его точь-в-точь и встаёт поверх незаметно.
            setQuery('');
            setSort('name');
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
            clearGenderNews();
            setTimeout(() => setGenderRun(true), 230);
          }}
        />
        {!genderRun && <AiToast text={toast} onDone={toastDone} bottom={selecting ? 90 : 96} />}
        {genderRun && headerH > 0 && <GenderRun listTop={headerH} onClose={() => setGenderRun(false)} />}
      </View>
    </TabSwipe>
  );
}

/** Свайп влево открывает красную кнопку «Удалить»; само удаление — только после подтверждения. */
function SwipeToDelete({ enabled, onDelete, children }: { enabled: boolean; onDelete: () => Promise<boolean>; children: ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  const { colors, fonts } = useTheme();
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: colors.card }}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel="Удалить"
          onPress={async () => {
            if (!(await onDelete())) ref.current?.close();
          }}
          style={({ pressed }) => ({
            width: 92,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="trash" size={22} color="#FFFFFF" strokeWidth={2} />
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 12,
              color: '#FFFFFF',
            }}
          >
            Удалить
          </Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
