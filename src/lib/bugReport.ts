/** Ник разработчика в Telegram — кнопка «Сообщить о проблеме» открывает чат с ним. */
export const DEVELOPER_TELEGRAM = 'KamonDev';

export interface ReportInfo {
  version: string;
  os: string;
  osVersion: string;
  device: string;
  crashId?: string;
}

/**
 * Начало сообщения разработчику: по первой строке сразу видно, что это из приложения,
 * какая версия и какой телефон. Остальное человек дописывает сам.
 */
export function buildReportText(info: ReportInfo): string {
  const head = `🐞 Друзья ${info.version} · ${[info.os, info.osVersion].filter(Boolean).join(' ')} · ${info.device}`.replace(/ · $/, '');
  const crash = info.crashId ? `Последний сбой: ${info.crashId}\n` : '';
  return `${head}\n${crash}Что случилось: `;
}

/** Ссылка на чат в Telegram с уже подставленным текстом. */
export function telegramReportUrl(username: string, text: string): string {
  return `https://t.me/${username}?text=${encodeURIComponent(text)}`;
}
