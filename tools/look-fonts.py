# 新しい見た目（試作）の字を書き出す。見出し・本文の日本語・数字と英字は使う字だけに絞る。
#   pip install fonttools brotli
#   python3 tools/look-fonts.py <フォントのフォルダ>
# フォルダには google/fonts の次の TTF を置く:
#   DelaGothicOne-Regular.ttf（ofl/delagothicone）
#   ZenKakuGothicNew-Regular.ttf・ZenKakuGothicNew-Bold.ttf（ofl/zenkakugothicnew）
#   BarlowSemiCondensed-Regular.ttf・BarlowSemiCondensed-SemiBold.ttf（ofl/barlowsemicondensed）
#   Graduate-Regular.ttf（ofl/graduate）・AlfaSlabOne-Regular.ttf（ofl/alfaslabone）・Yellowtail-Regular.ttf（apache/yellowtail）
#
# - 日本語の2つ（見出し Dela Gothic One・本文 Zen Kaku Gothic New）はどちらも1つ約2.4MB あるので、
#   JIS 第1水準・かな・記号に、src/・server/・アプリの画面に出てくる字（人名・地名の第2水準など）を足して絞る。
#   名前の表に字を足したら、これを回し直す（無い字は今までのフォントで出るだけで、壊れはしない）。
# - ⚠ Graduate と Alfa Slab One は OFL の「予約名」つき（名前を変えずに手を入れた版を配れない）なので絞らない。
#   形式を woff2 に包みかえるだけにする（アプリはそのまま写す）。ほかの5つは予約名が無い。
# - Web: どれも配布 HTML に埋め込まず public/fonts/ に置く（入にした人だけが読む。埋め込むと切の人も重くなる）。
#   ⚠ 表の桁そろえ（tabular-nums）を効かせるため、数字の字の形の切り替え（tnum など）は残す。
# - アプリ（res/font、Android は woff2 を読めないので TTF）: 見出しはそのまま。本文は
#   Compose の FontFamily が「数字はこのフォント、日本語はあのフォント」と字ごとに分けられないので、
#   Zen Kaku Gothic New に Barlow Semi Condensed の英数記号を入れた1つのフォントにする（look_body_*）。
import glob
import os
import shutil
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
WEB_FONTS = os.path.join(ROOT, 'public', 'fonts')
APP_FONTS = os.path.join(ROOT, 'mobile', 'androidApp', 'src', 'main', 'res', 'font')
TMP = tempfile.mkdtemp()
ASCII = set(chr(c) for c in range(0x20, 0x7F))
NUM_UNICODES = '--unicodes=U+0020-007E,U+00B7,U+2013,U+2014,U+2212'
# 名前の表（著作権・ライセンス・予約名）はそのまま残す
KEEP_NAMES = '--name-IDs=*'


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
    patterns = (
        'src/**/*.js', 'src/**/*.jsx', 'src/**/*.json', 'server/**/*.js', 'server/**/*.mjs',
        'mobile/androidApp/src/main/**/*.kt', 'mobile/shared/src/commonMain/**/*.kt',
    )
    for pattern in patterns:
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            with open(path, encoding='utf8', errors='ignore') as f:
                # 英数記号より上の字はみな拾う（「・」「〜」「①」などの記号も画面に出る）
                chars |= {c for c in f.read() if ord(c) >= 0x80}
    return chars


def write_text(name, chars):
    path = os.path.join(TMP, name)
    with open(path, 'w', encoding='utf8') as f:
        f.write(''.join(sorted(chars)))
    return path


def report(out):
    print(f'{os.path.relpath(out, ROOT)}: {os.path.getsize(out) // 1024}KB')


def subset(font, out, *args):
    flavor = ['--flavor=woff2'] if out.endswith('.woff2') else []
    subprocess.run(['pyftsubset', font, *flavor, KEEP_NAMES, f'--output-file={out}', *args], check=True)
    if out.startswith(ROOT):
        report(out)


def to_woff2(ttf, out):
    """形式だけを woff2 に包みかえる（字は1つも変えない）"""
    font = TTFont(ttf)
    font.flavor = 'woff2'
    font.save(out)
    report(out)


def tabular_digits(font):
    """数字の桁そろえ（tnum）の字。⚠ Barlow の数字は既定では幅がそろわない。Compose の表は字の形の
    切り替えを指定していない（端末の字は初めから桁がそろう）ので、初めから桁そろえの字を当てる"""
    out = {}
    gsub = font['GSUB'].table if 'GSUB' in font else None
    for record in gsub.FeatureList.FeatureRecord if gsub else []:
        if record.FeatureTag != 'tnum':
            continue
        for index in record.Feature.LookupListIndex:
            for table in gsub.LookupList.Lookup[index].SubTable:
                table = getattr(table, 'ExtSubTable', table)
                out.update(getattr(table, 'mapping', None) or {})
    return out


def merge_num(body_path, num_path, out, family, style):
    """本文の日本語フォントに、数字と英字のフォントの字を足す（英数記号は数字のフォントの字を使う）"""
    body = TTFont(body_path)
    num = TTFont(num_path)
    # 字の大きさの単位が違うと、足した字の大きさがずれる（どちらも 1000）
    assert body['head'].unitsPerEm == num['head'].unitsPerEm, 'unitsPerEm が違う'
    tabular = tabular_digits(num)
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
                table.cmap[code] = rename[tabular.get(g, g) if chr(code).isdigit() else g]
    # 著作権の表示は2つとも残す（OFL の条件）
    notices = [f['name'].getDebugName(0) for f in (body, num)]
    for record in body['name'].names:
        if record.nameID == 0:
            record.string = ' / '.join(n for n in notices if n)
        elif record.nameID in (1, 16):
            record.string = family
        elif record.nameID == 4:
            record.string = f'{family} {style}'
        elif record.nameID == 6:
            record.string = f'{family.replace(" ", "")}-{style}'
    body.save(out)
    report(out)


chars = used_chars()
head_text = ['--text-file=' + write_text('head.txt', chars)]
body_text = ['--text-file=' + write_text('body.txt', chars - ASCII)]

# 見出し（Dela Gothic One）
subset(src('DelaGothicOne-Regular.ttf'), os.path.join(WEB_FONTS, 'look-head.woff2'), *head_text)
subset(src('DelaGothicOne-Regular.ttf'), os.path.join(APP_FONTS, 'look_head.ttf'), *head_text)

# 数字と英字（Barlow Semi Condensed）・本文の日本語（Zen Kaku Gothic New）
for weight, barlow, zen in (('regular', 'Regular', 'Regular'), ('bold', 'SemiBold', 'Bold')):
    subset(src(f'BarlowSemiCondensed-{barlow}.ttf'), os.path.join(WEB_FONTS, f'look-num-{weight}.woff2'), NUM_UNICODES, '--layout-features=*')
    num_ttf = os.path.join(TMP, f'num-{weight}.ttf')
    zen_ttf = os.path.join(TMP, f'zen-{weight}.ttf')
    subset(src(f'BarlowSemiCondensed-{barlow}.ttf'), num_ttf, NUM_UNICODES, '--layout-features=tnum')
    subset(src(f'ZenKakuGothicNew-{zen}.ttf'), zen_ttf, *body_text)
    to_woff2(zen_ttf, os.path.join(WEB_FONTS, f'look-body-{weight}.woff2'))
    merge_num(zen_ttf, num_ttf, os.path.join(APP_FONTS, f'look_body_{weight}.ttf'), 'Look Body', zen)

# 球団マークの字（Graduate・Alfa Slab One・Yellowtail）。絞らずにそのまま使う
for name, file in (('graduate', 'Graduate-Regular'), ('alfaslab', 'AlfaSlabOne-Regular'), ('yellowtail', 'Yellowtail-Regular')):
    to_woff2(src(f'{file}.ttf'), os.path.join(WEB_FONTS, f'look-{name}.woff2'))
    shutil.copyfile(src(f'{file}.ttf'), os.path.join(APP_FONTS, f'look_{name}.ttf'))
