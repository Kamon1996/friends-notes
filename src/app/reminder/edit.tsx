import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { QuickForm } from '@/components/reminderForm/QuickForm';
import { RowsForm } from '@/components/reminderForm/RowsForm';
import { useReminderForm } from '@/components/reminderForm/useReminderForm';
import { Button, Empty } from '@/components/ui';
import { useStore } from '@/lib/store';

export default function EditReminderScreen() {
  const { ready, data } = useStore();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const exists = !!id && data.reminders.some((r) => r.id === id);
  // Форму уже показали: если дело удаляют прямо из неё, экран закрывается с формой, а не мигает «не найдено».
  const [opened, setOpened] = useState(false);
  if (ready && exists && !opened) setOpened(true);
  // Ждём загрузки данных, иначе при открытии из уведомления форма стартует пустой.
  if (!ready) return null;
  // Старое уведомление или ссылка на удалённое напоминание — не подсовываем пустую форму «Новое напоминание».
  if (id && !exists && !opened) return <ReminderNotFound />;
  return <ReminderForm />;
}

function ReminderNotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Напоминание' }} />
      <Empty icon="bell" title="Напоминание не найдено" text="Возможно, его уже удалили или отметили и убрали.">
        <Button title="К напоминаниям" variant="secondary" onPress={() => router.replace('/')} style={{ marginTop: 8 }} />
      </Empty>
    </>
  );
}

/**
 * Форма дела в одном из двух видов. Готовое дело всегда открывается «строками»: его читают и правят по одному
 * полю. Новое — тоже «строками», если в настройках не выбрана «быстрая» форма.
 */
function ReminderForm() {
  const { data } = useStore();
  const form = useReminderForm();
  const rows = !!form.existing || data.settings.newReminderForm !== 'quick';
  return rows ? <RowsForm form={form} /> : <QuickForm form={form} />;
}
