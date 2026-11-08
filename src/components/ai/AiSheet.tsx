import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { useTheme } from '@/components/ui';
import { plural } from '@/lib/dates';
import type { NotesSummary } from '@/lib/notesAi';
import { voice } from '@/lib/voice';
import { AiGradient, AiIcon } from './AiIcon';

/**
 * Шторка ИИ: задачи, которые проходят сразу по всем друзьям — пол друзей и соцсети из заметок. Говорит голосом ИИ; как это устроено внутри, не
 * рассказываем — ни сервисов, ни моделей, ни библиотек в интерфейсе.
 */
export function AiSheet({
  visible,
  onClose,
  gender,
  onGender,
  notes,
  onNotes,
}: {
  visible: boolean;
  onClose: () => void;
  /** Сколько друзей с известным полом и сколько всего. */
  gender: { known: number; total: number };
  onGender: () => void;
  /** Сколько заметок ещё не разобрано и идёт ли разбор (в том числе фоновый, после импорта). */
  notes: { waiting: number; busy: boolean };
  onNotes: () => Promise<NotesSummary>;
}) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  // Новые слова — при каждом открытии, но не при каждой перерисовке.
  const [opened, setOpened] = useState(visible);
  const [words, setWords] = useState(() => greeting());
  // Соцсети из заметок: пока без анимации — подпись «читаю…», потом итог; при следующем открытии — снова счётчик.
  const [notesLine, setNotesLine] = useState<string | null>(null);
  if (visible && !opened) {
    setOpened(true);
    setWords(greeting());
    setNotesLine(null);
  }
  if (!visible && opened) setOpened(false);
  const readNotes = async () => {
    if (notes.busy) return;
    setNotesLine(voice.say('notes.busy') ?? 'Читаю заметки…');
    const sum = await onNotes().catch((): NotesSummary => ({ status: 'unavailable', friends: 0, withLinks: 0, links: 0, facts: 0, cleaned: 0, left: 0 }));
    setNotesLine(notesResult(sum));
  };
  const notesSub =
    notesLine ?? (notes.busy ? 'Читаю заметки…' : notes.waiting ? `И подсказки к подаркам · ${notes.waiting} ${plural(notes.waiting, 'заметка', 'заметки', 'заметок')}` : 'Все заметки уже прочитаны');
  return (
    <Sheet visible={visible} onClose={onClose} style={{ paddingTop: 10, paddingBottom: insets.bottom + 18 }}>
      <SheetHandle />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
        <AiIcon size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[s.h2, { fontSize: 22, lineHeight: 28 }]}>{words.title}</Text>
          <Text style={s.muted}>{words.sub}</Text>
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
        <Pressable
          onPress={onGender}
          accessibilityRole="button"
          accessibilityLabel="Пол друзей — поехали"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, opacity: pressed ? 0.75 : 1 })}
        >
          <TaskGlyph>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: colors.text }}>♀♂</Text>
          </TaskGlyph>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.title, { fontFamily: fonts.semibold, fontSize: 16 }]}>Пол друзей</Text>
            <Text style={s.muted}>
              Для 8 Марта и 23 Февраля{gender.total ? ` · ${gender.known} из ${gender.total}` : ''}
            </Text>
          </View>
          <View style={{ borderRadius: 999, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 9 }}>
            <AiGradient radius={999} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: '#17130F' }}>Поехали</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={readNotes}
          disabled={notes.busy || !notes.waiting}
          accessibilityRole="button"
          accessibilityLabel="Соцсети из заметок — поехали"
          accessibilityState={{ busy: notes.busy }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.separator, opacity: pressed ? 0.75 : 1 })}
        >
          <TaskGlyph>
            <Icon name="link" size={20} color={colors.text} />
          </TaskGlyph>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.title, { fontFamily: fonts.semibold, fontSize: 16 }]}>Соцсети из заметок</Text>
            <Text style={s.muted} accessibilityLiveRegion="polite">
              {notesSub}
            </Text>
          </View>
          {notes.busy ? (
            <View style={{ width: 82, alignItems: 'center' }}>
              <ActivityIndicator color={colors.text2} />
            </View>
          ) : notes.waiting ? (
            <View style={{ borderRadius: 999, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 9 }}>
              <AiGradient radius={999} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: '#17130F' }}>Поехали</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.separator }}>
          <TaskGlyph>
            <Icon name="gift" size={20} color={colors.text2} />
          </TaskGlyph>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.title, { fontFamily: fonts.semibold, fontSize: 16, color: colors.text2 }]}>Идеи подарков</Text>
            <Text style={[s.muted, { color: colors.text3 }]}>По заметкам и тому, что любит друг</Text>
          </View>
          <Text style={[s.caption, { borderWidth: 1, borderColor: colors.hairline, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }]}>скоро</Text>
        </View>
      </View>
    </Sheet>
  );
}

/** Итог разбора заметок — голосом магии. */
function notesResult(sum: NotesSummary): string {
  if (sum.status === 'unavailable') return voice.say('notes.fail') ?? 'Не получилось — попробую позже';
  if (sum.status === 'nothing') return voice.say('notes.nothing') ?? 'Новых заметок нет';
  if (sum.withLinks) return voice.say('notes.done', { n: sum.links, k: sum.withLinks }) ?? `Нашла ${sum.links} ${plural(sum.links, 'соцсеть', 'соцсети', 'соцсетей')}`;
  if (sum.friends) return voice.say('notes.tidy') ?? 'Заметки прибраны';
  return voice.say('notes.none') ?? 'Соцсетей в заметках нет';
}

function greeting() {
  return {
    title: voice.say('menu.title') ?? 'Чем займёмся?',
    sub: voice.say('menu.sub') ?? 'Пройдусь по всем друзьям сама',
  };
}

function TaskGlyph({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}
