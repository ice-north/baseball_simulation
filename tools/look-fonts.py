# 新しい見た目（試作）の字（見出し・本文の日本語・数字と英字）を、使う字だけに絞って書き出す。
#   pip install fonttools brotli
#   python3 tools/look-fonts.py <フォントのフォルダ>
# フォルダには google/fonts の次の TTF を置く:
#   DelaGothicOne-Regular.ttf（ofl/delagothicone）
#   ZenKakuGothicNew-Regular.ttf・ZenKakuGothicNew-Bold.ttf（ofl/zenkakugothicnew）
#   BarlowSemiCondensed-Regular.ttf・BarlowSemiCondensed-SemiBold.ttf（ofl/barlowsemicondensed）
#
# - 日本語の2つ（見出し Dela Gothic One・本文 Zen Kaku Gothic New）はどちらも1つ約2.4MB あるので、
#   JIS 第1水準・かな・記号に、src/・server/・アプリの画面に出てくる字（人名・地名の第2水準など）を足して絞る。
#   名前の表に字を足したら、これを回し直す（無い字は今までのフォントで出るだけで、壊れはしない）。
# - Web: 日本語の2つは配布 HTML に埋め込まず public/fonts/ に置く（入にした人だけが読む。埋め込むと切の人も重くなる）。
#   数字と英字（Barlow Semi Condensed）は英数記号だけで小さいので、look.css から埋め込む。
#   ⚠ 表の桁そろえ（tabular-nums）を効かせるため、字の形の切り替え（tnum など）は残す。
# - アプリ（res/font、Android は woff2 を読めないので TTF）: 見出しはそのまま。本文は
#   Compose の FontFamily が「数字はこのフォント、日本語はあのフォント」と字ごとに分けられないので、
#   Zen Kaku Gothic New に Barlow Semi Condensed の英数記号を入れた1つのフォントにする（look_body_*）。
import glob
import os
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
WEB_FONTS = os.path.join(ROOT, 'public', 'fonts')
INLINE_FONTS = os.path.join(ROOT, 'src', 'online', 'look', 'fonts')
APP_FONTS = os.path.join(ROOT, 'mobile', 'androidApp', 'src', 'main', 'res', 'font')
TMP = tempfile.mkdtemp()
ASCII = set(chr(c) for c in range(0x20, 0x7F))
NUM_UNICODES = '--unicodes=U+0020-007E,U+00B7,U+2013,U+2014,U+2212'


def src(name):
    return os.path.join(SRC, name)


def used_chars():
    chars = set(ASCII)
    chars |= set(chr(c) for c in range(0xFF01, 0xFF5F))
    for ku in range(1, 48):
        if 9 <= ku <= 15:
            continue
        for ten in range(1, 95):
            try:
                chars.add(bytes([0xA0 + ku, 0xA0 + ten]).decode('euc_jp'))
            except UnicodeDecodeError:
                pass
    patterns = ('src/**/*.js', 'src/**/*.jsx', 'src/**/*.json', 'server/**/*.js', 'server/**/*.mjs', 'mobile/*/src/main/**/*.kt')
    for pattern in patterns:
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            with open(path, encoding='utf8', errors='ignore') as f:
                chars |= {c for c in f.read() if 0x3000 <= ord(c) <= 0x9FFF or 0xFF00 <= ord(c) <= 0xFFEF}
    return chars


def write_text(name, chars):
    path = os.path.join(TMP, name)
    with open(path, 'w', encoding='utf8') as f:
        f.write(''.join(sorted(chars)))
    return path


def subset(font, out, *args):
    flavor = ['--flavor=woff2'] if out.endswith('.woff2') else []
    subprocess.run(['pyftsubset', font, *flavor, f'--output-file={out}', *args], check=True)
    if out.startswith(ROOT):
        print(f'{os.path.relpath(out, ROOT)}: {os.path.getsize(out) // 1024}KB')


def merge_num(body_path, num_path, out, family, style):
    """本文の日本語フォントに、数字と英字のフォントの字を足す（英数記号は数字のフォントの字を使う）"""
    body = TTFont(body_path)
    num = TTFont(num_path)
    order = body.getGlyphOrder()
    rename = {g: f'num.{g}' for g in num.getGlyphOrder()}
    body_glyf, num_glyf = body['glyf'], num['glyf']
    vmtx = body['vmtx'] if 'vmtx' in body else None
    for g, new in rename.items():
        glyph = num_glyf[g]
        glyph.expand(num_glyf)
        if glyph.isComposite():
            for c in glyph.components:
                c.glyphName = rename[c.glyphName]
        glyph.removeHinting()
        body_glyf.glyphs[new] = glyph
        body['hmtx'].metrics[new] = num['hmtx'].metrics[g]
        if vmtx is not None:
            vmtx.metrics[new] = (body['head'].unitsPerEm, 0)
        order.append(new)
    body.setGlyphOrder(order)
    body_glyf.glyphOrder = order
    num_cmap = num.getBestCmap()
    for table in body['cmap'].tables:
        if table.isUnicode():
            for code, g in num_cmap.items():
                table.cmap[code] = rename[g]
    for record in body['name'].names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID == 4:
            record.string = f'{family} {style}'
        elif record.nameID == 6:
            record.string = f'{family.replace(" ", "")}-{style}'
    body.save(out)
    print(f'{os.path.relpath(out, ROOT)}: {os.path.getsize(out) // 1024}KB')


chars = used_chars()
head_text = ['--text-file=' + write_text('head.txt', chars)]
body_text = ['--text-file=' + write_text('body.txt', chars - ASCII)]

# 見出し（Dela Gothic One）
subset(src('DelaGothicOne-Regular.ttf'), os.path.join(WEB_FONTS, 'look-head.woff2'), *head_text)
subset(src('DelaGothicOne-Regular.ttf'), os.path.join(APP_FONTS, 'look_head.ttf'), *head_text)

# 数字と英字（Barlow Semi Condensed）・本文の日本語（Zen Kaku Gothic New）
for weight, barlow, zen in (('regular', 'Regular', 'Regular'), ('bold', 'SemiBold', 'Bold')):
    num_name = 'regular' if weight == 'regular' else 'semibold'
    subset(src(f'BarlowSemiCondensed-{barlow}.ttf'), os.path.join(INLINE_FONTS, f'barlow-{num_name}.woff2'), NUM_UNICODES, '--layout-features=*')
    subset(src(f'ZenKakuGothicNew-{zen}.ttf'), os.path.join(WEB_FONTS, f'look-body-{weight}.woff2'), *body_text)
    num_ttf = os.path.join(TMP, f'num-{weight}.ttf')
    zen_ttf = os.path.join(TMP, f'zen-{weight}.ttf')
    subset(src(f'BarlowSemiCondensed-{barlow}.ttf'), num_ttf, NUM_UNICODES)
    subset(src(f'ZenKakuGothicNew-{zen}.ttf'), zen_ttf, *body_text)
    merge_num(zen_ttf, num_ttf, os.path.join(APP_FONTS, f'look_body_{weight}.ttf'), 'Look Body', zen)
