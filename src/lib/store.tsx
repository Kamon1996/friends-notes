import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { cleanupAvatars, deleteOwnedFiles } from './avatars';
import { completeReminder } from './events';
import { markCalendarStale, syncDeviceCalendar } from './deviceCalendar';
import { syncNotifications } from './notifications';
import { parseStored } from './storage';
import { EMPTY_DATA, type AppData, type Friend, type Reminder, type Settings } from './types';
import { genderOnSave } from './gender';
import { applyGenderUpdate, genderPending } from './genderDetect';
import { genderSync } from './genderRun';

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
      if (loaded) setData(loaded);
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

  // Пол друзей определяется сам, в фоне: при открытии приложения, при возвращении в него и когда появились новые друзья.
  // Каждый друг проходит ступени только один раз (см. genderDetect.ts); ручной выбор не трогается.
  const syncGenders = useCallback(async () => {
    if (!liveRef.current) return;
    const friends = dataRef.current.friends;
    const namesAtStart = new Map(friends.map((f) => [f.id, f.name]));
    const updates = await genderSync.run(friends).catch(() => []);
    if (!updates.length) return;
    const byId = new Map(updates.map((u) => [u.id, u]));
    setData((d) => ({ ...d, friends: d.friends.map((f) => applyGenderUpdate(f, byId.get(f.id), namesAtStart.get(f.id))) }));
  }, []);
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
    const t = setTimeout(syncGenders, 2500);
    return () => clearTimeout(t);
  }, [freshGenders, ready, canPersist, syncGenders]);

  // При возврате в приложение — пересчитываем окно уведомлений (их число ограничено).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && liveRef.current) {
        syncNotifications(dataRef.current);
        // Пока приложение было свёрнуто, события могли удалить прямо в календаре — проверим и вернём.
        markCalendarStale();
        syncDeviceCalendar(dataRef.current);
        syncGenders();
      }
    });
    return () => sub.remove();
  }, [syncGenders]);

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
        if (!chosen.has(r.id)) return r;
        if (!done) return r.done ? { ...r, done: false } : r;
        return r.done ? r : completeReminder(r);
      }),
    }));
  }, []);

  const toggleReminderDone = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      reminders: d.reminders.map((r) => {
        if (r.id !== id) return r;
        if (r.done) return { ...r, done: false };
        return completeReminder(r);
      }),
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
    () => ({ ready, data, saveFriend, addFriends, updateFriends, deleteFriend, deleteFriends, saveReminder, deleteReminder, deleteReminders, toggleReminderDone, setRemindersDone, updateSettings, replaceData }),
    [ready, data, saveFriend, addFriends, updateFriends, deleteFriend, deleteFriends, saveReminder, deleteReminder, deleteReminders, toggleReminderDone, setRemindersDone, updateSettings, replaceData],
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
