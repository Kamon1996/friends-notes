import { createContext, useContext, useEffect } from 'react';

/**
 * Запрет листания вкладок (PagerTabs), пока экран в особом режиме: вызов — запретить, возвращённая функция — снять.
 * Отдельным модулем: экраны-вкладки не должны тянуть навигатор (и expo-router) при загрузке.
 */
export const PagerLock = createContext<() => () => void>(() => () => {});

/** Экран запрещает листание вкладок, пока `locked`. */
export function usePagerLock(locked: boolean) {
  const lock = useContext(PagerLock);
  useEffect(() => (locked ? lock() : undefined), [locked, lock]);
}
