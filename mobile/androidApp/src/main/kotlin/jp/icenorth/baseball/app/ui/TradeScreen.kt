package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.Commands
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.ONLINE_ROSTER_TARGETS
import jp.icenorth.baseball.shared.ROSTER_LIMIT
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.dealProblems
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.long
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.overallScore
import jp.icenorth.baseball.shared.pid
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.rosterCounts
import jp.icenorth.baseball.shared.rosterGroup
import jp.icenorth.baseball.shared.rostersAfterTrade
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.teamLabel
import kotlinx.serialization.json.JsonObject
import kotlin.math.roundToInt

/**
 * トレード。出す選手ともらう選手を同じ物差しで比べ、交換後の両球団の名簿が成り立つかを見て決める。
 * ⚠ 相手はCPU球団でもよい（その場で答える：受ける／逆提案／断る）。人の球団を先に並べる。
 * ⚠ 名簿が成り立つかはサーバーと同じ規則（rosterShortfall）。最終の判断はサーバー。
 * ⚠ 逆提案は1回だけ。`offer` はいつも提案した側が出す選手（向きを変えない）。
 */
@Composable
fun TradeScreen(model: AppViewModel, raw: JsonObject) {
    val view = model.view ?: return
    val trades = raw.at("trades").list().mapNotNull { it.obj() }
    val waiting = trades.filter { it.at("myTurn").bool() == true }
    val sent = trades.filter { it.at("myTurn").bool() != true }
    val humans = raw.at("members").list().mapNotNull { it.at("teamName").str() }.toSet()
    val others = raw.at("teamNames").list().mapNotNull { it.str() }.filter { it != view.teamName }
    val partners = others.filter { it in humans } + others.filter { it !in humans }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (waiting.isNotEmpty()) Caption("返事が必要な提案")
        waiting.forEach { TradeCard(model, view, raw, it) }
        if (sent.isNotEmpty()) Caption("相手の返事待ち")
        sent.forEach { TradeCard(model, view, raw, it) }
        Row(verticalAlignment = Alignment.Bottom) {
            Box(Modifier.weight(1f)) { Caption("新しく提案する") }
            InfoButton(
                "トレード",
                listOf(
                    "ほかの球団と選手を交換します。CPU球団はその場で答え、参加者の球団は相手が受けた時点で成立します。",
                    "行を押すと交換案に入ります（自球団の行＝出す、相手の行＝もらう）。名前を押すと詳細。",
                    "解雇は土曜の「契約更改」、獲得は土曜の「トライアウト」で行います。",
                ),
            )
        }
        if (partners.isEmpty()) Muted("トレードの相手になる球団がありません。")
        else TradeComposer(model, view, raw, partners, humans, locked = null, initialGive = emptySet(), initialGet = emptySet(), submitLabel = "この内容で提案する") { to, give, get, reset ->
            model.command(
                "tradeOffer",
                Commands.tradeOffer(to, give, get),
                label = "提案を送信中…",
                done = "提案しました",
            ) { reset() }
        }
    }
}

/** 相手の名簿（その場で読む。12球団ぶんをいつもビューに載せると重い） */
@Composable
private fun partnerRoster(model: AppViewModel, partner: String?): Pair<List<JsonObject>?, String?> {
    var roster by remember(partner) { mutableStateOf<List<JsonObject>?>(null) }
    var failure by remember(partner) { mutableStateOf<String?>(null) }
    val revision = model.view?.revision
    LaunchedEffect(partner, revision) {
        if (partner == null) return@LaunchedEffect
        try {
            roster = model.read("team", mapOf("team" to partner)).at("roster").list().mapNotNull { it.obj() }
            failure = null
        } catch (e: Exception) {
            // ⚠ 前の読み込みが取り消されたとき（ページを連打した・画面を離れた）は失敗として出さない
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    return roster to failure
}

@Composable
private fun TradeCard(model: AppViewModel, view: LeagueView, raw: JsonObject, trade: JsonObject) {
    val mine = trade.at("mine").bool() == true
    val myTurn = trade.at("myTurn").bool() == true
    val countered = trade.at("countered").bool() == true
    val partner = (if (mine) trade.at("toTeam") else trade.at("fromTeam")).str().orEmpty()
    // ⚠ 自分から見た向きに直す（offer はいつも提案した側が出す選手）
    val giveEntries = (if (mine) trade.at("offer") else trade.at("want")).list().mapNotNull { it.obj() }
    val getEntries = (if (mine) trade.at("want") else trade.at("offer")).list().mapNotNull { it.obj() }
    val (theirs, theirError) = partnerRoster(model, partner)
    val myRoster = raw.at("roster").list().mapNotNull { it.obj() }
    val stale = (giveEntries + getEntries).any { it.at("gone").bool() == true }
    val give = giveEntries.filter { it.at("gone").bool() != true }.map { it.pid }.toSet()
    val get = getEntries.filter { it.at("gone").bool() != true }.map { it.pid }.toSet()
    val problems = dealProblems(myRoster, theirs, give, get)
    var countering by rememberSaveable(trade.at("id").str()) { mutableStateOf(false) }
    val tradeId = trade.at("id").str().orEmpty()
    val respond = { action: String, counterGive: Set<Long>?, counterGet: Set<Long>? ->
        model.command(
            "tradeRespond",
            Commands.tradeRespond(tradeId, action, mine, counterGive, counterGet),
            label = "返事を送信中…",
            done = when (action) { "accept" -> "トレードが成立しました"; "reject" -> if (mine) "提案を取り下げました" else "断りました"; else -> "逆提案を送りました" },
        ) { countering = false }
    }
    Section(
        when {
            mine && countered -> "${view.teamLabel(partner)} からの逆提案"
            mine -> "${view.teamLabel(partner)} へ提案中"
            else -> "${view.teamLabel(partner)} からの提案"
        },
    ) {
        Text(
            (if (myTurn) "あなたの返事待ち" else "相手の返事待ち") + if (countered) "（逆提案あり）" else "",
            color = if (myTurn) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelLarge,
        )
        if (!countering) {
            DealSide("出す（自球団）", giveEntries, myRoster, model)
            DealSide("もらう（${view.teamLabel(partner)}）", getEntries, theirs.orEmpty(), model)
            theirError?.let { Muted("相手の名簿を読めませんでした: $it") }
            if (theirs != null) AfterCounts(view, partner, myRoster, theirs, give, get)
            if (stale) Text("移籍済みの選手が含まれているため、成立できません。", color = MaterialTheme.colorScheme.error)
            problems.forEach { Text(it, color = MaterialTheme.colorScheme.error) }
        }
        if (myTurn && !countering) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { respond("accept", null, null) }, enabled = !stale && problems.isEmpty()) { Text("成立させる") }
                if (trade.at("canCounter").bool() == true) OutlinedButton(onClick = { countering = true }) { Text("逆提案") }
                OutlinedButton(onClick = { respond("reject", null, null) }) { Text("断る") }
            }
        }
        if (myTurn && countering) {
            Muted("中身を作り替えて返します。逆提案はこの1回だけで、相手が受けなければこの提案は消えます。")
            TradeComposer(model, view, raw, listOf(partner), emptySet(), locked = partner, initialGive = give, initialGet = get, submitLabel = "この内容で返す", onCancel = { countering = false }) { _, g, w, _ ->
                respond("counter", g.toSet(), w.toSet())
            }
        }
        if (!myTurn) OutlinedButton(onClick = { respond("reject", null, null) }) { Text(if (mine) "取り下げる" else "断る") }
    }
}

@Composable
private fun DealSide(title: String, entries: List<JsonObject>, roster: List<JsonObject>, model: AppViewModel) {
    val byId = roster.associateBy { it.pid }
    Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
    if (entries.isEmpty()) Muted("なし")
    entries.forEach { e ->
        val p = byId[e.pid]
        if (p != null) PlayerSummary(p, { model.openPlayer = it }) { Overall(p) }
        else Text("${e.at("name").str().orEmpty()}（${positionLabel(e.at("position").str())}）", color = if (e.at("gone").bool() == true) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun Overall(p: JsonObject) {
    Text("総合${overallScore(p).roundToInt()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.Bold)
}

private fun countsText(players: List<JsonObject>): String {
    val c = rosterCounts(players)
    return "${players.size}/${ROSTER_LIMIT}人 投${c["pitcher"]} 捕${c["catcher"]} 内${c["infielder"]} 外${c["outfielder"]}"
}

@Composable
private fun AfterCounts(view: LeagueView, partner: String, mine: List<JsonObject>, theirs: List<JsonObject>, give: Set<Long>, get: Set<Long>) {
    val after = rostersAfterTrade(mine, theirs, give, get)
    Muted("交換後  自球団 ${countsText(after.mine)}")
    Muted("交換後  ${view.teamLabel(partner)} ${countsText(after.theirs)}")
}

private val GROUPS = listOf("pitcher" to "投手", "catcher" to "捕手", "infielder" to "内野手", "outfielder" to "外野手")

/**
 * 交換案を作る。守備位置ごとに自球団と相手の選手を並べ、行を押すと出す／もらうに入る（もう一度押すと外れる）。
 */
@Composable
private fun TradeComposer(
    model: AppViewModel,
    view: LeagueView,
    raw: JsonObject,
    partners: List<String>,
    humans: Set<String>,
    locked: String?,
    initialGive: Set<Long>,
    initialGet: Set<Long>,
    submitLabel: String,
    onCancel: (() -> Unit)? = null,
    onSubmit: (to: String, give: List<Long>, get: List<Long>, reset: () -> Unit) -> Unit,
) {
    var partner by rememberSaveable { mutableStateOf(locked ?: partners.first()) }
    var give by remember { mutableStateOf(initialGive) }
    var get by remember(partner) { mutableStateOf(if (partner == locked) initialGet else emptySet()) }
    var group by rememberSaveable { mutableStateOf("pitcher") }
    var picker by remember { mutableStateOf(false) }
    val (theirs, theirError) = partnerRoster(model, partner)
    val myRoster = raw.at("roster").list().mapNotNull { it.obj() }
    val lineupIds = remember(raw) {
        (raw.at("lineup", "battingOrder").list().mapNotNull { it.at("playerId").long() } + raw.at("lineup", "starters").list().mapNotNull { it.long() }).toSet()
    }
    val problems = dealProblems(myRoster, theirs, give, get)
    Section {
        if (locked == null) {
            Box {
                TextButton(onClick = { picker = true }) {
                    Text("相手: ${view.teamLabel(partner)}${if (partner in humans) "（参加者）" else "（CPU）"}", fontWeight = FontWeight.Bold)
                    Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                }
                DropdownMenu(expanded = picker, onDismissRequest = { picker = false }) {
                    partners.forEach { name ->
                        DropdownMenuItem(
                            text = { Text(view.teamLabel(name) + if (name in humans) "（参加者）" else "（CPU）") },
                            onClick = { picker = false; partner = name },
                        )
                    }
                }
            }
        }
        Muted("出す ${give.size}人 · もらう ${get.size}人")
        theirs?.let { AfterCounts(view, partner, myRoster, it, give, get) }
        problems.forEach { Text(it, color = MaterialTheme.colorScheme.error) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { onSubmit(partner, give.toList(), get.toList()) { give = emptySet(); get = emptySet() } },
                enabled = (give.isNotEmpty() || get.isNotEmpty()) && problems.isEmpty() && theirs != null,
            ) { Text(submitLabel) }
            if (onCancel != null) OutlinedButton(onClick = onCancel) { Text("やめる") }
            else if (give.isNotEmpty() || get.isNotEmpty()) TextButton(onClick = { give = emptySet(); get = emptySet() }) { Text("選び直す") }
        }
        ChoiceRow(GROUPS, group) { group = it }
        val target = ONLINE_ROSTER_TARGETS[group]
        Caption("自球団（${view.teamLabel(view.teamName.orEmpty())}）${target?.let { " 目標$it" } ?: ""}")
        myRoster.filter { rosterGroup(it.at("position").str()) == group }.sortedByDescending { overallScore(it) }.forEach { p ->
            TradeRow(model, p, p.pid in give, if (p.pid in lineupIds) "スタメン・ローテ" else null) { give = if (p.pid in give) give - p.pid else give + p.pid }
        }
        Caption(view.teamLabel(partner))
        when {
            theirError != null -> Muted("相手の名簿を読めませんでした: $theirError")
            theirs == null -> Muted("読み込み中…")
            else -> theirs.filter { rosterGroup(it.at("position").str()) == group }.sortedByDescending { overallScore(it) }.forEach { p ->
                TradeRow(model, p, p.pid in get, null) { get = if (p.pid in get) get - p.pid else get + p.pid }
            }
        }
    }
}

@Composable
private fun TradeRow(model: AppViewModel, p: JsonObject, selected: Boolean, tag: String?, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (selected) MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f) else Color.Transparent, RoundedCornerShape(8.dp))
            .clickable(onClick = onToggle)
            .padding(horizontal = 6.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (selected) "✓" else "", color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.Bold, modifier = Modifier.padding(end = 4.dp))
        Box(Modifier.weight(1f)) {
            PlayerSummary(p, { model.openPlayer = it }) {
                Column(horizontalAlignment = Alignment.End) {
                    Overall(p)
                    tag?.let { Tag(it) }
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}
