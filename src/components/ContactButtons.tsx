import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';

import { phoneUrl, telegramUrl, viberUrl, whatsappUrl } from '@/lib/messengers';
import type { Friend } from '@/lib/types';
import { colors } from './ui';

async function open(url: string, app: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Не получилось открыть ${app}`, 'Проверь, что приложение установлено на телефоне.');
  }
}

/** Кнопки связи: показываются только те мессенджеры, где человек действительно есть. */
export function ContactButtons({ friend }: { friend: Friend }) {
  const buttons = [
    friend.phone && { key: 'call', icon: '📞', label: 'Позвонить', onPress: () => open(phoneUrl(friend.phone), 'звонилку') },
    friend.telegramId && { key: 'tg', icon: '✈️', label: 'Telegram', onPress: () => open(telegramUrl(friend.telegramId!, Platform.OS), 'Telegram') },
    friend.whatsapp && { key: 'wa', icon: '💬', label: 'WhatsApp', onPress: () => open(whatsappUrl(friend.whatsapp!), 'WhatsApp') },
    friend.viber && { key: 'vb', icon: '🟣', label: 'Viber', onPress: () => open(viberUrl(friend.viber!), 'Viber') },
  ].filter(Boolean) as { key: string; icon: string; label: string; onPress: () => void }[];

  if (!buttons.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
      {buttons.map((b) => (
        <Pressable
          key={b.key}
          onPress={b.onPress}
          style={({ pressed }) => ({
            alignItems: 'center',
            gap: 2,
            minWidth: 76,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 14,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 22 }}>{b.icon}</Text>
          <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
