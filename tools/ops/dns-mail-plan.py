#!/usr/bin/env python3
"""LINEA · подготовка DNS-записей почты домена (SPF, DMARC, MX, DKIM) — ТОЛЬКО ЧТЕНИЕ И ПЛАН.

    python3 -I tools/ops/dns-mail-plan.py [--dkim='<значение TXT от поддержки Beget>'] [--rua=dmarc@домен]

Что делает:
  1. читает текущие записи домена из API Beget (dns/getData — только чтение) и из публичного DNS (DoH Google);
  2. собирает НОВЫЙ полный набор A/MX/TXT: dns/changeRecords ЗАМЕНЯЕТ все записи типа целиком,
     поэтому существующие A и прочие TXT (например, подтверждение Яндекс/Google) переносятся как есть;
  3. сохраняет input_data в файлы рядом (scratch) и печатает готовые команды tools/beget-api.py dns/changeRecords.
Сам ничего не меняет: изменение боевого DNS подтверждает и запускает владелец.
"""
import json, os, subprocess, sys, tempfile, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOMAIN = 'xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai'   # дизайн-студия-квартир.рф
SPF = 'v=spf1 redirect=beget.com'
MX = [{'priority': 10, 'value': 'mx1.beget.com.'}, {'priority': 20, 'value': 'mx2.beget.com.'}]

args = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
rua = args.get('rua', f'dmarc@{DOMAIN}')
dmarc = f'v=DMARC1; p=none; rua=mailto:{rua}; adkim=r; aspf=r; pct=100'

def api(method, data):
    r = subprocess.run([sys.executable, '-I', os.path.join(REPO, 'tools', 'beget-api.py'), method, json.dumps(data)],
                       capture_output=True, text=True, timeout=60)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {'status': 'error', 'raw': (r.stdout + r.stderr)[-300:]}

def doh(name, t):
    try:
        with urllib.request.urlopen(f'https://dns.google/resolve?name={name}&type={t}', timeout=10) as r:
            j = json.load(r)
        return [a['data'] for a in j.get('Answer', [])] if j.get('Status') == 0 else f"Status {j.get('Status')}"
    except Exception as e:
        return f'ошибка {e.__class__.__name__}'

print('== Публичный DNS (DoH Google)')
for name, t in [(DOMAIN, 'NS'), (DOMAIN, 'A'), (DOMAIN, 'MX'), (DOMAIN, 'TXT'), (f'_dmarc.{DOMAIN}', 'TXT'), (f'beget._domainkey.{DOMAIN}', 'TXT')]:
    print(f'  {t:4} {name}: {doh(name, t)}')

print('\n== Beget API dns/getData (только чтение)')
cur = api('dns/getData', {'fqdn': DOMAIN})
res = (cur.get('answer') or {}).get('result') if isinstance(cur.get('answer'), dict) else None
if not res:
    print('  API не ответил:', json.dumps(cur, ensure_ascii=False)[:300])
    print('  План без текущих записей не собираю: changeRecords заменил бы A-запись сайта. Повторить, когда Beget ответит.')
    sys.exit(1)
rec = res.get('records') or {}
print('  ', json.dumps(rec, ensure_ascii=False))

def clean(lst):
    return [{'priority': int(x.get('priority') or 0), 'value': x['value']} for x in (lst or []) if x.get('value')]

A = clean(rec.get('A'))
if not A:
    print('  У домена нет A-записи — что-то не так, план не собираю.'); sys.exit(1)
txt = [x for x in clean(rec.get('TXT')) if not x['value'].lower().startswith('v=spf1')]
txt.append({'priority': 10, 'value': SPF})
mx = clean(rec.get('MX')) or MX
main = {'fqdn': DOMAIN, 'records': {'A': A, 'MX': mx, 'TXT': txt}}

out = os.environ.get('LINEA_SCRATCH') or tempfile.gettempdir()
files = []
def save(name, data):
    p = os.path.join(out, name); json.dump(data, open(p, 'w'), ensure_ascii=False); files.append(p); return p

p1 = save('dns-main.json', main)
p2 = save('dns-dmarc.json', {'fqdn': f'_dmarc.{DOMAIN}', 'records': {'TXT': [{'priority': 10, 'value': dmarc}]}})
cmds = [f"python3 -I tools/beget-api.py dns/changeRecords \"$(cat '{p1}')\"",
        f"python3 -I tools/beget-api.py dns/changeRecords \"$(cat '{p2}')\""]
if args.get('dkim'):
    p3 = save('dns-dkim.json', {'fqdn': f"{args.get('selector', 'beget')}._domainkey.{DOMAIN}", 'records': {'TXT': [{'priority': 10, 'value': args['dkim']}]}})
    cmds.append(f"python3 -I tools/beget-api.py dns/changeRecords \"$(cat '{p3}')\"")

print('\n== План (НЕ выполнен). Новый набор для домена:')
print('  ', json.dumps(main['records'], ensure_ascii=False))
print(f'   _dmarc: {dmarc}')
print('\n== Команды для владельца (из корня репозитория). Перед запуском сверить A-запись с текущей выше:')
for c in cmds:
    print('  ', c)
print('\nОткат: сохранить текущее (выше) и при необходимости вернуть тем же dns/changeRecords с прежними A/MX/TXT.')
