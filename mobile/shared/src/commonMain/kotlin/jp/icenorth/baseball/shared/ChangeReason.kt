package jp.icenorth.baseball.shared

private val DAMAGE = Regex("""\(DP:[^)]*\)""")
private val PITCH_LIMIT = Regex("""球数制限到達\((\d+)/(\d+)球\)""")
private val STAMINA_LIMIT = Regex("""スタミナ限界\((\d+)%\)""")

/**
 * 継投の理由（サーバーの試合の記録の文）を、遊ぶ人の言葉に直す。
 * ⚠ 元の文は試合の計算の中の言葉がそのまま出る（「ダメージ蓄積で降板(DP:54/53.75)」など）。
 *    記録は変えられないので、出すときに直す。知らない形の文はそのまま返す
 */
fun readableChangeReason(text: String): String = text
    .replace(DAMAGE, "")
    .replace("ダメージ蓄積で降板", "打ち込まれて降板")
    .replace(PITCH_LIMIT) { "球数の上限（${it.groupValues[2]}球）に到達" }
    .replace(STAMINA_LIMIT) { "スタミナ切れ（残り${it.groupValues[1]}%）" }
