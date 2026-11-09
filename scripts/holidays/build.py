"""
Праздники стран для вкладки «Календарь»: даты — из python-holidays (открытая библиотека, 150+ стран, официальные
праздники и выходные), описания — начало статьи русской Википедии со ссылкой (CC BY-SA). Пишет
src/data/holidays.json и таблицу для проверки в сводку запуска (GITHUB_STEP_SUMMARY).

Запуск — workflow «Holidays data» (коммит со словом «[holidays]» в первой строке или вручную); локально:
  pip install holidays requests && python scripts/holidays/build.py
Поправки — scripts/holidays/overrides.json: { "KZ:Independence Day": {"name": "…", "wiki": "статья" | ["статья", "запасная"] | null} }.
Название — из поправки, иначе из русской локализации python-holidays, иначе английское. Статья — из поправки (null — без
описания), иначе ищется в Википедии, и найденное берём, только если начало статьи — про праздник или памятный день.
"""
import json, os, re, sys, time, urllib.parse
from datetime import date

import holidays
import requests

YEARS = list(range(2026, 2031))
# Страны: код, название по-русски, флаг.
COUNTRIES = [
    ('RU', 'Россия', '🇷🇺'), ('BY', 'Беларусь', '🇧🇾'), ('KZ', 'Казахстан', '🇰🇿'), ('UA', 'Украина', '🇺🇦'),
    ('UZ', 'Узбекистан', '🇺🇿'), ('KG', 'Киргизия', '🇰🇬'), ('AM', 'Армения', '🇦🇲'), ('GE', 'Грузия', '🇬🇪'),
    ('AZ', 'Азербайджан', '🇦🇿'), ('MD', 'Молдова', '🇲🇩'), ('LV', 'Латвия', '🇱🇻'), ('LT', 'Литва', '🇱🇹'),
    ('EE', 'Эстония', '🇪🇪'), ('PL', 'Польша', '🇵🇱'), ('DE', 'Германия', '🇩🇪'), ('RS', 'Сербия', '🇷🇸'),
    ('TJ', 'Таджикистан', '🇹🇯'), ('ME', 'Черногория', '🇲🇪'), ('CY', 'Кипр', '🇨🇾'), ('CZ', 'Чехия', '🇨🇿'),
    ('FR', 'Франция', '🇫🇷'), ('IT', 'Италия', '🇮🇹'), ('ES', 'Испания', '🇪🇸'), ('TR', 'Турция', '🇹🇷'),
    ('IL', 'Израиль', '🇮🇱'), ('AE', 'ОАЭ', '🇦🇪'), ('TH', 'Таиланд', '🇹🇭'), ('GB', 'Великобритания', '🇬🇧'),
    ('US', 'США', '🇺🇸'),
]
EN_COUNTRY = {'RU': 'Russia', 'BY': 'Belarus', 'KZ': 'Kazakhstan', 'UA': 'Ukraine', 'UZ': 'Uzbekistan', 'KG': 'Kyrgyzstan',
              'AM': 'Armenia', 'GE': 'Georgia', 'AZ': 'Azerbaijan', 'MD': 'Moldova', 'LV': 'Latvia', 'LT': 'Lithuania',
              'EE': 'Estonia', 'PL': 'Poland', 'DE': 'Germany', 'RS': 'Serbia', 'TR': 'Turkey', 'IL': 'Israel',
              'GB': 'United Kingdom', 'US': 'United States', 'TJ': 'Tajikistan', 'ME': 'Montenegro', 'CY': 'Cyprus',
              'CZ': 'Czech Republic', 'FR': 'France', 'IT': 'Italy', 'ES': 'Spain', 'AE': 'United Arab Emirates', 'TH': 'Thailand'}
# Общие праздники — одинаковые во многих странах: название и статья без поиска.
GENERIC = {
    "New Year's Day": ('Новый год', 'Новый год'), 'Christmas Day': ('Рождество Христово', 'Рождество Христово'),
    'Orthodox Christmas Day': ('Рождество Христово', 'Рождество Христово'), 'Christmas Eve': ('Сочельник', 'Рождественский сочельник'),
    'Second Day of Christmas': ('Второй день Рождества', 'Рождество Христово'), 'Boxing Day': ('День подарков', 'День подарков'),
    'Easter Sunday': ('Пасха', 'Пасха'), 'Easter Monday': ('Пасхальный понедельник', 'Светлый понедельник'),
    'Good Friday': ('Страстная пятница', 'Страстная пятница'), 'Orthodox Easter Sunday': ('Пасха', 'Пасха'),
    'Orthodox Easter Monday': ('Пасхальный понедельник', 'Светлый понедельник'), 'Orthodox Good Friday': ('Страстная пятница', 'Страстная пятница'),
    'Ascension Day': ('Вознесение Господне', 'Вознесение Господне'), 'Whit Monday': ('Духов день', 'Духов день'),
    'Whit Sunday': ('Троица', 'День Святой Троицы'), 'Pentecost': ('Троица', 'День Святой Троицы'),
    'Assumption Day': ('Успение Богородицы', 'Успение Пресвятой Богородицы'), 'Assumption of Mary': ('Успение Богородицы', 'Успение Пресвятой Богородицы'),
    "All Saints' Day": ('День всех святых', 'День всех святых'), 'Epiphany': ('Крещение Господне', 'Крещение Господне'),
    'Corpus Christi': ('Праздник Тела Христова', 'Праздник Тела и Крови Христовых'), 'Immaculate Conception': ('Непорочное зачатие', 'Непорочное зачатие Девы Марии'),
    'Labor Day': ('Праздник труда', 'Первое мая (праздник)'), 'Labour Day': ('Праздник труда', 'Первое мая (праздник)'),
    "International Women's Day": ('Международный женский день', 'Международный женский день'),
    'Eid al-Fitr': ('Ураза-байрам', 'Ураза-байрам'), 'Eid al-Adha': ('Курбан-байрам', 'Курбан-байрам'), 'Nowruz': ('Навруз', 'Навруз'),
    'Nowruz Holiday': ('Навруз', 'Навруз'), 'Spring Bank Holiday': ('Весенний банковский выходной', 'Банковский выходной'),
    'Late Summer Bank Holiday': ('Летний банковский выходной', 'Банковский выходной'), 'Early May Bank Holiday': ('Майский банковский выходной', 'Банковский выходной'),
}
# Украина: при военном положении праздники — рабочие дни, python-holidays кладёт их в категорию workday.
CATEGORIES = {'UA': ('public', 'workday')}
ABOUT_DAY = re.compile(r'праздн|памятн|годовщин|отмечается|отмечаемый|торжеств', re.I)
SKIP_TITLE = re.compile(r'^(Public holidays|List of|Holidays in|Праздники |Список )', re.I)
UA = {'User-Agent': 'FriendsNotesHolidays/1.0 (https://github.com/Kamon1996/friends-notes; build script)'}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'data', 'holidays.json')
OVERRIDES = json.load(open(os.path.join(HERE, 'overrides.json'), encoding='utf-8')) if os.path.exists(os.path.join(HERE, 'overrides.json')) else {}

# Переносы выходных и «день отдыха вместо…» — не праздники.
SKIP = re.compile(r'substitut|day off|перенес|выходной день|observed|bridge|in lieu', re.I)
# Один праздник под разными английскими названиями — к одному.
ALIASES = {'Eid al-Fitr Holiday': 'Eid al-Fitr', 'Eid al-Adha Holiday': 'Eid al-Adha', 'Orthodox Christmas': 'Orthodox Christmas Day'}
EST = re.compile(r'\s*\((estimated|ориентировочно|оценочно)\)|\*\s*$', re.I)


NO_WIKI = os.environ.get('HOLIDAYS_NO_WIKI') == '1'  # локальная проверка без сети: только даты и названия


def wiki_get(lang, params):
    if NO_WIKI:
        return {}
    params = {**params, 'format': 'json', 'formatversion': 2}
    for attempt in range(4):
        try:
            r = requests.get(f'https://{lang}.wikipedia.org/w/api.php', params=params, headers=UA, timeout=30)
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {}


def search(lang, query):
    j = wiki_get(lang, {'action': 'query', 'list': 'search', 'srsearch': query, 'srlimit': 3})
    for hit in j.get('query', {}).get('search', []):
        if not SKIP_TITLE.search(hit['title']):
            return hit['title']
    return None


def ru_title_from_en(en_title):
    j = wiki_get('en', {'action': 'query', 'titles': en_title, 'prop': 'langlinks', 'lllang': 'ru', 'redirects': 1})
    pages = j.get('query', {}).get('pages', [])
    for p in pages:
        for ll in p.get('langlinks', []):
            return ll.get('title')
    return None


def summary(ru_title):
    if NO_WIKI:
        return None
    url = 'https://ru.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(ru_title.replace(' ', '_'))
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            if r.status_code == 200:
                j = r.json()
                if j.get('type') == 'disambiguation':
                    return None
                return {'title': j.get('title', ru_title), 'text': (j.get('extract') or '').strip(), 'url': j.get('content_urls', {}).get('desktop', {}).get('page')}
            if r.status_code == 404:
                return None
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return None


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]


def main():
    localized = holidays.list_localized_countries()
    print('python-holidays', holidays.__version__)
    # holidays: страна → {id праздника: [даты]}; info: id → название, описание, ссылка.
    data = {'source': f'python-holidays {holidays.__version__}; описания — Википедия (CC BY-SA 4.0)', 'years': [YEARS[0], YEARS[-1]],
            'countries': [], 'holidays': {}, 'info': {}}
    review = ['| Страна | Праздник (англ.) | Название | Статья | Описание |', '|---|---|---|---|---|']
    for code, name_ru, flag in COUNTRIES:
        langs = localized.get(code, [])
        ru = 'ru' if 'ru' in langs else 'ru_KG' if 'ru_KG' in langs else None
        cats = CATEGORIES.get(code, ('public',))
        h_en = holidays.country_holidays(code, years=YEARS, language='en_US' if 'en_US' in langs else None, categories=cats)
        h_ru = holidays.country_holidays(code, years=YEARS, language=ru, categories=cats) if ru else None
        data['countries'].append({'code': code, 'name': name_ru, 'flag': flag})
        rows = {}
        for d in sorted(h_en.keys()):
            en_names = h_en.get_list(d)
            ru_names = h_ru.get_list(d) if h_ru else [None] * len(en_names)
            for i, en in enumerate(en_names):
                if SKIP.search(en):
                    continue
                estimated = bool(EST.search(en))
                en_clean = EST.sub('', en).strip()
                en_clean = ALIASES.get(en_clean, en_clean)
                ru_name = EST.sub('', ru_names[i]).strip() if i < len(ru_names) and ru_names[i] else None
                hid = f'{code}:{slug(en_clean)}'
                # Дата ориентировочная (исламский календарь на будущие годы) — с «~».
                rows.setdefault(hid, []).append(('~' if estimated else '') + d.isoformat())
                if hid in data['info']:
                    continue
                g = GENERIC.get(en_clean)
                ov = OVERRIDES.get(f'{code}:{en_clean}') or ({'name': g[0], 'wiki': g[1]} if g else {})
                s = None
                if 'wiki' in ov:
                    # Статья выбрана вручную (или null — описания нет).
                    for title in [ov['wiki']] if isinstance(ov['wiki'], str) else ov['wiki'] or []:
                        s = summary(title)
                        if s and s['text']:
                            break
                else:
                    # Поиск: по русскому названию, иначе через английскую статью и её русскую версию.
                    title = search('ru', f'{ru_name} {name_ru}') if ru_name else None
                    if not title:
                        en_title = search('en', f'{en_clean} {EN_COUNTRY[code]}')
                        title = ru_title_from_en(en_title) if en_title else None
                    s = summary(title) if title else None
                    if s and not ABOUT_DAY.search(s['text'][:300]):
                        s = None  # нашлась статья не о празднике (страна, город…) — лучше без описания
                display = ov.get('name') or ru_name or en_clean
                text = (s or {}).get('text', '').replace('\u0301', '')  # без знаков ударения
                if len(text) > 600:
                    cut = text[:600]
                    text = cut[: cut.rfind('. ') + 1] or cut
                data['info'][hid] = {'name': display, 'en': en_clean, 'text': text, 'url': (s or {}).get('url')}
                review.append(f"| {code} | {en_clean} | {display} | {(s or {}).get('title', '—')} | {text[:80].replace('|', '/')}… |")
                time.sleep(0.2)
        data['holidays'][code] = rows
        print(code, ru or 'en', len(rows), 'праздников,', sum(map(len, rows.values())), 'дат')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('записано', OUT, os.path.getsize(OUT) // 1024, 'КБ;', len(data['info']), 'праздников')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write('## Праздники: проверка\n\n' + '\n'.join(review) + '\n')
    else:
        print('\n'.join(review))


if __name__ == '__main__':
    sys.exit(main())
