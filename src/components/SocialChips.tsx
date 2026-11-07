import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isWebUrl, linkSubtitle, linkTitle } from '@/lib/socials';
import type { SocialLink } from '@/lib/types';
import { openExternal } from './ContactButtons';
import { Icon } from './Icon';
import { NetworkGlyph } from './NetworkBadge';
import { useTheme } from './ui';

/**
 * Чипы «значок + название сети». Нажатие открывает профиль, долгое нажатие копирует ссылку;
 * у сети без ссылок (WeChat) нажатие копирует ник. Пунктирный чип в конце — добавить.
 */
export function SocialChips({ links, onAdd }: { links: SocialLink[]; onAdd?: () => void }) {
  const { s, colors, fonts } = useTheme();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flash = (text: string) => {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 1800);
  };
  const copy = async (l: SocialLink) => {
    const text = l.url || (l.handle ? `@${l.handle}` : '');
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      flash(l.url ? 'Ссылка скопирована' : 'Ник скопирован');
    } catch {
      flash('Не получилось скопировать');
    }
  };
  // Открываем только веб-адреса; что-то другое (например, из старых данных) — копируем, а не запускаем.
  const open = (l: SocialLink) => (l.url && isWebUrl(l.url) ? openExternal(l.url, linkTitle(l)) : copy(l));

  return (
    <View>
      <View style={s.chips}>
        {links.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => open(l)}
            onLongPress={() => copy(l)}
            delayLongPress={350}
            accessibilityRole="link"
            accessibilityLabel={`${linkTitle(l)}: ${linkSubtitle(l)}`}
            style={({ pressed }) => [s.chip, { maxWidth: '100%' }, pressed && { opacity: 0.7 }]}
          >
            <NetworkGlyph network={l.network} size={16} color={colors.text} />
            <Text style={[s.chipText, { flexShrink: 1 }]} numberOfLines={1}>
              {linkTitle(l)}
            </Text>
          </Pressable>
        ))}
        {onAdd && (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Добавить соцсеть"
            style={({ pressed }) => [s.chip, { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.text3 }, pressed && { opacity: 0.7 }]}
          >
            <Icon name="plus" size={15} color={colors.accent} strokeWidth={2.2} />
            <Text style={[s.chipText, { color: colors.accentText }]}>Добавить</Text>
          </Pressable>
        )}
      </View>
      {/* Короткое сообщение поверх подписи «Соцсети», а не строкой под чипами: карточка ниже не прыгает и не закрывает его. */}
      {toast && (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: 0, right: 0, top: -40, alignItems: 'center' }}
        >
          <Text style={{ backgroundColor: colors.banner, color: colors.onBanner, fontFamily: fonts.medium, fontSize: 13, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
