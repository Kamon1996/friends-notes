import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { cleanupAvatars, deleteOwnedFiles } from './avatars';
import { completeReminder } from './events';
import { syncNotifications } from './notifications';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend, type Reminder, type Settings } from './types';

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
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as AppData;
        setData({ ...EMPTY_DATA, ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } });
      })
      .catch((e) => console.warn('Не удалось загрузить данные', e))
      .finally(() => setReady(true));
  }, []);

  // Сохраняем и перепланируем уведомления после каждого изменения.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) => console.warn('Не удалось сохранить', e));
    const t = setTimeout(() => syncNotifications(data), 400);
    return () => clearTimeout(t);
  }, [data, ready]);

  // При возврате в приложение — пересчитываем окно уведомлений (их число ограничено).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNotifications(dataRef.current);
    });
    return () => sub.remove();
  }, []);

  const saveFriend = useCallback((f: Friend) => {
    setData((d) => {
      const exists = d.friends.some((x) => x.id === f.id);
      const friends = exists ? d.friends.map((x) => (x.id === f.id ? f : x)) : [...d.friends, f];
      return { ...d, friends };
    });
  }, []);

  const addFriends = useCallback((list: Friend[]) => {
    setData((d) => ({ ...d, friends: [...d.friends, ...list] }));
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

  const value = useMemo(
    () => ({ ready, data, saveFriend, addFriends, updateFriends, deleteFriend, deleteFriends, saveReminder, deleteReminder, deleteReminders, toggleReminderDone, setRemindersDone, updateSettings }),
    [ready, data, saveFriend, addFriends, updateFriends, deleteFriend, deleteFriends, saveReminder, deleteReminder, deleteReminders, toggleReminderDone, setRemindersDone, updateSettings],
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
