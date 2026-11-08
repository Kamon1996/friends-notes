import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Card, Chip, useTheme } from '@/components/ui';
import { ask } from '@/lib/confirm';
import { plural } from '@/lib/dates';
import { GENDER_SOURCE_LABEL, genderFromName, type Gender } from '@/lib/gender';
import { geminiConfigured, runGenderDetection } from '@/lib/genderRun';
import { useStore } from '@/lib/store';
import type { Friend } from '@/lib/types';

type Filter = 'unknown' | 'f' | 'm';

const STAGE_TEXT = { names: 'Смотрю свою базу имён…', genderize: 'Спрашиваю Genderize…', 'device-ai': 'Спрашиваю ИИ телефона…', gemini: 'Спрашиваю Gemini…' } as const;

/**
 * Пол друзей — для поздравлений с 8 Марта и 23 Февраля. Сверху — сколько определено и кнопка «Определить»,
 * ниже — список по вкладкам: кого нужно выбрать вручную, женщины, мужчины. Ручной выбор главнее автоматического.
 */
export default function GendersScreen() {
  const { data, updateFriends } = useStore();
  const { s, colors, fonts } = useTheme();
  const friends = data.friends;
  const known = friends.filter((f) => f.gender).length;
  const counts = { unknown: friends.length - known, f: friends.filter((f) => f.gender === 'f').length, m: friends.filter((f) => f.gender === 'm').length };
  const [filter, setFilter] = useState<Filter>(counts.unknown ? 'unknown' : 'f');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; problems: string[] } | null>(null);

  const list = useMemo(
    () => friends.filter((f) => (filter === 'unknown' ? !f.gender : f.gender === filter)).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [friends, filter],
  );

  const setGender = (id: string, gender: Gender) => updateFriends((f) => (f.id === id ? { ...f, gender, genderBy: 'manual' } : f));

  const detect = async () => {
    if (busy) return;
    // Кого определяем: без пола и не отмеченных вручную как «не указан».
    const targets = friends.filter((f) => !f.gender && f.genderBy !== 'manual');
    if (!targets.length) {
      setResult({ text: counts.unknown ? 'Остальных ты отметил «не указан» — их не трогаем.' : 'У всех друзей пол уже определён.', problems: [] });
      return;
    }
    const leftLocally = targets.filter((f) => !genderFromName(f.name)).length;
    let online = false;
    if (leftLocally) {
      online = await ask(
        'Определить остальных через интернет?',
        `Своя база имён не узнаёт ${leftLocally} ${plural(leftLocally, 'человека', 'человек', 'человек')}. Их имена — без фамилий и телефонов — можно отправить в Genderize.io${geminiConfigured ? ', а если он не узнает, в Google Gemini' : ''}. Встроенный ИИ телефона, если он есть, работает без интернета.`,
        'Через интернет',
        'Только на телефоне',
      );
    }
    setBusy(STAGE_TEXT.names);
    setResult(null);
    try {
      const run = await runGenderDetection(
        targets.map((f) => ({ id: f.id, name: f.name, phone: f.phone })),
        online,
        (stage) => setBusy(STAGE_TEXT[stage]),
      );
      const byId = new Map(run.found.map((x) => [x.id, x]));
      if (byId.size) {
        updateFriends((f) => {
          const x = byId.get(f.id);
          // Пока шло определение, человек мог выбрать пол сам — его выбор не трогаем.
          return x && !f.gender && f.genderBy !== 'manual' ? { ...f, gender: x.gender, genderBy: x.by } : f;
        });
      }
      const n = run.found.length;
      const rest = run.unknown.length;
      setResult({
        text: `${n ? `Определено: ${n}.` : 'Никого не удалось определить.'}${rest ? ` Осталось выбрать вручную: ${rest}.` : ''}`,
        problems: run.problems,
      });
      if (rest) setFilter('unknown');
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <View style={{ gap: 14, marginBottom: 12 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={[s.title, { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 }]}>{`Определено ${known} из ${friends.length}`}</Text>
          <Text style={s.muted}>Для поздравлений с 8 Марта и 23 Февраля.</Text>
        </View>
        <Button title={busy ? 'Определяю…' : 'Определить автоматически'} icon="stars" onPress={detect} disabled={!!busy || !friends.length} />
        {busy && <Text style={s.muted}>{busy}</Text>}
        {result && (
          <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
            <Text style={[s.body, { fontSize: 15 }]}>{result.text}</Text>
            {result.problems.map((p) => (
              <Text key={p} style={[s.muted, { color: colors.warn }]}>
                {p}
              </Text>
            ))}
          </View>
        )}
        <Text style={[s.caption, { lineHeight: 17 }]}>
          Сначала своя база имён на телефоне, потом — с твоего согласия — Genderize и ИИ. Выбранное вручную не меняется.
        </Text>
      </Card>
      <View style={s.chips}>
        <Chip label={`Не указан · ${counts.unknown}`} selected={filter === 'unknown'} onPress={() => setFilter('unknown')} />
        <Chip label={`Женщины · ${counts.f}`} selected={filter === 'f'} onPress={() => setFilter('f')} />
        <Chip label={`Мужчины · ${counts.m}`} selected={filter === 'm'} onPress={() => setFilter('m')} />
      </View>
    </View>
  );

  return (
    <FlatList
      style={s.screen}
      // Строки идут сплошной карточкой: общий отступ между блоками экрана здесь не нужен.
      contentContainerStyle={[s.content, { gap: 0 }]}
      data={list}
      keyExtractor={(f) => f.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Text style={[s.muted, { textAlign: 'center', paddingVertical: 24 }]}>
          {filter === 'unknown' ? 'Пол указан у всех друзей.' : friends.length ? 'Пока никого.' : 'Сначала добавь друзей.'}
        </Text>
      }
      renderItem={({ item, index }) => <Row friend={item} first={index === 0} last={index === list.length - 1} onSet={setGender} />}
    />
  );
}

function Row({ friend, first, last, onSet }: { friend: Friend; first: boolean; last: boolean; onSet: (id: string, g: Gender) => void }) {
  const { s, colors, fonts } = useTheme();
  const source = friend.gender ? GENDER_SOURCE_LABEL[friend.genderBy ?? 'names'] : friend.genderBy === 'manual' ? 'отмечен «не указан»' : 'не определён';
  const pill = (g: Gender, label: string, a11y: string) => {
    const on = friend.gender === g;
    return (
      <Pressable
        onPress={() => onSet(friend.id, g)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${friend.name}: ${a11y}`}
        hitSlop={4}
        style={({ pressed }) => ({
          width: 40,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? colors.accent : colors.chip,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: on ? colors.onAccent : colors.text2 }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.hairline,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? 20 : 0,
        borderTopRightRadius: first ? 20 : 0,
        borderBottomLeftRadius: last ? 20 : 0,
        borderBottomRightRadius: last ? 20 : 0,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.separator }}>
        <Avatar friend={friend} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {friend.name}
          </Text>
          <Text style={s.muted} numberOfLines={1}>
            {source}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {pill('f', 'Ж', 'женщина')}
          {pill('m', 'М', 'мужчина')}
        </View>
      </View>
    </View>
  );
}
