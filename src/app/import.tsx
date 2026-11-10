import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Button, Card, Checkbox, Chip, Empty, GroupedRow, IconButton, IconCircle, SearchField, useTheme } from '@/components/ui';
import { pickMoreContacts } from '@/lib/contacts';
import { getContactsSnapshot, refreshContacts, type ContactsSnapshot } from '@/lib/contactsCache';
import { candidateToFriend, phoneKey, toCandidates, type ImportCandidate } from '@/lib/contactsImport';
import { applyEnrichment } from '@/lib/enrich';
import { formatDateCompact, hasYear, plural } from '@/lib/dates';
import { filterByName, prepareQuery } from '@/lib/search';
import { newId, useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import { tgToRawContact } from '@/lib/telegramImport';
import { Stepper, TG_STEPS } from '@/components/Stepper';
import { useTelegramSession } from '@/lib/telegramSession';
import { Telegram } from '../../modules/telegram';

type State =
  | { kind: 'loading' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; candidates: ImportCandidate[]; limited: boolean; sample: boolean; partial?: boolean };

type Filter = 'all' | 'phone' | 'birthday';

export default function ImportScreen() {
  const { data, ready, addFriends, updateFriends } = useStore();
  const { s: styles, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  // telegram — контакты, загруженные через вход в Telegram; иначе — телефонная книга.
  const fromTelegram = source === 'telegram';
  const tg = useTelegramSession();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Дубликаты ищем среди друзей на момент загрузки списка, а не на момент первого рендера экрана.
  const friendsRef = useRef(data.friends);
  useEffect(() => {
    friendsRef.current = data.friends;
  }, [data.friends]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  /** Список кандидатов из снимка книги; при фоновом обновлении отмеченные остаются отмеченными. */
  const applySnapshot = useCallback(
    (snap: ContactsSnapshot, keepSelection: boolean) => {
      const candidates = toCandidates(snap.contacts, friendsRef.current);
      setState({ kind: 'ready', candidates, limited: snap.limited, sample: snap.sample });
      if (!keepSelection) setSelected(new Set(candidates.filter((c) => !c.duplicateOf && c.birthday).map((c) => c.key)));
    },
    [],
  );

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    try {
      if (fromTelegram) {
        // Контакты уже загружены в фоне модулем Telegram.
        const people = (await Telegram?.getImportResult()) ?? [];
        if (!people.length) {
          setState({ kind: 'error', message: 'Нет загруженных контактов Telegram — начни импорт заново.' });
          return;
        }
        const candidates = toCandidates(people.map(tgToRawContact), friendsRef.current);
        setState({ kind: 'ready', candidates, limited: false, sample: false, partial: !!tg.imp.partial });
        setSelected(new Set(candidates.filter((c) => !c.duplicateOf && c.birthday).map((c) => c.key)));
        return;
      }
      // Книга уже прочитана (при старте или в прошлый раз) — показываем сразу, а свежую версию дочитываем в фоне.
      const snap = getContactsSnapshot();
      const instant = !!snap && !opts?.refresh;
      if (instant) applySnapshot(snap, false);
      else setState({ kind: 'loading' });
      setRefreshing(true);
      const res = await refreshContacts().finally(() => setRefreshing(false));
      if (res.status === 'denied') {
        if (!instant) setState({ kind: 'denied', canAskAgain: res.canAskAgain });
        return;
      }
      // Без входа: только те, кого Telegram добавил в телефонную книгу.
      // По умолчанию отмечаем новых людей, у которых указан день рождения.
      applySnapshot(getContactsSnapshot()!, instant || !!opts?.refresh);
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [ready, load]);

  const all = useMemo(() => (state.kind === 'ready' ? state.candidates : []), [state]);
  const withBirthday = useMemo(() => all.filter((c) => c.birthday).length, [all]);
  const withPhone = useMemo(() => all.filter((c) => c.phone).length, [all]);
  const visible = useMemo(() => {
    const q = prepareQuery(query);
    const digits = q ? q.raw.replace(/\D/g, '') : '';
    const shown = all.filter((c) => filter === 'all' || (filter === 'birthday' ? c.birthday : c.phone));
    if (!q) return shown;
    return filterByName(shown, q, (c) => c.name, (c) => digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits));
  }, [all, query, filter]);

  const selectable = visible.filter((c) => !c.duplicateOf);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.key));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of selectable) {
        if (allVisibleSelected) next.delete(c.key);
        else next.add(c.key);
      }
      return next;
    });

  const importing = useRef(false);
  const doImport = async () => {
    const chosen = all.filter((c) => selected.has(c.key) && !c.duplicateOf);
    if (!chosen.length || importing.current) return;
    // Быстрое двойное нажатие: без этого каждый выбранный добавился бы дважды.
    importing.current = true;
    const dups = all.filter((c) => c.duplicateOf);

    // Аватарки из Telegram лежат во временной папке: оставляем только нужные.
    let kept: Record<string, { photoUri?: string; thumbUri?: string }> = {};
    if (fromTelegram && Telegram) {
      const ids = [...chosen, ...dups].map((c) => c.links.telegramId).filter((id): id is number => !!id);
      try {
        kept = await Telegram.finalizeImport(ids);
      } catch (e) {
        importing.current = false;
        throw e;
      }
    }
    const photosOf = (c: ImportCandidate) => {
      if (!fromTelegram) return { photoUri: c.photoUri, thumbUri: c.thumbUri };
      const k = c.links.telegramId ? kept[String(c.links.telegramId)] : undefined;
      return { photoUri: k?.photoUri ?? k?.thumbUri ?? null, thumbUri: k?.thumbUri ?? k?.photoUri ?? null };
    };

    // «О себе» из Telegram разберёт ИИ — в фоне, сразу после импорта: соцсети в карточку, из заметки — ссылки.
    addFriends(chosen.map((c) => ({ ...candidateToFriend(c, newId(), newId), ...photosOf(c), ...(fromTelegram && c.note && { notesQueue: true }) })));

    // Уже добавленных друзей (совпали по номеру) дополняем фото и мессенджерами — заполненное не трогаем.
    const map = new Map<string, { links: ImportCandidate['links']; photoUri: string | null; thumbUri: string | null }>();
    for (const c of dups) {
      const key = phoneKey(c.phone);
      if (key.length >= 7) map.set(key, { links: c.links, ...photosOf(c) });
    }
    if (map.size) {
      const { friends, changed } = applyEnrichment(data.friends, map);
      if (changed) updateFriends((f) => friends.find((x) => x.id === f.id) ?? f);
    }

    if (fromTelegram) tg.clearResult();
    router.back();
  };

  if (state.kind === 'loading') {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Читаю контакты…</Text>
      </View>
    );
  }

  if (state.kind === 'denied') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Empty
          icon="lock"
          title="Нет доступа к контактам"
          text="Разреши приложению читать контакты — оно возьмёт только имена, телефоны и дни рождения. Ничего не отправляется в интернет."
        />
        {state.canAskAgain ? (
          <Button title="Разрешить доступ" onPress={load} />
        ) : (
          <Button title="Открыть настройки" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Empty icon="warning" title="Не получилось прочитать контакты" text={state.message} />
        <Button title="Попробовать ещё раз" onPress={load} />
      </View>
    );
  }

  const count = all.filter((c) => selected.has(c.key) && !c.duplicateOf).length;

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.key}
        extraData={selected}
        contentContainerStyle={[styles.content, { gap: 0, paddingBottom: 110 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 10 }}>
            <Stack.Screen
              options={{
                title: fromTelegram ? 'Контакты Telegram' : 'Импорт контактов',
                headerRight: fromTelegram
                  ? undefined
                  : () =>
                      refreshing ? (
                        <ActivityIndicator color={colors.accent} style={{ marginRight: 12 }} />
                      ) : (
                        <IconButton icon="refresh" label="Перечитать контакты" onPress={() => load({ refresh: true })} />
                      ),
              }}
            />
            {fromTelegram && (
              <View style={{ paddingTop: 2, paddingBottom: 4 }}>
                <Stepper steps={TG_STEPS} active={3} />
              </View>
            )}
            {!fromTelegram && telegramAvailable && (
              <Pressable
                onPress={() => router.push('/telegram')}
                style={({ pressed }) => [styles.card, styles.row, pressed && { opacity: 0.7 }]}
              >
                <IconCircle icon="send" tone="info" size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.title}>Импорт из Telegram</Text>
                  <Text style={styles.muted}>С днями рождения, фото и @username — через вход</Text>
                </View>
                <Icon name="chevronRight" size={18} color={colors.checkbox} strokeWidth={2} />
              </Pressable>
            )}
            {state.partial && (
              <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
                <Text style={[styles.muted, { color: colors.warn, fontSize: 14, lineHeight: 20 }]}>
                  Telegram попросил сделать паузу, поэтому дни рождения загружены не у всех. Можно повторить импорт позже.
                </Text>
              </Card>
            )}
            {state.sample && (
              <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
                <Text style={[styles.muted, { color: colors.warn, fontSize: 14, lineHeight: 20 }]}>
                  Это пример: в браузере нет доступа к телефонной книге. В приложении на телефоне здесь будут твои
                  контакты.
                </Text>
              </Card>
            )}
            {state.limited && Platform.OS === 'ios' && (
              <Card style={{ gap: 8 }}>
                <Text style={styles.muted}>Приложению доступны только выбранные контакты.</Text>
                <Button title="Выбрать ещё контакты" variant="secondary" onPress={() => pickMoreContacts().then(() => load())} />
              </Card>
            )}
            <SearchField value={query} onChangeText={setQuery} placeholder="Имя или телефон" />
            <View style={[styles.chips, { alignItems: 'center' }]}>
              <Chip label={`Все · ${all.length}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={`С номером · ${withPhone}`} icon="phone" selected={filter === 'phone'} onPress={() => setFilter('phone')} />
              <Chip label={`С днём рождения · ${withBirthday}`} icon="cake" selected={filter === 'birthday'} onPress={() => setFilter('birthday')} />
            </View>
            {selectable.length > 0 && (
              <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: 4 }]}>
                <Text style={styles.sectionLabel}>{count ? `Выбрано ${count} из ${all.length}` : `${all.length} контактов`}</Text>
                <Button title={allVisibleSelected ? 'Снять все' : 'Выбрать все'} variant="ghost" style={{ minHeight: 32, paddingHorizontal: 8, paddingVertical: 2 }} onPress={toggleAllVisible} />
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <GroupedRow first={index === 0} last={index === visible.length - 1} inset={102}>
            <ContactRow candidate={item} checked={selected.has(item.key)} onToggle={() => toggle(item.key)} />
          </GroupedRow>
        )}
        ListEmptyComponent={
          <Empty
            icon="people"
            title={all.length ? 'Никого не нашлось' : 'Контактов нет'}
            text={all.length ? 'Попробуй другой запрос или фильтр.' : 'В телефонной книге пока пусто.'}
          />
        }
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          paddingBottom: 16 + insets.bottom,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.hairline,
        }}
      >
        <Button
          title={count ? `Добавить ${count} ${plural(count, 'друга', 'друзей', 'друзей')}` : 'Отметь, кого добавить'}
          onPress={doImport}
          disabled={!count}
        />
      </View>
    </View>
  );
}

function ContactRow({ candidate: c, checked, onToggle }: { candidate: ImportCandidate; checked: boolean; onToggle: () => void }) {
  const { s: styles, colors } = useTheme();
  const dup = !!c.duplicateOf;
  const details = [c.birthday && `ДР ${formatDateCompact(c.birthday, hasYear(c.birthday))}`, ...c.dates.map((d) => d.title)].filter(Boolean);
  const messengers = [c.links.telegramId && 'send', c.links.whatsapp && 'bubble', c.links.viber && 'bubble2'].filter(Boolean) as ('send' | 'bubble' | 'bubble2')[];

  return (
    <Pressable
      onPress={dup ? undefined : onToggle}
      style={({ pressed }) => [styles.row, { paddingHorizontal: 14, paddingVertical: 10 }, dup && { opacity: 0.55 }, pressed && !dup && { opacity: 0.7 }]}
    >
      {dup ? (
        <Checkbox checked done onPress={() => {}} />
      ) : (
        <Checkbox checked={checked} onPress={onToggle} />
      )}
      <Avatar friend={{ name: c.name, photoUri: c.photoUri, thumbUri: c.thumbUri }} size={40} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{c.name}</Text>
        <Text style={[styles.muted, { fontVariant: ['tabular-nums'] }]} numberOfLines={2}>
          {dup ? `Уже есть: ${c.duplicateOf}` : [c.phone, ...details].filter(Boolean).join(' · ') || 'Без номера'}
        </Text>
      </View>
      {!dup && messengers.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {messengers.map((m) => (
            <Icon key={m} name={m} size={16} color={colors.text3} />
          ))}
        </View>
      )}
    </Pressable>
  );
}
