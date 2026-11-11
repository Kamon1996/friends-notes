// Тестовый ключ магии для веб-сборки под сквозные тесты: `node scripts/e2e-key.js` перед `expo export`.
// Ключ ненастоящий: наружу сценарии не ходят — запросы к сервисам перехватывает сам тест и отвечает за них.
// Без ключа экран «Из заметки» честно пишет, что разбор недоступен, и проверить его нечем.
// Правит app.json на месте: в CI это одноразовая копия; локально верни файл (`git checkout app.json`).
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
app.expo.extra = { ...app.expo.extra, ai: { gemini: 'e2e-key' } };
fs.writeFileSync(file, `${JSON.stringify(app, null, 2)}\n`);
console.log('app.json: тестовый ключ магии для сквозных тестов');
