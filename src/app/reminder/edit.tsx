import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { NoteImport } from '@/components/noteImport/NoteImport';
import { QuickForm } from '@/components/reminderForm/QuickForm';
import { RowsForm } from '@/components/reminderForm/RowsForm';
import { useReminderForm } from '@/components/reminderForm/useReminderForm';
import { Button, Empty, Segmented, useTheme } from '@/components/ui';
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
 *
 * У нового дела, открытого плюсом на «Напоминаниях», сверху две вкладки: «Дело» и «Из заметки» — вставить текст
 * и получить из него сразу несколько дел. Из карточки друга и из календаря открывается только форма: там уже
 * известно, для кого дело или на какой день.
 */
function ReminderForm() {
  const { data } = useStore();
  const params = useLocalSearchParams<{ id?: string; friendId?: string; date?: string }>();
  const form = useReminderForm();
  const [tab, setTab] = useState<'task' | 'note'>('task');
  // Вторая вкладка появляется, когда её открыли в первый раз, и дальше живёт за кадром — как и форма.
  const [noteOpened, setNoteOpened] = useState(false);
  if (tab === 'note' && !noteOpened) setNoteOpened(true);
  const rows = !!form.existing || data.settings.newReminderForm !== 'quick';
  const view = rows ? <RowsForm form={form} /> : <QuickForm form={form} />;
  if (params.id || params.friendId || params.date) return view;
  const tabs = <Segmented options={TABS} value={tab} onChange={setTab} />;
  // Обе вкладки остаются на экране и за кадром: набранное не пропадает, пока человек смотрит соседнюю.
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: tab === 'task' ? 'flex' : 'none' }}>
        <TabsBar>{tabs}</TabsBar>
        {view}
      </View>
      {noteOpened && (
        <View style={{ flex: 1, display: tab === 'note' ? 'flex' : 'none' }}>
          <NoteImport tabs={tabs} />
        </View>
      )}
    </View>
  );
}

const TABS = [
  { value: 'task' as const, label: 'Дело' },
  { value: 'note' as const, label: 'Из заметки' },
];

function TabsBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg }}>{children}</View>;
}
