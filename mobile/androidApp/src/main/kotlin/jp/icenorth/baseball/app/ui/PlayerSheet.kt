package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.CONDITION_TEXT
import jp.icenorth.baseball.shared.FORM_SHORT
import jp.icenorth.baseball.shared.PITCH_TYPE_NAMES
import jp.icenorth.baseball.shared.POSITION_LABELS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.formatStat
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.overviewGroup
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.str
import kotlinx.serialization.json.JsonObject

/** 選手の詳細（能力・守備適性・今季と通算の成績）。どの画面からでも同じシートで開く */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerSheet(model: AppViewModel, player: JsonObject) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = { model.openPlayer = null }, sheetState = state) {
        PlayerDetail(model, player)
    }
}

private fun hand(v: String?) = when (v) { "left" -> "左"; "switch" -> "両"; else -> "右" }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlayerDetail(model: AppViewModel, p: JsonObject) {
    val id = p.at("id").num()?.toLong()
    var periods by remember(id) { mutableStateOf<List<JsonObject>?>(null) }
    var failure by remember(id) { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        if (id == null) return@LaunchedEffect
        try {
            periods = model.read("player", mapOf("id" to id.toString())).at("periods").list().mapNotNull { it.obj() }
        } catch (e: Exception) {
            // ⚠ 前の読み込みが取り消されたとき（ページを連打した・画面を離れた）は失敗として出さない
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    val pitcher = p.at("position").str() == "pitcher"
    Column(
        Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column {
            Text(p.at("name").str().orEmpty(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            val condition = p.at("condition").int()?.let { CONDITION_TEXT.getOrNull(it) }
            Muted(
                listOfNotNull(
                    "${p.at("age").int() ?: "-"}歳",
                    POSITION_LABELS[p.at("position").str()]?.let { "本職 $it" },
                    "${hand(p.at("physical", "throws").str())}投${hand(p.at("batting", "bats").str())}打",
                    if (pitcher) FORM_SHORT[p.at("pitching", "form").str()] else null,
                    condition?.let { "調子 $it" },
                    p.at("fatigue").int()?.let { "疲労 $it" },
                ).joinToString(" · "),
            )
        }
        Text("能力", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (pitcher) {
                AbilityNum("球速 ", p.at("pitching", "velocity").int(), velocity = true)
                AbilityNum("制球 ", p.at("pitching", "control").int())
                AbilityNum("スタミナ ", p.at("pitching", "stamina").int(), stamina = true)
                AbilityNum("回転 ", p.at("pitching", "spinRate").int())
            }
            AbilityNum("ミート ", p.at("batting", "meet").int())
            AbilityNum("パワー ", p.at("batting", "power").int())
            AbilityNum("選球眼 ", p.at("batting", "eye").int())
            AbilityNum("走力 ", p.at("physical", "speed").int())
            AbilityNum("盗塁 ", p.at("batting", "steal").int())
            AbilityNum("バント ", p.at("batting", "bunt").int())
            AbilityNum("守備 ", p.at("fielding", "defense").int())
            AbilityNum("肩 ", p.at("physical", "arm").int())
            if (p.at("position").str() == "catcher") AbilityNum("リード ", p.at("catching", "lead").int())
            AbilityNum("体力 ", p.at("physical", "bodyStamina").int())
            AbilityNum("回復 ", p.at("physical", "recovery").int())
        }
        if (pitcher) {
            val pitches = p.at("pitching", "arsenal").list().filter { it.at("type").str() != "straight" }
            if (pitches.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    pitches.forEach { a -> AbilityNum("${PITCH_TYPE_NAMES[a.at("type").str()] ?: a.at("type").str()} ", a.at("level").int()) }
                }
            }
        }
        val fitness = p.at("positionFitness").obj().orEmpty()
            .mapNotNull { (pos, v) -> v.int()?.let { pos to it } }
            .filter { (pos, v) -> pos != "pitcher" && v >= 60 }
            .sortedByDescending { it.second }
        if (!pitcher && fitness.isNotEmpty()) {
            Text("守れる位置（適性）", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(fitness.joinToString("  ") { (pos, v) -> "${positionLabel(pos)} $v" })
        }
        val history = p.at("careerHistory").list().mapNotNull { it.at("label").str() }
        if (history.isNotEmpty()) Muted("経歴: " + history.joinToString(" → "))

        Text("成績", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        when {
            failure != null -> Muted("成績を読めませんでした: $failure")
            periods == null -> Muted("読み込み中…")
            else -> periods!!.forEach { period ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(period.at("label").str().orEmpty(), fontWeight = FontWeight.SemiBold)
                    // 投手は投球を先に。打席に立っていれば打撃も出す
                    val sides = if (pitcher) listOf(false, true) else listOf(true, false)
                    sides.forEach { batting ->
                        val group = overviewGroup(batting)
                        val show = if (batting) !pitcher || (period.at("seasonStats", "batting", "plateAppearances").num() ?: 0.0) > 0
                        else pitcher || (period.at("seasonStats", "pitching", "games").num() ?: 0.0) > 0
                        if (show) {
                            Muted(if (batting) "打撃" else "投球")
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                group.columns.forEach { c ->
                                    Row(verticalAlignment = Alignment.Bottom) {
                                        Text("${c.label} ", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text(formatStat(c, c.get(period)), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(ValueWidth))
                                    }
                                }
                            }
                        }
                    }
                    period.at("source").str()?.let { Muted(it) }
                }
            }
        }
    }
}

private val ValueWidth = 48.dp
