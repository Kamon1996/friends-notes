# Экспорт одобренных фраз (и черновиков, которые ещё не разобраны) из разбора (страница «Голос Рейчел», её отметки выгружаются в <db-dir>/reviews/*.json) в src/lib/voice/phrases.ts.
#   {n} — число друзей, {друг} — «друг/друга/друзей» по {n}; {k} — число загадок/новых, {человек}, {загадка}, {новым другом}, {идея} — по {k};
#   {k_instr} — «двумя/тремя/четырьмя»; {K_coll} — «Двое/Трое/Четверо»; {name} — имя друга;
#   {соцсеть} — «соцсеть/соцсети/соцсетей» по {n}; {друга} — «у 1 друга / у 5 друзей» по {k}.
# python3 export_ts.py <db-dir> <out.ts>
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
db_dir, out = sys.argv[1], sys.argv[2]
bank = json.load(open(os.path.join(HERE, 'bank.json'), encoding='utf-8'))
rev = {}
for f in glob.glob(os.path.join(db_dir, 'reviews/*.json')):
    d = json.load(open(f, encoding='utf-8'))
    rev[os.path.basename(f)[:-5]] = d.get('data', d)

BUCKETS = {
    'gender.start': {'1 друг': 'one', '2–10': 'few', '11–60': 'some', '61–200': 'many', 'больше 200': 'huge'},
    'gender.done': {'1 друг': 'one', '2–200': 'some', 'больше 200': 'huge'},
    'gender.left': {'1': 'one', '2–4': 'few', '5 и больше': 'many', 'больше половины': 'most'},
    'gender.form': {'угадала': 'guessed', 'засомневалась': 'unsure', 'переименовали': 'renamed'},
    'gender.why': {'Саша, Шура, Саня': 'alex', 'Женя': 'evg', 'Валя': 'val', 'Слава': 'slava', 'Стася': 'stas', 'Ника': 'nika', 'Крис': 'kris',
                   'Ким, Ли': 'surname', 'Сантехник, Сосед': 'role', 'остальные': 'other'},
}
CHOICE = {'заголовок': 'gender.choice.title', 'текст': 'gender.choice.text', 'кнопки': 'gender.choice.buttons', 'если «Оставить так»': 'gender.choice.leave'}


def template(text):
    t = text
    if re.fullmatch(r'(7|3) загад(ок|ки)', t):
        return '{k} {загадка}'
    t = t.replace('312 из 312', '{n} из {n}')
    t = re.sub(r'\b(7|34|124|312) (друзей|друга)\b', '{n} {друг}', t)
    t = re.sub(r'Все (34|312)\b', 'Все {n}', t)
    t = re.sub(r'^(312|124|34)(?=[?!…\s])', '{n}', t)
    t = re.sub(r'\b(3|7) человека?\b', '{k} {человек}', t)
    t = t.replace('С тремя', 'С {k_instr}').replace('Трое', '{K_coll}')
    t = t.replace('с 5 новыми друзьями', 'с {k} {новым другом}')
    t = t.replace('Нашла 5 идей', 'Нашла {k} {идея}')
    t = t.replace('Сантехник?', '{name}?')
    if t.endswith('.') and not t.endswith('..'):
        t = t[:-1]
    return t


rows = []
for p in bank['phrases']:
    r = rev.get(p['id'], {})
    # Черновик (draft) идёт в приложение, пока его не разобрали; отклонённый — нет.
    if r.get('status') != 'ok' and not (p.get('draft') and r.get('status') in (None, 'pending')):
        continue
    sit = p['sit']
    if sit.startswith('gifts.'):
        continue  # идеи подарков — «скоро», фразы понадобятся позже
    text = r.get('text') or p['text']
    bucket = None
    if sit == 'gender.choice':
        sit = CHOICE[p['bucket']]
        if sit == 'gender.choice.title' and text.startswith('Одна'):
            bucket = 'one'
    elif sit in BUCKETS:
        bucket = BUCKETS[sit].get(p['bucket'])
    elif sit == 'menu.privacy':
        sit = 'menu.privacy.names' if 'имена' in text else 'menu.privacy.notes'
    if sit == 'gender.cards' and text in ('Отложим',):
        continue  # кнопки «потом» больше нет
    rows.append({'sit': sit, 'bucket': bucket, 'text': template(text), 'coffee': any(c in text.lower() for c in ('коф', 'латте'))})

by, seen = {}, set()
for r in rows:
    key = (r['sit'], r['bucket'], r['text'])
    if key in seen:
        continue
    seen.add(key)
    by.setdefault(r['sit'], []).append(r)
lines = ['// Сгенерировано из разбора фраз: python3 scripts/voice/export_ts.py <выгрузка разбора> src/lib/voice/phrases.ts — правь в разборе, не здесь.',
         '// Голос ИИ: Рейчел из сериала, помогает в приложении; имени в интерфейсе нет.',
         "import type { Phrase } from './types';", '', 'export const PHRASES: Record<string, Phrase[]> = {']
for sit in sorted(by):
    lines.append(f'  {json.dumps(sit, ensure_ascii=False)}: [')
    for r in by[sit]:
        extra = ''
        if r['bucket']:
            extra += f", bucket: {json.dumps(r['bucket'])}"
        if r['coffee']:
            extra += ', coffee: true'
        lines.append(f"    {{ text: {json.dumps(r['text'], ensure_ascii=False)}{extra} }},")
    lines.append('  ],')
lines.append('};')
open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(out, len(rows), 'phrases in', len(by), 'situations')
for sit in sorted(by):
    for r in by[sit]:
        print(f"{sit:24} {str(r['bucket'] or ''):8} {'☕' if r['coffee'] else ' '} {r['text']}")
