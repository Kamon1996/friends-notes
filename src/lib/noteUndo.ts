import type { ReviewChanges } from './noteReview';

/**
 * «Отменить» после добавления дел из заметки. Добавляет один экран, а плашка с отменой показывается на другом —
 * в «Напоминаниях», куда человек вернулся. Здесь лежит последнее добавление, пока плашка его не забрала.
 */
export interface NoteImportDone {
  /** «Добавлено 6 дел и 1 дата». */
  text: string;
  changes: ReviewChanges;
}

let pending: NoteImportDone | null = null;
const listeners = new Set<() => void>();

export function offerUndo(done: NoteImportDone): void {
  pending = done;
  listeners.forEach((l) => l());
}

/** Забрать последнее добавление: второй раз его уже не будет. */
export function takeUndo(): NoteImportDone | null {
  const p = pending;
  pending = null;
  return p;
}

export function onUndoOffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
