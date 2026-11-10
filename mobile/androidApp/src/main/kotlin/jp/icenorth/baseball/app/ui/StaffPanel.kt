package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.CoachCard
import jp.icenorth.baseball.shared.Commands
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.OnlineJson
import jp.icenorth.baseball.shared.STAFF_ROLE_LABELS
import jp.icenorth.baseball.shared.StaffEvent
import jp.icenorth.baseball.shared.StaffScale
import jp.icenorth.baseball.shared.StaffSeat
import jp.icenorth.baseball.shared.StaffView
import jp.icenorth.baseball.shared.TacticLine
import jp.icenorth.baseball.shared.TeamStaffView
import jp.icenorth.baseball.shared.staffModeChanges
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import kotlinx.serialization.json.JsonNull

/*
 * 指導者（監督・投手コーチ・野手コーチ）。編成の「指導者」の面。
 * ⚠ 中身と文は PC の「指導者」ページ（src/online/StaffPage.jsx）と同じ。文はサーバーが作る（server/coachView.mjs）。
 * ⚠ 席の入れ替えはキャンプの間だけ（サーバーが canEditSeats で知らせる）。
 */

private val ROLES = listOf("manager", "pitching", "batting")

@Composable
fun StaffPanel(model: AppViewModel, view: LeagueView) {
    val own = view.staff
    if (own == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Muted("指導者の情報がまだありません", Modifier.padding(24.dp)) }
        return
    }
    var team by rememberSaveable { mutableStateOf(view.teamName.orEmpty()) }
    val isOwn = team == view.teamName
    // 他球団はその場で読む（team の窓口の staff。人の球団の采配は届かない）
    var other by remember(team) { mutableStateOf<TeamStaffView?>(null) }
    var loaded by remember(team) { mutableStateOf(false) }
    var failure by remember(team) { mutableStateOf<String?>(null) }
    var attempt by remember(team) { mutableStateOf(0) }
    LaunchedEffect(team, view.revision, attempt) {
        if (isOwn) return@LaunchedEffect
        try {
            val result = model.read("team", mapOf("team" to team))
            // ⚠ 古いサーバー・指導者の無いリーグは staff が無い（null）
            other = result["staff"]?.takeUnless { it is JsonNull }?.let { OnlineJson.decodeFromJsonElement(TeamStaffView.serializer(), it) }
            loaded = true
            failure = null
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    // ⚠ 下は空けておく（編成のタブには左下に TIPS の印が重なり、最後の行が隠れていた）
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = TipsBadgeRoom), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TeamPicker(view, team) { team = it }
        if (isOwn) OwnStaff(model, view, own)
        else when {
            failure != null -> LoadFailed(failure.orEmpty(), onRetry = { failure = null; attempt += 1 })
            !loaded -> Muted("読み込んでいます…")
            else -> other?.let { OtherStaff(it) } ?: Muted("指導者の情報がありません")
        }
        view.leagueStaff?.let { league ->
            Section("各球団の監督") {
                league.teams.forEach { t ->
                    Row(Modifier.fillMaxWidth().clickable { team = t.team }.padding(vertical = 4.dp)) {
                        Text(view.teamShort(t.team), fontWeight = FontWeight.Bold, modifier = Modifier.width(56.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.manager?.let { "${it.name}監督" + if (it.isNew) "（新）" else "" } ?: "監督なし")
                            t.manager?.color?.let { Muted(it) }
                        }
                    }
                }
            }
            Events("リーグの人事", league.events)
        }
    }
}

@Composable
private fun TeamPicker(view: LeagueView, team: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) { Text(view.teamLabel(team) + (if (team == view.teamName) "（自球団）" else "") + " ▾") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            val names = listOfNotNull(view.teamName) + view.standings.map { it.team }.filter { it != view.teamName }
            names.distinct().forEach { name ->
                DropdownMenuItem(text = { Text(view.teamLabel(name) + if (name == view.teamName) "（自球団）" else "") }, onClick = { open = false; onPick(name) })
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OwnStaff(model: AppViewModel, view: LeagueView, staff: StaffView) {
    val canWrite = view.writable && !model.busy
    val act: (String, String, String?, String?) -> Unit = { action, role, other, coachId ->
        model.command("staff", Commands.staff(action, role, other, coachId), done = "指導者を入れ替えました")
    }
    Section("首脳陣", trailing = {
        InfoButton("指導者", listOf(
            "監督・投手コーチ・野手コーチの考え方と性格で、采配の「AI判断」やトライアウト・退団・キャンプの案、トレードの返事が変わります。能力は上がりません。",
            "入れ替えられるのは年度更新のすぐ後のキャンプの間だけです。何もしなければ留任です。",
            "監督の「任せ度」は、投手・野手の判断でコーチの考えをどれだけ使うかです（ワンマン 0%〜任せる 100%）。",
        ))
    }) {
        if (staff.canEditSeats) Muted("キャンプの間は、解任・役職の入れ替え・市場から呼ぶことができます。")
        staff.seats.forEach { seat ->
            CoachBlock(seat.roleLabel, seat.coach)
            if (staff.canEditSeats) SeatActions(seat, staff.seats, canWrite, act)
            HorizontalDivider()
        }
    }
    Section("任せ方") {
        Muted("「意見を聞く」は決めるのはあなたで、指導者の案が標準案になります（采配の「AI判断」は指導者の考えで動きます）。「任せる」は指導者が決めます。全部「自分で」なら指導者を入れる前と同じです。")
        // ⚠ まとめて変えて「任せ方を保存」で1回だけ送る（いしだ指摘 2026-11-10: 1つ押すたびに保存が走るのは微妙）。
        //    下書きは画面ではなく model に置く（編成の別のタブへ移っても消えない）
        val draft = model.staffModesDraft
        val changes = staffModeChanges(staff.modes, draft)
        staff.modes.forEach { area ->
            val shown = if (area.locked) area.effective else draft[area.key] ?: area.effective
            Text(
                "${area.label}（${area.ownerLabel}）" + if (area.key in changes) " 未保存" else "",
                style = MaterialTheme.typography.labelLarge,
                color = if (area.key in changes) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface,
            )
            ChoiceRow(staff.modeOptions.map { it.value to it.label }, shown, enabled = canWrite && !area.locked) { mode ->
                val current = model.staffModesDraft
                model.staffModesDraft = if (mode == area.effective) current - area.key else current + (area.key to mode)
            }
            area.note?.let { Muted(it) }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (changes.isEmpty()) "保存済み" else "保存していない変更があります（${changes.size}件）",
                style = MaterialTheme.typography.bodySmall,
                color = if (changes.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.secondary,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { model.staffModesDraft = emptyMap() }, enabled = changes.isNotEmpty() && !model.busy) { Text("取り消す") }
            Button(
                onClick = { model.command("staffModes", Commands.staffModes(changes), done = "任せ方を変えました") { model.staffModesDraft = emptyMap() } },
                enabled = canWrite && changes.isNotEmpty(),
            ) { Text("任せ方を保存") }
        }
    }
    TacticsLines(staff.tactics)
    if (staff.canEditSeats) {
        val empty = staff.seats.filter { it.coach == null }.map { it.role }
        Section("市場（呼べる指導者）") {
            Muted("空いた席に呼べます（先に解任して席を空けてください）。CPU球団はキャンプの終わりに市場から埋めるので、早い者勝ちです。")
            if (staff.market.isEmpty()) Muted("いま市場にいる人はいません。")
            staff.market.forEach { coach ->
                CoachBlock(if (coach.fromPlayer) "引退したばかり" else "浪人中", coach)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ROLES.forEach { role ->
                        TextButton(onClick = { act("hire", role, null, coach.id) }, enabled = canWrite && role in empty) { Text("${STAFF_ROLE_LABELS[role]}に呼ぶ") }
                    }
                }
                HorizontalDivider()
            }
        }
    }
    Events("うちの球団の人事", staff.events)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeatActions(seat: StaffSeat, seats: List<StaffSeat>, enabled: Boolean, act: (String, String, String?, String?) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (seat.coach != null) TextButton(onClick = { act("release", seat.role, null, null) }, enabled = enabled) { Text("解任する") }
        ROLES.filter { it != seat.role }.forEach { other ->
            val otherCoach = seats.firstOrNull { it.role == other }?.coach
            if (seat.coach != null || otherCoach != null)
                TextButton(onClick = { act("swap", seat.role, other, null) }, enabled = enabled) { Text("${STAFF_ROLE_LABELS[other]}と入れ替える") }
        }
    }
}

@Composable
private fun OtherStaff(staff: TeamStaffView) {
    Section("首脳陣") {
        staff.front?.let { Muted("球団の期待: ${it.ambition} · 我慢強さ: ${it.patience}") }
        staff.seats.forEach { seat ->
            CoachBlock(seat.roleLabel, seat.coach)
            HorizontalDivider()
        }
    }
    staff.tactics?.let { TacticsLines(it) } ?: Section { Muted("人の球団の采配は見られません。") }
    Events("この球団の人事", staff.events)
}

/** 指導者1人。詳しい考え方・性格・履歴は押して開く */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CoachBlock(roleLabel: String, coach: CoachCard?) {
    if (coach == null) {
        Column {
            Caption(roleLabel)
            Text("空席", fontWeight = FontWeight.Bold)
            Muted("いません。受け持ちの分野は自分で決めます。")
        }
        return
    }
    var open by rememberSaveable(coach.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clickable { open = !open }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Caption(roleLabel)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(coach.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("  ${coach.age}歳 · ${coach.origin}${if (coach.legend) " · 名選手" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // 称号（通算の記録から。最大2つ）
        if (coach.titles.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) { coach.titles.forEach { Tag(it, MaterialTheme.colorScheme.tertiary) } }
        Text(coach.headline.ifBlank { coach.color }, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
        if (coach.pitch.isNotBlank()) Muted("「${coach.pitch}」")
        if (coach.vision.isNotBlank()) Fact("ビジョン", coach.vision)
        if (coach.growth.isNotBlank()) Fact("育成観", coach.growth)
        Fact("性格", coach.personality)
        coach.delegation?.let { Fact("任せ方", it) }
        coach.keyPlayers?.let { Fact("軸の選手", it) }
        Fact("通算", coach.career)
        coach.mentor?.let { Fact("恩師", it) }
        coach.playerLine?.let { Fact("現役時代", it) }
        if (open) {
            if (coach.prefs.isNotBlank()) Fact("好む選手", coach.prefs)
            coach.views.forEach { ScaleRow(it) }
            coach.traits.forEach { ScaleRow(it) }
            if (coach.history.isEmpty()) Muted("指導者としての履歴はまだありません。")
            coach.history.forEach { h -> Text("${h.year}年 ${h.teamLabel.orEmpty()} ${h.roleLabel.orEmpty()} ${h.text}", style = MaterialTheme.typography.bodySmall) }
        } else Muted("押すと考え方・性格・好む選手・履歴")
    }
}

@Composable
private fun Fact(label: String, value: String) {
    Row {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(64.dp))
        Text(value, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
    }
}

/** 考え方の目盛り（-2〜2 の5段。片側だけのものは右半分を薄く） */
@Composable
private fun ScaleRow(item: StaffScale) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 1.dp)) {
        Text(item.label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(88.dp))
        Text(item.low, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            (-2..2).forEach { v ->
                val color = when {
                    v == item.value -> MaterialTheme.colorScheme.primary
                    item.oneSided && v > 0 -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                    else -> MaterialTheme.colorScheme.surfaceVariant
                }
                Box(Modifier.size(width = 10.dp, height = 7.dp).clip(RoundedCornerShape(2.dp)).background(color))
            }
        }
        Text(item.high, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("  ${item.text}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TacticsLines(lines: List<TacticLine>) {
    if (lines.isEmpty()) return
    Section("試合中の采配（実際の動き）") {
        Muted("「AI判断」の項目に指導者が入れている中身と、決めた人です。")
        lines.forEach { Text(it.text, style = MaterialTheme.typography.bodySmall, fontWeight = if (it.by != null) FontWeight.SemiBold else FontWeight.Normal) }
    }
}

@Composable
private fun Events(title: String, events: List<StaffEvent>) {
    if (events.isEmpty()) return
    Section(title) {
        events.forEach { e -> Text("${e.year}年 ${e.text}", style = MaterialTheme.typography.bodySmall) }
    }
}

/** 方針・采配の各項目の下に出す「→ 積極的（山田監督）」。指導者が決めていなければ出さない */
@Composable
fun StaffActual(view: LeagueView, field: String, key: String) {
    val line = view.staff?.tactic(field, key)?.takeIf { it.by != null } ?: return
    Text("→ ${line.resolvedLabel ?: line.valueLabel}（${line.by}）", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
}
