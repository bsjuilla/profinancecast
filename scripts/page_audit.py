import re, os, glob
from collections import Counter, defaultdict

BS = chr(92)
ROOT = os.getcwd()

def norm(p):
    return p.replace(BS, '/')

html_files = []
for f in glob.glob('**/*.html', recursive=True):
    f = norm(f)
    if any(s in f for s in ('graphify-out', 'node_modules', 'docs/')):
        continue
    html_files.append(f)

EXTERNAL = ('http://', 'https://', '//', 'mailto:', 'tel:', 'javascript:', 'data:')

def exists_target(path):
    """Resolve a site path to a real file (cleanUrls + index.html aware)."""
    path = path.strip()
    if not path:
        return None  # empty
    cand = path.lstrip('/')
    options = [cand, cand + '.html', cand.rstrip('/') + '/index.html', cand + '/index.html']
    if cand == '' or path == '/':
        options.append('index.html')
    for o in options:
        if o and os.path.isfile(o):
            return o
    return False  # not found

def resolve_rel(page, href):
    """Resolve href relative to the page's directory; return site-rooted path."""
    if href.startswith('/'):
        return href
    base = os.path.dirname(page)
    joined = norm(os.path.normpath(os.path.join(base, href)))
    return '/' + joined

# Collect referenced js/inline + js/ files (to find dead ones)
referenced_assets = set()

issues = defaultdict(list)   # page -> [(kind, detail)]
GLOBAL = defaultdict(list)   # kind -> [(page, detail)]

def add(page, kind, detail):
    issues[page].append((kind, detail))
    GLOBAL[kind].append((page, detail))

for page in sorted(html_files):
    s = open(page, encoding='utf-8', errors='replace').read()

    # 1) Duplicate element IDs (CLASH)
    ids = re.findall(r'\bid=["\']([^"\']+)["\']', s)
    dup = {i: n for i, n in Counter(ids).items() if n > 1}
    for i, n in dup.items():
        add(page, 'DUP_ID', f'#{i} x{n}')

    # 2) Internal page links (<a href>)  — dead ends / broken links
    for m in re.finditer(r'<a\b[^>]*\bhref=["\']([^"\']*)["\']', s, re.I):
        href = m.group(1).strip()
        if href == '' :
            add(page, 'EMPTY_HREF', '<a href="">')
            continue
        if href == '#':
            add(page, 'HASH_HREF', '<a href="#">')
            continue
        if href.startswith('#') or href.lower().startswith(EXTERNAL):
            continue
        target = href.split('#')[0].split('?')[0]
        if not target:
            continue
        site = resolve_rel(page, target)
        r = exists_target(site)
        if r is False:
            add(page, 'BROKEN_LINK', f'{href} -> {site}')

    # 3) Asset srcs (script/link/img) — broken asset (query-stripped)
    for m in re.finditer(r'\b(?:src|href)=["\']([^"\']+\.(?:js|css|png|jpg|jpeg|webp|avif|svg|woff2?|ico|webmanifest|json))(?:\?[^"\']*)?["\']', s, re.I):
        asset = m.group(1).strip()
        if asset.lower().startswith(EXTERNAL):
            continue
        site = resolve_rel(page, asset)
        local = site.lstrip('/')
        if local.endswith('.js') and ('/js/' in site or local.startswith('js/')):
            referenced_assets.add(local)
        if not os.path.isfile(local):
            add(page, 'BROKEN_ASSET', f'{asset} -> {local}')

# 4) Dead js/inline files (never referenced by any HTML)
inline_files = [norm(f) for f in glob.glob('js/inline/*.js')]
for f in inline_files:
    if f not in referenced_assets:
        GLOBAL['DEAD_INLINE_FILE'].append((f, 'never referenced by any HTML <script src>'))

# ---- Report ----
print('=== PAGES SCANNED: %d ===' % len(html_files))
print()
order = ['BROKEN_LINK', 'BROKEN_ASSET', 'DUP_ID', 'EMPTY_HREF', 'HASH_HREF', 'DEAD_INLINE_FILE']
labels = {
    'BROKEN_LINK': 'BROKEN internal links (dead end — target file missing)',
    'BROKEN_ASSET': 'BROKEN asset references (js/css/img missing)',
    'DUP_ID': 'DUPLICATE element IDs (clash)',
    'EMPTY_HREF': 'EMPTY href (dead end)',
    'HASH_HREF': 'href="#" placeholder (possible dead end)',
    'DEAD_INLINE_FILE': 'DEAD js/inline files (never loaded)',
}
for k in order:
    items = GLOBAL.get(k, [])
    print('## %s: %d' % (labels[k], len(items)))
    # group HASH_HREF count per page (too noisy to list each)
    if k == 'HASH_HREF':
        per = Counter(p for p, _ in items)
        for p, n in sorted(per.items(), key=lambda x: -x[1])[:25]:
            print('   %-45s x%d' % (p, n))
    else:
        for p, d in items[:80]:
            print('   %-45s %s' % (p, d))
    print()
