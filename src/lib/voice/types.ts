/** Одна реплика ИИ. `bucket` — для какого случая (размер компании, имя), `coffee` — про кофе: такие звучат реже. */
export interface Phrase {
  text: string;
  bucket?: string;
  coffee?: boolean;
}
