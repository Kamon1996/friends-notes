"""Свежие ошибки из Sentry с полным контекстом — для разбора и починки.

    SENTRY_READ_TOKEN=... python3 scripts/sentry/issues.py [--query "is:unresolved"] [--limit 10] [--days 14] [--issue ID]

Токен — личный, только для чтения (event:read, project:read, org:read); хранится как секрет репозитория и в чат не попадает.
Печатает для каждой проблемы: заголовок, где, сколько раз и у скольких, в какой версии, стек последнего события
(с пометкой «наш код»), теги устройства и последние шаги (breadcrumbs). В GitHub Actions пишет то же в итог запуска.
"""
import argparse, json, os, sys, urllib.parse, urllib.request

ORG, PROJECT = 'testorg-oz', 'friends-notes'
API = os.environ.get('SENTRY_API', 'https://sentry.io/api/0')


def get(path, params=None):
    url = f'{API}{path}' + (('?' + urllib.parse.urlencode(params)) if params else '')
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {os.environ["SENTRY_READ_TOKEN"]}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def frames_md(entry):
    out = []
    for exc in entry.get('data', {}).get('values', []) or []:
        out.append(f"**{exc.get('type')}**: {exc.get('value')}")
        frames = (exc.get('stacktrace') or {}).get('frames') or []
        for f in reversed(frames[-25:]):
            mark = '▶' if f.get('inApp') else ' '
            where = f.get('filename') or f.get('module') or '?'
            out.append(f"    {mark} {f.get('function') or '?'}  {where}:{f.get('lineNo') or '?'}")
    return out


def event_md(ev):
    lines = []
    tags = {t['key']: t['value'] for t in ev.get('tags', [])}
    keep = ['release', 'environment', 'device', 'os', 'app.device', 'handled', 'mechanism']
    lines.append('Теги: ' + ', '.join(f'{k}={tags[k]}' for k in keep if k in tags))
    for entry in ev.get('entries', []):
        if entry.get('type') == 'exception':
            lines += frames_md(entry)
        elif entry.get('type') == 'breadcrumbs':
            crumbs = entry.get('data', {}).get('values', [])[-15:]
            if crumbs:
                lines.append('Последние шаги:')
                for c in crumbs:
                    msg = c.get('message') or json.dumps(c.get('data') or {}, ensure_ascii=False)[:160]
                    lines.append(f"    {c.get('timestamp', '')[11:19]} {c.get('category', '')}: {msg}")
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--query', default='is:unresolved')
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--issue', default='')
    a = ap.parse_args()
    if not os.environ.get('SENTRY_READ_TOKEN'):
        print('Нет SENTRY_READ_TOKEN — добавь секрет репозитория (Settings → Secrets and variables → Actions).')
        sys.exit(2)
    if a.issue:
        issues = [get(f'/organizations/{ORG}/issues/{a.issue}/')]
    else:
        issues = get(f'/projects/{ORG}/{PROJECT}/issues/', {'query': a.query, 'statsPeriod': f'{a.days}d', 'limit': a.limit, 'sort': 'date'})
    md = [f'# Sentry · {PROJECT}: {len(issues)} проблем ({a.query}, {a.days} дн.)', '']
    for it in issues:
        md.append(f"## {it.get('shortId')} · {it.get('title')}")
        md.append(f"Где: {it.get('culprit')} · событий {it.get('count')} · людей {it.get('userCount')} · "
                  f"первый раз {it.get('firstSeen', '')[:16]} · последний {it.get('lastSeen', '')[:16]} · {it.get('permalink')}")
        try:
            ev = get(f"/organizations/{ORG}/issues/{it['id']}/events/latest/")
            md += ['```'] + event_md(ev) + ['```']
        except Exception as e:  # одно событие не прочиталось — остальные всё равно покажем
            md.append(f'(последнее событие не прочиталось: {e})')
        md.append('')
    text = '\n'.join(md)
    print(text)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write(text + '\n')


if __name__ == '__main__':
    main()
