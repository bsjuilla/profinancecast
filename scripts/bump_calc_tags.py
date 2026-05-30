import glob, re
changed = []
for path in glob.glob('**/*.html', recursive=True):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        s = f.read()
    o = s
    s = re.sub(r'pfc-debt-engine\.js\?v=[^"\']+', 'pfc-debt-engine.js?v=20260530a-rollfwd', s)
    s = re.sub(r'tools-take-home-pay-3\.js\?v=[^"\']+', 'tools-take-home-pay-3.js?v=20260530a-fix', s)
    if s != o:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(s)
        changed.append(path.replace('\\', '/'))
print('bumped', len(changed), 'pages:')
for c in sorted(changed):
    print('  ' + c)
