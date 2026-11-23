# 新しい見た目（試作）の見出しと数字のフォントを、使う字だけに絞って書き出す。
#   pip install fonttools brotli
#   python3 tools/look-fonts.py <DelaGothicOne-Regular.ttf> <BarlowSemiCondensed-Regular.ttf> <BarlowSemiCondensed-SemiBold.ttf>
# 元のフォントは google/fonts（ofl/delagothicone・ofl/barlowsemicondensed）。
#
# - 見出し（Dela Gothic One）は全部で約2.4MB あるので、JIS 第1水準・かな・英数記号に、
#   src/・server/・アプリの画面に出てくる字（人名・地名の第2水準など）を足して絞る。
#   ⚠ 配布 HTML に埋め込まず public/fonts/ に置く（入にした人だけが読む。埋め込むと切の人も重くなる）。
#   名前の表に字を足したら、これを回し直す（無い字は今までのフォントで出るだけで、壊れはしない）。
# - 数字と英字（Barlow Semi Condensed）は英数記号だけ。小さいので look.css から埋め込む。
#   ⚠ 表の桁そろえ（tabular-nums）を効かせるため、字の形の切り替え（tnum など）は残す。
# - アプリにも同じ字を TTF で書き出す（mobile/androidApp/src/main/res/font/look_head・look_num_*。Android は woff2 を読めない）。
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dela, barlow_regular, barlow_semibold = sys.argv[1:4]

chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set(chr(c) for c in range(0xFF01, 0xFF5F))
for ku in range(1, 48):
    if 9 <= ku <= 15:
        continue
    for ten in range(1, 95):
        try:
            chars.add(bytes([0xA0 + ku, 0xA0 + ten]).decode('euc_jp'))
        except UnicodeDecodeError:
            pass
for pattern in ('src/**/*.js', 'src/**/*.jsx', 'src/**/*.json', 'server/**/*.js', 'server/**/*.mjs', 'mobile/*/src/main/**/*.kt'):
    for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
        with open(path, encoding='utf8', errors='ignore') as f:
            chars |= {c for c in f.read() if 0x3000 <= ord(c) <= 0x9FFF or 0xFF00 <= ord(c) <= 0xFFEF}

text = os.path.join(ROOT, 'node_modules', '.look-head-chars.txt')
with open(text, 'w', encoding='utf8') as f:
    f.write(''.join(sorted(chars)))

APP_FONTS = os.path.join(ROOT, 'mobile', 'androidApp', 'src', 'main', 'res', 'font')

def subset(src, out, *args):
    flavor = ['--flavor=woff2'] if out.endswith('.woff2') else []
    subprocess.run(['pyftsubset', src, *flavor, f'--output-file={out}', *args], check=True)
    print(f'{os.path.relpath(out, ROOT)}: {os.path.getsize(out) // 1024}KB')

head = [f'--text-file={text}']
subset(dela, os.path.join(ROOT, 'public', 'fonts', 'look-head.woff2'), *head)
subset(dela, os.path.join(APP_FONTS, 'look_head.ttf'), *head)
num = ['--unicodes=U+0020-007E,U+00B7,U+2013,U+2014,U+2212', '--layout-features=*']
for src, name in ((barlow_regular, 'regular'), (barlow_semibold, 'semibold')):
    subset(src, os.path.join(ROOT, 'src', 'online', 'look', 'fonts', f'barlow-{name}.woff2'), *num)
    subset(src, os.path.join(APP_FONTS, f'look_num_{name}.ttf'), *num)
