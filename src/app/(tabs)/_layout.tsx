import { Tabs } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { useTheme } from '@/lib/themeContext';

const tabIcon = (name: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={24} color={typeof color === 'string' ? color : '#9A8F85'} strokeWidth={focused ? 2 : 1.75} />;
  };

export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.hairline, borderTopWidth: 1 },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      {/* Главная — «Напоминания»: приложение открывается на них (при первом запуске — на «Друзьях»). */}
      <Tabs.Screen name="index" options={{ title: 'Напоминания', tabBarIcon: tabIcon('bell') }} />
      <Tabs.Screen name="friends" options={{ title: 'Друзья', tabBarIcon: tabIcon('people') }} />
    </Tabs>
  );
}
