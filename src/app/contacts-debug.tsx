import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, Share, Text, TextInput, View } from 'react-native';

import { Button, Card, Empty, SectionTitle, colors, styles } from '@/components/ui';
import { collectContactsDebug, type DebugContact, type DebugReport } from '@/lib/contactsDebug';

const mono = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 12 } as const;

const json = (v: unknown) => JSON.stringify(v, null, 2);

async function share(text: string) {
  try {
    await Share.share({ message: text });
  } catch {
    // пользователь закрыл окно — ничего не делаем
  }
}

/** Экран для отладки: что именно телефон отдаёт приложению о контактах. */
export default function ContactsDebugScreen() {
  const [report, setReport] = useState<DebugReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReport(null);
    setError(null);
    try {
      setReport(await collectContactsDebug());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (report?.contacts ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [report, query]);

  if (error) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Empty emoji="⚠️" title="Ошибка" text={error} />
        <Button title="Ещё раз" onPress={load} />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Читаю всё, что есть в контактах…</Text>
      </View>
    );
  }

  // Сводка без персональных данных — её безопасно переслать.
  const summaryText = json({
    platform: report.platform,
    permission: report.permission,
    summary: report.summary,
    fieldStats: report.fieldStats,
    errors: report.errors,
  });
  const stats = Object.entries(report.fieldStats).sort((a, b) => a[0].localeCompare(b[0]));
  const total = report.contacts.length;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 6 }}>
            <Text style={styles.muted}>
              Только чтение: экран показывает, что телефон отдаёт приложению. Ничего не сохраняется и никуда не
              отправляется, пока ты сам не нажмёшь «Поделиться».
            </Text>
          </Card>

          <SectionTitle>Сводка</SectionTitle>
          <Card style={{ gap: 4 }}>
            <Text style={mono} selectable>
              {json({ platform: report.platform, ...report.summary })}
            </Text>
          </Card>

          {Object.keys(report.errors).length > 0 && (
            <>
              <SectionTitle>Ошибки</SectionTitle>
              <Card style={{ gap: 6, borderColor: colors.danger }}>
                {Object.entries(report.errors).map(([k, v]) => (
                  <Text key={k} style={[mono, { color: colors.danger }]} selectable>
                    {k}: {v}
                  </Text>
                ))}
              </Card>
            </>
          )}

          <SectionTitle>Какие поля заполнены</SectionTitle>
          <Card style={{ gap: 2 }}>
            {stats.length === 0 && <Text style={styles.muted}>Ни одного заполненного поля.</Text>}
            {stats.map(([k, n]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={mono}>{k}</Text>
                <Text style={[mono, { fontWeight: '700' }]}>
                  {n}
                  {total ? ` / ${total}` : ''}
                </Text>
              </View>
            ))}
          </Card>
          <Button title="Поделиться сводкой (без имён и номеров)" variant="secondary" onPress={() => share(summaryText)} />

          <SectionTitle>Контакты · {total}</SectionTitle>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="🔍  Найти контакт"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>
      }
      renderItem={({ item }) => (
        <DebugRow contact={item} open={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
      )}
      ListEmptyComponent={<Empty emoji="📇" title="Пусто" text="Контактов не найдено." />}
    />
  );
}

function DebugRow({ contact, open, onToggle }: { contact: DebugContact; open: boolean; onToggle: () => void }) {
  const data = { id: contact.id, legacy: contact.legacy, next: contact.next };
  return (
    <Card style={{ gap: 8, paddingVertical: 12 }}>
      <Pressable onPress={onToggle} style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={[styles.title, { flex: 1 }]}>{contact.name || '(без имени)'}</Text>
        <Text style={styles.muted}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={mono} selectable>
            {json(data)}
          </Text>
          <Button title="Поделиться этим контактом" variant="secondary" onPress={() => share(json(data))} />
        </>
      )}
    </Card>
  );
}
