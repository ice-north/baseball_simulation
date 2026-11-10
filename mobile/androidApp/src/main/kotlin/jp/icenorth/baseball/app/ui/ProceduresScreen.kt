package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
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
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.app.PhaseDraft
import jp.icenorth.baseball.shared.Commands
import jp.icenorth.baseball.shared.PHASE_LABELS
import jp.icenorth.baseball.shared.ROSTER_LIMIT
import jp.icenorth.baseball.shared.ONLINE_ROSTER_TARGETS
import jp.icenorth.baseball.shared.rosterCounts
import jp.icenorth.baseball.shared.seasonLine
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.long
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.pid
import jp.icenorth.baseball.shared.PendingProcedure
import jp.icenorth.baseball.shared.pendingProcedure
import jp.icenorth.baseball.shared.PackWaiting
import jp.icenorth.baseball.shared.packWaiting
import jp.icenorth.baseball.shared.waitingTradeCount
import jp.icenorth.baseball.shared.stageInfo
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.teamLabel
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

private enum class ProcTab(val label: String) { Current("現在の手続き"), Trade("トレード") }

/** 手続きタブ: 初期メンバー選択・キャンプ・契約更改・トライアウト・年度更新と、トレード */
@Composable
fun ProceduresScreen(model: AppViewModel, onRename: () -> Unit, onHome: () -> Unit = {}) {
    val raw = model.raw ?: return
    // ⚠ どちらの側を開いているかは AppViewModel に置く（届いた提案の知らせから、トレードの側を直接開くため）
    val tab = if (model.procTrade) ProcTab.Trade else ProcTab.Current
    val counts = mapOf(
        ProcTab.Current.name to (if (pendingProcedure(raw) != null) 1 else 0),
        ProcTab.Trade.name to waitingTradeCount(raw),
    )
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            ChipTabs(
                ProcTab.entries.map { it.name to it.label },
                tab.name,
                { model.procTrade = it == ProcTab.Trade.name },
                Modifier.weight(1f),
                counts = counts,
            )
            TextButton(onClick = onRename) { Text("球団名") }
        }
        when (tab) {
            ProcTab.Current -> CurrentProcedure(model, raw, onHome)
            ProcTab.Trade -> TradeScreen(model, raw)
        }
    }
}

@Composable
private fun CurrentProcedure(model: AppViewModel, raw: JsonObject, onHome: () -> Unit) {
    val pending = raw["pendingPack"].obj()
    val phase = raw["phase"].obj()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // ⚠ いまの段階とやることを先頭に出す（いしだ指摘: シーズン後の流れが分からない）。
        //    途中参加の初期メンバー選択の間は出さない（その画面に説明がある）
        if (pending == null) SeasonFlowCard(raw)
        when {
            pending != null -> PendingPack(model, raw, pending, onHome)
            phase != null -> PhasePanel(model, raw, phase)
            else -> {
                // ⚠ 「無い」だけで終わらせない。合間なら次に何が開くかを書く
                val head = stageHeadText(raw)
                val inSeason = raw.at("stage", "key").str() == "season"
                Section("手続き") { Text(if (head != null && !inSeason) "いま決めることはありません。$head。" else "現在、決定待ちの手続きはありません。") }
                raw["lastCamp"].obj()?.let { camp ->
                    Caption("${camp.at("year").int() ?: ""}年目のキャンプ結果")
                    CampGains(model, camp, raw.at("roster").list().mapNotNull { it.obj() }, finished = true)
                }
                OffseasonGrowthCard(model, raw)
            }
        }
    }
}

/** 「11/9(月) 0:00 の開幕から」。キャンプの前なら見込みなので「（予定）」を付ける（Web 版の packStartText と同じ） */
fun packStartText(joinsAt: String?, estimated: Boolean): String {
    val due = formatDeadline(joinsAt) ?: return "次のキャンプが終わった後の開幕から"
    return "$due の開幕から" + if (estimated) "（予定）" else ""
}

/** 途中参加の初期メンバー選択。選んだ時点で保存する（pack 命令。締め切りは無い） */
@Composable
private fun PendingPack(model: AppViewModel, raw: JsonObject, pending: JsonObject, onHome: () -> Unit) {
    val packs = pending.at("packs").list().mapNotNull { it.obj() }
    val chosen = pending.at("chosen").str()
    val chosenName = packs.firstOrNull { it.at("id").str() == chosen }?.at("name").str()
    val waiting = packWaiting(raw)
    // 選び終えた後に「セットを選び直す」を押したか
    var choosing by rememberSaveable { mutableStateOf(false) }
    // ⚠ **選び終えたら「参加の準備ができました」に切り替える**（Web 版と同じ）。以前は選んだ後も
    //    セットの一覧がそのまま残り、済んだのか・いつ自分の球団になるのか分からなかった（いしだ指摘）
    if (waiting != null && !choosing) {
        PackReady(model, raw, waiting, onHome) { choosing = true }
        return
    }
    if (waiting != null) {
        OutlinedButton(onClick = { choosing = false }) { Text("選び直さずに戻る") }
    }
    Section(
        "初期メンバー選択",
        trailing = {
            InfoButton(
                "初期メンバー選択",
                // ⚠ セットの型（版2）が無ければ、前から待っている人のセット（版1・全部同じ構成）。
                //    Web 版（PackSelect）と同じく説明を分ける
                listOf(
                    "20セットから1つ選びます。選んだ24人はキャンプが終わった時点で名簿に入り、" +
                        packStartText(pending.at("joinsAt").str(), pending.at("joinsInCamp").bool() != true) +
                        "あなたの球団になります。それまでは引き継いだ選手でCPUが戦い、ストーブリーグとキャンプの手続きもCPUが決めます。",
                ) + (
                    if (packs.any { it.at("feature").str() != null }) listOf(
                        "セットごとに構成（投手厚め・野手厚め・二刀流・捕手3人など）と格付けの配り方（少数精鋭・粒ぞろい・大黒柱など）が違います。年齢は19〜24歳です。",
                        "格の総量（A=3・B=2・C=1点の合計）はどれも同じにしてあり、同じ枠の平均からの開きも1%前後に揃えてあるので、戦い方の好みで選んでください。",
                    ) else listOf(
                        "どのセットも投12・捕2・内外10の24人（うち二刀流2人）で、格付けはA2・B10・C12、年齢は19〜24歳です。",
                        "合計の力は揃えてあるので（開きは1%前後）、好みで選んで構いません。",
                    )
                ) + listOf(
                    "選んだセットは1球団だけが受け取ります（重なったら球団名の順）。",
                ),
            )
        },
    ) {
        Muted(if (chosenName != null) "いま選んでいるのは「$chosenName」です。キャンプまでは何度でも選び直せます。" else "まだ選んでいません。決めずにキャンプを迎えると、1つ目のセットになります。")
    }
    PackPicker(model, packs, chosen) { id ->
        model.command("pack", Commands.pack(id), done = "初期メンバーを選びました") { choosing = false }
    }
}

/** 初期メンバーを選び終えた後。選んだセットと、自分の球団になる日を出す */
@Composable
private fun PackReady(model: AppViewModel, raw: JsonObject, waiting: PackWaiting, onHome: () -> Unit, onChoose: () -> Unit) {
    val team = model.view?.teamLabel(raw.at("teamName").str().orEmpty())
    Section(
        "参加の準備ができました",
        trailing = {
            InfoButton(
                "参加の準備ができました",
                listOf(
                    "選んだ24人は、キャンプが終わった時点で名簿に入ります。",
                    "それまでは引き継いだ選手でCPUが戦い、ストーブリーグとキャンプの手続きもCPUが決めます。トレードもそれまではできません。",
                    "セットはキャンプが終わるまで選び直せます。球団名は上の「球団名」で変えられます。",
                ),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.testTag("pack-ready")) {
            Muted("初期メンバー")
            Text("「${waiting.packName}」" + (waiting.feature?.let { "  $it" } ?: ""), fontWeight = FontWeight.Bold)
            Muted("あなたの球団になる日")
            Text(packStartText(waiting.joinsAt, waiting.estimated), fontWeight = FontWeight.Bold)
            if (!team.isNullOrBlank()) {
                Muted("球団名")
                Text(team, fontWeight = FontWeight.Bold)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                Button(onClick = onHome) { Text("ホームへ") }
                OutlinedButton(onClick = onChoose) { Text("セットを選び直す") }
            }
        }
    }
}

/**
 * 自分が決める手続きの帯（「手続き」を開いていない間、どのタブでも上に出す）。閉じるボタンは置かない:
 * 済むまで出し続ける（初期メンバー選択・人員整理・キャンプを見逃して飛ばさないように）
 */
@Composable
fun ProcedureNotice(procedure: PendingProcedure, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val due = formatDeadline(procedure.deadline)
    Surface(
        color = MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.fillMaxWidth().clickable(onClick = onOpen).testTag("procedure-notice"),
    ) {
        Row(Modifier.padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("${procedure.label}を決めてください", fontWeight = FontWeight.Bold)
                val detail = listOfNotNull(procedure.progress, due?.let { "締め切り $it（過ぎると標準の内容で進みます）" })
                if (detail.isNotEmpty()) Text(detail.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = onOpen) { Text("開く") }
        }
    }
}

/**
 * 手続きの決まり（Web 版の rulesText のスマホの文と同じ）。
 * ⚠ 以前は PC 向けの長い文をそのまま出していた。長い文は見出しの ⓘ（[rulesDetail]）へ回す。
 * ⚠ 締め切りの日時は上の「1年の流れ」の帯（いまは○○（締め切り …））に出ているので繰り返さない。
 *    帯に締め切りが出ないとき（[showDate]）だけ日時を書く
 */
internal fun rulesText(kind: String?, deadline: String?, showDate: Boolean): String {
    val due = formatDeadline(deadline)
    val shown = due?.takeIf { showDate }
    return when {
        kind == "camp" && due == null -> "全員が4クール終えると次へ進みます。"
        kind == "camp" -> (shown?.let { "締め切りは $it。" } ?: "") + "全員が4クール終えた時点で次へ進みます。締め切りまでに終わらなかったぶんは、最後に指示した内容で自動で行われます。"
        due == null -> "全員が決定すると進みます。"
        else -> (shown?.let { "締め切り $it。" } ?: "") + "全員が決定するか、締め切りで進みます。"
    }
}

/** 手続きの決まりの詳しい文（Web 版の PC の rulesText と同じ。日時は除く） */
private fun rulesDetail(deadline: String?): String =
    if (formatDeadline(deadline) != null) "全員が決定した時点で処理します。締め切りを過ぎると、未決定の球団は保存した下書き（無ければ標準案）で進みます。ほかに検討中の球団がいる間は、決定後も出し直せます。"
    else "全員が決定した時点で処理します。この手続きに締め切りはありません。ほかに検討中の球団がいる間は、決定後も出し直せます。"

@Composable
private fun PhasePanel(model: AppViewModel, raw: JsonObject, phase: JsonObject) {
    val view = model.view ?: return
    val phaseId = phase.at("id").str().orEmpty()
    val kind = phase.at("kind").str()
    val submission = phase["submission"].obj()
    val members = raw.at("members").list().mapNotNull { it.obj() }
    val title = PHASE_LABELS[kind] ?: phase.at("label").str() ?: "手続き"
    val deadline = phase.at("deadline").str() ?: view.phaseDeadline
    Section(
        title,
        trailing = { if (kind != "camp") InfoButton(title, listOf(rulesDetail(deadline))) },
    ) {
        Text(rulesText(kind, deadline, showDate = stageInfo(raw)?.open != true), style = MaterialTheme.typography.bodyMedium)
        // 標準案を出した指導者と、任せているか（Web の PhasePanel と同じ文。文はサーバーが作る）。
        // ⚠ 任せていると提出しても指導者の案で決まるので、出さないと組み立てが無駄になる。
        //    キャンプのぶんは CampPanel が出す（Web と同じ分け方）
        if (kind != "camp") phase.at("planBy", "text").str()?.takeIf { it.isNotBlank() }?.let { Muted(it) }
        members.forEach { m ->
            val ready = m.at("ready").bool() == true
            Row(verticalAlignment = Alignment.CenterVertically) {
                // ⚠ 決定前は印を出さない（以前は「…」で、何の印か分からなかった）。右の「検討中」で分かる。
                //    「未提出」とは書かない（下書きを保存した球団もここに入る。Web 版も「検討中」）
                Text(if (ready) "✓" else "", color = MaterialTheme.colorScheme.primary, modifier = Modifier.width(20.dp))
                Text(view.teamLabel(m.at("teamName").str().orEmpty()), modifier = Modifier.weight(1f))
                Muted(if (m.at("cpu").bool() == true) "CPUが決定（初期メンバー待ち）" else if (ready) "決定済み" else "検討中")
            }
        }
    }
    if (kind == "camp") {
        // 年度更新はキャンプの直前に済む。方針を決める前に見られるようにする
        OffseasonGrowthCard(model, raw)
        CampPanel(model, raw, phase)
        return
    }

    // 編集中の案。保存済みの提出があればそれ、無ければ標準案（defaults）から始める
    val draft = model.phaseDraft?.takeIf { it.phaseId == phaseId }
    var failure by remember(phaseId) { mutableStateOf<String?>(null) }
    // 「読み直す」を押した回数。⚠ 標準案の読み込みに失敗したあとは、ほかの鍵（手続き・提出・下書きの有無）が
    //    変わらないことが多いので、これを鍵に入れないと読み直さず「標準案を準備しています…」のまま止まる
    var attempt by remember(phaseId) { mutableStateOf(0) }
    // ⚠ 下書きを捨てた（null にした）ときも読み直すよう、draft == null も鍵に入れる
    LaunchedEffect(phaseId, submission, draft == null, attempt) {
        val current = model.phaseDraft?.takeIf { it.phaseId == phaseId }
        if (current != null && (current.dirty || current.base == (submission ?: JsonNull))) return@LaunchedEffect
        val plan = submission?.get("plan").obj()
        if (plan != null) {
            model.phaseDraft = PhaseDraft(phaseId, plan, submission, dirty = false)
            return@LaunchedEffect
        }
        try {
            val defaults = model.read("defaults")
            if (defaults.at("phaseId").str() != phaseId) {
                failure = "手続きが更新されました。最新状態を確認してください"
                return@LaunchedEffect
            }
            model.phaseDraft = PhaseDraft(phaseId, defaults["plan"].obj() ?: JsonObject(emptyMap()), JsonNull, dirty = false)
            failure = null
        } catch (e: Exception) {
            // ⚠ 前の読み込みが取り消されたとき（ページを連打した・画面を離れた）は失敗として出さない
            if (e is kotlinx.coroutines.CancellationException) throw e
            failure = model.describe(e)
        }
    }
    if (failure != null) {
        Section {
            Text("読み込めませんでした: $failure", color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = { model.phaseDraft = null; failure = null; attempt += 1; model.reload(pull = true) }) { Text("読み直す") }
        }
        return
    }
    if (draft == null) {
        Muted("標準案を準備しています…")
        return
    }
    val changedElsewhere = draft.dirty && draft.base != (submission ?: JsonNull)
    if (changedElsewhere) {
        Section {
            Text("別の操作で提出が更新されました。現在の入力を破棄して保存済みの内容を読み直せます。", color = MaterialTheme.colorScheme.secondary)
            OutlinedButton(onClick = { model.phaseDraft = null }) { Text("最新の提出を読み直す") }
        }
    }
    val scope = rememberCoroutineScope()
    val setPlan: (JsonObject) -> Unit = { model.phaseDraft = draft.copy(plan = it, dirty = true) }
    val plan = draft.plan
    val ready = submission?.at("ready").bool() == true

    // 決定・下書きの操作（PC版と同じく見出しのすぐ下に1か所）
    Section {
        Muted(
            when {
                draft.dirty -> "編集中の内容（未保存）です。"
                ready -> "あなたは決定済みです。ほかに検討中の球団がいる間は出し直せます。"
                submission != null -> "下書きを保存済みです。"
                else -> "標準案を表示しています。"
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = { submit(model, phaseId, plan, true, draft.base) }) { Text("この内容で決定") }
            OutlinedButton(onClick = { submit(model, phaseId, plan, false, draft.base) }) { Text(if (ready) "決定を取り消す" else "下書きを保存") }
        }
        if (draft.dirty) TextButton(onClick = { model.phaseDraft = null }) { Text("変更を取り消す") }
    }

    when {
        plan["packId"] != null || phase["packs"] != null -> {
            val packs = phase.at("packs").list().mapNotNull { it.obj() }
            PackPicker(model, packs, plan.at("packId").str()) { id -> setPlan(Commands.withPack(plan, id)) }
        }
        plan["rankedIds"] != null -> TryoutPanel(model, raw, phase, plan, setPlan) {
            // 標準案に戻す（⚠ 保存済みの下書きではなく、いつも標準案を取り直す）
            scope.launch {
                try {
                    val defaults = model.read("defaults")
                    if (defaults.at("phaseId").str() != phaseId) failure = "手続きが更新されました。最新状態を確認してください"
                    else model.phaseDraft = draft.copy(plan = defaults["plan"].obj() ?: plan, dirty = submission != null)
                } catch (e: Exception) {
                    // ⚠ 前の読み込みが取り消されたとき（ページを連打した・画面を離れた）は失敗として出さない
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    failure = model.describe(e)
                }
            }
        }
        plan["releaseIds"] != null -> ReleasePanel(model, raw, plan, setPlan)
        kind == "offseason" -> Section { Text("最終順位を保存し、次年度のキャンプへ進みます。決めることはありません（「この内容で決定」を押すと早く進みます）。") }
    }
}

private fun submit(model: AppViewModel, phaseId: String, plan: JsonObject, ready: Boolean, base: JsonElement?) {
    model.command("submit", Commands.submit(phaseId, plan, ready, base), label = if (ready) "決定を送信中…" else "保存中…", done = if (ready) "決定しました" else "保存しました") {
        // ⚠ サーバーは提出を整えて保存する（送った形と同じとは限らない）ので、読み直したビューの提出から作り直す。
        //    送った形を base にすると、次の提出が edit_conflict で断られることがある
        model.phaseDraft = null
    }
}

/** 初期メンバーのセット。カードを押すと中身、「このセットにする」で選ぶ */
@Composable
private fun PackPicker(model: AppViewModel, packs: List<JsonObject>, chosen: String?, onChoose: (String) -> Unit) {
    var open by remember { mutableStateOf(chosen ?: packs.firstOrNull()?.at("id").str()) }
    Section("セットを選ぶ") {
        packs.forEach { pack ->
            val id = pack.at("id").str().orEmpty()
            val counts = pack["counts"].obj()
            Row(
                Modifier.fillMaxWidth().clickable { open = id }.padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (id == chosen) "●" else "○", color = if (id == chosen) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, modifier = Modifier.width(22.dp))
                Column(Modifier.weight(1f)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(pack.at("name").str().orEmpty(), fontWeight = if (id == open) FontWeight.Bold else FontWeight.Normal)
                        // ⚠ セットの型（版2）。前から待っている人のセット（版1）には無い
                        pack.at("feature").str()?.let { Text(it, color = MaterialTheme.colorScheme.tertiary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall) }
                    }
                    Muted(
                        listOf("pitcher" to "投", "catcher" to "捕", "infield" to "内", "outfield" to "外")
                            .joinToString(" ") { (k, l) -> "$l${counts.at(k).int() ?: 0}" } +
                            " · " + listOf("A", "B", "C").joinToString(" ") { "$it${pack.at("ranks", it).int() ?: 0}" } +
                            " · 平均${pack.at("averageAge").str() ?: "-"}歳 · 二刀流${pack.at("twoWay").int() ?: 0}",
                    )
                }
                if (id == chosen) Tag("選択中", MaterialTheme.colorScheme.primary)
            }
            if (id == open) {
                Button(onClick = { onChoose(id) }, enabled = id != chosen) { Text(if (id == chosen) "選択中" else "このセットにする") }
                pack.at("players").list().mapNotNull { it.obj() }.forEach { p ->
                    PlayerSummary(p, { model.openPlayer = it }) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            p.at("rank").str()?.let { Tag(it, MaterialTheme.colorScheme.onSurfaceVariant) }
                            if (p.at("isTwoWay").bool() == true) Tag("二刀流")
                        }
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

/**
 * 契約更改。チェックした選手が退団する（最低9人は残す）。
 * ⚠ Web 版の `ContractPlanner` と同じ材料を出す（いしだ指摘: 切る判断ができているか分からない）:
 *    退団後の区分ごとの人数・トライアウトで獲れる人数・今季の成績・標準案の理由（サーバーの `phase.releaseAdvice`）
 */
@Composable
private fun ReleasePanel(model: AppViewModel, raw: JsonObject, plan: JsonObject, setPlan: (JsonObject) -> Unit) {
    val roster = raw.at("roster").list().mapNotNull { it.obj() }
    val releases = plan.at("releaseIds").list().mapNotNull { it.long() }
    val advice = raw.at("phase", "releaseAdvice").obj()
    val remaining = roster.filter { it.pid !in releases }
    val counts = rosterCounts(remaining)
    Section("退団させる選手（${releases.size}人）") {
        Text("残り ${remaining.size}人 · " + listOf("pitcher" to "投", "catcher" to "捕", "infielder" to "内", "outfielder" to "外")
            .joinToString(" ") { (k, l) -> "$l${counts[k] ?: 0}/${ONLINE_ROSTER_TARGETS[k] ?: 0}" }, fontWeight = FontWeight.Bold)
        Muted("続くトライアウトで最大 ${(ROSTER_LIMIT - remaining.size).coerceAtLeast(0)}人を獲れます（上限${ROSTER_LIMIT}人）。")
        Muted("チェックした選手が退団（最低9人は残す）。標準案は「30歳以上」と「能力の低さ」で選び、毎年少なくとも3人を出します。このあとの年度更新で、若い選手は伸び、30歳を過ぎると衰えやすくなります。")
        roster.forEach { p ->
            val checked = p.pid in releases
            val reasons = advice?.get(p.pid.toString()).list().mapNotNull { it.str() }.takeIf { advice?.containsKey(p.pid.toString()) == true }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = checked,
                    onCheckedChange = { on ->
                        val next = if (on) releases + p.pid else releases - p.pid
                        setPlan(Commands.withReleases(plan, next))
                    },
                )
                Column(Modifier.weight(1f)) {
                    PlayerSummary(p, { model.openPlayer = it }) { if (checked) Tag("退団予定") }
                    Muted(seasonLine(p))
                    if (reasons != null) Text(
                        "標準案で退団: " + (reasons.joinToString("・").ifEmpty { "枠を空けるため" }),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }
        }
    }
}

/** 名簿の残りの枠（トライアウトの獲得希望人数の上限） */
internal fun rosterRoom(raw: JsonObject): Int = (ROSTER_LIMIT - raw.at("roster").list().size).coerceAtLeast(0)
