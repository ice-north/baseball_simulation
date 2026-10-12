// ============================================================
// sim-harness レポート基盤
// PASS/FAIL の集計・整形と、リアリズム帯(band)チェックを提供する。
// ============================================================

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m', BOLD = '\x1b[1m';

export class Report {
  constructor(title) {
    this.title = title;
    this.checks = [];
  }

  // 値が [min, max] に収まっているか判定して記録する。
  band(label, value, min, max, fmt = (v) => v.toFixed(3)) {
    const ok = value >= min && value <= max;
    this.checks.push({ label, value: fmt(value), range: `${fmt(min)}〜${fmt(max)}`, ok });
    return ok;
  }

  // 真偽条件をそのまま記録する（不変条件チェック用）。
  assert(label, ok, detail = '') {
    this.checks.push({ label, value: ok ? 'OK' : 'NG', range: detail, ok });
    return ok;
  }

  // 参考値（合否判定なし）を記録する。
  info(label, value) {
    this.checks.push({ label, value: String(value), range: '', ok: null });
  }

  get passed() { return this.checks.every(c => c.ok !== false); }

  print() {
    const w = Math.max(...this.checks.map(c => [...c.label].length), 10);
    console.log(`\n${BOLD}${this.title}${RESET}`);
    console.log('─'.repeat(w + 34));
    for (const c of this.checks) {
      const pad = c.label + ' '.repeat(Math.max(0, w - [...c.label].length));
      if (c.ok === null) {
        console.log(`${DIM}  ·${RESET} ${pad}  ${c.value}`);
      } else if (c.ok) {
        console.log(`  ${GREEN}✓${RESET} ${pad}  ${c.value}  ${DIM}(許容 ${c.range})${RESET}`);
      } else {
        console.log(`  ${RED}✗${RESET} ${pad}  ${RED}${c.value}${RESET}  ${YELLOW}(許容 ${c.range})${RESET}`);
      }
    }
    console.log('─'.repeat(w + 34));
    const fails = this.checks.filter(c => c.ok === false).length;
    if (fails === 0) {
      console.log(`  ${GREEN}${BOLD}PASS${RESET} — 全 ${this.checks.filter(c => c.ok !== null).length} 項目が許容範囲内\n`);
    } else {
      console.log(`  ${RED}${BOLD}FAIL${RESET} — ${fails} 項目が範囲外\n`);
    }
  }
}
