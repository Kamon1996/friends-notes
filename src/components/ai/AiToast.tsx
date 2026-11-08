import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTheme } from '@/components/ui';
import { voice } from '@/lib/voice';
import { AiIcon } from './AiIcon';

/** Тихий тост: ИИ сама определила пол новых друзей в фоне. Показывается несколько секунд и уходит. */
export function AiToast({ news, onDone, bottom }: { news: number; onDone: () => void; bottom: number }) {
  const { s, colors } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  if (news > 0 && news !== seen) {
    setSeen(news);
    setText(voice.say('gender.quiet', { k: news }));
  }
  if (news === 0 && seen !== 0) {
    setSeen(0);
    setText(null);
  }
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
