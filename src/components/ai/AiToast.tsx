import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTheme } from '@/components/ui';
import { AiIcon } from './AiIcon';

/** Тихий тост: магия сама что-то сделала в фоне (пол новых друзей, соцсети из «О себе»). Несколько секунд — и уходит. */
export function AiToast({ text, onDone, bottom }: { text: string | null; onDone: () => void; bottom: number }) {
  const { s, colors } = useTheme();
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [text, onDone]);
  if (!text) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(200)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 16, right: 88, bottom }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.banner, borderRadius: 18, paddingVertical: 10, paddingLeft: 10, paddingRight: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
        <AiIcon size={28} />
        <Text style={[s.body, { flex: 1, fontSize: 14, lineHeight: 19, color: colors.onBanner }]}>{text}</Text>
      </View>
    </Animated.View>
  );
}
