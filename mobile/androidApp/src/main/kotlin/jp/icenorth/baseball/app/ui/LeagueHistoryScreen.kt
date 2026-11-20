package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.ChronicleView
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.OnlineJson
import jp.icenorth.baseball.shared.OwnerRecord
import jp.icenorth.baseball.shared.PYRAMID_LEAGUES
import jp.icenorth.baseball.shared.ProDrafted
import jp.icenorth.baseball.shared.TeamChronicle
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.gamesBehindAbove
import jp.icenorth.baseball.shared.gapText
import jp.icenorth.baseball.shared.honorRows
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.pastMoves
import jp.icenorth.baseball.shared.pastTables
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.proDraftedAfter
import jp.icenorth.baseball.shared.proDraftedBody
import jp.icenorth.baseball.shared.proDraftedHead
import jp.icenorth.baseball.shared.rate3
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import kotlinx.serialization.json.JsonObject

/*
 * リーグ史（試合タブの「リーグ史」）。PC の左メニュー「リーグ史」（src/online/LeagueHistory.jsx）と同じ6つの切り替え。
 * ⚠ 先方要望（2026-11-20）。能力ランキング・通算成績ランキング（以前は選手タブの「能力順」「通算順」）と
 *    リーグ全体の取引の記録はここへ統合した。球団史・記録にあったリーグ全体の欄（オーナー名鑑・年間表彰・
 *    リーグからプロへ）もここへ移した
 */

private val HISTORY_TABS = listOf(
    "standings" to "過去の順位",
    "pro" to "プロ入り",
    "moves" to "移籍・取引",
    "careers" to "通算成績",
    "ability" to "能力",
    "honors" to "表彰・オーナー",
)

@Composable
fun LeagueHistoryPane(model: AppViewModel, view: LeagueView, raw: JsonObject) {
    var tab by rememberSaveable { mutableStateOf("standings") }
    Column(Modifier.fillMaxSize()) {
        ChipTabs(HISTORY_TABS, tab, { tab = it }, Modifier.testTag("league-history-tabs"))
        when (tab) {
            "pro" -> ProPane(model, view, raw)
            "moves" -> TransactionsPane(model, view)
            "careers" -> CareerRanking(model, view, raw)
            "ability" -> AbilityRanking(model, view, raw)
            "honors" -> HonorsPane(view, raw)
            else -> PastStandingsPane(view, raw)
        }
    }
}

/** 過去の順位（終わった年の最終順位。差はすぐ上の順位の球団とのゲーム差）と歴代の優勝 */
@Composable
private fun PastStandingsPane(view: LeagueView, raw: JsonObject) {
    val history = raw.at("history").list().mapNotNull { it.obj() }
    var year by rememberSaveable { mutableStateOf(history.lastOrNull()?.at("year").int()) }
    val entry = history.firstOrNull { it.at("year").int() == year } ?: history.lastOrNull()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (entry == null) {
            Muted("まだ終わったシーズンがありません。1年目の年度更新が済むと、ここに年ごとの最終順位が並びます。")
            return@Column
        }
        if (history.size > 1) {
            ChipTabs(history.reversed().map { "${it.at("year").int()}" to "${it.at("year").int()}年目" }, "${entry.at("year").int()}", { year = it.toIntOrNull() })
        }
        Muted("${entry.at("year").int()}年目の最終順位です。差はすぐ上の順位の球団とのゲーム差です。")
        val moves = pastMoves(entry)
        val champion = entry.at("playoffChampion").str()
        pastTables(entry).forEach { table ->
            val gaps = gamesBehindAbove(table.rows)
            Section(table.league?.name ?: "順位") {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                    val head = MaterialTheme.typography.labelSmall
                    val ink = MaterialTheme.colorScheme.onSurfaceVariant
                    Text("順", style = head, color = ink, modifier = Modifier.width(22.dp))
                    Text("球団", style = head, color = ink, modifier = Modifier.weight(1f))
                    Text("勝-敗-分", style = head, color = ink, modifier = Modifier.width(72.dp), textAlign = TextAlign.End)
                    Text("勝率", style = head, color = ink, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
                    Text("差", style = head, color = ink, modifier = Modifier.width(38.dp), textAlign = TextAlign.End)
                }
                table.rows.forEachIndexed { i, s ->
                    val own = s.team == view.teamName
                    val note = listOfNotNull(if (champion == s.team) "プレーオフ優勝" else null, moves[s.team]).joinToString("・")
                    Column(
                        Modifier.fillMaxWidth()
                            .background(if (own) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("${i + 1}", modifier = Modifier.width(22.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(view.teamShort(s.team), fontWeight = if (own) FontWeight.Bold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Text("${s.wins}-${s.losses}-${s.draws}", modifier = Modifier.width(72.dp), textAlign = TextAlign.End)
                            Text(rate3(s.winRate), modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
                            Text(gapText(gaps[i]), modifier = Modifier.width(38.dp), textAlign = TextAlign.End)
                        }
                        if (note.isNotEmpty()) Text(note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 22.dp))
                    }
                }
            }
        }
        // 歴代の優勝（新しい順。各部の1位とプレーオフ優勝）
        Section("歴代の優勝") {
            history.reversed().forEach { h ->
                val tables = pastTables(h)
                val firsts = PYRAMID_LEAGUES.mapNotNull { l -> tables.firstOrNull { it.league?.id == l.id }?.rows?.firstOrNull()?.let { "${l.name} ${view.teamShort(it.team)}" } }
                val po = h.at("playoffChampion").str()?.let { "PO ${view.teamShort(it)}" }
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text("${h.at("year").int()}年目", fontWeight = FontWeight.Bold, modifier = Modifier.width(56.dp))
                    Text((firsts + listOfNotNull(po)).joinToString("　"), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/** プロ入りとその後（リーグ全体。新しい順）。プロでの成績の全部は押して読む（ビューは最新の年の1行だけ） */
@Composable
private fun ProPane(model: AppViewModel, view: LeagueView, raw: JsonObject) {
    val list = remember(raw) {
        raw.at("chronicle").obj()?.let { runCatching { OnlineJson.decodeFromJsonElement(ChronicleView.serializer(), it) }.getOrNull() }?.proDrafted.orEmpty()
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Muted("このリーグからNPBのドラフトで指名された選手と、プロに入ってからの成績です（新しい順。プロでの成績は飾りで、リーグには効きません）。")
        if (list.isEmpty()) Muted("まだこのリーグからプロ入りした選手はいません（指名は10月下旬、リーグ全体で年0〜5人。0人の年もあります）。")
        list.forEach { r ->
            Column {
                Text(proDraftedHead(r) { view.teamShort(it) }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                Text(proDraftedBody(r), style = MaterialTheme.typography.bodySmall)
                ProCareer(model, r)
                HorizontalDivider(Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

/** プロでの成績。最新の1行と「全部見る」（元の球団の球団史を読む。PC の ProCareerMore と同じ） */
@Composable
private fun ProCareer(model: AppViewModel, r: ProDrafted) {
    var open by rememberSaveable(r.name, r.year) { mutableStateOf(false) }
    var lines by remember(r.name, r.year) { mutableStateOf<List<String>?>(null) }
    var failure by remember(r.name, r.year) { mutableStateOf<String?>(null) }
    LaunchedEffect(open) {
        if (!open || lines != null) return@LaunchedEffect
        try {
            val c = model.read("team", mapOf("team" to r.team)).at("chronicle").obj()?.let { OnlineJson.decodeFromJsonElement(TeamChronicle.serializer(), it) }
            lines = c?.proDrafted?.firstOrNull { it.name == r.name && it.year == r.year }?.let { proDraftedAfter(it) }.orEmpty()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    val shown = if (open) lines else null
    (shown ?: proDraftedAfter(r)).forEach { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    if (open && lines == null && failure == null) Muted("読み込み中…")
    failure?.let { Muted(it) }
    if (r.team.isNotEmpty() && (r.after != null || r.career.isNotEmpty())) {
        TextButton(onClick = { open = !open }) { Text(if (open) "プロでの成績を閉じる" else "プロでの成績を全部見る") }
    }
}

private val KIND_LABELS = mapOf("trade" to "トレード", "release" to "退団", "signing" to "入団")

/** 移籍・取引の記録（成立したトレード・契約更改の退団・トライアウトの入団。年度と球団で絞る） */
@Composable
private fun TransactionsPane(model: AppViewModel, view: LeagueView) {
    var year by rememberSaveable { mutableStateOf(view.year) }
    var team by rememberSaveable { mutableStateOf("") }
    var data by remember { mutableStateOf<JsonObject?>(null) }
    var failure by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    LaunchedEffect(year, team, view.revision, attempt) {
        data = null
        try {
            data = model.read("transactions", buildMap { put("year", year?.toString()); if (team.isNotEmpty()) put("team", team) })
            failure = null
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Muted("成立したトレードと、契約更改の退団・トライアウトの入団です。")
        val d = data
        val years = (listOfNotNull(view.year) + d?.at("years").list().mapNotNull { it.int() }).distinct().sortedDescending()
        if (years.size > 1) ChipTabs(years.map { "$it" to "${it}年目" }, "${year ?: ""}", { year = it.toIntOrNull() })
        val names = listOf("" to "全球団") + view.standings.map { it.team }.sorted().map { it to view.teamShort(it) }
        ChipTabs(names, team, { team = it })
        when {
            failure != null -> LoadFailed(failure.orEmpty(), onRetry = { failure = null; attempt += 1 })
            d == null -> Muted("読み込み中…")
            else -> {
                val items = d.at("items").list().mapNotNull { it.obj() }
                if (items.isEmpty()) Muted("この年度の取引はまだありません。")
                items.forEach { t ->
                    val kind = t.at("kind").str().orEmpty()
                    val teams = t.at("teams").list().mapNotNull { it.str() }.joinToString(" ⇄ ") { view.teamShort(it) }
                    val who = when {
                        kind != "trade" -> ""
                        t.at("cpuOnly").bool() == true -> "（CPU球団どうし）"
                        t.at("cpu").bool() == true -> "（相手はCPU）"
                        else -> ""
                    }
                    val date = when (kind) {
                        "trade" -> t.at("date").obj()?.let { "${it.at("month").int()}月${it.at("day").int()}日" }.orEmpty()
                        "release" -> "契約更改"
                        else -> "トライアウト"
                    }
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Tag(KIND_LABELS[kind] ?: kind, if (kind == "release") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary)
                            Muted(date)
                            Text("$teams$who", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                        }
                        t.at("moves").list().mapNotNull { it.obj() }.forEach { m ->
                            val from = m.at("from").str()?.let { view.teamShort(it) } ?: if (kind == "signing") "新人" else ""
                            val to = m.at("to").str()?.let { view.teamShort(it) } ?: if (kind == "release") "退団" else ""
                            Muted("${m.at("name").str().orEmpty()}（${positionLabel(m.at("position").str())}）　$from → $to")
                        }
                        HorizontalDivider(Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
}

/** 表彰・オーナー（リーグ全体の年間表彰と、参加者ごとの通算） */
@Composable
private fun HonorsPane(view: LeagueView, raw: JsonObject) {
    val chronicle = remember(raw) { raw.at("chronicle").obj()?.let { runCatching { OnlineJson.decodeFromJsonElement(ChronicleView.serializer(), it) }.getOrNull() } }
    val honors = chronicle?.honors
    val owners = remember(raw) {
        raw.at("owners").list().mapNotNull { e -> e.obj()?.let { runCatching { OnlineJson.decodeFromJsonElement(OwnerRecord.serializer(), it) }.getOrNull() } }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Section("年間表彰" + (honors?.year?.takeIf { it > 0 }?.let { "（${it}年目）" } ?: "")) {
            val rows = honorRows(honors) { view.teamShort(it) }
            if (rows.isEmpty()) Muted("まだありません。10月下旬に成績が確定すると、タイトルと部ごとのMVP・新人王・ベストナイン・最優秀バッテリーが決まります。")
            rows.forEach { (head, text) ->
                Column(Modifier.padding(vertical = 2.dp)) {
                    Text(head, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text(text, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Section("オーナー名鑑") {
            if (owners.isEmpty()) Muted("まだ参加者がいません。")
            owners.forEach { o ->
                Column(Modifier.padding(vertical = 2.dp)) {
                    Text(o.head.ifBlank { view.teamLabel(o.team) }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text(o.text, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
