import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Card, Field, colors, styles } from '@/components/ui';
import { Telegram, fetchTelegramPeople, startTelegram, telegramAvailable, telegramConfigured } from '@/lib/telegramClient';
import { setPendingImport, tgErrorText, tgToRawContact } from '@/lib/telegramImport';
import type { TgAuthState } from '../../modules/telegram';

type Phase = 'intro' | 'auth' | 'loading' | 'finishing';

const UNSUPPORTED: Record<string, string> = {
  waitEmailAddress: 'Telegram просит привязать почту ко входу. Сделай это в самом Telegram и попробуй снова.',
  waitEmailCode: 'Telegram прислал код на почту. Такой вход пока не поддерживается — войди через код из Telegram или SMS.',
  waitRegistration: 'На этот номер нет аккаунта Telegram.',
  waitOtherDeviceConfirmation: 'Telegram просит подтвердить вход на другом устройстве. Попробуй ещё раз позже.',
  waitPremiumPurchase: 'Telegram требует Premium для входа с этого номера.',
};

export default function TelegramImportScreen() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [auth, setAuth] = useState<TgAuthState>({ state: 'none' });
  const [phone, setPhone] = useState('+');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);

  const started = useRef(false);
  const done = useRef(false);
  const cancelled = useRef(false);
  const authRef = useRef(auth);
  authRef.current = auth;

  // Подписка на смену состояния входа.
  useEffect(() => {
    if (!Telegram) return;
    const sub = Telegram.addListener('onAuthState', (s) => setAuth(s));
    return () => sub.remove();
  }, []);

  /** Выйти/стереть сессию — вызывается при отмене, ошибке и уходе с экрана. */
  const cleanup = useCallback(async () => {
    if (!Telegram || !started.current) return;
    started.current = false;
    try {
      if (authRef.current.state === 'ready') await Telegram.logOut();
      else if (authRef.current.state !== 'closed') await Telegram.destroy();
    } catch {
      // уже закрыт
    }
  }, []);

  useEffect(
    () => () => {
      cancelled.current = true;
      if (!done.current) cleanup();
    },
    [cleanup],
  );

  // Когда вход завершён — загружаем контакты и сразу выходим.
  useEffect(() => {
    if (auth.state !== 'ready' || phase === 'loading' || phase === 'finishing') return;
    setPhase('loading');
    (async () => {
      try {
        const { people, partial } = await fetchTelegramPeople((d, t) => setProgress([d, t]), () => cancelled.current);
        if (cancelled.current) return;
        setPendingImport({ label: 'Telegram', contacts: people.map(tgToRawContact), partial });
        setPhase('finishing');
        await cleanup();
        done.current = true;
        router.replace({ pathname: '/import', params: { source: 'telegram' } });
      } catch (e) {
        setError(tgErrorText(e));
        setPhase('auth');
        await cleanup();
      }
    })();
  }, [auth.state, phase, cleanup]);

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

  const begin = () =>
    run(async () => {
      started.current = true;
      setPhase('auth');
      const s = await startTelegram();
      setAuth((prev) => (prev.state === 'none' ? s : prev));
    });

  const cancel = async () => {
    cancelled.current = true;
    await cleanup();
    done.current = true;
    router.back();
  };

  if (!telegramAvailable || !telegramConfigured) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Импорт из Telegram недоступен</Text>
          <Text style={styles.muted}>
            {!telegramAvailable
              ? 'Нужна Android-версия приложения с библиотекой Telegram (TDLib). В браузере, Expo Go и на iOS её пока нет.'
              : 'В этой сборке не заданы ключи Telegram API (TG_API_ID и TG_API_HASH).'}
          </Text>
        </Card>
      </View>
    );
  }

  const s = auth.state;
  const unsupported = UNSUPPORTED[s];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Импорт из Telegram' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {phase === 'intro' && (
          <>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 40, textAlign: 'center' }}>✈️</Text>
              <Text style={[styles.title, { textAlign: 'center', fontSize: 18 }]}>Контакты и дни рождения из Telegram</Text>
              <Text style={[styles.muted, { lineHeight: 20 }]}>
                Войди в свой Telegram — приложение загрузит контакты с их днями рождения (у кого они открыты), а потом
                ты выберешь, кого добавить.
              </Text>
            </Card>
            <Card style={{ gap: 6 }}>
              <Text style={styles.title}>🔒 Что происходит с аккаунтом</Text>
              <Text style={[styles.muted, { lineHeight: 20 }]}>
                • Используется официальная библиотека Telegram (TDLib).{'\n'}• Читаются только контакты и их профили —
                не сообщения и не чаты.{'\n'}• Сразу после загрузки приложение выходит из аккаунта, сессия не
                сохраняется.{'\n'}• Telegram может прислать уведомление о входе с нового устройства — это нормально.
              </Text>
            </Card>
            <Button title="Войти в Telegram" onPress={begin} />
          </>
        )}

        {phase === 'auth' && (
          <>
            {(s === 'none' || s === 'starting' || s === 'waitTdlibParameters') && !error && (
              <View style={{ alignItems: 'center', gap: 8, marginTop: 24 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.muted}>Подключаюсь к Telegram…</Text>
              </View>
            )}

            {s === 'waitPhoneNumber' && (
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
            )}

            {s === 'waitCode' && (
              <Card>
                <Text style={[styles.muted, { marginBottom: 12, lineHeight: 20 }]}>
                  {auth.codeType?.includes('TelegramMessage')
                    ? 'Код пришёл в приложение Telegram (чат «Telegram»). Не пересылай его никому.'
                    : 'Код отправлен по SMS или в Telegram.'}
                </Text>
                <Field
                  label="Код"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  autoFocus
                  maxLength={8}
                />
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
          </>
        )}

        {(phase === 'loading' || phase === 'finishing') && (
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.title}>
              {phase === 'finishing' ? 'Выхожу из аккаунта…' : 'Загружаю контакты и дни рождения…'}
            </Text>
            {progress && (
              <Text style={styles.muted}>
                {progress[0]} из {progress[1]}
              </Text>
            )}
          </Card>
        )}

        {error && (
          <Card style={{ borderColor: colors.danger }}>
            <Text style={{ color: colors.danger, lineHeight: 20 }}>{error}</Text>
          </Card>
        )}

        {phase !== 'intro' && phase !== 'finishing' && <Button title="Отмена" variant="danger" onPress={cancel} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
