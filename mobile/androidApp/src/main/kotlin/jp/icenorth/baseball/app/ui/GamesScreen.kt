package jp.icenorth.baseball.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import kotlinx.serialization.json.JsonObject

/** 試合タブ: 自球団／リーグ全体の試合結果（年度・6試合ずつ）と、1試合の打撃・投手成績 */
@Composable
fun GamesScreen(model: AppViewModel) {
    val view = model.view ?: return
    val raw = model.raw ?: return
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    val current = open
    if (current != null) {
        BackHandler { open = null }
        GameDetail(model, view, current.substringBefore(':'), current.substringAfter(':')) { open = null }
        return
    }
    val years = raw.at("seasonYears").list().mapNotNull { it.int() }.ifEmpty { listOfNotNull(view.year) }
    var year by rememberSaveable { mutableStateOf(years.lastOrNull() ?: 1) }
    var scope by rememberSaveable { mutableStateOf("own") }
    var page by rememberSaveable { mutableStateOf(0) }
    var data by remember { mutableStateOf<JsonObject?>(null) }
    var failure by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(year, scope, page, view.revision) {
        try {
            data = model.read("games", mapOf("year" to "$year", "page" to "$page", "scope" to scope))
            failure = null
        } catch (e: Exception) {
            failure = model.describe(e)
        }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("試合結果", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        ChoiceRow(listOf("own" to "自球団", "league" to "リーグ全体"), scope) { scope = it; page = 0 }
        if (years.size > 1) ChoiceRow(years.map { "$it" to "${it}年目" }, "$year") { year = it.toInt(); page = 0 }
        val games = data?.at("games").list().mapNotNull { it.obj() }
        val count = data?.at("count").int() ?: 0
        val size = data?.at("size").int() ?: 6
        when {
            failure != null -> Muted("読み込めませんでした: $failure")
            data == null -> Muted("読み込み中…")
            games.isEmpty() -> Muted("まだ試合がありません。")
            else -> Section {
                games.forEach { g ->
                    GameRow(view, g) { open = "${g.at("gameId").num()?.toLong()}:${data?.at("year").int() ?: year}" }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
        if (count > size) {
            val pages = (count + size - 1) / size
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = { page -= 1 }, enabled = page > 0) { Text("新しい") }
                Text("${page + 1} / $pages", modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                OutlinedButton(onClick = { page += 1 }, enabled = page + 1 < pages) { Text("古い") }
            }
        }
    }
}

private fun dateText(g: JsonObject) = g.at("date").let { d -> "${d.at("month").int() ?: ""}/${d.at("day").int() ?: ""}" }

@Composable
private fun GameRow(view: LeagueView, g: JsonObject, onOpen: () -> Unit) {
    val home = g.at("home").str().orEmpty()
    val away = g.at("away").str().orEmpty()
    val hs = g.at("homeScore").int()
    val `as` = g.at("awayScore").int()
    val mine = view.teamName
    val result = if (mine == home || mine == away) {
        val own = if (mine == home) hs else `as`
        val their = if (mine == home) `as` else hs
        if (own == null || their == null) null else if (own > their) "○" to WinColor else if (own < their) "●" to LoseColor else "△" to MaterialTheme.colorScheme.onSurfaceVariant
    } else null
    Row(Modifier.fillMaxWidth().testTag("game-row").clickable(onClick = onOpen).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(dateText(g), modifier = Modifier.width(44.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        Text(result?.first ?: "", color = result?.second ?: MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold, modifier = Modifier.width(20.dp))
        Column(Modifier.weight(1f)) {
            Text("${view.teamShort(away)}  ${`as` ?: "-"} - ${hs ?: "-"}  ${view.teamShort(home)}", fontWeight = FontWeight.SemiBold)
            val d = g.at("decisions")
            Muted(
                listOfNotNull(
                    d.at("winningPitcher", "name").str()?.let { "勝 $it" },
                    d.at("losingPitcher", "name").str()?.let { "敗 $it" },
                    d.at("savePitcher", "name").str()?.let { "S $it" },
                ).joinToString("  "),
            )
        }
        Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun GameDetail(model: AppViewModel, view: LeagueView, id: String, year: String, onBack: () -> Unit) {
    var game by remember(id) { mutableStateOf<JsonObject?>(null) }
    var failure by remember(id) { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        try {
            game = model.read("game", mapOf("id" to id, "year" to year))
        } catch (e: Exception) {
            failure = model.describe(e)
        }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text("‹ 試合結果へ戻る") }
        val g = game
        when {
            failure != null -> Muted("読み込めませんでした: $failure")
            g == null -> Muted("読み込み中…")
            else -> {
                val home = g.at("home").str().orEmpty()
                val away = g.at("away").str().orEmpty()
                Section {
                    Muted("${dateText(g)} · ${view.teamLabel(home)}の主催")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(view.teamShort(away), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f), textAlign = TextAlign.End)
                        Text(
                            "  ${g.at("awayScore").int() ?: "-"} - ${g.at("homeScore").int() ?: "-"}  ",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(view.teamShort(home), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    }
                    val d = g.at("decisions")
                    Muted(
                        listOfNotNull(
                            d.at("winningPitcher", "name").str()?.let { "勝 $it" },
                            d.at("losingPitcher", "name").str()?.let { "敗 $it" },
                            d.at("savePitcher", "name").str()?.let { "S $it" },
                            d.at("holdPitchers").list().mapNotNull { it.at("name").str() }.takeIf { it.isNotEmpty() }?.let { "H ${it.joinToString("・")}" },
                        ).joinToString("  "),
                    )
                }
                listOf(away, home).forEach { team ->
                    val players = g.at("teams", team).list().mapNotNull { it.obj() }
                    if (players.isNotEmpty()) BoxScore(view, team, players)
                }
                val changes = g.at("pitcherChanges").list().mapNotNull { it.obj() }
                if (changes.isNotEmpty()) {
                    Section("継投") {
                        changes.forEach { c ->
                            Column {
                                Text(
                                    "${c.at("inning").int()}回${if (c.at("isTop").bool() == true) "表" else "裏"} ${view.teamShort(c.at("team").str().orEmpty())}  ${c.at("out").str()} → ${c.at("in").str()}",
                                    fontSize = 13.sp,
                                )
                                Muted(listOfNotNull(c.at("role").str(), c.at("reason").str()).joinToString(" · "))
                            }
                        }
                    }
                }
                if (g["replay"].obj() != null) Muted("この試合は一球ごとの経過が記録されています（経過の再生は Web 版で見られます）。")
            }
        }
    }
}

private data class Col(val label: String, val get: (JsonObject) -> String)

private fun n(v: Double?) = v?.toInt()?.toString() ?: "-"

private val BATTER_COLS = listOf(
    Col("打数") { n(it.at("batting", "atBats").num()) },
    Col("安打") { n(it.at("batting", "hits").num()) },
    Col("本塁") { n(it.at("batting", "homeruns").num()) },
    Col("打点") { n(it.at("batting", "rbis").num()) },
    Col("四球") { n(it.at("batting", "walks").num()) },
    Col("三振") { n(it.at("batting", "strikeouts").num()) },
)

private val PITCHER_COLS = listOf(
    Col("回") { p -> p.at("pitching", "inningsPitched").num()?.toInt()?.let { "${it / 3}.${it % 3}" } ?: "-" },
    Col("被安") { n(it.at("pitching", "hits").num()) },
    Col("失点") { n(it.at("pitching", "runsAllowed").num()) },
    Col("自責") { n(it.at("pitching", "earnedRuns").num()) },
    Col("四球") { n(it.at("pitching", "walks").num()) },
    Col("三振") { n(it.at("pitching", "strikeouts").num()) },
    Col("球数") { n(it.at("pitching", "pitches").num()) },
)

@Composable
private fun BoxScore(view: LeagueView, team: String, players: List<JsonObject>) {
    val batters = players
        .filter { (it.at("battingOrder").int() ?: 0) > 0 || (it.at("batting", "plateAppearances").num() ?: 0.0) > 0 }
        .sortedBy { it.at("battingOrder").int()?.takeIf { o -> o > 0 } ?: 99 }
    val pitchers = players.filter { (it.at("pitching", "battersFaced").num() ?: 0.0) > 0 || (it.at("pitching", "inningsPitched").num() ?: 0.0) > 0 }
    Section(view.teamLabel(team)) {
        Table(batters, BATTER_COLS) { p -> "${p.at("battingOrder").int()?.takeIf { it > 0 }?.toString() ?: " "} ${positionLabel(p.at("position").str())} ${p.at("name").str().orEmpty()}" }
        if (pitchers.isNotEmpty()) {
            Muted("投手")
            Table(pitchers, PITCHER_COLS) { it.at("name").str().orEmpty() }
        }
    }
}

@Composable
private fun Table(rows: List<JsonObject>, cols: List<Col>, name: (JsonObject) -> String) {
    Column {
        Row {
            Text("", modifier = Modifier.weight(1f))
            cols.forEach { Text(it.label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(34.dp), textAlign = TextAlign.End) }
        }
        rows.forEach { p ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(name(p), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                cols.forEach { Text(it.get(p), fontSize = 13.sp, modifier = Modifier.width(34.dp), textAlign = TextAlign.End) }
            }
        }
    }
}
