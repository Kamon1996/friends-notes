import * as Clipboard from 'expo-clipboard';
import { Stack, router, usePreventRemove } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { FormCard, FormSection, SmallChip } from '@/components/form/parts';
import { Button, GrowingInput, Group, useTheme } from '@/components/ui';
import { ai, hasAiKeys } from '@/lib/ai';
import { confirm } from '@/lib/confirm';
import { plural } from '@/lib/dates';
import { DEFAULT_TIME, timeSuggestions } from '@/lib/habits';
import {
  addedText, buildChanges, buttonLabel, canAdd, createReview, decide, editItem, itemFromRest, missingOf, sectionsOf, setDateForAll, withoutDate, type ItemPatch, type ReviewItem,
} from '@/lib/noteReview';
import { NOTE_MAX_TEXT, NOTE_TASK, draftsFromNote, type NoteAnswer } from '@/lib/noteTasks';
import { offerUndo } from '@/lib/noteUndo';
import { newId, useStore } from '@/lib/store';
import type { ISODate } from '@/lib/types';
import { NoteRow, SkippedRow } from './parts';
import { ItemSheet, WhenSheet } from './sheets';

type Stage = 'input' | 'loading' | 'review';
const WHY = { done: 'похоже, уже сделано', other: 'похоже, чужое дело' } as const;

/**
 * «Из заметки»: вставил текст → магия разложила его на записи → по каждой решение (добавить или убрать) → «Добавить».
 * Текст уходит на разбор только по кнопке. Что получилось, человек проверяет сам: пока есть записи на проверке,
 * ничего не добавляется. Правила списка — в `src/lib/noteReview.ts`, разбора — в `src/lib/noteTasks.ts`.
 *
 * `tabs` — переключатель «Дело / Из заметки»: он виден, пока человек вводит текст; у списка записей свой заголовок.
 */
export function NoteImport({ tabs }: { tabs: ReactNode }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, today, saveReminder, saveFriend, addFriends } = useStore();
  const [stage, setStage] = useState<Stage>('input');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [answer, setAnswer] = useState<NoteAnswer | null>(null);
  /** Куски «Не вошло в дела», из которых уже сделали запись. */
  const [taken, setTaken] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  /** Кому выбираем срок: записи (после свайпа «Добавить») или всем без срока. */
  const [whenFor, setWhenFor] = useState<string | 'all' | null>(null);
  /** Нажали кнопку, а проверено не всё: подсвечиваем раздел «На проверку». */
  const [nudge, setNudge] = useState(false);
  const runId = useRef(0);
  const leaving = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const usualTime = useMemo(() => timeSuggestions(data.reminders, data.friends, { kind: 'due' }).usual ?? DEFAULT_TIME, [data.reminders, data.friends]);
  const friendOf = (item: ReviewItem) => data.friends.find((f) => f.id === item.friendId);
  const sections = sectionsOf(items);
  const button = buttonLabel(items);
  const decided = items.some((i) => i.state !== 'todo');

  // «Назад» из списка возвращает к тексту, а не закрывает экран: разбор не теряется от случайного нажатия.
  const backToText = async () => {
    if (decided && !(await confirm('Вернуться к тексту?', 'Решения по записям не сохранятся.', 'Вернуться'))) return;
    setStage('input');
    setItems([]);
    setAnswer(null);
    setTaken([]);
  };
  const allowLeave = usePreventRemove(stage === 'review', () => {
    backToText();
  });

  const parse = async () => {
    const input = { text: text.trim(), now: Date.now() };
    if (!input.text) return;
    const id = ++runId.current;
    setError(null);
    setStage('loading');
    // Почему не вышло: ответили, но не по делу («unusable») — или не ответил никто.
    const failed: { why: 'unusable' | 'unavailable' } = { why: 'unavailable' };
    const got = await draftsFromNote(input, async (i) => {
      const r = await ai.run(NOTE_TASK, i);
      if (r.status === 'ok') return r.value;
      failed.why = r.status;
      return null;
    }).catch(() => null);
    if (id !== runId.current) return; // отменили или запустили заново
    if (!got) {
      setStage('input');
      setError(failed.why === 'unusable' ? 'Не получилось разобрать этот текст. Попробуй ещё раз или сократи его.' : 'Сейчас не получается: нет связи или сервис занят. Попробуй чуть позже.');
      return;
    }
    if (!got.drafts.length) {
      setStage('input');
      setError('Дел в этом тексте не нашлось. Если они там есть — напиши их отдельными строками.');
      return;
    }
    setAnswer(got);
    setItems(createReview(got, data.friends, newId));
    setTaken([]);
    setNudge(false);
    setStage('review');
  };
  const cancel = () => {
    runId.current++;
    setStage('input');
  };
  const paste = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip.trim()) setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n${clip}` : clip).slice(0, NOTE_MAX_TEXT * 2));
    } catch {
      // буфер недоступен — вставят долгим нажатием
    }
  };

  // ---------- решения ----------
  const add = (item: ReviewItem) => {
    if (canAdd(item)) return setItems((cur) => decide(cur, item.id, 'add'));
    // Не хватает только срока — один вопрос «когда»; чего-то ещё — вся запись.
    const miss = missingOf(item);
    if (item.draft.type === 'task' && miss.length === 1 && miss[0] === 'date') setWhenFor(item.id);
    else setOpenId(item.id);
  };
  const skip = (item: ReviewItem) => setItems((cur) => decide(cur, item.id, item.state === 'skip' ? 'todo' : 'skip'));
  const edit = (id: string, patch: ItemPatch) => setItems((cur) => editItem(cur, id, patch));
  const pickWhen = (date: ISODate) => {
    if (whenFor === 'all') setItems((cur) => setDateForAll(cur, date));
    else if (whenFor) setItems((cur) => decide(editItem(cur, whenFor, { date }), whenFor, 'add'));
    setWhenFor(null);
  };

  const press = () => {
    if (!button.ready) {
      // Не всё проверено: ничего не добавляем, возвращаем наверх — к записям без решения.
      setNudge(sections.todo.length > 0);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    const changes = buildChanges(items, { friends: data.friends, reminders: data.reminders, today, now: Date.now(), eventTime: data.settings.eventTime, makeId: newId });
    changes.reminders.forEach(saveReminder);
    if (changes.friends.length) addFriends(changes.friends);
    changes.updated.forEach(saveFriend);
    offerUndo({ text: addedText(items), changes });
    // Экран закрываем сами: защита от случайного «Назад» тут не нужна.
    allowLeave();
    router.back();
  };

  // ---------- что не вошло ----------
  const rest = (answer?.rest ?? []).filter((r) => !taken.includes(r));
  const why = (part: string) => answer?.skipped.find((x) => part.toLowerCase().includes(x.quote.toLowerCase().replace(/[.,;:!?]+$/, '')))?.why;
  const makeTask = (part: string) => {
    const item = itemFromRest(part, newId);
    setItems((cur) => [...cur, item]);
    setTaken((cur) => [...cur, part]);
    setOpenId(item.id);
  };

  const opened = items.find((i) => i.id === openId) ?? null;
  const whenItem = whenFor && whenFor !== 'all' ? items.find((i) => i.id === whenFor) : undefined;
  const noDate = withoutDate(items).length;

  if (stage !== 'review') {
    const loading = stage === 'loading';
    const left = NOTE_MAX_TEXT - text.length;
    const point = (icon: IconName, label: string) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} color={colors.text2} strokeWidth={2.1} />
        </View>
        <Text style={[s.muted, { flex: 1 }]}>{label}</Text>
      </View>
    );
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.screen} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {tabs}
          <FormCard style={{ marginTop: 14 }}>
            <GrowingInput
              minLines={7}
              maxLines={14}
              value={text}
              onChangeText={(v) => {
                setText(v);
                if (error) setError(null);
              }}
              editable={!loading}
              placeholder="Вставь заметку, список дел или переписку — разберу на дела."
              accessibilityLabel="Текст заметки"
              style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 16, fontSize: 15.5, lineHeight: 23, color: loading ? colors.text2 : colors.text }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
              {text ? <SmallChip label="Очистить" icon="close" selected={false} onPress={() => !loading && setText('')} /> : <SmallChip label="Вставить из буфера" icon="copy" selected={false} onPress={paste} />}
              <View style={{ flex: 1 }} />
              {!!text && (
                <Text style={[s.caption, { fontVariant: ['tabular-nums'] }, left < 0 && { color: colors.warn }]}>
                  {text.length} из {NOTE_MAX_TEXT}
                </Text>
              )}
            </View>
          </FormCard>
          {left < 0 && <Text style={[s.caption, { color: colors.warn, marginTop: 8, paddingHorizontal: 16 }]}>Текст длинный: разберу первые {NOTE_MAX_TEXT} знаков, остальное покажу отдельно.</Text>}
          {error && (
            <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.warnSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 }} accessibilityLiveRegion="polite">
              <Icon name="info" size={17} color={colors.warn} strokeWidth={2.2} />
              <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.text }}>{error}</Text>
            </View>
          )}
          {!text && (
            <>
              <FormSection title="Что найду" />
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {point('check', 'Дела, сроки и время')}
                {point('repeat', 'Повторы и привычки')}
                {point('cake', 'Дни рождения и важные даты людей')}
              </View>
            </>
          )}
          <Text style={[s.caption, { marginTop: 16, paddingHorizontal: 16 }]}>
            {hasAiKeys
              ? 'Текст уйдёт на разбор в облачный сервис — только когда нажмёшь «Разобрать». Не вставляй пароли и номера карт.'
              : 'В этой сборке разбор заметок недоступен.'}
          </Text>
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 + insets.bottom, backgroundColor: colors.bg }}>
          {loading ? (
            <Pressable
              onPress={cancel}
              accessibilityRole="button"
              accessibilityLabel="Читаю заметку. Отменить"
              style={[s.button, { backgroundColor: colors.chip, flexDirection: 'row', gap: 10 }]}
            >
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[s.buttonText, { color: colors.text }]}>Читаю заметку…</Text>
              <Text style={[s.buttonText, { color: colors.text2, fontFamily: fonts.medium }]}>Отмена</Text>
            </Pressable>
          ) : (
            <Button title="Разобрать" icon="stars" onPress={parse} disabled={!text.trim() || !hasAiKeys} />
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  const total = items.length;
  const done = total - sections.todo.length;
  const { tasks, dates } = { tasks: sections.add.filter((i) => i.draft.type === 'task' || i.to === 'reminder').length, dates: sections.add.filter((i) => i.draft.type !== 'task' && i.to !== 'reminder').length };
  const rows = (list: ReviewItem[]) =>
    list.map((item) => <NoteRow key={item.id} item={item} friend={friendOf(item)} today={today} onPress={() => setOpenId(item.id)} onAdd={() => add(item)} onSkip={() => skip(item)} />);
  const head = (title: string, n: number, hint?: string, tone?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={[s.sectionLabel, { letterSpacing: 1.4 }, tone ? { color: tone } : null]}>
        {title} · {n}
      </Text>
      {!!hint && <Text style={[s.caption, tone ? { color: tone } : null]}>{hint}</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Из заметки' }} />
      <ScrollView ref={scrollRef} style={s.screen} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <Text style={[s.h2, { fontFamily: fonts.display, flex: 1 }]} accessibilityRole="header">
              {plural(total, 'Нашлась', 'Нашлись', 'Нашлось')} {total} {plural(total, 'запись', 'записи', 'записей')}
            </Text>
            <Text style={[s.muted, { fontVariant: ['tabular-nums'] }]}>
              проверено {done} из {total}
            </Text>
          </View>
          <Text style={[s.muted, { marginTop: 4 }]}>
            {sections.todo.length
              ? 'Проведи вправо — добавить, влево — убрать. Нажми на запись, чтобы поправить.'
              : tasks || dates
                ? `Всё проверено. ${[tasks ? `${tasks} ${plural(tasks, 'дело', 'дела', 'дел')}` : '', dates ? `${dates} ${plural(dates, 'дата', 'даты', 'дат')}` : ''].filter(Boolean).join(' и ')} — можно добавлять.`
                : 'Всё проверено, но добавлять нечего: верни нужное из «Убрать».'}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.chip, marginTop: 10, overflow: 'hidden' }} accessibilityElementsHidden>
            <View style={{ width: `${total ? (done / total) * 100 : 0}%`, height: '100%', backgroundColor: colors.accent, borderRadius: 2 }} />
          </View>
        </View>

        {noDate > 1 && (
          <Pressable
            onPress={() => setWhenFor('all')}
            accessibilityRole="button"
            accessibilityLabel={`${noDate} ${plural(noDate, 'запись', 'записи', 'записей')} без срока. Поставить всем`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.chip, borderRadius: 14, paddingLeft: 14, paddingRight: 12, minHeight: 44, marginTop: 12, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name="calendar" size={15} color={colors.text2} strokeWidth={2.1} />
            <Text style={[s.muted, { flex: 1 }]}>
              {noDate} {plural(noDate, 'запись', 'записи', 'записей')} без срока
            </Text>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.accentText }}>Поставить всем</Text>
          </Pressable>
        )}

        {nudge && sections.todo.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.warnSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 }} accessibilityLiveRegion="polite">
            <Icon name="info" size={17} color={colors.warn} strokeWidth={2.2} />
            <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.text }}>
              Пока ничего не добавлено: {sections.todo.length} {plural(sections.todo.length, 'запись ждёт', 'записи ждут', 'записей ждут')} проверки.
            </Text>
          </View>
        )}

        {sections.todo.length > 0 && (
          <>
            {head('На проверку', sections.todo.length, nudge ? 'проведи вправо или влево' : undefined, nudge ? colors.warn : undefined)}
            <Group style={nudge ? { borderColor: colors.warn, borderWidth: 1.5 } : undefined}>{rows(sections.todo)}</Group>
          </>
        )}
        {sections.add.length > 0 && (
          <>
            {head('Добавить', sections.add.length)}
            <Group>{rows(sections.add)}</Group>
          </>
        )}
        {sections.skip.length > 0 && (
          <>
            {head('Убрать', sections.skip.length)}
            <Group>
              {sections.skip.map((item) => (
                <SkippedRow key={item.id} title={item.draft.type === 'birthday' ? `День рождения — ${friendOf(item)?.name ?? item.draft.person ?? ''}` : item.draft.title} onRestore={() => skip(item)} />
              ))}
            </Group>
          </>
        )}
        {rest.length > 0 && (
          <>
            {head('Не вошло в дела', rest.length)}
            <Group inset={16}>
              {rest.map((part) => (
                <View key={part} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text }} numberOfLines={3}>
                      «{part}»
                    </Text>
                    {!!why(part) && <Text style={[s.caption, { marginTop: 1 }]}>{WHY[why(part) as keyof typeof WHY]}</Text>}
                  </View>
                  <Pressable onPress={() => makeTask(part)} accessibilityRole="button" accessibilityLabel={`Сделать делом: ${part}`} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.accentText }}>Сделать делом</Text>
                  </Pressable>
                </View>
              ))}
            </Group>
          </>
        )}
        {answer?.partial && <Text style={[s.caption, { marginTop: 12, paddingHorizontal: 16 }]}>Ответ оборвался: возможно, найдено не всё. Остаток заметки — в «Не вошло в дела».</Text>}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 + insets.bottom, backgroundColor: colors.bg }}>
        {button.ready ? (
          <Button title={button.text} onPress={press} />
        ) : (
          <Pressable
            onPress={press}
            accessibilityRole="button"
            accessibilityLabel={`${button.text}. К записям на проверке`}
            style={({ pressed }) => [s.button, { backgroundColor: colors.chip, flexDirection: 'row', gap: 8, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[s.buttonText, { color: colors.text }]}>{button.text}</Text>
            {sections.todo.length > 0 && <Icon name="chevronUp" size={18} color={colors.text2} strokeWidth={2.4} />}
          </Pressable>
        )}
      </View>

      <ItemSheet
        item={opened}
        friends={data.friends}
        reminders={data.reminders}
        today={today}
        usualTime={usualTime}
        onEdit={(patch) => opened && edit(opened.id, patch)}
        onAdd={() => {
          if (opened) setItems((cur) => decide(cur, opened.id, 'add'));
          setOpenId(null);
        }}
        onSkip={() => {
          if (opened) skip(opened);
          setOpenId(null);
        }}
        onClose={() => setOpenId(null)}
      />
      <WhenSheet
        open={whenFor !== null}
        title={whenFor === 'all' ? `Срок для ${noDate} ${plural(noDate, 'записи', 'записей', 'записей')}` : `${whenItem?.draft.title ?? ''} — когда?`}
        quote={whenItem?.draft.quote}
        usualTime={usualTime}
        today={today}
        onPick={pickWhen}
        onClose={() => setWhenFor(null)}
      />
    </View>
  );
}
