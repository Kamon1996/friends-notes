import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';

import { appTarget } from '@/lib/appLinks';
import { phoneUrl, telegramUrl, viberUrl, whatsappUrl } from '@/lib/messengers';
import { openInApp } from '../../modules/open-in-app';
import type { Friend } from '@/lib/types';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ui';

/**
 * Открыть ссылку. Ссылку на соцсеть или WhatsApp сначала пробуем открыть прямо в приложении (если оно установлено),
 * и только если его нет — как обычно, в браузере. Звонки и tg:/viber: открываются системой напрямую.
 */
export async function openExternal(url: string, app: string) {
  const apps = Platform.OS === 'android' ? appTarget(url) : null;
  if (apps && (await openInApp(url, apps))) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Не получилось открыть ${app}`, 'Проверь, что приложение установлено на телефоне.');
  }
}

export interface ContactAction {
  key: string;
  icon: IconName;
  label: string;
  url: string;
  app: string;
}

/** Способы связи, которые есть у человека: звонок и мессенджеры. */
export function contactActions(friend: Pick<Friend, 'phone' | 'telegramId' | 'whatsapp' | 'viber'>, os = Platform.OS): ContactAction[] {
  const list: (ContactAction | false | null | undefined | number | string)[] = [
    friend.phone && { key: 'call', icon: 'phone', label: 'Позвонить', url: phoneUrl(friend.phone), app: 'звонилку' },
    friend.telegramId && { key: 'tg', icon: 'send', label: 'Telegram', url: telegramUrl(friend.telegramId, os), app: 'Telegram' },
    friend.whatsapp && { key: 'wa', icon: 'bubble', label: 'WhatsApp', url: whatsappUrl(friend.whatsapp), app: 'WhatsApp' },
    friend.viber && { key: 'vb', icon: 'bubble2', label: 'Viber', url: viberUrl(friend.viber), app: 'Viber' },
  ];
  return list.filter((x): x is ContactAction => typeof x === 'object' && !!x);
}

/** Плитки связи в карточке друга — только те мессенджеры, где человек действительно есть. */
export function ContactButtons({ friend }: { friend: Friend }) {
  const { colors, fonts } = useTheme();
  const buttons = contactActions(friend);
  if (!buttons.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {buttons.map((b) => (
        <Pressable
          key={b.key}
          onPress={() => openExternal(b.url, b.app)}
          accessibilityLabel={b.label}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 60,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            paddingVertical: 8,
            borderRadius: 14,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.hairline,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name={b.icon} size={22} color={colors.accent} />
          <Text style={{ fontSize: 11, lineHeight: 14, color: colors.accent, fontFamily: fonts.medium }}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
