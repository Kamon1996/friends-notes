import { Redirect } from 'expo-router';

/** Старый адрес вкладки «Напоминания»: теперь это главная. */
export default function RemindersRedirect() {
  return <Redirect href="/" />;
}
