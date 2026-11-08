"""Ошибки приложения в Sentry: посмотреть с полным контекстом и отметить, что починено.

    python3 scripts/sentry/issues.py list    [--query "is:unresolved"] [--days 14] [--limit 10] [--issue ID]
    python3 scripts/sentry/issues.py resolve --issue ID --note "Починено в abc1234, выйдет в 1.29.1"
    python3 scripts/sentry/issues.py note    --issue ID --note "Причина: …"
    python3 scripts/sentry/issues.py reopen  --issue ID --note "Повторилось на …"

Токен — в переменной SENTRY_READ_TOKEN: личный токен Sentry с правами Project: Read, Organization: Read и
Issue & Event: Read & Write (чтобы отмечать). Хранится секретом репозитория и в чат не попадает.
list печатает для каждой проблемы: статус, заголовок, где, сколько раз и у скольких, первый и последний раз, стек
последнего события (▶ — наш код), устройство и последние шаги. «Починено» — статус resolved плюс комментарий с
коммитом и версией: если ошибка повторится в новой версии, Sentry сам вернёт её в открытые (regression).
В GitHub Actions всё пишется и в итог запуска.
"""
from datetime import datetime, timedelta, timezone
import argparse, json, os, sys, urllib.error, urllib.parse, urllib.request

ORG, PROJECT = 'testorg-oz', 'friends-notes'
API = os.environ.get('SENTRY_API', 'https://sentry.io/api/0')


def call(method, path, params=None, body=None):
    url = f'{API}{path}' + (('?' + urllib.parse.urlencode(params)) if params else '')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Authorization': f'Bearer {os.environ["SENTRY_READ_TOKEN"]}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def get(path, params=None):
    return call('GET', path, params)


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


STATUS = {'unresolved': 'открыта', 'resolved': 'починено', 'ignored': 'отложена', 'reprocessing': 'обрабатывается'}


def out(text):
    print(text)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write(text + '\n')


def comment(issue, text):
    """Комментарий к проблеме (в Sentry — «Activity → Comment»)."""
    for path in (f'/organizations/{ORG}/issues/{issue}/comments/', f'/issues/{issue}/comments/'):
        try:
            return call('POST', path, body={'text': text, 'mentions': []})
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise RuntimeError('комментарий не принят')


def set_status(issue, status):
    return call('PUT', f'/organizations/{ORG}/issues/{issue}/', body={'status': status, 'statusDetails': {}})


def list_issues(a):
    if a.issue:
        issues = [get(f'/organizations/{ORG}/issues/{a.issue}/')]
    else:
        # Sentry принимает только периоды 24h и 14d (иначе 400); точнее отсекаем сами по lastSeen.
        period = '24h' if a.days <= 1 else '14d'
        issues = get(f'/projects/{ORG}/{PROJECT}/issues/', {'query': a.query, 'statsPeriod': period, 'limit': a.limit, 'sort': 'date'})
        since = (datetime.now(timezone.utc) - timedelta(days=a.days)).strftime('%Y-%m-%dT%H:%M:%S')
        issues = [it for it in issues if (it.get('lastSeen') or '') >= since]
    md = [f'# Sentry · {PROJECT}: {len(issues)} проблем ({a.query if not a.issue else a.issue}, {a.days} дн.)', '']
    for it in issues:
        st = STATUS.get(it.get('status'), it.get('status'))
        sub = (it.get('substatus') or '').replace('_', ' ')
        md.append(f"## {it.get('shortId')} (id {it.get('id')}) · {st}{f' · {sub}' if sub else ''} · {it.get('title')}")
        md.append(f"Где: {it.get('culprit')} · событий {it.get('count')} · людей {it.get('userCount')} · "
                  f"первый раз {it.get('firstSeen', '')[:16]} · последний {it.get('lastSeen', '')[:16]} · {it.get('permalink')}")
        try:
            ev = get(f"/organizations/{ORG}/issues/{it['id']}/events/latest/")
            md += ['```'] + event_md(ev) + ['```']
        except Exception as e:  # одно событие не прочиталось — остальные всё равно покажем
            md.append(f'(последнее событие не прочиталось: {e})')
        md.append('')
    out('\n'.join(md))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('action', nargs='?', default='list', choices=['list', 'resolve', 'note', 'reopen'])
    ap.add_argument('--query', default='is:unresolved')
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--issue', default='')
    ap.add_argument('--note', default='')
    a = ap.parse_args()
    if not os.environ.get('SENTRY_READ_TOKEN'):
        out('Нет SENTRY_READ_TOKEN — добавь секрет репозитория (Settings → Secrets and variables → Actions).')
        sys.exit(2)
    if a.action == 'list':
        return list_issues(a)
    if not a.issue:
        out('Укажи --issue')
        sys.exit(2)
    try:
        if a.action == 'resolve':
            set_status(a.issue, 'resolved')
        elif a.action == 'reopen':
            set_status(a.issue, 'unresolved')
        if a.note:
            comment(a.issue, a.note)
    except urllib.error.HTTPError as e:
        hint = ' — у токена нет права Issue & Event: Write' if e.code == 403 else ''
        out(f'Sentry ответил {e.code} на «{a.action}» для {a.issue}{hint}')
        sys.exit(1)
    it = get(f'/organizations/{ORG}/issues/{a.issue}/')
    out(f"{it.get('shortId')} · {STATUS.get(it.get('status'), it.get('status'))} · {it.get('title')}" + (f'\nКомментарий: {a.note}' if a.note else ''))


if __name__ == '__main__':
    main()
