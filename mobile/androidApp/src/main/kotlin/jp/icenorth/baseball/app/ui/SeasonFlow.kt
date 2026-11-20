package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.SEASON_STEPS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.draftRankText
import jp.icenorth.baseball.shared.isYearSummaryTime
import jp.icenorth.baseball.shared.proDraftLead
import jp.icenorth.baseball.shared.proDraftOfYear
import jp.icenorth.baseball.shared.proDraftReward
import jp.icenorth.baseball.shared.yearSummaryMoveText
import jp.icenorth.baseball.shared.yearSummaryRankText
import jp.icenorth.baseball.shared.stageHead
import jp.icenorth.baseball.shared.stageInfo
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.teamLabel
import kotlinx.serialization.json.JsonObject

// ============================================================
// 1年の流れの帯と、その年のまとめ・NPBドラフトの発表・トライアウトの結果
// （Web 版の `SeasonFlow.jsx`・`YearSummary.jsx`・`ProDraftResult.jsx`・`TryoutResult.jsx` と同じ）。
// ⚠ オフの成長（`lastOffseason` の能力の差）は 2026-11-20 にやめた（Web は 11-18。いしだ「キャンプの結果や
//    オフの成長は要りません」）。`lastOffseason` の `year`・`departed` は通知がまだ読む。
//
// ⚠ いしだ指摘: シーズン後の流れ・いまの段階・何をすればいいか、成長がいつどれだけ
//    起きたのかが分からない。段階はサーバーが決める（`view.stage`）。
// ============================================================

/** いまの段階の1行目（Web 版の `stageLines(view).head` と同じ文） */
fun stageHeadText(raw: JsonObject?): String? {
    val info = stageInfo(raw) ?: return null
    val deadline = formatDeadline(raw?.at("phase", "deadline").str() ?: raw?.at("phaseDeadline").str())
    return stageHead(info, formatDeadline(raw?.at("nextAdvanceAt").str()), if (raw?.get("phase").obj() != null) deadline else null)
}

@Composable
fun SeasonFlowCard(raw: JsonObject?) {
    val info = stageInfo(raw) ?: return
    Section(modifier = Modifier.testTag("season-flow")) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            SEASON_STEPS.forEachIndexed { i, step ->
                // ⚠ 前後だけ出す（Web 版のスマホ幅と同じ）。7つ並べると、いまの段階が右端の外に隠れる
                if (i < info.index - 1 || i > info.index + 2) return@forEachIndexed
                val now = i == info.index
                val done = i < info.index
                val accent = MaterialTheme.colorScheme.primary
                val bg = when {
                    now && info.open -> accent
                    done -> Color(0x332E9E5B)
                    else -> MaterialTheme.colorScheme.surfaceContainerHighest
                }
                val ink = when {
                    now && info.open -> MaterialTheme.colorScheme.onPrimary
                    done -> Color(0xFF2E9E5B)
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                var mod = Modifier.background(bg, RoundedCornerShape(6.dp))
                if (now && !info.open) mod = mod.border(1.dp, accent, RoundedCornerShape(6.dp))
                Column(mod.padding(horizontal = 8.dp, vertical = 4.dp)) {
                    Text(step.label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ink)
                    Text(step.time, fontSize = 10.sp, color = ink)
                }
            }
        }
        stageHeadText(raw)?.let { Text(it, fontWeight = FontWeight.Bold) }
        Muted(info.step.todo)
    }
}

/**
 * その年のまとめ（順位・入退団・主なトピック）。Web 版 `YearSummary.jsx` と同じ。
 * ⚠ いしだ 2026-11-18「キャンプの結果やオフの成長は要りません。その年の順位、入退団の選手、
 *    主なトピックに止めて下さい」。以前はここにオフの成長（`lastOffseason` の能力の差）を出していた。
 * ⚠ 出すのは年度更新から開幕した月の終わりまで（`isYearSummaryTime`。サーバーも時期の外は載せない）。
 */
@Composable
fun YearSummaryCard(model: AppViewModel) {
    val view = model.view ?: return
    val s = view.yearSummary ?: return
    if (!isYearSummaryTime(s.year, view.year, view.currentDate?.month)) return
    Section("${s.year}年目のまとめ", modifier = Modifier.testTag("year-summary")) {
        yearSummaryRankText(s)?.let { Text(it, fontWeight = FontWeight.Bold) }
        // ① 順位（自分の部だけ。自球団を太字）
        Caption("順位")
        s.standings.forEach { r ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val weight = if (r.mine) FontWeight.Bold else FontWeight.Normal
                Text("${r.rank}", fontWeight = weight)
                Text(r.label, fontWeight = weight, modifier = Modifier.weight(1f))
                Text("${r.wins}勝${r.losses}敗${if (r.draws > 0) "${r.draws}分" else ""}", fontWeight = weight)
            }
        }
        // ② 入退団
        Caption("入退団（入団${s.joined.size}人・退団${s.left.size}人）")
        if (s.joined.isEmpty() && s.left.isEmpty()) Muted("この年の入退団はありません。")
        (s.joined + s.left).forEach { Text(yearSummaryMoveText(it), fontSize = 13.sp) }
        // ③ 主なトピック
        Caption("主なトピック")
        if (s.topics.isEmpty()) Muted("この年に残った話題はありません。")
        s.topics.forEach { Text("・$it", fontSize = 13.sp) }
    }
}

/**
 * その年のNPBドラフトの発表（指名から年度更新まで）。Web 版 `ProDraftResult.jsx` と同じ。
 * ⚠ 中身はビューの `chronicle.proDrafted` のその年の行（保存もビューも足していない）。
 * ⚠ `whenEmpty` のところ（契約更改の手続き）だけ「指名なし」も出す。ホームでは出さない。
 */
@Composable
fun ProDraftCard(model: AppViewModel, whenEmpty: Boolean = false) {
    val view = model.view ?: return
    val rows = proDraftOfYear(view.chronicle, view.year)
    if (rows.isEmpty() && !whenEmpty) return
    val myLabel = view.teamName?.let { view.teamLabel(it) }.orEmpty()
    val mine = rows.count { it.team == view.teamName }
    Section("${view.year ?: ""}年目のNPBドラフト（10月下旬）", modifier = Modifier.testTag("pro-draft")) {
        Muted(proDraftLead(rows, view.teamName, myLabel))
        rows.forEach { r ->
            Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(draftRankText(r), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Text(r.name, fontWeight = if (r.team == view.teamName) FontWeight.Bold else FontWeight.SemiBold)
                    Muted("${positionLabel(r.position)}${r.age?.let { "・${it}歳" } ?: ""}")
                }
                Muted("${view.teamLabel(r.team)} → ${r.npbTeam}${r.reason?.takeIf { it.isNotBlank() }?.let { "　$it" } ?: ""}")
            }
        }
        proDraftReward(mine, myLabel)?.let { Muted(it) }
    }
}

/**
 * トライアウトで入団した選手と、交渉したのに他球団に取られた選手（`view.lastTryout`。Web 版 TryoutResult と同じ）。
 * ⚠ 先方指摘: トライアウト後の入団選手の一覧が無く、誰が入ったか分からない（リーグ便りは全球団の指名が混ざるだけ）
 */
@Composable
fun TryoutResultCard(model: AppViewModel, raw: JsonObject?) {
    if (raw == null) return
    val result = raw["lastTryout"].obj() ?: return
    // ⚠ 出すのはトライアウトから年度更新までの間だけ（年が替わったら「その年のまとめ」の入退団に出る。Web 版と同じ）
    val year = raw.at("year").int()
    if (year != null && result.at("year").int() != year) return
    val roster = raw.at("roster").list().mapNotNull { it.obj() }
    val byId = roster.associateBy { it.at("id").num()?.toLong() }
    val picks = result.at("picks").list().mapNotNull { it.obj() }
    val lost = result.at("lost").list().mapNotNull { it.obj() }
    val wished = picks.count { it.at("wish").int() != null }
    Section("${result.at("year").int() ?: ""}年目のトライアウトで入団した選手（${picks.size}人）") {
        Muted(if (picks.isEmpty()) "今年のトライアウトで入団した選手はいません。" else "交渉して獲得 ${wished}人・自動で獲得 ${picks.size - wished}人")
        picks.forEach { p ->
            val player = byId[p.at("playerId").num()?.toLong()]
            Row(
                Modifier.fillMaxWidth().clickable(enabled = player != null) { player?.let { model.openPlayer = it } }.padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(p.at("name").str().orEmpty(), fontWeight = FontWeight.SemiBold)
                // ⚠ 年齢は名簿の今の値（結果の年齢はトライアウト時点で、年度更新で1つ上がる）。Web 版 TryoutResult.jsx
                Muted("${positionLabel(p.at("position").str().orEmpty())} · ${player.at("age").int() ?: p.at("age").int() ?: ""}歳 · ${p.at("round").int() ?: ""}巡目")
                val wish = p.at("wish").int()
                Text(
                    if (wish != null) "交渉${wish}位" else "自動",
                    color = if (wish != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                )
            }
        }
        if (lost.isNotEmpty())
            Muted("交渉したが他球団が獲得: " + lost.joinToString("、") { l ->
                "${l.at("name").str()}（交渉${l.at("wish").int() ?: ""}位・${positionLabel(l.at("position").str().orEmpty())}）→ ${l.at("takenBy").str()?.let { model.view?.teamLabel(it) ?: it }.orEmpty()}"
            })
    }
}
