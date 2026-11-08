import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NETWORKS, TOP_NETWORKS, linkFromInput, linkSubtitle, mergeLinks, networkById, parseSocialInput, type Network, type ParsedInput } from '@/lib/socials';
import { newId } from '@/lib/store';
import type { SocialLink } from '@/lib/types';
import { Icon } from './Icon';
import { NetworkBadge, NetworkGlyph } from './NetworkBadge';
import { NetworkPicker } from './NetworkPicker';
import { Sheet, SheetHandle } from './Sheet';
import { Button, IconButton, Label, useTheme } from './ui';

/** Подписи шторки — согласованы отдельно, менять вместе с макетами. */
export const SOCIAL_COPY = {
  placeholder: 'instagram.com/… или @ник',
  invalid: 'Ник без пробелов или ссылка, иначе не разберём.',
  link: (name: string) => `Похоже на ${name}. Если что, можно поменять.`,
  handle: 'Хороший ник. Осталось понять, из какой он сети. Помогите 🥺',
  site: 'Такую сеть не узнаём. Сохраним как сайт?',
  duplicate: 'Эта ссылка уже есть в списке.',
};

/** Черновик ссылки из ввода и (если выбрана) сети, которой человек поправил догадку. */
function draftLink(parsed: ParsedInput, chosen: Network | null): SocialLink | null {
  if (parsed.kind === 'link') {
    const base = linkFromInput(parsed, null, 'draft');
    if (!base || !chosen || chosen.id === parsed.network.id) return base;
    return { ...base, network: chosen.id, url: parsed.handle && chosen.profile ? chosen.profile(parsed.handle) : parsed.url };
  }
  if (parsed.kind === 'site') {
    const base = linkFromInput(parsed, null, 'draft');
    return chosen && base ? { id: 'draft', network: chosen.id, url: parsed.url, source: 'manual' } : base;
  }
  if (parsed.kind === 'handle') return chosen ? linkFromInput(parsed, chosen, 'draft') : null;
  return null;
}

/** Шторка «Добавить соцсеть»: одно поле, сеть узнаётся по ссылке, по нику выбирается из каталога. */
export function SocialLinkSheet({
  visible,
  existing = [],
  onClose,
  onAdd,
}: {
  visible: boolean;
  existing?: SocialLink[];
  onClose: () => void;
  onAdd: (link: SocialLink) => void;
}) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<Network | null>(null);
  const [picker, setPicker] = useState(false);

  const parsed = parseSocialInput(text);
  const link = draftLink(parsed, chosen);
  const duplicate = !!link && mergeLinks(existing, [link]).length === existing.length;
  const network = link ? networkById(link.network) : null;
  const canAdd = !!link && !duplicate;
  const caption = duplicate
    ? SOCIAL_COPY.duplicate
    : parsed.kind === 'invalid'
      ? SOCIAL_COPY.invalid
      : parsed.kind === 'link'
        ? SOCIAL_COPY.link(parsed.network.name)
        : parsed.kind === 'handle'
          ? chosen
            ? null
            : SOCIAL_COPY.handle
          : parsed.kind === 'site'
            ? SOCIAL_COPY.site
            : null;
  const buttonTitle = !link ? 'Добавить' : duplicate ? 'Уже есть' : link.network === 'site' ? 'Да, это сайт' : `Добавить ${network!.name}`;

  const change = (v: string) => {
    setText(v);
    setChosen(null);
  };
  // Каждый раз шторка открывается пустой. Сбрасываем при открытии, а не при закрытии: пока она уезжает, текст ещё виден.
  const [wasOpen, setWasOpen] = useState(visible);
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) {
      setText('');
      setChosen(null);
      setPicker(false);
    }
  }
  const close = () => onClose();
  const submit = () => {
    if (!link || duplicate) return;
    onAdd({ ...link, id: newId(), source: 'manual' });
    close();
  };

  return (
    <Sheet visible={visible} onClose={close} style={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 14 }}>
      <SheetHandle />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[s.h2, { fontFamily: fonts.display }]}>Добавить соцсеть</Text>
        <IconButton icon="close" label="Закрыть" onPress={close} />
      </View>

      <View>
        <Label>Ссылка или ник</Label>
        <View>
          <TextInput
            value={text}
            onChangeText={change}
            placeholder={SOCIAL_COPY.placeholder}
            placeholderTextColor={colors.placeholder}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="Ссылка или ник"
            style={[s.input, { paddingRight: 44 }, parsed.kind === 'invalid' && { borderColor: colors.danger, borderWidth: 1.5 }]}
          />
          {text.length > 0 && (
            <Pressable
              onPress={() => change('')}
              accessibilityLabel="Очистить"
              hitSlop={8}
              style={({ pressed }) => ({ position: 'absolute', right: 4, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
            >
              <Icon name="close" size={16} color={colors.text3} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      {caption && <Text style={[s.muted, { lineHeight: 18, paddingHorizontal: 2 }, parsed.kind === 'invalid' && { color: colors.danger }]}>{caption}</Text>}

      {link && network && (
        <Pressable
          onPress={() => setPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`Сеть: ${network.name}. Поменять`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: colors.chip, opacity: pressed ? 0.7 : 1 })}
        >
          <NetworkBadge network={link.network} tone="accent" />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={s.title}>{network.name}</Text>
            <Text style={s.muted} numberOfLines={1}>
              {linkSubtitle(link)}
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.checkbox} strokeWidth={2} />
        </Pressable>
      )}

      {parsed.kind === 'handle' && !chosen && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOP_NETWORKS.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => setChosen(n)}
                accessibilityRole="button"
                accessibilityLabel={n.name}
                style={({ pressed }) => ({
                  flexBasis: '22%',
                  flexGrow: 1,
                  height: 62,
                  borderRadius: 14,
                  backgroundColor: colors.chip,
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <NetworkGlyph network={n.id} size={20} color={colors.text} />
                <Text style={[s.caption, { color: colors.text, fontFamily: fonts.medium }]} numberOfLines={1}>
                  {n.name.replace(/ \(.*\)$/, '')}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setPicker(true)} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text style={[s.muted, { color: colors.accentText, fontFamily: fonts.medium }]}>{`Все сети · ${NETWORKS.length} →`}</Text>
          </Pressable>
        </View>
      )}

      <Button title={buttonTitle} onPress={submit} disabled={!canAdd} />
      <NetworkPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onSelect={(n) => {
          setChosen(n);
          setPicker(false);
        }}
      />
    </Sheet>
  );
}
