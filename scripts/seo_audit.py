import re, glob, os
from collections import Counter

BS = chr(92)  # backslash, avoid literal in source

# robots.txt disallowed paths
disallow = set()
with open('robots.txt') as f:
    for ln in f:
        m = re.match(r'Disallow:\s*(\S+)', ln)
        if m:
            disallow.add(m.group(1).lstrip('/'))
disallow_roots = {d.rstrip('/') for d in disallow}

# sitemap urls -> normalized paths
sm = open('sitemap.xml', encoding='utf-8').read()
sitemap_urls = re.findall(r'<loc>\s*([^<]+?)\s*</loc>', sm)
sitemap_paths = set()
for u in sitemap_urls:
    p = re.sub(r'https?://[^/]+', '', u).strip('/').rstrip('/')
    sitemap_paths.add(p)

files = []
for f in glob.glob('**/*.html', recursive=True):
    f = f.replace(BS, '/')
    if 'graphify-out' in f or 'node_modules' in f:
        continue
    files.append(f)

def grab(s, pat, fl=re.I | re.S):
    m = re.search(pat, s, fl)
    return m.group(1).strip() if m else None

rows = []
for path in sorted(files):
    s = open(path, encoding='utf-8', errors='replace').read()
    title = grab(s, r'<title[^>]*>(.*?)</title>')
    desc = grab(s, r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']')
    canon = grab(s, r'<link\s+rel=["\']canonical["\']\s+href=["\'](.*?)["\']')
    robots = grab(s, r'<meta\s+name=["\']robots["\']\s+content=["\'](.*?)["\']')
    hreflang = len(re.findall(r'rel=["\']alternate["\']\s+hreflang=', s, re.I))
    jsonld = ('application/ld+json' in s)
    h1 = len(re.findall(r'<h1[\s>]', s, re.I))
    rel = path
    first = rel.split('/')[0]
    dis = (rel in disallow_roots) or (first in disallow_roots) or any(rel.startswith(d + '/') for d in disallow_roots)
    cpath = re.sub(r'https?://[^/]+', '', canon).strip('/').rstrip('/') if canon else None
    keys = {rel.rstrip('/'), rel.replace('.html', '').rstrip('/'), rel.replace('/index.html', '').rstrip('/')}
    if cpath is not None:
        keys.add(cpath)
    in_sm = bool(keys & sitemap_paths)
    rows.append(dict(path=rel, title=title, desc=desc, canon=canon, robots=robots,
                     hreflang=hreflang, jsonld=jsonld, h1=h1, dis=dis, in_sm=in_sm))

public = [r for r in rows if not r['dis']]
print("TOTAL html: %d | public(indexable): %d | robots-disallowed: %d" % (len(rows), len(public), len(rows) - len(public)))
print("sitemap <loc> count: %d" % len(sitemap_paths))
print()

def flag(cond):
    return [r['path'] for r in public if cond(r)]

def show(label, lst, limit=60):
    print("== %s: %d" % (label, len(lst)))
    for p in lst[:limit]:
        print("   ", p)

show("PUBLIC missing canonical", flag(lambda r: not r['canon']))
show("PUBLIC with NOINDEX", flag(lambda r: r['robots'] and 'noindex' in r['robots'].lower()))
show("PUBLIC missing <title>", flag(lambda r: not r['title']))
show("PUBLIC missing meta description", flag(lambda r: not r['desc']))
show("PUBLIC missing JSON-LD", flag(lambda r: not r['jsonld']))
show("PUBLIC not in sitemap", flag(lambda r: not r['in_sm']))
show("PUBLIC with != 1 H1", ["%s (h1=%d)" % (r['path'], r['h1']) for r in public if r['h1'] != 1])

# duplicate titles / descriptions among public
tc = Counter(r['title'] for r in public if r['title'])
dc = Counter(r['desc'] for r in public if r['desc'])
dup_t = {t: n for t, n in tc.items() if n > 1}
dup_d = {d: n for d, n in dc.items() if n > 1}
print("== DUPLICATE titles (public): %d distinct" % len(dup_t))
for t, n in list(dup_t.items())[:15]:
    print("   [%dx] %s" % (n, (t or '')[:80]))
print("== DUPLICATE descriptions (public): %d distinct" % len(dup_d))
for d, n in list(dup_d.items())[:15]:
    print("   [%dx] %s" % (n, (d or '')[:80]))

# title length issues
print("== title length out of 30-65 range (public):")
for r in public:
    if r['title'] and not (30 <= len(r['title']) <= 65):
        print("    %s  len=%d" % (r['path'], len(r['title'])))
