import { Alert, Platform } from 'react-native';

/** Подтверждение удаления — нативный Alert на телефоне, window.confirm в браузере. */
export function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Удалить', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
