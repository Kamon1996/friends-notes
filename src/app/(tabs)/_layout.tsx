import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { createPagerTabs } from '@/components/PagerTabs';

const tabIcon = (name: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={24} color={typeof color === 'string' ? color : '#9A8F85'} strokeWidth={focused ? 2 : 1.75} />;
  };

let Tabs: ReturnType<typeof createPagerTabs> | null = null;

/** Вкладки каруселью (PagerTabs): соседний экран заезжает за пальцем, нижняя панель — как была. */
export default function TabsLayout() {
  Tabs ??= createPagerTabs();
  return (
    <Tabs>
      {/* Главная — «Напоминания»: приложение открывается на них (при первом запуске — на «Друзьях»). */}
      <Tabs.Screen name="index" options={{ title: 'Напоминания', tabBarIcon: tabIcon('bell') }} />
      <Tabs.Screen name="friends" options={{ title: 'Друзья', tabBarIcon: tabIcon('people') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Календарь', tabBarIcon: tabIcon('calendar') }} />
    </Tabs>
  );
}
