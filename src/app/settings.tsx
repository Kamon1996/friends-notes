import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { AccentDots } from '@/components/AccentPicker';
import { DateField } from '@/components/DateField';
import { Icon } from '@/components/Icon';
import { Button, Card, Group, IconCircle, ListRow, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { smartCalendarOn } from '@/lib/calendarAi';
import { calendarItems } from '@/lib/calendarPlan';
import { APP_VERSION } from '@/lib/changelog';
import { confirm, notify } from '@/lib/confirm';
import { sendTestReport } from '@/lib/crashReports';
import { loadEnrichment } from '@/lib/contacts';
import { describeBackup, restoredData } from '@/lib/backup';
import { cleanupAfterRestore, pickBackup, saveBackup, writeRestoredPhotos } from '@/lib/backupFiles';
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
import { daysBetween, formatDate, toISODate, todayISO } from '@/lib/dates';
import { useStore } from '@/lib/store';
import { zodiacShown } from '@/lib/zodiac';
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
  const { data, updateSettings, updateFriends, replaceData } = useStore();
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

  // Резервная копия: сохранить в файл и восстановить из файла.
  const [backupProgress, setBackupProgress] = useState<{ done: number; total: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const saveCopy = async () => {
    if (backupProgress || restoring) return;
    if (!data.friends.length && !data.reminders.length) {
      notify('Пока нечего сохранять', 'Добавь друзей или напоминания.');
      return;
    }
    setBackupProgress({ done: 0, total: 0 });
    try {
      await saveBackup(data, (done, total) => setBackupProgress({ done, total }));
      updateSettings({ lastBackupAt: new Date().toISOString() });
    } catch (e) {
      notify('Не получилось сохранить копию', errorText(e));
    } finally {
      setBackupProgress(null);
    }
  };

  const restoreCopy = async () => {
    if (backupProgress || restoring) return;
    let backup;
    try {
      backup = await pickBackup();
    } catch (e) {
      notify('Не получилось открыть файл', errorText(e));
      return;
    }
    if (!backup) return;
    if (!backup.ok) {
      notify('Не получилось восстановить', backup.error);
      return;
    }
    const from = backup.createdAt ? `Копия от ${formatDate(toISODate(backup.createdAt))}` : 'В копии';
    if (!(await confirm('Восстановить копию?', `${from}: ${describeBackup(backup)}.\nВсё, что сейчас в приложении, заменится.`, 'Восстановить'))) return;
    setRestoring(true);
    try {
      const next = restoredData(data, { ...backup, data: await writeRestoredPhotos(backup) });
      await replaceData(next);
      // Фото прежних данных удаляем чуть позже — когда новые данные уже записаны.
      setTimeout(() => cleanupAfterRestore(next), 3000);
      notify('Копия восстановлена', `${describeBackup(backup)}.`);
    } catch (e) {
      notify('Не получилось восстановить', errorText(e));
    } finally {
      setRestoring(false);
    }
  };

  const lastBackup = settings.lastBackupAt ? toISODate(new Date(settings.lastBackupAt)) : null;
  const today = todayISO();
  // Друзей уже немало, а копии нет или она старше трёх месяцев — подсвечиваем строку.
  const backupDue = data.friends.length >= 5 && (!lastBackup || daysBetween(lastBackup, today) > 90);
  const backupSubtitle = backupProgress
    ? backupProgress.total
      ? `Собираю фото: ${backupProgress.done} из ${backupProgress.total}…`
      : 'Готовлю файл…'
    : lastBackup
      ? `Последняя — ${formatDate(lastBackup, lastBackup.slice(0, 4) !== today.slice(0, 4))}`
      : 'Друзья, даты, напоминания и фото';

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
          <ListRow
            leading={<IconCircle icon="stars" />}
            title="Знаки зодиака"
            subtitle="В карточке, в списке и в «Сегодня»"
            trailing={
              <Switch
                value={zodiacShown(settings)}
                onValueChange={(on) => updateSettings({ showZodiac: on })}
                trackColor={{ true: colors.accent, false: colors.checkbox }}
                thumbColor="#fff"
                accessibilityLabel="Показывать знаки зодиака"
                {...({ activeThumbColor: '#fff' } as object)}
              />
            }
            onPress={() => updateSettings({ showZodiac: !zodiacShown(settings) })}
          />
        </Group>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Календарь</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          <SwitchRow
            icon="stars"
            label="Умный календарь"
            sub="Магия сама решает, какие дела — встречи и записи, и показывает их во вкладке «Календарь». На разбор уходят только названия дел."
            value={smartCalendarOn(settings)}
            onChange={(v) => updateSettings({ smartCalendar: v })}
          />
        </Card>
        <Card style={{ paddingVertical: 4 }}>
          <SwitchRow
            icon="info"
            label="Обозначения под календарём"
            sub="Что значат значки и сколько чего в месяце."
            value={settings.calendarLegend !== false}
            onChange={(v) => updateSettings({ calendarLegend: v })}
          />
        </Card>
        {deviceCalendarAvailable && (
          <Card style={{ paddingVertical: 4 }}>
            <SwitchRow
              icon="calendar"
              label="Дни рождения в календаре"
              sub="Samsung и Google, с возрастом"
              value={!!settings.calendarSync}
              onChange={toggleCalendar}
            />
            {calendarLine && (
              <>
                {/* Разделитель — от колонки текста до края карточки, как между строками списка. */}
                <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 48, marginRight: -14 }} />
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10 }} accessibilityLiveRegion="polite">
                  {/* Значок — по центру колонки иконок, под значком календаря. */}
                  <View style={{ width: 36, alignItems: 'center', paddingTop: 2 }}>
                    <Icon
                      name={calendarLine.icon}
                      size={18}
                      strokeWidth={2}
                      color={calendarLine.tone === 'danger' ? colors.danger : calendarLine.tone === 'warn' ? colors.warn : calendarLine.icon === 'check' ? colors.success : colors.text3}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.body, { fontSize: 15 }, calendarLine.tone !== 'muted' && { color: calendarLine.tone === 'danger' ? colors.danger : colors.warn }]}>
                      {calendarLine.title}
                    </Text>
                    {calendarLine.sub && <Text style={s.muted}>{calendarLine.sub}</Text>}
                  </View>
                </View>
              </>
            )}
            {calendarLine?.needsAccess && (
              // Действие карточки — её футер: на всю ширину, с линией сверху, как кнопка внизу диалога.
              <Pressable
                onPress={fixCalendarAccess}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  marginHorizontal: -14,
                  marginBottom: -4,
                  minHeight: 50,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderTopWidth: 1,
                  borderTopColor: colors.hairline,
                  borderBottomLeftRadius: 19,
                  borderBottomRightRadius: 19,
                  backgroundColor: pressed ? colors.chip : 'transparent',
                })}
              >
                <Text style={[s.title, { color: colors.accent }]}>Разрешить доступ</Text>
              </Pressable>
            )}
          </Card>
        )}
        <Group inset={62}>
          <ListRow leading={<IconCircle icon="share" />} title="Выгрузить даты" subtitle="Файл .ics для любого календаря" chevron onPress={exportFile} />
        </Group>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Резервная копия</SectionTitle>
        <Group inset={62}>
          <ListRow
            leading={<IconCircle icon="archive" />}
            title="Сохранить копию"
            subtitle={<Text style={[s.muted, backupDue && !backupProgress && { color: colors.warn }]}>{backupDue && !lastBackup && !backupProgress ? 'Ещё ни разу — стоит сохранить' : backupSubtitle}</Text>}
            chevron
            onPress={saveCopy}
          />
          <ListRow
            leading={<IconCircle icon="import" />}
            title="Восстановить из копии"
            subtitle={restoring ? 'Восстанавливаю…' : 'Заменит данные в приложении'}
            chevron
            onPress={restoreCopy}
          />
        </Group>
        {Platform.OS === 'android' && (
          <Text style={[s.muted, { paddingHorizontal: 4, lineHeight: 18 }]}>Android тоже хранит копию в Google, если это включено в настройках телефона.</Text>
        )}
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
