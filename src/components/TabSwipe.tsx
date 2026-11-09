import type { ReactNode } from 'react';

import { usePagerLock } from './pagerLock';

/**
 * Обёртка экрана-вкладки: листание вкладок каруселью делает сам навигатор (PagerTabs), а здесь экран может его
 * запретить — например, в режиме выбора или пока идёт «Пол друзей».
 */
export function TabSwipe({ enabled = true, children }: { tab?: string; enabled?: boolean; children: ReactNode }) {
  usePagerLock(!enabled);
  return children;
}
