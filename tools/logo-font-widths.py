# 球団ロゴの字の幅の表（`src/online/look/logoParts.js` の `WIDTHS`）を、字のファイルから測る。
#   pip install fonttools brotli
#   python3 tools/logo-font-widths.py            # 表と同じか比べる（違えば 1 で終わる）
#   python3 tools/logo-font-widths.py --print    # 表に貼る形で出す
#
# ロゴの字はフォントから測らず、この表の数で大きさとアーチの字送りを決める（ブラウザとアプリで
# 同じロゴにするため）。`public/fonts/look-graduate.woff2`・`look-alfaslab.woff2`・`look-yellowtail.woff2`
# を差しかえたら、これで測り直して表を書きかえる。
import os
import re
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = {'graduate': 'look-graduate.woff2', 'alfa': 'look-alfaslab.woff2', 'yellowtail': 'look-yellowtail.woff2'}


def widths(file):
    """0x20〜0x7E の送り幅（1000分のいくつ）"""
    font = TTFont(os.path.join(ROOT, 'public', 'fonts', file))
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    unit = font['head'].unitsPerEm
    return [round(hmtx[cmap[code]][0] * 1000 / unit) for code in range(0x20, 0x7F)]


measured = {name: widths(file) for name, file in FONTS.items()}
if '--print' in sys.argv:
    for name, row in measured.items():
        print(f"  {name}: [{','.join(str(v) for v in row)}],")
    sys.exit(0)

source = open(os.path.join(ROOT, 'src', 'online', 'look', 'logoParts.js'), encoding='utf-8').read()
bad = 0
for name, row in measured.items():
    found = re.search(rf'^\s*{name}: \[([0-9,]+)\],$', source, re.M)
    table = [int(v) for v in found.group(1).split(',')] if found else None
    if table != row:
        bad += 1
        print(f'✗ {name}: 表と字のファイルが食い違っている（--print で出して書きかえる）')
print('logo-font-widths: ok' if not bad else '')
sys.exit(1 if bad else 0)
