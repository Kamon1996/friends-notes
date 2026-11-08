import { Alert, Platform } from 'react-native';

/** Подтверждение необратимого действия (по умолчанию «Удалить») — нативный Alert на телефоне, window.confirm в браузере. */
export function confirm(title: string, message: string, action = 'Удалить'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Короткое сообщение с одной кнопкой — нативный Alert на телефоне, window.alert в браузере. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

/** Закрывают форму с несохранёнными правками: сохранить, выбросить или вернуться к правке. */
export function confirmUnsaved(): Promise<'save' | 'discard' | 'stay'> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.('Сохранить изменения?') === false ? 'discard' : 'save');
  }
  return new Promise((resolve) =>
    Alert.alert('Сохранить изменения?', 'Ты поправил текст, но ещё не сохранил его.', [
      { text: 'Не сохранять', style: 'destructive', onPress: () => resolve('discard') },
      { text: 'Сохранить', onPress: () => resolve('save') },
    ], { cancelable: true, onDismiss: () => resolve('stay') }),
  );
}
