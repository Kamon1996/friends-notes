import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { AccentDots } from '@/components/AccentPicker';
import { DateField } from '@/components/DateField';
import { Icon } from '@/components/Icon';
import { Button, Card, Group, IconCircle, ListRow, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { calendarItems } from '@/lib/calendarPlan';
import { APP_VERSION } from '@/lib/changelog';
import { notify } from '@/lib/confirm';
import { sendTestReport } from '@/lib/crashReports';
import { loadEnrichment } from '@/lib/contacts';
import { calendarStatus, type CalendarSummary } from '@/lib/calendarSync';
import {
  calendarPermissionGranted,
  calendarSummary,
  deviceCalendarAvailable,
  requestCalendarPermission,
  subscribeCalendarSummary,
  syncDeviceCalendar,
} from '@/lib/deviceCalendar';
import { applyEnrichment } from '@/lib/enrich';
import { exportDates } from '@/lib/exportDates';
import { notificationsAllowed, setupNotifications } from '@/lib/notifications';
import { useStore } from '@/lib/store';
import { accentById } from '@/lib/theme';
import type { ThemeMode } from '@/lib/types';

const MODE_LABEL: Record<ThemeMode, string> = { system: 'Как в системе', light: 'Светлая', dark: 'Тёмная' };

/** «Терракота и Мёд», а при одинаковом цвете — просто «Терракота». */
function accentNames(light: string, dark: string): string {
  const l = accentById(light).name;
  const d = accentById(dark).name;
  return l === d ? l : `${l} и ${d}`;
}

export default function SettingsScreen() {
  const { data, updateSettings, updateFriends } = useStore();
  const { s, colors } = useTheme();
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);

  const enrich = async () => {
    setEnrichStatus('…');
    try {
      const map = await loadEnrichment();
      const { friends, changed } = applyEnrichment(data.friends, map);
      if (changed) updateFriends((f) => friends.find((x) => x.id === f.id) ?? f);
      setEnrichStatus(changed ? `Обновлено друзей: ${changed}` : 'Ничего нового не нашлось');
    } catch (e) {
      setEnrichStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    notificationsAllowed().then(setAllowed);
  }, []);

  const enable = async () => {
    const ok = await setupNotifications();
    setAllowed(ok);
    if (!ok && Platform.OS !== 'web') {
      Alert.alert('Уведомления выключены', 'Разреши их в настройках телефона.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const { settings } = data;

  const [calendarAccess, setCalendarAccess] = useState<boolean | null>(null);
  const [calendarInfo, setCalendarInfo] = useState<CalendarSummary | null>(null);
  useEffect(() => {
    if (!deviceCalendarAvailable) return;
    calendarSummary().then(setCalendarInfo).catch(() => {});
    // Доступ могли забрать в настройках телефона — проверяем при открытии и при возвращении в приложение.
    const check = () => calendarPermissionGranted().then(setCalendarAccess).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    const unsubscribe = subscribeCalendarSummary(setCalendarInfo);
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, []);
  const calendarLine = calendarStatus(!!settings.calendarSync, calendarAccess, calendarInfo);

  /** Запросить доступ; если система больше не спрашивает — предложить настройки телефона. */
  const askCalendarAccess = async () => {
    const res = await requestCalendarPermission();
    setCalendarAccess(res.granted);
    if (!res.granted && !res.canAskAgain) {
      Alert.alert('Нет доступа к календарю', 'Разреши его в настройках телефона: Разрешения → Календарь.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
      ]);
    }
    return res.granted;
  };

  const toggleCalendar = async (on: boolean) => {
    if (!on) {
      updateSettings({ calendarSync: false });
      return;
    }
    if (await askCalendarAccess()) updateSettings({ calendarSync: true });
  };

  const fixCalendarAccess = async () => {
    if (await askCalendarAccess()) syncDeviceCalendar(data);
  };

  const exportFile = async () => {
    if (!calendarItems(data).length) {
      notify('Пока нечего выгружать', 'Добавь друзьям дни рождения или важные даты.');
      return;
    }
    try {
      await exportDates(data);
    } catch (e) {
      notify('Не получилось выгрузить', e instanceof Error ? e.message : String(e));
    }
  };

  // Пять быстрых нажатий на версию внизу — тестовое событие в Sentry, чтобы проверить, что отчёты доходят.
  const taps = useRef({ n: 0, at: 0 });
  const tapVersion = () => {
    const now = Date.now();
    taps.current = { n: now - taps.current.at < 1500 ? taps.current.n + 1 : 1, at: now };
    if (taps.current.n < 5) return;
    taps.current = { n: 0, at: 0 };
    const sent = sendTestReport();
    Alert.alert(sent ? 'Тестовый отчёт отправлен' : 'Отчёты о сбоях выключены', sent ? 'Через минуту он появится в Sentry.' : 'Включи их выше или дождись сборки с Sentry.');
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Уведомления</SectionTitle>
        <Card style={{ gap: 10 }}>
          {Platform.OS === 'web' ? (
            <Text style={s.muted}>В браузере уведомления не работают — открой приложение на телефоне.</Text>
          ) : (
            <>
              <View style={s.row}>
                <IconCircle icon="bell" tone={allowed ? 'success' : 'warn'} />
                <Text style={[s.title, { flex: 1 }]}>
                  {allowed === null ? '…' : allowed ? 'Уведомления включены' : 'Уведомления выключены'}
                </Text>
              </View>
              {!allowed && <Button title="Включить уведомления" onPress={enable} />}
            </>
          )}
        </Card>
        <Card style={{ paddingBottom: 6 }}>
          <DateField mode="time" label="Во сколько напоминать о датах" value={settings.eventTime} onChange={(v) => updateSettings({ eventTime: v })} />
          <SwitchRow label="Напоминать ещё и за день" value={settings.eventDayBefore} onChange={(v) => updateSettings({ eventDayBefore: v })} />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Оформление</SectionTitle>
        <Group inset={62}>
          <ListRow
            leading={<IconCircle icon="palette" tone="accent" />}
            title="Тема и цвет"
            subtitle={`${MODE_LABEL[settings.theme]} · ${accentNames(settings.accentLight, settings.accentDark)}`}
            trailing={<AccentDots light={settings.accentLight} dark={settings.accentDark} />}
            chevron
            onPress={() => router.push('/appearance')}
          />
        </Group>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Календарь</SectionTitle>
        {deviceCalendarAvailable && (
          <Card style={{ paddingVertical: 4 }}>
            <SwitchRow
              icon="calendar"
              label="Дни рождения в календаре телефона"
              sub="Свой календарь «Друзья» в Samsung и Google Календаре: дни рождения с возрастом, без напоминаний."
              value={!!settings.calendarSync}
              onChange={toggleCalendar}
            />
            {calendarLine && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, marginLeft: 48, paddingTop: 10, paddingBottom: 10, gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }} accessibilityLiveRegion="polite">
                  <View style={{ marginTop: 1 }}>
                    <Icon
                      name={calendarLine.icon}
                      size={16}
                      color={calendarLine.tone === 'danger' ? colors.danger : calendarLine.tone === 'warn' ? colors.warn : calendarLine.icon === 'check' ? colors.success : colors.text3}
                    />
                  </View>
                  <Text style={[s.muted, { flex: 1, lineHeight: 18 }, calendarLine.tone !== 'muted' && { color: calendarLine.tone === 'danger' ? colors.danger : colors.warn }]}>
                    {calendarLine.text}
                  </Text>
                </View>
                {calendarLine.needsAccess && (
                  <Button title="Разрешить доступ" variant="secondary" onPress={fixCalendarAccess} style={{ alignSelf: 'flex-start', minHeight: 40, paddingVertical: 8 }} />
                )}
              </View>
            )}
          </Card>
        )}
        <Group inset={62}>
          <ListRow leading={<IconCircle icon="share" />} title="Выгрузить даты в файл" subtitle="Файл .ics для Google Календаря на сайте и других устройств" chevron onPress={exportFile} />
        </Group>
      </View>

      {Platform.OS === 'android' && (
        <View style={{ gap: 8 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Друзья</SectionTitle>
          <Card style={{ gap: 10 }}>
            <Text style={s.muted}>
              Найти в контактах телефона Telegram, WhatsApp, Viber и фото для уже добавленных друзей — по номеру телефона.
            </Text>
            <Button title={enrichStatus === '…' ? 'Ищу…' : 'Подтянуть мессенджеры и фото'} icon="refresh" variant="secondary" onPress={enrich} />
            {enrichStatus && enrichStatus !== '…' && <Text style={s.muted}>{enrichStatus}</Text>}
          </Card>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Помощь</SectionTitle>
        <Group inset={62}>
          <ListRow leading={<IconCircle icon="list" />} title="Что нового" subtitle="История изменений по версиям" chevron onPress={() => router.push('/whats-new')} />
          <ListRow leading={<IconCircle icon="send" />} title="Сообщить о проблеме" subtitle="Написать разработчику в Telegram" chevron onPress={() => router.push('/diagnostics')} />
        </Group>
        <Card style={{ paddingVertical: 4 }}>
          <SwitchRow icon="warning" label="Отправлять отчёты о сбоях" sub="Автоматически, через Sentry: стек ошибки, версия и модель телефона. Без имён, номеров и заметок." value={settings.crashReports} onChange={(v) => updateSettings({ crashReports: v })} />
        </Card>
      </View>

      <Pressable onPress={tapVersion} accessibilityLabel={`Версия ${APP_VERSION}`}>
        <Text style={[s.caption, { textAlign: 'center', color: colors.text3 }]}>{`«Друзья» ${APP_VERSION}\nВсе данные хранятся только на этом телефоне.`}</Text>
      </Pressable>
    </ScrollView>
  );
}
