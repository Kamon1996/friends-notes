import { FlatList, Text, View } from 'react-native';

import { ReleaseNotes } from '@/components/ReleaseNotes';
import { Card, useTheme } from '@/components/ui';
import { APP_VERSION, CHANGELOG, compareVersions } from '@/lib/changelog';

/** История изменений по версиям — из настроек, раздел «Помощь». */
export default function WhatsNewScreen() {
  const { s, colors } = useTheme();
  return (
    <FlatList
      style={s.screen}
      data={CHANGELOG}
      keyExtractor={(r) => r.version}
      contentContainerStyle={s.content}
      ListHeaderComponent={<Text style={[s.muted, { marginBottom: -6 }]}>{`Установлена версия ${APP_VERSION}. Новые версии — сверху.`}</Text>}
      renderItem={({ item }) => (
        <Card>
          <ReleaseNotes release={item} current={compareVersions(item.version, APP_VERSION) === 0} />
        </Card>
      )}
      ListFooterComponent={
        <View style={{ paddingTop: 6 }}>
          <Text style={[s.caption, { textAlign: 'center', color: colors.text3 }]}>Обновления приходят через магазин приложений, из которого установлены «Друзья».</Text>
        </View>
      }
    />
  );
}
