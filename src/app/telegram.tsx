import { Stack, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { QrCode } from '@/components/QrCode';
import { Icon, type IconName } from '@/components/Icon';
import { Stepper, TG_STEPS } from '@/components/Stepper';
import { Button, Card, Field, IconCircle, useTheme } from '@/components/ui';
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

type Mode = 'book' | 'login';

/** Строка с иконкой слева: пункт «что читает / не читает», шаг инструкции, счётчик. */
function Line({ icon, tone = 'neutral', num, children }: { icon?: IconName; tone?: 'neutral' | 'success' | 'danger' | 'warn' | 'info'; num?: number; children: string }) {
  const { s, colors, fonts } = useTheme();
  const color = { neutral: colors.text2, success: colors.success, danger: colors.danger, warn: colors.warn, info: colors.info }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 21, alignItems: 'center', justifyContent: 'center' }}>
        {num ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.accentText }}>{num}</Text>
          </View>
        ) : icon ? (
          <Icon name={icon} size={18} color={color} strokeWidth={2} />
        ) : null}
      </View>
      <Text style={[s.body, { flex: 1, fontSize: 15, lineHeight: 21 }]}>{children}</Text>
    </View>
  );
}

/** Маленькая метка «что получишь»: галочка — есть, прочерк — нет. */
function Pill({ label, ok = true }: { label: string; ok?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 28,
        paddingLeft: 8,
        paddingRight: 10,
        borderRadius: 999,
        backgroundColor: ok ? colors.soft : colors.chip,
      }}
    >
      <Icon name={ok ? 'check' : 'minus'} size={13} color={ok ? colors.accentText : colors.text3} strokeWidth={2.4} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: ok ? colors.accentText : colors.text3 }}>{label}</Text>
    </View>
  );
}

/** Карточка-вариант на первом шаге: иконка, название, подпись, метки и кружок выбора. */
function ChoiceCard({
  icon,
  title,
  sub,
  pills,
  selected,
  disabled,
  onPress,
  note,
}: {
  icon: IconName;
  title: string;
  sub: string;
  pills: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  note?: ReactNode;
}) {
  const { s, colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        s.card,
        { gap: 10, borderWidth: 1.5, borderColor: selected ? colors.accent : colors.hairline, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={s.row}>
        <IconCircle icon={icon} tone={selected ? 'accent' : 'neutral'} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.name}>{title}</Text>
          <Text style={s.muted}>{sub}</Text>
        </View>
        {selected ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={13} color={colors.onAccent} strokeWidth={3} />
          </View>
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.checkbox }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{pills}</View>
      {note}
    </Pressable>
  );
}

/** Кольцо прогресса загрузки. */
function ProgressRing({ progress, label, sub }: { progress: number | null; label: string; sub?: string }) {
  const { colors, fonts } = useTheme();
  const size = 150;
  const r = 64;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.chip} strokeWidth={12} fill="none" />
        {progress !== null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.accent}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {progress === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={{ fontFamily: fonts.display, fontSize: 34, color: colors.text, lineHeight: 38 }}>{label}</Text>
      )}
      {sub ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text2 }}>{sub}</Text> : null}
    </View>
  );
}

function StatTile({ value, label, tone = 'neutral' }: { value: string; label: string; tone?: 'neutral' | 'accent' | 'danger' }) {
  const { s, colors, fonts } = useTheme();
  const color = tone === 'accent' ? colors.accentText : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={[s.card, { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 12 }]}>
      <Text style={{ fontFamily: fonts.display, fontSize: 24, color, lineHeight: 28 }}>{value}</Text>
      <Text style={[s.caption, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

/** Шторка «Что получает приложение» — честный рассказ про доступ, один на все шаги. */
function AccessSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 20 + insets.bottom, gap: 14 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: 'center' }} />
        <Text style={[s.h2, { fontFamily: fonts.display }]}>Что получает приложение</Text>
        <Text style={[s.muted, { lineHeight: 20 }]}>
          Telegram не умеет давать ограниченный доступ: любой вход по коду равен входу с нового телефона. Поэтому «Друзья» устроены так:
        </Text>
        <View style={{ gap: 10 }}>
          <Line icon="check" tone="success">Читает контакты: имена, телефоны, @username, дни рождения, «о себе», аватарки.</Line>
          <Line icon="close" tone="danger">Не читает сообщения, чаты, группы, файлы. Таких функций в приложении нет — даже по ошибке их не вызвать.</Line>
          <Line icon="lock">Выходит из аккаунта сразу после загрузки. Своего сервера нет, всё остаётся на телефоне.</Line>
          <Line icon="info">{`Вход виден в Telegram → Настройки → Устройства как «${SESSION_NAME}» и пропадает после выхода.`}</Line>
        </View>
        <Pressable onPress={() => Linking.openURL(SOURCE_URL).catch(() => {})} hitSlop={6}>
          <Text style={[s.muted, { color: colors.accentText, fontFamily: fonts.medium }]}>Исходный код модуля Telegram →</Text>
        </Pressable>
        <Button title="Понятно" onPress={onClose} />
      </View>
    </Modal>
  );
}

export default function TelegramImportScreen() {
  const tg = useTelegramSession();
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const loginPossible = telegramAvailable && telegramConfigured;
  const [mode, setMode] = useState<Mode>(loginPossible ? 'login' : 'book');
  const [phone, setPhone] = useState('+');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState(false);

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

  const { auth, imp } = tg;
  const finished = imp.phase === 'done' || imp.phase === 'cancelled' || imp.phase === 'error';
  const unsupported = UNSUPPORTED[auth.state];
  const step = tg.working || finished ? 3 : tg.signingIn || unsupported ? 2 : 1;
  const done = imp.done ?? 0;
  const total = imp.total ?? 0;

  // ---------- Шаг 1: способ ----------
  const chooseStep = (
    <>
      <Text style={[s.h1, { fontSize: 26, paddingHorizontal: 4 }]}>Что забрать из Telegram?</Text>
      <ChoiceCard
        icon="book"
        title="Только имена и телефоны"
        sub="Из телефонной книги, без входа"
        pills={
          <>
            <Pill label="Имя и телефон" />
            <Pill label="Кнопка «Написать»" />
            <Pill label="Дни рождения" ok={false} />
          </>
        }
        selected={mode === 'book'}
        onPress={() => setMode('book')}
      />
      <ChoiceCard
        icon="cake"
        title="С днями рождения и фото"
        sub="Нужен вход в Telegram"
        pills={
          <>
            <Pill label="Дни рождения" />
            <Pill label="Фото" />
            <Pill label="@username" />
          </>
        }
        selected={mode === 'login'}
        disabled={!loginPossible}
        onPress={() => setMode('login')}
        note={
          loginPossible ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={16} color={colors.text2} strokeWidth={2} />
              <Text style={[s.muted, { flex: 1 }]}>
                Войдём на минуту-две и сразу выйдем.{' '}
                <Text onPress={() => setAccess(true)} style={{ color: colors.accentText, fontFamily: fonts.medium }}>
                  Подробнее
                </Text>
              </Text>
            </View>
          ) : (
            <Text style={s.muted}>{telegramAvailable ? 'В этой сборке не заданы ключи Telegram API (TG_API_ID и TG_API_HASH).' : 'Вход доступен только в Android-приложении.'}</Text>
          )
        }
      />
      <Text style={[s.caption, { paddingHorizontal: 4 }]}>{`Вход виден в Telegram → Устройства как «${SESSION_NAME}» и пропадает после выхода.`}</Text>
      {error && <Text style={[s.muted, { color: colors.danger }]}>{error}</Text>}
    </>
  );

  // ---------- Шаг 2: вход ----------
  const st = auth.state;
  const loginStep = (
    <>
      <Text style={[s.h1, { fontSize: 26, paddingHorizontal: 4 }]}>Вход в Telegram</Text>
      {(st === 'starting' || st === 'waitTdlibParameters') && (
        <View style={{ alignItems: 'center', gap: 8, marginTop: 24 }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.muted}>Подключаюсь к Telegram…</Text>
        </View>
      )}

      {st === 'waitPhoneNumber' && (
        <>
          <Card>
            <Field
              label="Номер телефона, привязанный к Telegram"
              value={phone}
              onChangeText={(v) => setPhone('+' + v.replace(/[^\d]/g, ''))}
              keyboardType="phone-pad"
              autoFocus
              placeholder="+7 999 123 45 67"
              style={{ fontSize: 20, letterSpacing: 0.5 }}
            />
            <Button title={busy ? 'Отправляю…' : 'Получить код'} onPress={() => run(() => Telegram!.setPhoneNumber(phone))} disabled={busy} />
          </Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
            <Text style={s.caption}>или</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
          </View>
          <Pressable
            onPress={() => run(() => Telegram!.requestQrCode())}
            disabled={busy}
            style={({ pressed }) => [s.card, s.row, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <IconCircle icon="qr" size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.title}>QR-код со второго устройства</Text>
              <Text style={s.muted}>Без кода и пароля: подтверждение в твоём Telegram</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.checkbox} strokeWidth={2} />
          </Pressable>
          <View style={{ backgroundColor: colors.soft, borderRadius: 16, padding: 12, paddingHorizontal: 14, gap: 8 }}>
            <Line icon="check" tone="success">Прочитаем контакты, дни рождения и фото</Line>
            <Line icon="close" tone="danger">Сообщения и чаты не читаем, такого кода в приложении нет</Line>
            <Line icon="lock">Выйдем из аккаунта сразу после загрузки</Line>
            <Pressable onPress={() => setAccess(true)} hitSlop={6} style={{ paddingLeft: 34 }}>
              <Text style={[s.muted, { color: colors.accentText, fontFamily: fonts.medium }]}>Подробнее о доступе →</Text>
            </Pressable>
          </View>
        </>
      )}

      {st === 'waitOtherDeviceConfirmation' && (
        <Card style={{ gap: 12, alignItems: 'center' }}>
          {auth.link ? <QrCode value={auth.link} size={240} /> : <ActivityIndicator color={colors.accent} />}
          <View style={{ gap: 6, alignSelf: 'stretch' }}>
            <Line num={1}>На втором телефоне или планшете открой Telegram → Настройки → Устройства.</Line>
            <Line num={2}>Нажми «Подключить устройство» (сканировать QR) и наведи камеру на этот код.</Line>
            <Line num={3}>{`Telegram покажет вход «${SESSION_NAME}» — подтверди его. Если включён облачный пароль, его попросят здесь.`}</Line>
          </View>
          <Text style={[s.muted, { alignSelf: 'stretch' }]}>Код обновляется сам каждые ~30 секунд, так что просто держи экран открытым.</Text>
          <Button title="Ввести номер вместо этого" variant="secondary" onPress={() => run(tg.restart)} style={{ alignSelf: 'stretch' }} />
        </Card>
      )}

      {st === 'waitCode' && (
        <Card>
          <Text style={[s.muted, { marginBottom: 12, lineHeight: 20 }]}>
            {auth.codeType?.includes('TelegramMessage')
              ? 'Код пришёл в приложение Telegram (чат «Telegram»). Можно свернуть «Друзья», посмотреть код и вернуться — вход не прервётся. Никому не пересылай этот код.'
              : 'Код отправлен по SMS или в Telegram.'}
          </Text>
          <Field label="Код" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" autoFocus maxLength={8} style={{ fontSize: 22, letterSpacing: 4 }} />
          <Button title={busy ? 'Проверяю…' : 'Войти'} onPress={() => run(() => Telegram!.checkCode(code))} disabled={busy} />
        </Card>
      )}

      {st === 'waitPassword' && (
        <Card>
          <Text style={[s.muted, { marginBottom: 12 }]}>
            Включена двухэтапная аутентификация — введи облачный пароль Telegram.
            {auth.passwordHint ? `\nПодсказка: ${auth.passwordHint}` : ''}
          </Text>
          <Field label="Облачный пароль" value={password} onChangeText={setPassword} secureTextEntry autoFocus />
          <Button title={busy ? 'Проверяю…' : 'Войти'} onPress={() => run(() => Telegram!.checkPassword(password))} disabled={busy} />
        </Card>
      )}

      {unsupported && (
        <Card>
          <Text style={[s.body, { color: colors.danger, fontSize: 15, lineHeight: 21 }]}>{unsupported}</Text>
        </Card>
      )}
      {error && (
        <Card style={{ borderColor: colors.danger }}>
          <Text style={[s.body, { color: colors.danger, fontSize: 15, lineHeight: 21 }]}>{error}</Text>
        </Card>
      )}
    </>
  );

  // ---------- Шаг 3: загрузка и итог ----------
  const progress = imp.phase === 'finishing' || finished ? 1 : total ? done / total : null;
  const loadStep = (
    <>
      <Text style={[s.h1, { fontSize: 26, textAlign: 'center' }]}>
        {finished ? (imp.phase === 'error' ? 'Загрузка прервалась' : 'Контакты загружены') : imp.phase === 'finishing' ? 'Выхожу из аккаунта' : 'Загружаю контакты'}
      </Text>
      {!finished && (
        <Text style={[s.muted, { textAlign: 'center' }]}>
          {imp.waitingSeconds ? `Telegram попросил паузу на ${imp.waitingSeconds} с — продолжу автоматически.` : 'Можно свернуть приложение, загрузка продолжится.'}
        </Text>
      )}
      <ProgressRing
        progress={progress}
        label={progress === null ? '' : `${Math.round(progress * 100)}%`}
        sub={total ? `${done} из ${total}` : finished ? `${done}` : 'получаю список…'}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatTile value={String(imp.requestsProfiles ?? 0)} label="профилей с днём рождения" tone="accent" />
        <StatTile value={String(imp.requestsPhotos ?? 0)} label="фото" />
        <StatTile value={String(imp.requestsMessages ?? 0)} label="сообщений и чатов" tone="danger" />
      </View>

      {finished ? (
        <>
          {imp.loggedOut ? (
            <Card style={{ gap: 8, backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
              <View style={s.row}>
                <IconCircle icon="check" tone="success" />
                <Text style={[s.title, { color: colors.success, flex: 1 }]}>Сессия Telegram завершена</Text>
              </View>
              <Text style={[s.body, { fontSize: 15, lineHeight: 21 }]}>
                Приложение вышло из аккаунта и стёрло данные входа. Проверь сам: Telegram → Настройки → Устройства — сессии «{SESSION_NAME}» там больше нет.
              </Text>
            </Card>
          ) : (
            <Card style={{ gap: 8, backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
              <View style={s.row}>
                <IconCircle icon="warning" tone="warn" />
                <Text style={[s.title, { color: colors.warn, flex: 1 }]}>Проверь, что сессия завершена</Text>
              </View>
              <Text style={[s.body, { fontSize: 15, lineHeight: 21 }]}>
                Не удалось подтвердить выход из аккаунта. Открой Telegram → Настройки → Устройства и, если там есть «{SESSION_NAME}», нажми «Завершить сеанс».
              </Text>
            </Card>
          )}
          {imp.phase === 'error' && (
            <Card style={{ borderColor: colors.danger }}>
              <Text style={[s.body, { color: colors.danger, fontSize: 15, lineHeight: 21 }]}>Загрузка прервалась: {tgErrorText(imp.error)}</Text>
            </Card>
          )}
          {imp.partial && <Text style={s.muted}>Telegram попросил сделать паузу, поэтому дни рождения загружены не у всех.</Text>}
        </>
      ) : (
        <View style={{ backgroundColor: colors.soft, borderRadius: 16, padding: 12, paddingHorizontal: 14, gap: 8 }}>
          <Line icon="check" tone="success">{`Контакты: ${imp.requestsContacts ? 'список получен' : 'запрашиваю список'}`}</Line>
          <Line icon="camera">{`Загружаю профили и фото: ${done} из ${total || '…'}`}</Line>
          <Line icon="lock">После этого выйду из аккаунта</Line>
        </View>
      )}
    </>
  );

  // ---------- Нижняя кнопка под каждый шаг ----------
  let bottom: ReactNode;
  if (step === 1) {
    bottom = (
      <Button
        title={mode === 'login' ? (busy ? 'Подключаюсь…' : 'Дальше') : 'Дальше'}
        icon={mode === 'login' ? 'send' : undefined}
        disabled={busy}
        onPress={() => (mode === 'book' ? router.push({ pathname: '/import', params: { source: 'tgbook' } }) : run(tg.begin))}
      />
    );
  } else if (step === 2) {
    bottom = <Button title="Отменить вход" variant="ghost" onPress={tg.cancel} />;
  } else if (!finished) {
    bottom = imp.phase === 'loading' ? <Button title="Остановить" variant="secondary" onPress={tg.cancel} /> : <Button title="Выхожу из аккаунта…" variant="secondary" disabled onPress={() => {}} />;
  } else {
    bottom = (
      <View style={{ gap: 8 }}>
        {done > 0 && <Button title={`Выбрать, кого добавить (${done})`} onPress={() => router.replace({ pathname: '/import', params: { source: 'telegram' } })} />}
        <Button title={done > 0 ? 'Начать заново' : 'Попробовать снова'} variant={done > 0 ? 'ghost' : 'primary'} onPress={tg.clearResult} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Импорт из Telegram' }} />
      <View style={s.screen}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
          <Stepper steps={TG_STEPS} active={step} />
        </View>
        <ScrollView contentContainerStyle={[s.content, { paddingTop: 8 }]} keyboardShouldPersistTaps="handled">
          {step === 1 ? chooseStep : step === 2 ? loginStep : loadStep}
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.bg }}>{bottom}</View>
      </View>
      <AccessSheet visible={access} onClose={() => setAccess(false)} />
    </KeyboardAvoidingView>
  );
}
