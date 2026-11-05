import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button, Card, Checkbox, Chip, Empty, colors, styles } from '@/components/ui';
import { loadContacts, pickMoreContacts } from '@/lib/contacts';
import { candidateToFriend, phoneKey, toCandidates, type ImportCandidate } from '@/lib/contactsImport';
import { applyEnrichment } from '@/lib/enrich';
import { formatDate, hasYear } from '@/lib/dates';
import { newId, useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import { tgToRawContact } from '@/lib/telegramImport';
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
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  // telegram — загружено через вход в Telegram; tgbook — контакты Telegram из телефонной книги, без входа.
  const fromTelegram = source === 'telegram';
  const fromTgBook = source === 'tgbook';
  const tg = useTelegramSession();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      if (fromTelegram) {
        // Контакты уже загружены в фоне модулем Telegram.
        const people = (await Telegram?.getImportResult()) ?? [];
        if (!people.length) {
          setState({ kind: 'error', message: 'Нет загруженных контактов Telegram — начни импорт заново.' });
          return;
        }
        const candidates = toCandidates(people.map(tgToRawContact), data.friends);
        setState({ kind: 'ready', candidates, limited: false, sample: false, partial: !!tg.imp.partial });
        setSelected(new Set(candidates.filter((c) => !c.duplicateOf && c.birthday).map((c) => c.key)));
        return;
      }
      const res = await loadContacts();
      if (res.status === 'denied') {
        setState({ kind: 'denied', canAskAgain: res.canAskAgain });
        return;
      }
      // Без входа: только те, кого Telegram добавил в телефонную книгу.
      const list = fromTgBook ? res.contacts.filter((c) => c.links?.telegramId) : res.contacts;
      const candidates = toCandidates(list, data.friends);
      setState({ kind: 'ready', candidates, limited: res.limited, sample: res.sample });
      // По умолчанию отмечаем новых людей, у которых указан день рождения.
      setSelected(new Set(candidates.filter((c) => !c.duplicateOf && c.birthday).map((c) => c.key)));
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
    // Дубликаты считаем по списку друзей на момент открытия экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const all = state.kind === 'ready' ? state.candidates : [];
  const withBirthday = useMemo(() => all.filter((c) => c.birthday).length, [all]);
  const withPhone = useMemo(() => all.filter((c) => c.phone).length, [all]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (c) =>
        (filter === 'all' || (filter === 'birthday' ? c.birthday : c.phone)) &&
        (!q || c.name.toLowerCase().includes(q) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '—')),
    );
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

  const doImport = async () => {
    const chosen = all.filter((c) => selected.has(c.key) && !c.duplicateOf);
    if (!chosen.length) return;
    const dups = all.filter((c) => c.duplicateOf);

    // Аватарки из Telegram лежат во временной папке: оставляем только нужные.
    let kept: Record<string, { photoUri?: string; thumbUri?: string }> = {};
    if (fromTelegram && Telegram) {
      const ids = [...chosen, ...dups].map((c) => c.links.telegramId).filter((id): id is number => !!id);
      kept = await Telegram.finalizeImport(ids);
    }
    const photosOf = (c: ImportCandidate) => {
      if (!fromTelegram) return { photoUri: c.photoUri, thumbUri: c.thumbUri };
      const k = c.links.telegramId ? kept[String(c.links.telegramId)] : undefined;
      return { photoUri: k?.photoUri ?? k?.thumbUri ?? null, thumbUri: k?.thumbUri ?? k?.photoUri ?? null };
    };

    addFriends(chosen.map((c) => ({ ...candidateToFriend(c, newId(), newId), ...photosOf(c) })));

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
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Читаю контакты…</Text>
      </View>
    );
  }

  if (state.kind === 'denied') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Empty
          emoji="🔒"
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
        <Empty emoji="⚠️" title="Не получилось прочитать контакты" text={state.message} />
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
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Stack.Screen options={{ title: fromTelegram || fromTgBook ? 'Контакты Telegram' : 'Импорт контактов' }} />
            {!fromTelegram && !fromTgBook && telegramAvailable && (
              <Pressable
                onPress={() => router.push('/telegram')}
                style={({ pressed }) => [styles.card, styles.row, { borderColor: colors.blue }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontSize: 28 }}>✈️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Импорт из Telegram</Text>
                  <Text style={styles.muted}>Без входа — или с днями рождения через вход</Text>
                </View>
                <Text style={styles.muted}>›</Text>
              </Pressable>
            )}
            {state.partial && (
              <Card style={{ backgroundColor: colors.amberSoft, borderColor: colors.amberSoft }}>
                <Text style={{ color: colors.amber, lineHeight: 20 }}>
                  Telegram попросил сделать паузу, поэтому дни рождения загружены не у всех. Можно повторить импорт позже.
                </Text>
              </Card>
            )}
            {state.sample && (
              <Card style={{ backgroundColor: colors.amberSoft, borderColor: colors.amberSoft }}>
                <Text style={{ color: colors.amber, lineHeight: 20 }}>
                  Это пример: в браузере нет доступа к телефонной книге. В приложении на телефоне здесь будут твои
                  контакты.
                </Text>
              </Card>
            )}
            {state.limited && Platform.OS === 'ios' && (
              <Card style={{ gap: 8 }}>
                <Text style={styles.muted}>Приложению доступны только выбранные контакты.</Text>
                <Button title="Выбрать ещё контакты" variant="secondary" onPress={() => pickMoreContacts().then(load)} />
              </Card>
            )}
            {!fromTelegram && !fromTgBook && <Pressable onPress={() => router.push('/sources')} hitSlop={8}>
              <Text style={{ color: colors.blue }}>🧪 Что лежит в контактах от Telegram, WhatsApp, Viber… →</Text>
            </Pressable>}
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="🔍  Имя или телефон"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <View style={[styles.chips, { alignItems: 'center' }]}>
              <Chip label={`Все · ${all.length}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={`📞 С номером · ${withPhone}`} selected={filter === 'phone'} onPress={() => setFilter('phone')} />
              <Chip
                label={`🎂 С днём рождения · ${withBirthday}`}
                selected={filter === 'birthday'}
                onPress={() => setFilter('birthday')}
              />
            </View>
            {selectable.length > 0 && (
              <Pressable onPress={toggleAllVisible} style={[styles.row, { paddingVertical: 4, paddingHorizontal: 4 }]}>
                <Checkbox checked={allVisibleSelected} onPress={toggleAllVisible} />
                <Text style={styles.title}>{allVisibleSelected ? 'Снять все' : 'Выбрать все'}</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ContactRow candidate={item} checked={selected.has(item.key)} onToggle={() => toggle(item.key)} />
        )}
        ListEmptyComponent={
          <Empty
            emoji="📇"
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
          borderTopColor: colors.border,
        }}
      >
        <Button
          title={count ? `Добавить (${count})` : 'Отметь, кого добавить'}
          onPress={doImport}
          style={!count && { opacity: 0.5 }}
        />
      </View>
    </View>
  );
}

function ContactRow({ candidate: c, checked, onToggle }: { candidate: ImportCandidate; checked: boolean; onToggle: () => void }) {
  const dup = !!c.duplicateOf;
  const details = [
    c.birthday && `🎂 ${formatDate(c.birthday, hasYear(c.birthday))}`,
    ...c.dates.map((d) => `📅 ${d.title}`),
    c.links.telegramId && '✈️',
    c.links.whatsapp && '💬',
    c.links.viber && '🟣',
  ].filter(Boolean);

  return (
    <Pressable
      onPress={dup ? undefined : onToggle}
      style={({ pressed }) => [styles.card, styles.row, { paddingVertical: 12 }, dup && { opacity: 0.5 }, pressed && !dup && { opacity: 0.7 }]}
    >
      {dup ? <View style={{ width: 26 }} /> : <Checkbox checked={checked} onPress={onToggle} />}
      {(c.thumbUri || c.photoUri) && <Avatar friend={{ emoji: '🙂', photoUri: c.photoUri, thumbUri: c.thumbUri }} size={36} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{c.name}</Text>
        {!!c.phone && <Text style={styles.muted}>{c.phone}</Text>}
        {details.length > 0 && <Text style={[styles.muted, { color: colors.text }]}>{details.join('  ')}</Text>}
        {dup && <Text style={[styles.muted, { fontSize: 13 }]}>Уже есть: {c.duplicateOf}</Text>}
      </View>
    </Pressable>
  );
}
