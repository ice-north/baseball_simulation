package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.BATTING_GROUPS
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.PITCHING_GROUPS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.defaultSortColumn
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.overviewGroup
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.sortRoster
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

private enum class PlayersMode(val label: String) { Season("選手成績"), Career("通算成績"), Ranking("能力ランキング") }

/** 選手タブ: 選手成績・通算成績（球団を切り替えて同じ表）と、リーグ全体の能力ランキング */
@Composable
fun PlayersScreen(model: AppViewModel) {
    val view = model.view ?: return
    val raw = model.raw ?: return
    var mode by rememberSaveable { mutableStateOf(PlayersMode.Season) }
    var team by rememberSaveable { mutableStateOf(view.teamName.orEmpty()) }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ChipTabs(PlayersMode.entries.map { it.name to it.label }, mode.name, { mode = PlayersMode.valueOf(it) }, Modifier.weight(1f).padding(top = 8.dp))
            InfoButton(
                "選手",
                listOf("表の見出しを押すと並べ替え、名前を押すと選手の詳細を開きます。", "自球団の表で色の付いた行は、スタメン・先発ローテの選手です。ランキングでは自球団の選手に色が付きます。"),
                Modifier.padding(top = 8.dp, end = 8.dp),
            )
        }
        when (mode) {
            PlayersMode.Ranking -> AbilityRanking(model, view, raw)
            else -> TeamStats(model, view, raw, team, { team = it }, career = mode == PlayersMode.Career)
        }
    }
}

@Composable
private fun TeamPicker(view: LeagueView, raw: JsonObject, team: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val names = raw.at("teamNames").list().mapNotNull { it.str() }.ifEmpty { view.standings.map { it.team } }
    // 自球団を先頭に
    val ordered = listOfNotNull(view.teamName) + names.filter { it != view.teamName }
    Box {
        TextButton(onClick = { open = true }) {
            Text(view.teamLabel(team), fontWeight = FontWeight.Bold)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = "球団を選ぶ")
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            ordered.forEach { name ->
                DropdownMenuItem(
                    text = { Text(view.teamLabel(name) + if (name == view.teamName) "（自球団）" else "") },
                    onClick = { open = false; onPick(name) },
                )
            }
        }
    }
}

@Composable
private fun TeamStats(model: AppViewModel, view: LeagueView, raw: JsonObject, team: String, onTeam: (String) -> Unit, career: Boolean) {
    val own = team == view.teamName
    // 自球団の今季は手元のビューで出す。他球団と通算はその場で読みに行く（全球団ぶんをビューに載せない）
    var loaded by remember(team, career) { mutableStateOf<List<JsonObject>?>(null) }
    var failure by remember(team, career) { mutableStateOf<String?>(null) }
    val needsRead = career || !own
    LaunchedEffect(team, career, view.revision) {
        if (!needsRead) return@LaunchedEffect
        try {
            val result = model.read("team", mapOf("team" to team))
            loaded = result.at("roster").list().mapNotNull { it.obj() }
            failure = null
        } catch (e: Exception) {
            // ⚠ 前の読み込みが取り消されたとき（ページを連打した・画面を離れた）は失敗として出さない
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    val source: List<JsonObject>? = if (needsRead) loaded else raw.at("roster").list().mapNotNull { it.obj() }
    // 通算は通算の数字を表が読む形に移す（Web 版 careerRoster と同じ）。記録の無い選手は出さない
    val roster = source?.let { list ->
        if (!career) list else list.mapNotNull { p ->
            val c = p["career"].obj() ?: return@mapNotNull null
            buildJsonObject {
                p.forEach { (k, v) -> put(k, v) }
                c["seasonStats"]?.let { put("seasonStats", it) }
                c["performance"]?.let { put("performance", it) }
            }
        }
    }
    var batting by rememberSaveable { mutableStateOf(true) }
    var groupId by rememberSaveable(batting) { mutableStateOf("overview") }
    var sortId by rememberSaveable(batting, career) { mutableStateOf<String?>(null) }
    var ascending by rememberSaveable(batting, career) { mutableStateOf(false) }
    val groups = listOf(overviewGroup(batting)) + if (batting) BATTING_GROUPS else PITCHING_GROUPS
    val group = groups.firstOrNull { it.id == groupId } ?: groups.first()
    val allColumns = groups.flatMap { it.columns }
    val sortColumn = sortId?.let { id -> allColumns.firstOrNull { it.id == id } } ?: defaultSortColumn(batting)
    val players = roster.orEmpty().filter { (it.at("position").str() == "pitcher") != batting && it.at("isActive").bool() != false }
    val sorted = sortRoster(players, sortColumn, if (sortId == null) false else ascending)
    val lineupIds = remember(view.lineup) {
        view.lineup?.at("battingOrder").list().mapNotNull { it.at("playerId").num()?.toLong() }.toSet() +
            view.lineup?.at("starters").list().mapNotNull { it.num()?.toLong() }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TeamPicker(view, raw, team, onTeam)
            Box(Modifier.weight(1f))
            ChoiceRow(listOf("bat" to "打撃", "pit" to "投球"), if (batting) "bat" else "pit") { batting = it == "bat" }
        }
        ChipTabs(groups.map { it.id to it.label }, group.id, { groupId = it })
        if (career && roster != null) {
            val years = roster.maxOfOrNull { it.at("career", "years").int() ?: 0 } ?: 0
            val partial = roster.any { it.at("career", "partial").bool() == true }
            Muted(
                if (roster.isEmpty()) "このリーグでの記録がまだありません。1シーズン目が進むと出ます。"
                else "通算${years}シーズン（今季を含む）" + if (partial) "。記録の無い試合の分は入っていません" else "",
                Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        when {
            failure != null -> Muted("読み込めませんでした: $failure", Modifier.padding(16.dp))
            roster == null -> Muted("読み込み中…", Modifier.padding(16.dp))
            else -> {
                StatTable(
                    players = sorted,
                    columns = group.columns,
                    sortId = sortColumn.id,
                    ascending = if (sortId == null) false else ascending,
                    onSort = { c ->
                        if (c.id == sortColumn.id && sortId != null) ascending = !ascending
                        else { sortId = c.id; ascending = c.ascending }
                    },
                    onPlayer = { model.openPlayer = it },
                    highlight = { own && (it.at("id").num()?.toLong() ?: -1L) in lineupIds },
                    sub = { p ->
                        positionLabel(p.at("position").str()) + (p.at("age").int()?.let { " ${it}歳" } ?: "")
                    },
                )
            }
        }
    }
}

/** 能力ランキング（リーグ全球団の中の並び。球団ごとの表では作れない） */
@Composable
private fun AbilityRanking(model: AppViewModel, view: LeagueView, raw: JsonObject) {
    val boards = raw.at("abilityLeaders").list().mapNotNull { it.obj() }
    if (boards.isEmpty()) {
        Muted("まだ集計がありません。", Modifier.padding(16.dp))
        return
    }
    var selected by rememberSaveable { mutableStateOf(boards.first().at("id").str().orEmpty()) }
    val board = boards.firstOrNull { it.at("id").str() == selected } ?: boards.first()
    val velocity = board.at("velocity").bool() == true
    val stamina = board.at("stamina").bool() == true
    Column(Modifier.fillMaxSize()) {
        ChipTabs(boards.map { it.at("id").str().orEmpty() to it.at("label").str().orEmpty() }, board.at("id").str().orEmpty(), { selected = it })
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            board.at("rows").list().mapNotNull { it.obj() }.forEachIndexed { i, row ->
                val mine = row.at("team").str() == view.teamName
                Row(
                    Modifier.fillMaxWidth().clickable { model.openPlayer = row }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${i + 1}", modifier = Modifier.width(28.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f)) {
                        Text(row.at("name").str().orEmpty(), fontWeight = if (mine) FontWeight.Bold else FontWeight.SemiBold, color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                        Muted("${view.teamShort(row.at("team").str().orEmpty())} · ${positionLabel(row.at("position").str())} · ${row.at("age").int() ?: "-"}歳")
                    }
                    Box(Modifier.width(56.dp), contentAlignment = Alignment.CenterEnd) {
                        AbilityNum(null, row.at("value").int(), velocity = velocity, stamina = stamina)
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}
