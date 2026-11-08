package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.TeamFit
import jp.icenorth.baseball.shared.teamFitRank
import jp.icenorth.baseball.shared.Commands
import jp.icenorth.baseball.shared.DEFAULT_WEIGHTS
import jp.icenorth.baseball.shared.ONLINE_ROSTER_TARGETS
import jp.icenorth.baseball.shared.ROSTER_GROUP_LABELS
import jp.icenorth.baseball.shared.TRYOUT_GROUPS
import jp.icenorth.baseball.shared.TRYOUT_SORT_KEYS
import jp.icenorth.baseball.shared.WEIGHTED_SORT_KEY
import jp.icenorth.baseball.shared.WEIGHT_FIELDS
import jp.icenorth.baseball.shared.WEIGHT_LEVELS
import jp.icenorth.baseball.shared.WEIGHT_MAX
import jp.icenorth.baseball.shared.addToPlan
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.benchFromPlan
import jp.icenorth.baseball.shared.inTryoutGroup
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.long
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.overallScore
import jp.icenorth.baseball.shared.pid
import jp.icenorth.baseball.shared.planSummary
import jp.icenorth.baseball.shared.plannedPicks
import jp.icenorth.baseball.shared.rosterGroup
import jp.icenorth.baseball.shared.shiftInPlan
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.weightedRanked
import jp.icenorth.baseball.shared.weightedScore
import kotlinx.serialization.json.JsonObject
import kotlin.math.roundToInt

private const val PAGE = 12

/**
 * 初期編成・トライアウトの希望リスト（Web 版 TryoutPlanner と同じ規則）。
 *
 * - 上: 獲得予定（サーバーが実際に取る顔ぶれ。↑↓で順位、×で控えへ）
 * - 下: 候補（区分・並べ替え・名前で絞り、＋で獲得予定へ、★で最優先）
 * ⚠ 操作は「獲得予定」を基準にする（希望順の位置で動かすと、目標構成で飛ばされる選手が
 *    挟まったときに押した選手が入らない・消える）。誰も消さず、外すのは末尾送り。
 */
@Composable
fun TryoutPanel(model: AppViewModel, raw: JsonObject, phase: JsonObject, plan: JsonObject, setPlan: (JsonObject) -> Unit, onReset: () -> Unit) {
    val candidates = remember(phase) { phase.at("candidates").list().mapNotNull { it.obj() } }
    val roster = remember(raw) { raw.at("roster").list().mapNotNull { it.obj() } }
    val ranked = plan.at("rankedIds").list().mapNotNull { it.long() }
    val maxCount = rosterRoom(raw)
    val planCount = plan.at("count").int() ?: 0
    val count = minOf(planCount, ranked.size)
    val summary = planSummary(ranked, candidates, count, roster)
    val wanted = summary.picked.map { it.pid }
    val weights = model.tryoutWeights
    val scores = remember(candidates, weights) { candidates.associate { it.pid to weightedScore(it, weights) } }
    // ⚠ お知らせは出したときの希望順と組で持つ（希望順が外から変わったら出さない）
    var noticeState by remember { mutableStateOf<Pair<String, List<Long>>?>(null) }
    val notice = noticeState?.takeIf { it.second == ranked }?.first
    val setRanked: (List<Long>) -> Unit = { ids -> setPlan(Commands.withRanked(plan, ids)) }
    val setCount: (Int) -> Unit = { n -> setPlan(Commands.withCount(plan, n.coerceIn(0, maxCount))) }

    Section(
        "獲得希望人数",
        trailing = {
            InfoButton(
                "トライアウト",
                listOf(
                    "獲得予定の上から順に取りにいきます。他球団に先を越された選手は飛ばして、控えから繰り上がります。",
                    "名簿が偏らないよう、投${ONLINE_ROSTER_TARGETS["pitcher"]}・捕${ONLINE_ROSTER_TARGETS["catcher"]}・内${ONLINE_ROSTER_TARGETS["infielder"]}・外${ONLINE_ROSTER_TARGETS["outfielder"]}を超える区分は飛ばします（CPUの球団も同じ目標です）。",
                    "「重視する能力」の重みから評価（0〜100）を出し、おすすめ順を作れます。「軽視〜最重視」を0.6〜1.6倍で重み付けした平均で、投手と野手は別の能力で計算します。重みはこの端末に覚えます。",
                ),
            )
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { setCount(planCount - 1) }, enabled = planCount > 0) { Text("−") }
            Text("${planCount}人", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            OutlinedButton(onClick = { setCount(planCount + 1) }, enabled = planCount < maxCount) { Text("＋") }
            Muted("最大${maxCount}人")
        }
        TextButton(onClick = onReset) { Text("標準案に戻す") }
    }

    WeightsSection(model, candidates, roster) { next ->
        setRanked(next)
        noticeState = "評価の高い順に、投・捕・内・外の目標人数を守っておすすめ順を作り直しました。" to next
    }

    val c = summary.counts
    Section("獲得予定 ${wanted.size}人") {
        Muted("投${c["pitcher"]}/${ONLINE_ROSTER_TARGETS["pitcher"]} 捕${c["catcher"]}/${ONLINE_ROSTER_TARGETS["catcher"]} 内${c["infielder"]}/${ONLINE_ROSTER_TARGETS["infielder"]} 外${c["outfielder"]}/${ONLINE_ROSTER_TARGETS["outfielder"]}")
        if (summary.blocking.isNotEmpty()) Text("このままでは決定できません: ${summary.blocking.joinToString(" / ")}　獲得希望人数を増やすか、希望順位を入れ替えてください。", color = MaterialTheme.colorScheme.error)
        if (summary.warnings.isNotEmpty()) Text("${summary.warnings.joinToString(" / ")}　この位置は人数が足りないと自動で埋められます。", color = MaterialTheme.colorScheme.secondary)
        notice?.let { Text(it, color = MaterialTheme.colorScheme.secondary) }
        if (wanted.isEmpty()) Muted("獲得予定はありません。")
        summary.picked.forEachIndexed { i, p ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}", fontWeight = FontWeight.Bold, modifier = Modifier.width(24.dp))
                Box(Modifier.weight(1f)) {
                    PlayerSummary(p, { model.openPlayer = it }) {
                        Column(horizontalAlignment = Alignment.End) {
                            Score(scores[p.pid])
                            Fit(teamFitRank(p, roster, weights))
                        }
                    }
                }
                IconButton(onClick = { setRanked(shiftInPlan(ranked, candidates, count, roster, i, -1)) }, enabled = i > 0, modifier = Modifier.size(36.dp)) { Text("↑") }
                IconButton(onClick = { setRanked(shiftInPlan(ranked, candidates, count, roster, i, 1)) }, enabled = i < wanted.size - 1, modifier = Modifier.size(36.dp)) { Text("↓") }
                IconButton(onClick = { setRanked(benchFromPlan(ranked, candidates, count, roster, p.pid)) }, modifier = Modifier.size(36.dp)) { Text("×") }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }

    var group by rememberSaveable { mutableStateOf("all") }
    var sortKey by rememberSaveable { mutableStateOf(WEIGHTED_SORT_KEY) }
    var query by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableStateOf(0) }
    val scoreOf: (JsonObject) -> Double = if (sortKey == WEIGHTED_SORT_KEY) { p -> scores[p.pid] ?: 0.0 } else TRYOUT_SORT_KEYS.firstOrNull { it.key == sortKey }?.of ?: ::overallScore
    val pool = candidates
        .filter { inTryoutGroup(it, group) && (query.isBlank() || it.at("name").str().orEmpty().contains(query.trim())) }
        .sortedWith(compareByDescending<JsonObject> { scoreOf(it) }.thenBy { it.pid })
    val pages = maxOf(1, (pool.size + PAGE - 1) / PAGE)
    val shown = pool.drop(page.coerceAtMost(pages - 1) * PAGE).take(PAGE)
    Section("候補 ${candidates.size}人") {
        ChoiceRow(TRYOUT_GROUPS, group) { group = it; page = 0 }
        ChoiceRow(listOf(WEIGHTED_SORT_KEY to "評価") + TRYOUT_SORT_KEYS.map { it.key to it.label }, sortKey) { sortKey = it; page = 0 }
        OutlinedTextField(query, { query = it; page = 0 }, label = { Text("名前で探す") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        shown.forEach { p ->
            val at = wanted.indexOf(p.pid)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    PlayerSummary(p, { model.openPlayer = it }) {
                        Column(horizontalAlignment = Alignment.End) {
                            Score(scores[p.pid])
                            Fit(teamFitRank(p, roster, weights))
                            if (at >= 0) Tag("指名中 ${at + 1}位", MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                if (at < 0) {
                    TextButton(onClick = {
                        if (count <= 0) {
                            noticeState = "獲得希望人数が0人のため、獲得予定に入れられません。先に人数を増やしてください。" to ranked
                        } else {
                            val next = addToPlan(ranked, candidates, count, roster, p.pid)
                            if (plannedPicks(next, candidates, count, roster).none { it.pid == p.pid }) {
                                noticeState = "${p.at("name").str()}は、今の名簿だけで${ROSTER_GROUP_LABELS[rosterGroup(p.at("position").str())]}が目標人数に達しているため、獲得予定に入れられません。" to ranked
                            } else setRanked(next)
                        }
                    }) { Text("＋予定") }
                } else if (at > 0) {
                    TextButton(onClick = { setRanked(addToPlan(ranked, candidates, count, roster, p.pid, first = true)) }) { Text("最優先") }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        if (pages > 1) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = { page = (page - 1).coerceAtLeast(0) }, enabled = page > 0) { Text("前へ") }
                Text("${page + 1} / $pages", modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
                OutlinedButton(onClick = { page = (page + 1).coerceAtMost(pages - 1) }, enabled = page + 1 < pages) { Text("次へ") }
            }
        }
    }
}

/**
 * いまの名簿の同じ区分で何番手にあたるか（Web 版のトライアウト画面と同じ）。
 * ⚠ いしだ指摘: 候補が自分のチームに合っているか分からない
 */
@Composable
private fun Fit(fit: TeamFit) {
    Text(
        "うちの${ROSTER_GROUP_LABELS[fit.group]}で${fit.rank}番手",
        style = MaterialTheme.typography.labelSmall,
        color = if (fit.rank <= 2) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = if (fit.rank <= 2) FontWeight.Bold else FontWeight.Normal,
    )
}

@Composable
private fun Score(value: Double?) {
    value ?: return
    Text("評価${value.roundToInt()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.Bold)
}

/** 重視する能力（評価値の重み）。端末に覚え、サーバーには送らない */
@Composable
private fun WeightsSection(model: AppViewModel, candidates: List<JsonObject>, roster: List<JsonObject>, onRanked: (List<Long>) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    val weights = model.tryoutWeights
    Section("重視する能力（評価値の重み）", trailing = { TextButton(onClick = { open = !open }) { Text(if (open) "閉じる" else "開く") } }) {
        if (!open) return@Section
        listOf("fielder" to "野手", "pitcher" to "投手", "common" to "共通").forEach { (side, title) ->
            Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            WEIGHT_FIELDS.filter { it.group == side }.forEach { f ->
                val level = weights[f.key] ?: 2
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(f.label, modifier = Modifier.width(64.dp))
                    Slider(
                        value = level.toFloat(),
                        onValueChange = { v -> model.changeWeights(weights + (f.key to v.roundToInt())) },
                        valueRange = 0f..WEIGHT_MAX.toFloat(),
                        steps = WEIGHT_MAX - 1,
                        modifier = Modifier.weight(1f),
                    )
                    Text(WEIGHT_LEVELS.getOrNull(level)?.first.orEmpty(), modifier = Modifier.width(64.dp).padding(start = 6.dp), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onRanked(weightedRanked(candidates, weights, roster)) }) { Text("この重みでおすすめ順を作る") }
            TextButton(onClick = { model.changeWeights(DEFAULT_WEIGHTS) }) { Text("標準に戻す") }
        }
    }
}

