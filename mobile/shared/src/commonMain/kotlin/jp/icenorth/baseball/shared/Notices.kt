package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

// ============================================================
// 「自分が何かしないといけないこと」の数え方。Web 版の `src/online/notices.js` と同じ決まり
// （PC版の左メニューの数字・上の帯と、アプリの「手続き」の数字・上の帯が食い違わないように）。
//
// ⚠ 初期メンバー選択・人員整理（契約更改）・キャンプは「手続き」のタブから入るので見逃しやすい。
//    数え方を画面ごとに書くと、片方だけ「済んだ」扱いになって帯が消える、がおきる。
// ============================================================

/** いま自分が決める手続き。[progress] はキャンプの「第2クール / 全4クール」 */
data class PendingProcedure(val kind: String, val label: String, val deadline: String?, val progress: String?)

/**
 * いま自分が決める手続き。無ければ null。
 * - 初期メンバー選択: まだセットを選んでいない
 * - キャンプ: 4クールを終えていない
 * - そのほか（契約更改・トライアウト・年度更新）: まだ決定していない
 *
 * ⚠ 初期メンバーを待っている球団には、リーグの手続きを出さない
 *    （その球団の手続きはCPUが決め、サーバーも決定を待たない）。
 */
fun pendingProcedure(raw: JsonObject?): PendingProcedure? {
    if (raw == null) return null
    raw["pendingPack"].obj()?.let { pack ->
        if (pack.at("chosen").str() != null) return null
        return PendingProcedure("pack_select", PHASE_LABELS.getValue("pack_select"), null, null)
    }
    val phase = raw["phase"].obj() ?: return null
    val kind = phase.at("kind").str().orEmpty()
    val deadline = phase.at("deadline").str() ?: raw.at("phaseDeadline").str()
    if (kind == "camp") {
        val done = phase.at("camp", "rounds").int() ?: 0
        val total = phase.at("camp", "total").int() ?: CAMP_ROUNDS
        if (done >= total) return null
        return PendingProcedure(kind, PHASE_LABELS.getValue("camp"), deadline, "第${done + 1}クール / 全${total}クール")
    }
    if (phase.at("submission", "ready").bool() == true) return null
    return PendingProcedure(kind, PHASE_LABELS[kind] ?: phase.at("label").str() ?: "手続き", deadline, null)
}

/** 自分が返事をする番のトレードの提案の数 */
fun waitingTradeCount(raw: JsonObject?): Int = raw?.at("trades").list().count { it.at("myTurn").bool() == true }

/** 「手続き」に出す数（手続き1件＋返事待ちの提案） */
fun noticeCount(raw: JsonObject?): Int = (if (pendingProcedure(raw) != null) 1 else 0) + waitingTradeCount(raw)

/** 途中参加で初期メンバーを選び終え、自分の球団になるのを待っている間。[estimated] は日時が見込みか */
data class PackWaiting(val packName: String, val feature: String?, val joinsAt: String?, val estimated: Boolean)

/**
 * 途中参加で初期メンバーを選び終えた後の知らせ。無ければ null。Web 版の `packWaiting` と同じ決まり。
 *
 * ⚠ 選んだ時点で手続きの帯（[pendingProcedure]）は消える。代わりにこれで「いつ自分の球団になるか」を出し続ける
 *    （いしだ指摘: セットと名前を決めた後も画面がそのままで、済んだのか分からなかった）。
 */
fun packWaiting(raw: JsonObject?): PackWaiting? {
    val pending = raw?.get("pendingPack").obj() ?: return null
    val chosen = pending.at("chosen").str() ?: return null
    val pack = pending.at("packs").list().mapNotNull { it.obj() }.firstOrNull { it.at("id").str() == chosen }
    return PackWaiting(
        packName = pack?.at("name").str() ?: "選んだセット",
        feature = pack?.at("feature").str(),
        joinsAt = pending.at("joinsAt").str(),
        // キャンプの最中なら締め切りは決まっている。でなければ見込み
        estimated = pending.at("joinsInCamp").bool() != true,
    )
}

/** いまの段階（1年の流れの帯）。[open] が false ならその段階の手前で待っている。Web 版の `stageLines` と同じ決まり */
data class StageInfo(val index: Int, val step: SeasonStep, val open: Boolean)

/**
 * サーバーが決めた段階（`view.stage`）。初期メンバー選択の間と、知らない段階なら null。
 * ⚠ 画面で日付から推し量らないこと（PC・スマホと食い違う）
 */
fun stageInfo(raw: JsonObject?): StageInfo? {
    val stage = raw?.get("stage").obj() ?: return null
    val key = stage.at("key").str() ?: return null
    val index = SEASON_STEPS.indexOfFirst { it.key == key }
    if (index < 0) return null
    return StageInfo(index, SEASON_STEPS[index], stage.at("open").bool() != false)
}

/**
 * 帯の1行目。[next] は次の進行の日時、[deadline] は手続きの締め切り（画面で書式を整えたもの）。
 * ⚠ 文は Web 版の `stageLines` と同じにする
 */
fun stageHead(info: StageInfo, next: String?, deadline: String?): String {
    val label = info.step.label
    return when {
        info.open -> if (deadline != null) "いまは$label（締め切り $deadline）" else "いまは$label"
        info.step.key == "opening" -> if (next != null) "$next に開幕します" else "まもなく開幕します"
        next != null -> "次の進行（$next）で$label" + if (info.step.key == "year_end") "が行われ、キャンプが開きます" else "が開きます"
        else -> "まもなく${label}が始まります"
    }
}
