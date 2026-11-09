// Описание релизов на GitHub — из «Что нового» (src/lib/changelog.ts), чтобы история релизов совпадала с историей в приложении.
//   npx tsx scripts/releases/notes.ts 1.40.0  → описание одной версии (для сборки APK)
//   npx tsx scripts/releases/notes.ts         → { "1.39.0": "…", … } для всех версий (для «Releases tidy»)
import { CHANGELOG } from '../../src/lib/changelog';

const FOOTER = 'APK ставится поверх прошлой версии — друзья и напоминания сохраняются.';
const body = (items: readonly string[]) => [...items.map((t) => `- ${t}`), '', FOOTER].join('\n');

const version = process.argv[2];
if (version) {
  const release = CHANGELOG.find((r) => r.version === version);
  process.stdout.write(release ? body(release.items) : FOOTER);
} else {
  process.stdout.write(JSON.stringify(Object.fromEntries(CHANGELOG.map((r) => [r.version, body(r.items)])), null, 1));
}
