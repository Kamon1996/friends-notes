import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { QrCode } from '@/components/QrCode';
import { Button, Card, Field, SectionTitle, colors, styles } from '@/components/ui';
import { telegramAvailable, telegramConfigured } from '@/lib/telegramClient';
import { tgErrorText } from '@/lib/telegramImport';
import { useTelegramSession } from '@/lib/telegramSession';
import { Telegram } from '../../modules/telegram';

const SESSION_NAME = 'Друзья · импорт контактов';
const SOURCE_URL = 'https://github.com/Kamon1996/friends-notes/tree/claude/mobile-project-creation-pgqs46/modules/telegram';

const UNSUPPORTED: Record<string, string> = {
  waitEmailAddress: 'Telegram просит привязать почту ко входу. Сделай это в самом Telegram и попробуй снова.',
  waitEmailCode: 'Telegram прислал код на почту. Такой вход пока не поддерживается — войди через код из Telegram или SMS.',
  waitRegistration: 'На этот номер нет аккаунта Telegram.',
  waitPremiumPurchase: 'Telegram требует Premium для входа с этого номера.',
};

function Line({ icon, children }: { icon: string; children: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ width: 22 }}>{icon}</Text>
      <Text style={{ flex: 1, color: colors.text, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export default function TelegramImportScreen() {
  const tg = useTelegramSession();
  const [phone, setPhone] = useState('+');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(tgErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const loginPossible = telegramAvailable && telegramConfigured;
  const { auth, imp } = tg;
  const finished = imp.phase === 'done' || imp.phase === 'cancelled' || imp.phase === 'error';
  const unsupported = UNSUPPORTED[auth.state];

  // ---------- Загрузка идёт ----------
  if (tg.working) {
    const done = imp.done ?? 0;
    const total = imp.total ?? 0;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Импорт из Telegram' }} />
        <Card style={{ gap: 10 }}>
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.title, { flex: 1 }]}>
              {imp.phase === 'finishing' ? 'Выхожу из аккаунта Telegram…' : total ? `Загружаю контакты: ${done} из ${total}` : 'Получаю список контактов…'}
            </Text>
          </View>
          {total > 0 && (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round((done / total) * 100)}%`, height: 8, backgroundColor: colors.primary }} />
            </View>
          )}
          {!!imp.waitingSeconds && (
            <Text style={styles.muted}>Telegram попросил паузу на {imp.waitingSeconds} с — продолжу автоматически.</Text>
          )}
          <Text style={[styles.muted, { lineHeight: 20 }]}>
            Можно свернуть приложение или открыть другие вкладки — загрузка продолжится. Прогресс виден в уведомлении и
            внизу экрана.
          </Text>
        </Card>

        <SectionTitle>Что запрошено у Telegram</SectionTitle>
        <Card style={{ gap: 6 }}>
          <Line icon="📒">{`Список контактов: ${imp.requestsContacts ?? 0}`}</Line>
          <Line icon="👤">{`Профили (имя, телефон, @username): ${imp.requestsUsers ?? 0}`}</Line>
          <Line icon="🎂">{`Полные профили (день рождения, «о себе»): ${imp.requestsProfiles ?? 0}`}</Line>
          <Line icon="📷">{`Аватарки (маленькая и большая версии): ${imp.requestsPhotos ?? 0}`}</Line>
          <Line icon="💬">{`Сообщения и чаты: ${imp.requestsMessages ?? 0} — в приложении нет такой функции`}</Line>
        </Card>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="К друзьям" variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
          {imp.phase === 'loading' && <Button title="Остановить" variant="danger" onPress={tg.cancel} style={{ flex: 1 }} />}
        </View>
      </ScrollView>
    );
  }

  // ---------- Готово: сессия завершена ----------
  if (finished) {
    const count = imp.done ?? 0;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Импорт из Telegram' }} />
        {imp.loggedOut ? (
          <Card style={{ gap: 8, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
            <Text style={[styles.title, { color: colors.green }]}>✓ Сессия Telegram завершена</Text>
            <Text style={{ color: colors.text, lineHeight: 20 }}>
              Приложение вышло из аккаунта и стёрло данные входа. Проверь сам: Telegram → Настройки → Устройства —
              сессии «{SESSION_NAME}» там больше нет.
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: 8, backgroundColor: colors.amberSoft, borderColor: colors.amberSoft }}>
            <Text style={[styles.title, { color: colors.amber }]}>⚠️ Проверь, что сессия завершена</Text>
            <Text style={{ color: colors.text, lineHeight: 20 }}>
              Не удалось подтвердить выход из аккаунта. Открой Telegram → Настройки → Устройства и, если там есть
              «{SESSION_NAME}», нажми «Завершить сеанс».
            </Text>
          </Card>
        )}

        {imp.phase === 'error' && (
          <Card style={{ borderColor: colors.danger }}>
            <Text style={{ color: colors.danger, lineHeight: 20 }}>Загрузка прервалась: {tgErrorText(imp.error)}</Text>
          </Card>
        )}
        {imp.partial && (
          <Text style={styles.muted}>Telegram попросил сделать паузу, поэтому дни рождения загружены не у всех.</Text>
        )}

        {count > 0 ? (
          <Button
            title={`Выбрать, кого добавить (${count})`}
            onPress={() => router.replace({ pathname: '/import', params: { source: 'telegram' } })}
          />
        ) : (
          <Text style={styles.muted}>Контакты не загружены.</Text>
        )}
        <Button title="Начать заново" variant="secondary" onPress={tg.clearResult} />
      </ScrollView>
    );
  }

  // ---------- Вход ----------
  if (tg.signingIn || unsupported) {
    const s = auth.state;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack.Screen options={{ title: 'Вход в Telegram' }} />
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {(s === 'starting' || s === 'waitTdlibParameters') && (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 24 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Подключаюсь к Telegram…</Text>
            </View>
          )}

          {s === 'waitPhoneNumber' && (
            <>
              <Card>
                <Field
                  label="Номер телефона, привязанный к Telegram"
                  value={phone}
                  onChangeText={(v) => setPhone('+' + v.replace(/[^\d]/g, ''))}
                  keyboardType="phone-pad"
                  autoFocus
                  placeholder="+7 999 123 45 67"
                />
                <Button title={busy ? 'Отправляю…' : 'Получить код'} onPress={() => run(() => Telegram!.setPhoneNumber(phone))} />
              </Card>
              <Card style={{ gap: 8 }}>
                <Text style={styles.title}>📷 Или QR-код — без ввода кода и пароля</Text>
                <Text style={[styles.muted, { lineHeight: 20 }]}>
                  Если есть второй телефон или планшет, где ты уже вошёл в Telegram: покажи QR-код здесь и отсканируй его
                  там. Подтверждение происходит в твоём Telegram, ничего вводить в это приложение не нужно. На этом же
                  телефоне QR отсканировать нельзя — Telegram так не умеет.
                </Text>
                <Button title={busy ? 'Готовлю QR-код…' : 'Показать QR-код'} variant="secondary" onPress={() => run(() => Telegram!.requestQrCode())} />
              </Card>
            </>
          )}

          {s === 'waitOtherDeviceConfirmation' && (
            <Card style={{ gap: 12, alignItems: 'center' }}>
              {auth.link ? <QrCode value={auth.link} size={240} /> : <ActivityIndicator color={colors.primary} />}
              <View style={{ gap: 6, alignSelf: 'stretch' }}>
                <Line icon="1️⃣">На втором телефоне или планшете открой Telegram → Настройки → Устройства.</Line>
                <Line icon="2️⃣">Нажми «Подключить устройство» (сканировать QR) и наведи камеру на этот код.</Line>
                <Line icon="3️⃣">{`Telegram покажет вход «${SESSION_NAME}» — подтверди его. Если включён облачный пароль, его попросят здесь.`}</Line>
              </View>
              <Text style={[styles.muted, { alignSelf: 'stretch' }]}>Код обновляется сам каждые ~30 секунд, так что просто держи экран открытым.</Text>
              <Button title="Ввести номер вместо этого" variant="secondary" onPress={() => run(tg.restart)} style={{ alignSelf: 'stretch' }} />
            </Card>
          )}

          {s === 'waitCode' && (
            <Card>
              <Text style={[styles.muted, { marginBottom: 12, lineHeight: 20 }]}>
                {auth.codeType?.includes('TelegramMessage')
                  ? 'Код пришёл в приложение Telegram (чат «Telegram»). Можно свернуть «Друзья», посмотреть код и вернуться — вход не прервётся. Никому не пересылай этот код.'
                  : 'Код отправлен по SMS или в Telegram.'}
              </Text>
              <Field label="Код" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" autoFocus maxLength={8} />
              <Button title={busy ? 'Проверяю…' : 'Войти'} onPress={() => run(() => Telegram!.checkCode(code))} />
            </Card>
          )}

          {s === 'waitPassword' && (
            <Card>
              <Text style={[styles.muted, { marginBottom: 12 }]}>
                Включена двухэтапная аутентификация — введи облачный пароль Telegram.
                {auth.passwordHint ? `\nПодсказка: ${auth.passwordHint}` : ''}
              </Text>
              <Field label="Облачный пароль" value={password} onChangeText={setPassword} secureTextEntry autoFocus />
              <Button title={busy ? 'Проверяю…' : 'Войти'} onPress={() => run(() => Telegram!.checkPassword(password))} />
            </Card>
          )}

          {unsupported && (
            <Card>
              <Text style={{ color: colors.danger, lineHeight: 20 }}>{unsupported}</Text>
            </Card>
          )}
          {error && (
            <Card style={{ borderColor: colors.danger }}>
              <Text style={{ color: colors.danger, lineHeight: 20 }}>{error}</Text>
            </Card>
          )}
          <Button title="Отменить вход" variant="danger" onPress={tg.cancel} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---------- Выбор способа ----------
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Импорт из Telegram' }} />

      <Card style={{ gap: 8 }}>
        <Text style={[styles.title, { fontSize: 17 }]}>📒 Без входа — быстро и безопасно</Text>
        <Text style={[styles.muted, { lineHeight: 20 }]}>
          Возьмём из телефонной книги контакты, которые туда добавил Telegram: имя, номер и кнопку «Написать в
          Telegram». Ни кода, ни пароля не нужно. Дней рождения так не получить.
        </Text>
        <Button title="Выбрать контакты из Telegram" onPress={() => router.push({ pathname: '/import', params: { source: 'tgbook' } })} />
      </Card>

      <SectionTitle>С днями рождения</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Text style={[styles.title, { fontSize: 17 }]}>🎂 Через вход в Telegram</Text>
        <View style={{ backgroundColor: colors.amberSoft, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: colors.text, lineHeight: 20 }}>
            ⚠️ Telegram не умеет давать ограниченный доступ: любой вход по коду — это полный доступ к аккаунту, как у
            любого приложения-клиента Telegram. Поэтому «Друзья» устроены так:
          </Text>
        </View>
        <Line icon="✅">Читает: список контактов, имена и телефоны, @username, дни рождения, «о себе», текущие аватарки.</Line>
        <Line icon="❌">
          Не читает: сообщения, чаты и группы, файлы и фото из переписок. Таких функций в приложении нет — даже по ошибке их не вызвать.
        </Line>
        <Line icon="🔒">Сразу после загрузки выходит из аккаунта. Своего сервера нет — всё остаётся на этом телефоне.</Line>
        <Line icon="📷">Войти можно по номеру с кодом или по QR-коду со второго устройства — тогда код и пароль в это приложение вводить не нужно.</Line>
        <Line icon="👀">{`В Telegram → Настройки → Устройства вход виден как «${SESSION_NAME}» и пропадёт после выхода.`}</Line>
        <Pressable onPress={() => Linking.openURL(SOURCE_URL).catch(() => {})} hitSlop={6}>
          <Text style={{ color: colors.blue }}>Исходный код модуля Telegram →</Text>
        </Pressable>
        {loginPossible ? (
          <Button title={busy ? 'Подключаюсь…' : 'Войти в Telegram'} onPress={() => run(tg.begin)} />
        ) : (
          <Text style={styles.muted}>
            {telegramAvailable
              ? 'В этой сборке не заданы ключи Telegram API (TG_API_ID и TG_API_HASH).'
              : 'Вход доступен только в Android-приложении.'}
          </Text>
        )}
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      </Card>
    </ScrollView>
  );
}
