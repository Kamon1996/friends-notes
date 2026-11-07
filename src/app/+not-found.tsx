import { Stack, router } from 'expo-router';
import { View } from 'react-native';

import { Button, Empty, useTheme } from '@/components/ui';

/** Неизвестный адрес (например, старая или чужая ссылка со схемой приложения) — свой экран вместо служебного. */
export default function NotFoundScreen() {
  const { s } = useTheme();
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Не нашлось' }} />
      <Empty icon="search" title="Такой страницы нет" text="Ссылка устарела или ведёт не туда. Всё остальное на месте.">
        <Button title="На главную" onPress={() => router.replace('/')} style={{ marginTop: 8 }} />
      </Empty>
    </View>
  );
}
