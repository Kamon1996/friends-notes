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

/**
 * Шторка экрана встала вплотную к нижней панели: панель прячет свою верхнюю линию, чтобы между ними не было щели.
 * Тот же порядок: вызов — включить, возвращённая функция — выключить; действует, только пока экран на виду.
 */
export const TabBarSeam = createContext<() => () => void>(() => () => {});

/** Экран сливает свою шторку с нижней панелью, пока `on`. */
export function useTabBarSeam(on: boolean) {
  const seam = useContext(TabBarSeam);
  useEffect(() => (on ? seam() : undefined), [on, seam]);
}
