package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.clickable
import androidx.compose.material3.TextButton
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.app.CampDraft
import jp.icenorth.baseball.shared.CAMP_DIRECTIONS
import jp.icenorth.baseball.shared.Commands
import jp.icenorth.baseball.shared.CAMP_GROUPS
import jp.icenorth.baseball.shared.CAMP_PHASES
import jp.icenorth.baseball.shared.CAMP_ROUNDS
import jp.icenorth.baseball.shared.Menu
import jp.icenorth.baseball.shared.MoodTone
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.campGroupOf
import jp.icenorth.baseball.shared.campMenusFor
import jp.icenorth.baseball.shared.campSubMenusFor
import jp.icenorth.baseball.shared.clampMenu
import jp.icenorth.baseball.shared.clampSub
import jp.icenorth.baseball.shared.describeMood
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.isPitcherJson
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.pid
import jp.icenorth.baseball.shared.playerWish
import jp.icenorth.baseball.shared.resolveTraining
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.CampGainItem
import jp.icenorth.baseball.shared.formatGain
import jp.icenorth.baseball.shared.campGainTotals
import jp.icenorth.baseball.shared.campGainRows
import kotlinx.serialization.json.JsonObject

/**
 * キャンプ（1クールずつサーバーで実行する。campRound 命令）。
 *
 * 育成方針（長所／全体／短所 × 基礎体力／技術）→ 全員の練習を引き直す。
 * 選手ごとにメイン・サブ練習を選び、「第Nクール練習を実行」。伸びた能力を見て次を決める（全4回）。
 * ⚠ 同じクールを2回走らせない（クール番号を送り、サーバーが次の1つだけ受け付ける）。
 * ⚠ スマホでも選手ごとの練習を選べるようにする（Web のスマホ版は方針だけだったが、
 *    「詳細はPCで」を作らない）。表は入らないので、1人1枚のカードにする。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CampPanel(model: AppViewModel, raw: JsonObject, phase: JsonObject) {
    val phaseId = phase.at("id").str().orEmpty()
    val camp = phase["camp"].obj()
    val done = camp.at("rounds").int() ?: 0
    val total = camp.at("total").int() ?: CAMP_ROUNDS
    val finished = done >= total
    val roster = remember(raw) { raw.at("roster").list().mapNotNull { it.obj() } }
    val saved = camp.at("plan").obj()
    val draft = model.campDraft?.takeIf { it.phaseId == phaseId } ?: CampDraft(
        phaseId,
        saved.at("policy", "direction").str() ?: "balanced",
        saved.at("policy", "phase").str() ?: "skill",
        saved.at("main").obj().orEmpty().mapNotNull { (k, v) -> k.toLongOrNull()?.let { id -> v.str()?.let { id to it } } }.toMap(),
        saved.at("sub").obj().orEmpty().mapNotNull { (k, v) -> k.toLongOrNull()?.let { id -> v.str()?.let { id to it } } }.toMap(),
    )
    val mainOf = { p: JsonObject -> clampMenu(draft.main[p.pid] ?: resolveTraining(p, draft.direction, draft.phase).main, p) }
    val subOf = { p: JsonObject -> clampSub(draft.sub[p.pid] ?: resolveTraining(p, draft.direction, draft.phase).sub, p) }
    // 方針を変えたら割り当ても引き直す（方針はやる気にも効くので、練習が前のままだと噛み合いが読めない）
    val applyPolicy = { direction: String, ph: String ->
        model.campDraft = CampDraft(
            phaseId, direction, ph,
            roster.associate { it.pid to clampMenu(resolveTraining(it, direction, ph).main, it) },
            roster.associate { it.pid to clampSub(resolveTraining(it, direction, ph).sub, it) },
        )
    }
    val applyAll = { key: String, pitchers: Boolean ->
        model.campDraft = draft.copy(main = draft.main + roster.filter { it.isPitcherJson() == pitchers }.associate { it.pid to clampMenu(key, it) })
    }

    Section(
        "春季キャンプ",
        trailing = {
            Rounds(done, total)
            InfoButton(
                "春季キャンプ",
                listOf(
                    "メイン練習とサブ練習を選んで実行します。1クールごとに結果が反映されるので、伸びた能力を見て次のクールを決められます。全クールが終わったら、伸びた能力でスタメン・投手起用を整えて開幕を待ちます。",
                    "本人の希望（育成方針・段階）と噛み合うほど練習が身につきます（正解とは限りません）。",
                ),
            )
        },
    ) {
        Text("育成方針", style = MaterialTheme.typography.labelLarge)
        ChoiceRow(CAMP_DIRECTIONS.map { it.key to "${it.icon} ${it.name}" }, draft.direction, enabled = !finished) { applyPolicy(it, draft.phase) }
        Text("段階", style = MaterialTheme.typography.labelLarge)
        ChoiceRow(CAMP_PHASES.map { it.key to "${it.icon} ${it.name}" }, draft.phase, enabled = !finished) { applyPolicy(draft.direction, it) }
        Muted(
            listOfNotNull(CAMP_DIRECTIONS.firstOrNull { it.key == draft.direction }?.description, CAMP_PHASES.firstOrNull { it.key == draft.phase }?.description).joinToString("／"),
        )
        Text("全員に一括", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            campMenusFor(false).filter { !it.key.startsWith("intensive_") }.forEach { m ->
                OutlinedButton(onClick = { applyAll(m.key, false) }, enabled = !finished) { Text("野手 ${m.icon}${m.name}", fontSize = 12.sp) }
            }
            campMenusFor(true).filter { !it.key.startsWith("intensive_") && it.key != "fielding" }.forEach { m ->
                OutlinedButton(onClick = { applyAll(m.key, true) }, enabled = !finished) { Text("投手 ${m.icon}${m.name}", fontSize = 12.sp) }
            }
        }
        if (!finished) {
            Button(
                onClick = {
                    val payload = Commands.campRound(
                        done + 1, draft.direction, draft.phase,
                        roster.associate { it.pid to mainOf(it) },
                        roster.associate { it.pid to subOf(it) },
                    )
                    model.command("campRound", payload, label = "第${done + 1}クールの練習中…", done = "第${done + 1}クールの練習を終えました")
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("第${done + 1}クール練習を実行") }
        }
    }

    // ⚠ 伸びをまとめて見せる（能力は伸びているのに結果がまとまっておらず、成長が実感できなかった）
    key(done) { CampGains(model, camp, roster, finished) }

    var group by rememberSaveable { mutableStateOf("pitcher") }
    val groups = CAMP_GROUPS.map { (id, label) -> Triple(id, label, roster.filter { campGroupOf(it.at("position").str()) == id }) }.filter { it.third.isNotEmpty() }
    val shown = groups.firstOrNull { it.first == group } ?: groups.firstOrNull()
    ChipTabs(groups.map { (id, label, list) -> id to "$label ${list.size}" }, shown?.first.orEmpty(), { group = it })
    shown?.third?.forEach { p ->
        CampPlayerCard(
            model, p, mainOf(p), subOf(p), draft.direction, draft.phase, enabled = !finished,
            gains = camp.at("gains", p.pid.toString()).obj(),
            onMain = { key -> model.campDraft = draft.copy(main = draft.main + (p.pid to key)) },
            onSub = { key -> model.campDraft = draft.copy(sub = draft.sub + (p.pid to key)) },
        )
    }
}

private const val GAIN_ROWS = 8

/** 練習の成果（このクール／キャンプ通算）。伸びた量の多い選手から */
@Composable
private fun CampGains(model: AppViewModel, camp: JsonObject?, roster: List<JsonObject>, finished: Boolean) {
    val last = camp.at("last").obj()
    val total = camp.at("gains").obj()
    if (last == null && total.isNullOrEmpty()) return
    var showLast by rememberSaveable { mutableStateOf(!finished && last != null) }
    var all by rememberSaveable { mutableStateOf(false) }
    val useLast = showLast && last != null
    val gains = if (useLast) last.at("gains").obj() else total
    // ⚠ 出来事（フォーム改造・新球種など）はクールごとにしか残していない
    val rows = campGainRows(gains, roster, if (useLast) last.at("events").obj() else null)
    val totals = campGainTotals(gains)
    Section("練習の成果") {
        ChoiceRow(
            listOfNotNull(last?.let { "last" to "第${it.at("round").int() ?: 0}クール" }, "total" to "キャンプ通算"),
            if (useLast) "last" else "total",
        ) { showLast = it == "last" }
        if (rows.isEmpty()) {
            Muted("伸びた能力はありません。")
            return@Section
        }
        Text(
            "${rows.count { it.grew }}人が伸びました",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        Muted("球団全体: " + totals.take(6).joinToString(" · ") { "${it.label}${formatGain(it.diff)}" })
        (if (all) rows else rows.take(GAIN_ROWS)).forEach { row ->
            Column(Modifier.fillMaxWidth().clickable { model.openPlayer = row.player }.padding(vertical = 4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(row.player.at("name").str().orEmpty(), fontWeight = FontWeight.SemiBold)
                    Muted(positionLabel(row.player.at("position").str().orEmpty()))
                }
                if (row.items.isNotEmpty()) GainLine(null, row.items)
                row.events.forEach { Text(it, color = MaterialTheme.colorScheme.tertiary, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        }
        if (rows.size > GAIN_ROWS) {
            TextButton(onClick = { all = !all }) { Text(if (all) "上位${GAIN_ROWS}人だけ" else "全員（${rows.size}人）を見る") }
        }
    }
}

/** 伸びの並び。伸びは緑、下がったものは赤 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GainLine(title: String?, items: List<CampGainItem>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        title?.let { Muted(it) }
        items.forEach { item ->
            Text(
                "${item.label}${formatGain(item.diff)}",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (item.diff > 0) GainUp else MaterialTheme.colorScheme.error,
            )
        }
    }
}

private val GainUp = androidx.compose.ui.graphics.Color(0xFF2E9E5B)

@Composable
private fun Rounds(done: Int, total: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(total) { i ->
            val color = when {
                i < done -> MaterialTheme.colorScheme.primary
                i == done -> MaterialTheme.colorScheme.secondary
                else -> MaterialTheme.colorScheme.outlineVariant
            }
            Box(Modifier.size(22.dp).background(color, CircleShape), contentAlignment = Alignment.Center) {
                Text("${i + 1}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
            }
        }
        Text(" $done/$total", style = MaterialTheme.typography.bodySmall)
    }
}

private val MOOD_TEXT = mapOf(MoodTone.Good to "意欲的", MoodTone.Mid to "納得", MoodTone.Bad to "身が入らない")

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CampPlayerCard(
    model: AppViewModel,
    p: JsonObject,
    main: String,
    sub: String,
    direction: String,
    phase: String,
    enabled: Boolean,
    gains: JsonObject?,
    onMain: (String) -> Unit,
    onSub: (String) -> Unit,
) {
    val pitcher = p.isPitcherJson()
    val mood = describeMood(p, direction, phase)
    val wish = playerWish(p)
    val moodColor = when (mood.tone) {
        MoodTone.Good -> MaterialTheme.colorScheme.primary
        MoodTone.Mid -> MaterialTheme.colorScheme.onSurfaceVariant
        MoodTone.Bad -> MaterialTheme.colorScheme.error
    }
    Section(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        PlayerSummary(p, { model.openPlayer = it }) {
            Column(horizontalAlignment = Alignment.End) {
                Tag(MOOD_TEXT[mood.tone] ?: mood.label, moodColor)
                Muted(
                    "希望 ${CAMP_DIRECTIONS.firstOrNull { it.key == wish.direction }?.icon.orEmpty()}${CAMP_PHASES.firstOrNull { it.key == wish.phase }?.icon.orEmpty()}",
                )
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Muted("成長 ${p.at("growthPotential").num()?.let { "%.2f".format(it) } ?: "—"}")
            AbilityNum("プロ意識", p.at("personality", "discipline").int())
            AbilityNum("精神", p.at("personality", "mental").int())
            AbilityNum("肩", p.at("physical", "arm").int())
            if (pitcher) AbilityNum("守", p.at("fielding", "defense").int()) else AbilityNum("眼", p.at("batting", "eye").int())
            AbilityNum("体力", p.at("physical", "bodyStamina").int())
            AbilityNum("回復", p.at("physical", "recovery").int())
        }
        // キャンプ通算の伸び（サーバーの記録）
        val items = campGainRows(gains?.let { JsonObject(mapOf(p.pid.toString() to it)) }, listOf(p)).firstOrNull()?.items.orEmpty()
        if (items.isNotEmpty()) GainLine("通算", items)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MenuPicker("メイン", main, campMenusFor(pitcher), enabled, Modifier.weight(1f), onMain)
            MenuPicker("サブ", sub, campSubMenusFor(p), enabled, Modifier.weight(1f), onSub)
        }
    }
}

@Composable
private fun MenuPicker(label: String, selected: String, menus: List<Menu>, enabled: Boolean, modifier: Modifier, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val current = menus.firstOrNull { it.key == selected }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Text("$label: ${current?.let { "${it.icon}${it.name}" } ?: selected}", fontSize = 12.sp, maxLines = 1)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            menus.forEach { m ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text("${m.icon} ${m.name}", fontWeight = if (m.key == selected) FontWeight.Bold else FontWeight.Normal)
                            Text(m.description, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    onClick = { open = false; onPick(m.key) },
                )
            }
        }
    }
    // ⚠ ここ（Box の外）に部品を足さないこと。呼ぶ側の Row に並んでしまい、横幅いっぱいの部品だと
    //    メイン／サブのボタンの幅が0になって見えなくなる（実際に透明な区切り線でそうなっていた）
}
