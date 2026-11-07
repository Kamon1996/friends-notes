import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { plural } from '@/lib/dates';
import { useTelegramSession } from '@/lib/telegramSession';
import { Icon } from './Icon';
import { useTheme } from './ui';

/**
 * Карточка импорта из Telegram в начале ленты «Скоро» и списка друзей: идёт загрузка,
 * результат ждёт выбора или вход ждёт код. Вместо плавающей плашки — живёт в ленте и уходит, когда дело сделано.
 */
export function TelegramImportCard({ style }: { style?: object }) {
  const tg = useTelegramSession();
  const { s, colors, fonts } = useTheme();

  let title: string | null = null;
  let subtitle = '';
  let progress: number | null = null;
  let ready = false;
  let target: () => void = () => router.push('/telegram');
  if (tg.working) {
    const { done = 0, total = 0 } = tg.imp;
    title = 'Импорт из Telegram';
    subtitle = tg.imp.phase === 'finishing' ? 'Выхожу из аккаунта Telegram…' : total ? `Загружаю контакты: ${done} из ${total}` : 'Загружаю контакты…';
    progress = total ? done / total : null;
  } else if (tg.resultReady) {
    title = `Telegram: ${tg.imp.done} ${plural(tg.imp.done ?? 0, 'контакт', 'контакта', 'контактов')}`;
    subtitle = 'Выбери, кого добавить в друзья';
    ready = true;
    target = () => router.push({ pathname: '/import', params: { source: 'telegram' } });
  } else if (tg.auth.state === 'waitOtherDeviceConfirmation') {
    title = 'Вход в Telegram ждёт тебя';
    subtitle = 'Покажи QR-код другому устройству';
  } else if (tg.signingIn && tg.auth.state !== 'starting') {
    title = 'Вход в Telegram ждёт тебя';
    subtitle = tg.auth.state === 'waitPassword' ? 'Нужен облачный пароль' : tg.auth.state === 'waitCode' ? 'Код из приложения Telegram' : 'Введи номер телефона';
  }
  if (!title) return null;

  return (
    <Pressable
      onPress={target}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [
        s.card,
        { gap: 10, opacity: pressed ? 0.8 : 1 },
        ready && { backgroundColor: colors.soft, borderColor: colors.soft },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: ready ? colors.accent : colors.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="send" size={18} color={ready ? colors.onAccent : colors.accent} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.muted} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={ready ? colors.accentText : colors.checkbox} strokeWidth={2} />
      </View>
      {progress !== null && (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.chip, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
        </View>
      )}
      {tg.working && <Text style={[s.caption, { fontFamily: fonts.body }]}>Можно свернуть приложение: загрузка продолжится.</Text>}
    </Pressable>
  );
}
