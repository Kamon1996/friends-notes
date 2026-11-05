import { Link } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Text } from 'react-native';

import { colors } from '@/components/ui';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontSize: 20, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Скоро',
          tabBarIcon: icon('🗓️'),
          headerRight: () => (
            <Link href="/settings" style={{ fontSize: 22, paddingHorizontal: 16 }}>
              ⚙️
            </Link>
          ),
        }}
      />
      <Tabs.Screen name="friends" options={{ title: 'Друзья', tabBarIcon: icon('👥') }} />
      <Tabs.Screen name="reminders" options={{ title: 'Напоминания', tabBarIcon: icon('⏰') }} />
    </Tabs>
  );
}
