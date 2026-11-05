import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

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
  deleteFriend: (id: string) => void;
  saveReminder: (r: Reminder) => void;
  deleteReminder: (id: string) => void;
  toggleReminderDone: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

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

  const deleteFriend = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      friends: d.friends.filter((f) => f.id !== id),
      reminders: d.reminders.filter((r) => r.friendId !== id),
    }));
  }, []);

  const saveReminder = useCallback((r: Reminder) => {
    setData((d) => {
      const exists = d.reminders.some((x) => x.id === r.id);
      const reminders = exists ? d.reminders.map((x) => (x.id === r.id ? r : x)) : [...d.reminders, r];
      return { ...d, reminders };
    });
  }, []);

  const deleteReminder = useCallback((id: string) => {
    setData((d) => ({ ...d, reminders: d.reminders.filter((r) => r.id !== id) }));
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
    () => ({ ready, data, saveFriend, deleteFriend, saveReminder, deleteReminder, toggleReminderDone, updateSettings }),
    [ready, data, saveFriend, deleteFriend, saveReminder, deleteReminder, toggleReminderDone, updateSettings],
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
