import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTelegramSession } from '@/lib/telegramSession';
import { colors } from './ui';

const TAB_ROUTES = new Set(['/', '/friends', '/reminders']);

/** Плашка с ходом импорта из Telegram — видна на любом экране, пока импорт идёт или ждёт выбора. */
export function TelegramBanner() {
  const tg = useTelegramSession();
  const path = usePathname();
  const insets = useSafeAreaInsets();

  if (path === '/telegram' || path === '/import') return null;

  let text: string | null = null;
  let target: () => void = () => router.push('/telegram');
  let progress: number | null = null;
  if (tg.working) {
    const { done = 0, total = 0 } = tg.imp;
    text = tg.imp.phase === 'finishing' ? 'Telegram: завершаю сессию…' : total ? `Импорт из Telegram: ${done} из ${total}` : 'Импорт из Telegram…';
    progress = total ? done / total : null;
  } else if (tg.resultReady) {
    text = `Контакты Telegram загружены (${tg.imp.done}) · Выбрать`;
    target = () => router.push({ pathname: '/import', params: { source: 'telegram' } });
  } else if (tg.signingIn && tg.auth.state !== 'starting') {
    text = 'Вход в Telegram ждёт тебя · Открыть';
  }
  if (!text) return null;

  // На вкладках — над панелью вкладок и левее кнопки «+».
  const inTabs = TAB_ROUTES.has(path);
  return (
    <Pressable
      onPress={target}
      style={({ pressed }) => ({
        position: 'absolute',
        left: 12,
        right: inTabs ? 96 : 12,
        bottom: inTabs ? insets.bottom + 49 + 30 : insets.bottom + 16,
        borderRadius: 16,
        backgroundColor: colors.text,
        paddingHorizontal: 14,
        paddingVertical: 10,
        opacity: pressed ? 0.85 : 1,
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      })}
    >
      <Text style={{ color: '#fff', fontWeight: '600' }} numberOfLines={1}>
        ✈️ {text}
      </Text>
      {progress !== null && (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, backgroundColor: colors.primary }} />
        </View>
      )}
    </Pressable>
  );
}
