#!/usr/bin/env python3
"""Вызов API Beget (аккаунт aleks2si) без печати пароля.

    python3 -I tools/beget-api.py site/getList
    python3 -I tools/beget-api.py domain/getList
    python3 -I tools/beget-api.py site/linkDomain '{"domain_id": 123, "site_id": 9469516}'

Доступы — ~/.claude/secrets/beget.env (BEGET_LOGIN, BEGET_API_PASSWORD). Файл читается построчно
регэкспом, а не через `source`: в пароле спецсимволы. Пароль уходит POST-ом (не в адресе) и
вычищается из ответа. При включённом VPN запрос идёт в обход через en0 (BEGET_BIND).
"""
import http.client, json, os, re, ssl, subprocess, sys, urllib.parse

env = {}
for line in open(os.path.expanduser('~/.claude/secrets/beget.env'), encoding='utf-8'):
    m = re.match(r'^\s*([A-Z_]+)\s*=\s*(.*?)\s*$', line)
    if m:
        v = m.group(2)
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
            v = v[1:-1]
        env[m.group(1)] = v

if len(sys.argv) < 2:
    print(__doc__); sys.exit(2)
params = {'login': env['BEGET_LOGIN'], 'passwd': env['BEGET_API_PASSWORD'], 'output_format': 'json'}
if len(sys.argv) > 2:
    params['input_format'] = 'json'
    params['input_data'] = json.dumps(json.loads(sys.argv[2]), ensure_ascii=False)

src = None
iface = subprocess.run(['route', '-n', 'get', 'default'], capture_output=True, text=True).stdout
if re.search(r'interface:\s*(utun|ppp|ipsec|tun)', iface):
    ip = subprocess.run(['ipconfig', 'getifaddr', os.environ.get('BEGET_BIND', 'en0')], capture_output=True, text=True).stdout.strip()
    src = (ip, 0) if ip else None

c = http.client.HTTPSConnection('api.beget.com', 443, timeout=60, source_address=src, context=ssl.create_default_context())
c.request('POST', '/api/' + sys.argv[1], urllib.parse.urlencode(params), {'Content-Type': 'application/x-www-form-urlencoded'})
r = c.getresponse()
txt = r.read().decode('utf-8', 'replace').replace(env['BEGET_API_PASSWORD'], '***')
try:
    d = json.loads(txt)
    print(json.dumps(d, ensure_ascii=False, indent=1))
    ok = d.get('status') == 'success' and (d.get('answer') or {}).get('status', 'success') == 'success'
    sys.exit(0 if ok else 1)
except ValueError:
    print(r.status, txt[:2000]); sys.exit(1)
