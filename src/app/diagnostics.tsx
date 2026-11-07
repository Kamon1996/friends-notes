import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button, Card, IconCircle, useTheme } from '@/components/ui';
import { DEVELOPER_TELEGRAM, buildReportText, telegramReportUrl, type ReportInfo } from '@/lib/bugReport';
import { APP_VERSION } from '@/lib/changelog';
import { lastCrashId } from '@/lib/crashReports';
import { useStore } from '@/lib/store';

const mono = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 12, lineHeight: 17 } as const;

/** Что известно о телефоне без лишних разрешений: система, версия, модель. */
function reportInfo(): ReportInfo {
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  if (Platform.OS === 'android') {
    return { version: APP_VERSION, os: 'Android', osVersion: str('Release'), device: [str('Manufacturer') || str('Brand'), str('Model')].filter(Boolean).join(' ') || 'телефон', crashId: lastCrashId() };
  }
  if (Platform.OS === 'ios') return { version: APP_VERSION, os: 'iOS', osVersion: str('osVersion'), device: 'iPhone', crashId: lastCrashId() };
  return { version: APP_VERSION, os: 'Web', osVersion: '', device: 'браузер' };
}

/** «Сообщить о проблеме»: открывает чат с разработчиком в Telegram с уже подставленной шапкой. */
export default function ReportScreen() {
  const { s, colors } = useTheme();
  const { data } = useStore();
  const [copied, setCopied] = useState(false);
  const text = buildReportText(reportInfo());

  const write = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
    } catch {
      // Буфер недоступен — ничего, текст уже в ссылке.
    }
    try {
      await Linking.openURL(telegramReportUrl(DEVELOPER_TELEGRAM, text));
    } catch {
      Alert.alert('Не получилось открыть Telegram', `Напиши мне на @${DEVELOPER_TELEGRAM}, текст сообщения уже скопирован.`);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Card style={{ gap: 12 }}>
        <View style={s.row}>
          <IconCircle icon="send" tone="accent" />
          <Text style={[s.title, { flex: 1 }]}>Напиши мне в Telegram</Text>
        </View>
        <Text style={[s.muted, { lineHeight: 20 }]}>
          Расскажи, что пошло не так и как это повторить. Скриншот очень поможет. Начало сообщения уже готово: по нему я сразу пойму, что это из
          «Друзей», какая версия и какой телефон.
        </Text>
        <View style={{ backgroundColor: colors.chip, borderRadius: 12, padding: 12 }}>
          <Text style={[mono, { color: colors.text }]} selectable>
            {text.trimEnd()}
          </Text>
        </View>
        <Button title="Написать в Telegram" icon="send" onPress={write} />
        <Text style={s.caption}>
          {copied ? 'Текст скопирован. Если чат открылся пустым, просто вставь его.' : `Откроется чат с @${DEVELOPER_TELEGRAM}; текст заодно скопируется в буфер.`}
        </Text>
      </Card>
      {!data.settings.crashReports && (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4 }}>
          <Icon name="info" size={16} color={colors.text3} />
          <Text style={[s.caption, { flex: 1 }]}>Отчёты о сбоях выключены в настройках. Если приложение падало, включи их: тогда я увижу подробности сбоя.</Text>
        </View>
      )}
    </ScrollView>
  );
}
