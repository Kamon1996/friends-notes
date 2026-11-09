import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { cleanupAvatars, deleteOwnedFiles } from './avatars';
import { completeReminder, reopenReminder, rollReminder } from './events';
import { markCalendarStale, syncDeviceCalendar } from './deviceCalendar';
import { syncNotifications } from './notifications';
import { parseStored } from './storage';
import { EMPTY_DATA, type AppData, type Friend, type Reminder, type Settings } from './types';
import { genderOnSave } from './gender';
import { applyGenderUpdate, genderPending, retractUnisexGuess } from './genderDetect';
import { defaultHolidayCountries } from './holidays';
import { genderSync } from './genderRun';
import { ai } from './ai';
import { applyCalendarUpdate, calendarPass, calendarPending, smartCalendarOn } from './calendarAi';
import { applyNotesUpdate, notesPass, notesPending, notesSummary, retidySeen, type NotesSummary } from './notesAi';

const STORAGE_KEY = 'friends-notes/data/v1';

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface Store {
  ready: boolean;
  data: AppData;
  saveFriend: (f: Friend) => void;
  addFriends: (list: Friend[]) => void;
  updateFriends: (update: (f: Friend) => Friend) => void;
  deleteFriend: (id: string) => void;
  deleteFriends: (ids: string[]) => void;
  saveReminder: (r: Reminder) => void;
  deleteReminder: (id: string) => void;
  deleteReminders: (ids: string[]) => void;
  toggleReminderDone: (id: string) => void;
  /** Отметить несколько сделанными (повторяющиеся переносятся на следующий раз) или вернуть в активные. */
  setRemindersDone: (ids: string[], done: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Заменить все данные (восстановление из копии). Прежние откладываются в хранилище — на случай, если копия не та. */
  replaceData: (next: AppData) => Promise<void>;
  /** Определить пол тем, кто ещё ждёт; если проход уже идёт в фоне — дождаться его. */
  detectGenders: () => Promise<void>;
  /** Идёт определение пола (значок ИИ тихо светится). */
  genderBusy: boolean;
  /** Сколько друзей фоновый проход только что определил — для тихого тоста; 0 — нечего сказать. */
  genderNews: number;
  clearGenderNews: () => void;
  /**
   * Разобрать заметки силами ИИ: соцсети, подсказки для карточки, заметка без ссылок (src/lib/notesAi.ts).
   * 'all' — все неразобранные (меню магии), 'queued' — только из импорта Telegram (это делается и само, в фоне).
   */
  readNotes: (mode?: 'queued' | 'all') => Promise<NotesSummary>;
  notesBusy: boolean;
  /** Итог фонового разбора после импорта — для тихого тоста; null — нечего сказать. */
  notesNews: NotesSummary | null;
  clearNotesNews: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  /** Данные прочитаны и сохраняются: до этого синхронизировать нечего, иначе пустые данные сотрут календарь и уведомления. */
  const liveRef = useRef(false);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Если прочитать хранилище не удалось, ничего не записываем до следующего запуска: иначе пустые данные затрут настоящие.
  const [canPersist, setCanPersist] = useState(true);
  useEffect(() => {
    (async () => {
      let raw: string | null;
      try {
        raw = await AsyncStorage.getItem(STORAGE_KEY);
      } catch (e) {
        console.warn('Не удалось прочитать данные', e);
        setCanPersist(false);
        return;
      }
      const { data: loaded, broken } = parseStored(raw);
      if (broken && raw !== null) {
        // Разобрать нельзя — откладываем как есть в резервную копию, а не теряем.
        await AsyncStorage.setItem(`${STORAGE_KEY}.broken-${Date.now()}`, raw).catch(() => setCanPersist(false));
      }
      // Заметки, разобранные прошлой версией, доочищаем по новым правилам («О себе: инст:» → пусто) — без ИИ.
      // Повторяющиеся, сделанные в прошлые дни, снова активны — на ближайший раз.
      // Пол, угаданный по имени, общему для обоих (Валя, Ника), снимаем — спросим у человека.
      if (loaded) setData({ ...loaded, friends: loaded.friends.map((f) => retractUnisexGuess(retidySeen(f))), reminders: loaded.reminders.map((r) => rollReminder(r)) });
      // Праздники: пока страну не выбирали — страна телефона (один раз; дальше — как выбрал человек).
      setData((d) => (Array.isArray(d.settings.holidayCountries) ? d : { ...d, settings: { ...d.settings, holidayCountries: defaultHolidayCountries() } }));
    })().finally(() => setReady(true));
  }, []);

  // Сохраняем и перепланируем уведомления после каждого изменения.
  useEffect(() => {
    if (!ready || !canPersist) return;
    liveRef.current = true;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) => console.warn('Не удалось сохранить', e));
    const t = setTimeout(() => syncNotifications(data), 400);
    // Календарь телефона обновляется реже: пересоздание событий тяжелее, чем расписание уведомлений.
    const c = setTimeout(() => syncDeviceCalendar(data), 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(c);
    };
  }, [data, ready, canPersist]);

  // Новый день: сделанные вчера повторяющиеся снова активны. При возврате в приложение и в полночь, если оно открыто.
  const rollDay = useCallback(() => {
    setData((d) => {
      const now = new Date();
      let changed = false;
      const reminders = d.reminders.map((r) => {
        const next = rollReminder(r, now);
        if (next !== r) changed = true;
        return next;
      });
      return changed ? { ...d, reminders } : d;
    });
  }, []);
  const [dayTick, setDayTick] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    const t = setTimeout(() => {
      rollDay();
      setDayTick((n) => n + 1);
    }, midnight.getTime() - now.getTime());
    return () => clearTimeout(t);
  }, [ready, dayTick, rollDay]);

  // Пол друзей определяется сам, в фоне: при открытии приложения, при возвращении в него и когда появились новые друзья.
  // Каждый друг проходит ступени только один раз (см. genderDetect.ts); ручной выбор не трогается.
  const [genderBusy, setGenderBusy] = useState(false);
  const [genderNews, setGenderNews] = useState(0);
  const clearGenderNews = useCallback(() => setGenderNews(0), []);
  const genderRunRef = useRef<Promise<void> | null>(null);
  const manualRef = useRef(false);
  const syncGenders = useCallback((): Promise<void> => {
    if (genderRunRef.current) return genderRunRef.current;
    if (!liveRef.current) return Promise.resolve();
    const friends = dataRef.current.friends;
    if (!friends.some(genderPending)) return Promise.resolve();
    const namesAtStart = new Map(friends.map((f) => [f.id, f.name]));
    setGenderBusy(true);
    const run = (async () => {
      const updates = await genderSync.run(friends).catch(() => []);
      if (!updates.length) return;
      const byId = new Map(updates.map((u) => [u.id, u]));
      setData((d) => ({ ...d, friends: d.friends.map((f) => applyGenderUpdate(f, byId.get(f.id), namesAtStart.get(f.id))) }));
      // Пока человек смотрит барабан, тост не нужен — он и так всё видит.
      const found = updates.filter((u) => u.gender).length;
      if (found && !manualRef.current) setGenderNews((x) => x + found);
    })().finally(() => {
      genderRunRef.current = null;
      setGenderBusy(false);
    });
    genderRunRef.current = run;
    return run;
  }, []);
  /** Ручной запуск (экран «Пол друзей»): тот же проход, но без тихого тоста. */
  const detectGenders = useCallback((): Promise<void> => {
    manualRef.current = true;
    return syncGenders().finally(() => {
      manualRef.current = false;
    });
  }, [syncGenders]);
  // Сколько друзей ещё не прошли Genderize и дальше: растёт, когда добавили друга, импортировали или переименовали.
  const freshGenders = useMemo(() => data.friends.filter((f) => genderPending(f) && (!f.genderStage || f.genderStage === 'names')).length, [data.friends]);
  const seenFresh = useRef(-1);
  useEffect(() => {
    if (!ready || !canPersist) return;
    // Первый раз — вскоре после запуска; потом — когда появились новые, кого ещё не спрашивали.
    if (seenFresh.current >= 0 && freshGenders <= seenFresh.current) {
      seenFresh.current = freshGenders;
      return;
    }
    seenFresh.current = freshGenders;
    const t = setTimeout(() => void syncGenders(), 2500);
    return () => clearTimeout(t);
  }, [freshGenders, ready, canPersist, syncGenders]);

  // Заметки: соцсети и подсказки силами ИИ. В фоне — только друзья из импорта Telegram (их «О себе» мы и так
  // собирались разобрать); остальных — когда попросят из меню магии.
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesNews, setNotesNews] = useState<NotesSummary | null>(null);
  const clearNotesNews = useCallback(() => setNotesNews(null), []);
  const notesRunRef = useRef<Promise<NotesSummary> | null>(null);
  const readNotes = useCallback(async (mode: 'queued' | 'all' = 'all'): Promise<NotesSummary> => {
    // Проход уже идёт: фоновому хватит его, а из меню — дождёмся и разберём остальных.
    if (notesRunRef.current) {
      const current = notesRunRef.current;
      if (mode === 'queued') return current;
      await current.catch(() => null);
    }
    const friends = dataRef.current.friends;
    if (!liveRef.current || !friends.some((f) => notesPending(f, mode))) {
      return { status: 'nothing', friends: 0, withLinks: 0, links: 0, facts: 0, cleaned: 0, left: 0 };
    }
    setNotesBusy(true);
    const run = (async () => {
      const r = await notesPass(friends, ai, { mode, idFor: newId });
      if (r.updates.length) {
        const byId = new Map(r.updates.map((u) => [u.id, u]));
        setData((d) => ({ ...d, friends: d.friends.map((f) => applyNotesUpdate(f, byId.get(f.id))) }));
      }
      return notesSummary(friends, r, mode);
    })().finally(() => {
      notesRunRef.current = null;
      setNotesBusy(false);
    });
    notesRunRef.current = run;
    return run;
  }, []);
  const queuedNotes = useMemo(() => data.friends.filter((f) => notesPending(f, 'queued')).length, [data.friends]);
  useEffect(() => {
    if (!ready || !canPersist || !queuedNotes) return;
    const t = setTimeout(() => {
      void readNotes('queued').then((sum) => {
        if (sum.status === 'done' && sum.friends) setNotesNews(sum);
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [queuedNotes, ready, canPersist, readNotes]);

  // «Умный календарь»: новые и переименованные дела «на дату и время» и повторяющиеся — к магии, в фоне. ИИ недоступен —
  // остаются по типу дела, спросим при следующем изменении или возвращении в приложение.
  const calendarRunRef = useRef(false);
  const calendarWaiting = smartCalendarOn(data.settings) && data.reminders.some(calendarPending);
  const syncCalendarAi = useCallback(async () => {
    const d = dataRef.current;
    if (calendarRunRef.current || !liveRef.current || !smartCalendarOn(d.settings)) return;
    calendarRunRef.current = true;
    try {
      const names = new Map(d.friends.map((f) => [f.id, f.name]));
      const updates = await calendarPass(d.reminders, ai, (id) => names.get(id));
      if (updates.length) {
        const byId = new Map(updates.map((u) => [u.id, u]));
        setData((x) => ({ ...x, reminders: x.reminders.map((r) => applyCalendarUpdate(r, byId.get(r.id))) }));
      }
    } finally {
      calendarRunRef.current = false;
    }
  }, []);
  useEffect(() => {
    if (!ready || !canPersist || !calendarWaiting) return;
    const t = setTimeout(() => void syncCalendarAi(), 2500);
    return () => clearTimeout(t);
  }, [calendarWaiting, data.reminders, ready, canPersist, syncCalendarAi]);

  // При возврате в приложение — пересчитываем окно уведомлений (их число ограничено).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && liveRef.current) {
        rollDay();
        void syncCalendarAi();
        syncNotifications(dataRef.current);
        // Пока приложение было свёрнуто, события могли удалить прямо в календаре — проверим и вернём.
        markCalendarStale();
        syncDeviceCalendar(dataRef.current);
        syncGenders();
        void readNotes('queued').then((sum) => {
          if (sum.status === 'done' && sum.friends) setNotesNews(sum);
        });
      }
    });
    return () => sub.remove();
  }, [syncGenders, readNotes, rollDay, syncCalendarAi]);

  const saveFriend = useCallback((input: Friend) => {
    setData((d) => {
      const f = genderOnSave(d.friends.find((x) => x.id === input.id), input);
      const exists = d.friends.some((x) => x.id === f.id);
      const friends = exists ? d.friends.map((x) => (x.id === f.id ? f : x)) : [...d.friends, f];
      return { ...d, friends };
    });
  }, []);

  const addFriends = useCallback((list: Friend[]) => {
    setData((d) => ({ ...d, friends: [...d.friends, ...list.map((f) => genderOnSave(undefined, f))] }));
  }, []);

  const updateFriends = useCallback((update: (f: Friend) => Friend) => {
    setData((d) => ({ ...d, friends: d.friends.map(update) }));
  }, []);

  const deleteFriends = useCallback((ids: string[]) => {
    const set = new Set(ids);
    const gone = dataRef.current.friends.filter((f) => set.has(f.id));
    setData((d) => ({
      ...d,
      friends: d.friends.filter((f) => !set.has(f.id)),
      reminders: d.reminders.filter((r) => !r.friendId || !set.has(r.friendId)),
    }));
    for (const f of gone) {
      cleanupAvatars(f.id);
      deleteOwnedFiles([f.photoUri, f.thumbUri]);
    }
  }, []);
  const deleteFriend = useCallback((id: string) => deleteFriends([id]), [deleteFriends]);

  const saveReminder = useCallback((r: Reminder) => {
    setData((d) => {
      const exists = d.reminders.some((x) => x.id === r.id);
      const reminders = exists ? d.reminders.map((x) => (x.id === r.id ? r : x)) : [...d.reminders, r];
      return { ...d, reminders };
    });
  }, []);

  const deleteReminders = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setData((d) => ({ ...d, reminders: d.reminders.filter((r) => !gone.has(r.id)) }));
  }, []);
  const deleteReminder = useCallback((id: string) => deleteReminders([id]), [deleteReminders]);

  const setRemindersDone = useCallback((ids: string[], done: boolean) => {
    const chosen = new Set(ids);
    setData((d) => ({
      ...d,
      reminders: d.reminders.map((r) => {
        if (!chosen.has(r.id) || r.done === done) return r;
        return done ? completeReminder(r) : reopenReminder(r);
      }),
    }));
  }, []);

  const toggleReminderDone = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      reminders: d.reminders.map((r) => (r.id !== id ? r : r.done ? reopenReminder(r) : completeReminder(r))),
    }));
  }, []);


  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const replaceData = useCallback(async (next: AppData) => {
    await AsyncStorage.setItem(`${STORAGE_KEY}.before-restore`, JSON.stringify(dataRef.current));
    setData(next);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      data,
      saveFriend,
      addFriends,
      updateFriends,
      deleteFriend,
      deleteFriends,
      saveReminder,
      deleteReminder,
      deleteReminders,
      toggleReminderDone,
      setRemindersDone,
      updateSettings,
      replaceData,
      detectGenders,
      genderNews,
      clearGenderNews,
      genderBusy,
      readNotes,
      notesBusy,
      notesNews,
      clearNotesNews,
    }),
    [
      ready,
      data,
      saveFriend,
      addFriends,
      updateFriends,
      deleteFriend,
      deleteFriends,
      saveReminder,
      deleteReminder,
      deleteReminders,
      toggleReminderDone,
      setRemindersDone,
      updateSettings,
      replaceData,
      detectGenders,
      genderBusy,
      genderNews,
      clearGenderNews,
      readNotes,
      notesBusy,
      notesNews,
      clearNotesNews,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore вне StoreProvider');
  return s;
}

export function useFriend(id: string | undefined): Friend | undefined {
  const { data } = useStore();
  return data.friends.find((f) => f.id === id);
}
