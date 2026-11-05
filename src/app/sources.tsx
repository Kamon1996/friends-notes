import { requestPermissionsAsync } from 'expo-contacts';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Button, Card, SectionTitle, colors, styles } from '@/components/ui';
import { contactsRawAvailable, dumpAccount, getAccounts, type RawAccount, type RawDump } from '../../modules/contacts-raw';
import { SOURCES, accountsFor, filterDumpsByMime, formatDump, mimeStats, otherAccounts, type SourceDef } from '@/lib/sources';
import { plural } from '@/lib/dates';
import { SAMPLE_ACCOUNTS, SAMPLE_DUMPS } from '@/lib/sourcesSample';

const isSample = !contactsRawAvailable && Platform.OS === 'web';
const LIMIT = 300;
const SHARE_LIMIT = 200_000; // Android не передаст через «Поделиться» слишком длинный текст
const SHOW_LIMIT = 40_000;

const mono = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11, lineHeight: 15 } as const;

type Result = { title: string; dumps: RawDump[]; text: string };

async function loadAccounts(): Promise<RawAccount[]> {
  if (isSample) return SAMPLE_ACCOUNTS;
  return getAccounts();
}

async function loadDump(accountType: string): Promise<RawDump> {
  if (isSample) return SAMPLE_DUMPS[accountType] ?? { accountType, total: 0, items: [] };
  return dumpAccount(accountType, LIMIT);
}

async function share(text: string) {
  const message = text.length > SHARE_LIMIT ? text.slice(0, SHARE_LIMIT) + '\n…(обрезано)' : text;
  try {
    await Share.share({ message });
  } catch {
    // окно закрыли — ничего не делаем
  }
}

/** Экран для исследования: какие сырые данные мессенджеры и аккаунты кладут в телефонную книгу. */
export default function SourcesScreen() {
  const [accounts, setAccounts] = useState<RawAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const init = useCallback(async () => {
    setError(null);
    try {
      if (!isSample) {
        const perm = await requestPermissionsAsync();
        if (!perm.granted) {
          setError('Нет доступа к контактам. Разреши его в настройках телефона.');
          return;
        }
      }
      setAccounts(await loadAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (contactsRawAvailable || isSample) init();
  }, [init]);

  const open = async (title: string, list: RawAccount[], mime?: RegExp) => {
    setBusy(title);
    setResult(null);
    try {
      const types = [...new Set(list.map((a) => a.accountType))];
      let dumps = await Promise.all(types.map(loadDump));
      if (mime) dumps = filterDumpsByMime(dumps, mime);
      setResult({ title, dumps, text: formatDump(title, dumps) });
    } catch (e) {
      setResult({ title, dumps: [], text: `Ошибка: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  };

  if (!contactsRawAvailable && !isSample) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Доступно только в Android-приложении</Text>
          <Text style={styles.muted}>
            Этот экран читает телефонную книгу Android напрямую, со служебными данными мессенджеров. На iOS система
            таких данных не даёт, а в Expo Go нет нужного модуля — нужен собранный APK.
          </Text>
        </Card>
      </ScrollView>
    );
  }

  const sourceButton = (s: SourceDef) => {
    // Источник без своего аккаунта (Viber) ищем по типам данных во всех аккаунтах.
    const byMime = !!s.mime && !!accounts?.length && !(accounts && accountsFor(s, accounts).length);
    const found = accounts ? (byMime ? accounts : accountsFor(s, accounts)) : [];
    const count = found.reduce((n, a) => n + a.rawContacts, 0);
    return (
      <Pressable
        key={s.key}
        disabled={!found.length || !!busy}
        onPress={() => open(s.title, found, s.mime)}
        style={({ pressed }) => [
          styles.card,
          styles.row,
          { paddingVertical: 12 },
          !found.length && { opacity: 0.5 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={{ fontSize: 24 }}>{s.emoji}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.muted}>
            {byMime
              ? 'своего аккаунта нет — ищу его записи во всех контактах'
              : found.length
                ? `${count} ${plural(count, 'запись', 'записи', 'записей')} · ${found.map((a) => a.accountType || 'без аккаунта').join(', ')}`
                : 'не найдено на телефоне'}
          </Text>
          {!found.length && s.note && <Text style={[styles.muted, { fontSize: 12 }]}>{s.note}</Text>}
        </View>
        {busy === s.title ? <ActivityIndicator color={colors.primary} /> : found.length ? <Text style={styles.muted}>›</Text> : null}
      </Pressable>
    );
  };

  // Один тип аккаунта может встречаться с разными именами — кнопка одна на тип.
  const others = [...new Map((accounts ? otherAccounts(accounts) : []).map((a) => [a.accountType, a])).values()];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ gap: 6, backgroundColor: isSample ? colors.amberSoft : colors.card }}>
        <Text style={[styles.muted, isSample && { color: colors.amber }]}>
          {isSample
            ? 'Это пример формата на выдуманных данных: в браузере нет телефонной книги. В Android-приложении здесь будут настоящие данные.'
            : 'Только чтение. Показывает, что мессенджеры и аккаунты записали в телефонную книгу. Ничего никуда не отправляется, пока ты сам не нажмёшь «Поделиться» — там будут имена и номера.'}
        </Text>
      </Card>

      {error && (
        <Card style={{ gap: 8, borderColor: colors.danger }}>
          <Text style={{ color: colors.danger }}>{error}</Text>
          <Button title="Ещё раз" variant="secondary" onPress={init} />
        </Card>
      )}

      {!accounts && !error && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}

      {accounts && (
        <>
          <SectionTitle>Источники</SectionTitle>
          {SOURCES.map(sourceButton)}
          {others.length > 0 && (
            <>
              <SectionTitle>Другие аккаунты на телефоне</SectionTitle>
              {others.map((a) =>
                sourceButton({ key: `o-${a.accountType}-${a.accountName}`, title: a.accountType, emoji: '🗂️', match: (t) => t === a.accountType }),
              )}
            </>
          )}
          <Button
            title={`🧾 Все аккаунты сразу (до ${LIMIT} на каждый)`}
            variant="secondary"
            onPress={() => open('Все аккаунты', accounts)}
          />
        </>
      )}

      {result && (
        <>
          <SectionTitle>{result.title}</SectionTitle>
          <Card style={{ gap: 4 }}>
            {mimeStats(result.dumps.flatMap((d) => d.items)).map(([m, n]) => (
              <View key={m} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[mono, { flex: 1 }]}>{m}</Text>
                <Text style={[mono, { fontWeight: '700' }]}>{n}</Text>
              </View>
            ))}
          </Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Поделиться текстом" onPress={() => share(result.text)} style={{ flex: 1 }} />
            <Button
              title="JSON"
              variant="secondary"
              onPress={() => share(JSON.stringify(result.dumps, null, 1))}
              style={{ width: 90 }}
            />
          </View>
          <Card>
            <Text style={mono} selectable>
              {result.text.length > SHOW_LIMIT ? result.text.slice(0, SHOW_LIMIT) + '\n…(дальше — через «Поделиться»)' : result.text}
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
