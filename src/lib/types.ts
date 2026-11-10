/** Дата без времени в формате YYYY-MM-DD (локальная). */
export type ISODate = string;
/** Время в формате HH:MM. */
export type TimeOfDay = string;

export interface ImportantDate {
  id: string;
  title: string;
  date: ISODate;
  /** Повторять каждый год (годовщина) или это разовое событие. */
  yearly: boolean;
}

/** Ссылка на профиль в соцсети: сеть из каталога (`src/lib/socials.ts`) или «site» для любого другого адреса. */
export interface SocialLink {
  id: string;
  network: string;
  /** Полный адрес; пустой, если у сети нет ссылок на профиль (только ник). */
  url: string;
  /** Ник без @, если известен. */
  handle?: string;
  /** Подпись чипа «Сайт»: домен или своё название. */
  label?: string;
  /** Откуда: Telegram (@username), контакты телефона, вручную или из заметок и «О себе» (разобрал ИИ). */
  source?: 'tg' | 'contacts' | 'manual' | 'notes';
}

export interface Friend {
  id: string;
  name: string;
  emoji: string;
  birthday: ISODate | null;
  phone: string;
  food: string;
  flowers: string;
  gifts: string;
  notes: string;
  dates: ImportantDate[];
  createdAt: number;
  /** ID пользователя Telegram — для кнопки «Написать в Telegram». */
  telegramId?: number | null;
  /** Номер WhatsApp (цифры в международном формате). */
  whatsapp?: string | null;
  /** Номер Viber (цифры в международном формате). */
  viber?: string | null;
  /** Фото для карточки (большое): из контактов телефона (content://…) или аватарка Telegram (file://…). */
  photoUri?: string | null;
  /** Маленькая версия фото для списков. */
  thumbUri?: string | null;
  /** Избранный — выше остальных в списке друзей и в окне выбора. */
  favorite?: boolean;
  /** Без уведомлений о дне рождения и важных датах этого человека (напоминания, созданные вручную, приходят). */
  muted?: boolean;
  /** Пол — для поздравлений с 8 Марта и 23 Февраля. Нет значения — не знаем. */
  gender?: 'f' | 'm';
  /** Откуда пол: выбран вручную или определён (по имени, Genderize, ИИ). Ручной выбор не перезаписывается. */
  genderBy?: 'manual' | 'names' | 'genderize' | 'device-ai' | 'ai';
  /** Пол пока не определён: последняя ступень, которая ответила «не знаю». Следующий проход начнёт со следующей. */
  genderStage?: 'names' | 'genderize' | 'device-ai' | 'ai';
  /** Соцсети и сайты человека. */
  socials?: SocialLink[];
  /** Отпечаток заметки, которую ИИ уже разобрал (соцсети и подсказки, src/lib/notesAi.ts): тот же текст второй раз не отправляем. */
  notesSeen?: string;
  /** Разобрать заметку в фоне — так помечаются друзья из импорта Telegram с «О себе». */
  notesQueue?: boolean;
}

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export interface Repeat {
  every: number;
  unit: RepeatUnit;
  /**
   * Повтор по дням недели («тренировка по пн, ср и пт»): 1 — понедельник … 7 — воскресенье. Только у недельного
   * повтора; `every` — раз в сколько недель. Нет — повтор от даты, как раньше.
   */
  days?: number[];
}

/** За сколько минут предупредить заранее (для разовых напоминаний и дедлайнов). */
export type Advance = 0 | 60 | 120 | 1440 | 4320 | 10080;

export interface Reminder {
  id: string;
  title: string;
  note: string;
  /** null — личное напоминание, не привязанное к другу. */
  friendId: string | null;
  /** Для разовых — дата/дедлайн. Для повторяющихся — дата ближайшего срабатывания. */
  date: ISODate;
  time: TimeOfDay;
  repeat: Repeat | null;
  /**
   * С какой даты считается серия повторяющегося напоминания. `date` после «сделано» переезжает на следующий раз,
   * а отсчёт ведётся отсюда, чтобы «каждое 31-е» после февраля вернулось на 31-е. Нет — значит с `date`.
   */
  anchor?: ISODate;
  advance: Advance;
  /**
   * Несколько «заранее» сразу: за сколько минут до срока напомнить («за день и за час» — [60, 1440]). Есть — главнее
   * `advance`; пустой список — заранее не напоминать. Нет поля — по-старому: одно `advance` у дел «до срока»,
   * «за день» у встреч, ничего у повторяющихся. Читай через `advancesOf`.
   */
  advances?: number[];
  /**
   * Только у разовых: напоминать каждый день в `time` — с сегодняшнего дня до срока `date`, с обратным отсчётом,
   * пока не отмечено «сделано». Вместо `advance`.
   */
  daily?: boolean;
  /**
   * Только у разовых: 'at' — на дату и время (визит, встреча): напомнить за день и в это время. Нет — «сделать до срока»:
   * `date` — последний день, `time` — когда напоминать.
   */
  kind?: 'at';
  /** Важность: 1 — низкая, 2 — средняя, 3 — важно. Нет — не задана. */
  priority?: Priority;
  /** Сколько займёт, в минутах. Нет — не задано. */
  minutes?: number;
  /** Показывать в календаре — выбрал человек (главнее магии). Нет — решает «Умный календарь» (src/lib/calendarAi.ts). */
  calendar?: boolean;
  /** Решение магии: событие для календаря (true) или обычное дело. */
  calendarAi?: boolean;
  /** Что магия видела (calendarKey): поменялось название или повтор — спросим снова. */
  calendarSeen?: string;
  done: boolean;
  /**
   * Когда отметили «сделано» (мс). Повторяющееся сделано до конца этого дня, потом снова активно — на ближайший раз
   * (rollReminder).
   */
  doneAt?: number;
  createdAt: number;
}

export type Priority = 1 | 2 | 3;

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentId = 'terracotta' | 'honey' | 'eucalyptus' | 'plum' | 'indigo' | 'raspberry';

export interface Settings {
  /** Во сколько присылать уведомления о днях рождения и важных датах. */
  eventTime: TimeOfDay;
  /** Напоминать за день до дня рождения / важной даты. */
  eventDayBefore: boolean;
  /** Тема: как в системе, светлая или тёмная. */
  theme: ThemeMode;
  /** Акцентный цвет светлой темы. */
  accentLight: AccentId;
  /** Акцентный цвет тёмной темы — может отличаться от светлой. */
  accentDark: AccentId;
  /** Версия, изменения которой пользователь уже видел на экране «Что нового». Нет — ещё не показывали. */
  lastSeenVersion?: string;
  /** Отправлять автоматические отчёты о сбоях (Sentry): только техническое, без данных людей. */
  crashReports: boolean;
  /** Показывать дни рождения и важные даты в календаре телефона (свой локальный календарь «Друзья»). */
  calendarSync?: boolean;
  /** Когда последний раз сохраняли резервную копию в файл (ISO). */
  lastBackupAt?: string;
  /** Показывать знаки зодиака (карточка друга, список, «Сегодня»). Нет значения — показывать. */
  showZodiac?: boolean;
  /** «Умный календарь»: магия сама решает, какие дела — события для календаря. Нет — включён. */
  smartCalendar?: boolean;
  /** Праздники каких стран показывать в календаре (коды стран). Нет — страна телефона, если она есть в базе. */
  holidayCountries?: string[];
  /** Обозначения под календарём (сколько чего в месяце). Нет — показывать. */
  calendarLegend?: boolean;
  /** Подробности дня в календаре: шторкой снизу или «гармошкой» внутри календаря. Нет — шторкой. */
  calendarDayView?: 'sheet' | 'inline';
  /**
   * Какой формой заводить новое дело: «строками» (значения в строках, выбор в шторке) или «быстрой» (ленты, выбор
   * в одно нажатие). Нет — строками. Готовое дело всегда открывается строками.
   */
  newReminderForm?: 'quick' | 'rows';
}

export interface AppData {
  version: 1;
  friends: Friend[];
  reminders: Reminder[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  eventTime: '10:00',
  eventDayBefore: true,
  theme: 'system',
  accentLight: 'terracotta',
  accentDark: 'terracotta',
  crashReports: true,
};

export const EMPTY_DATA: AppData = {
  version: 1,
  friends: [],
  reminders: [],
  settings: DEFAULT_SETTINGS,
};
