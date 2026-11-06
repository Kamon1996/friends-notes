import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Share, Text } from 'react-native';

import { Button, ButtonRow, Card, SectionTitle, useTheme } from '@/components/ui';
import { Telegram } from '@/lib/telegramClient';

const mono = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11, lineHeight: 15 } as const;

/** Отчёт об ошибке: последний сбой приложения и лог Telegram (TDLib). Только на этом телефоне. */
export default function DiagnosticsScreen() {
  const { s: styles, colors } = useTheme();
  const [data, setData] = useState<{ lastCrash: string; tdlibLog: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Telegram) {
      setError('Отчёт доступен только в Android-приложении.');
      return;
    }
    try {
      setData(await Telegram.getDiagnostics());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const report = data
    ? `=== Последний сбой ===\n${data.lastCrash || '(нет)'}\n\n=== Лог Telegram (TDLib), конец ===\n${data.tdlibLog || '(пусто)'}`
    : '';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.muted, { lineHeight: 20 }]}>
          Если приложение закрылось с ошибкой — открой этот экран после перезапуска и нажми «Поделиться». В отчёте
          нет сообщений и паролей, но в логе Telegram может быть твой номер телефона.
        </Text>
      </Card>
      {error && <Text style={[styles.muted, { color: colors.danger }]}>{error}</Text>}
      {!data && !error && <ActivityIndicator color={colors.accent} />}
      {data && (
        <>
          <ButtonRow>
            <Button title="Поделиться" onPress={() => Share.share({ message: report.slice(-60_000) }).catch(() => {})} style={{ flexGrow: 1 }} />
            <Button
              title="Очистить"
              variant="secondary"
              style={{ flexGrow: 1 }}
              onPress={async () => {
                await Telegram?.clearDiagnostics();
                load();
              }}
            />
          </ButtonRow>
          <SectionTitle>Последний сбой</SectionTitle>
          <Card>
            <Text style={mono} selectable>
              {data.lastCrash || 'Сбоев не записано.'}
            </Text>
          </Card>
          <SectionTitle>Лог Telegram (TDLib)</SectionTitle>
          <Card>
            <Text style={mono} selectable>
              {data.tdlibLog ? data.tdlibLog.slice(-15_000) : 'Лог пуст — импорт из Telegram ещё не запускался.'}
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
