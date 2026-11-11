package jp.icenorth.baseball.app.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.EditHistory
import jp.icenorth.baseball.shared.FIELDER_REST_FATIGUE
import jp.icenorth.baseball.shared.FIELD_POSITIONS
import jp.icenorth.baseball.shared.positionGroup
import jp.icenorth.baseball.shared.candidatesFor
import jp.icenorth.baseball.shared.FIELDER_GROUP_LABELS
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.MAX_STARTERS
import jp.icenorth.baseball.shared.PlanDraft
import jp.icenorth.baseball.shared.Player
import jp.icenorth.baseball.shared.RELIEF_ORDER
import jp.icenorth.baseball.shared.RELIEF_REST_FATIGUE
import jp.icenorth.baseball.shared.RELIEF_ROLES
import jp.icenorth.baseball.shared.ROLE_HINT
import jp.icenorth.baseball.shared.STARTER_ORDER
import jp.icenorth.baseball.shared.STARTER_ROLES
import jp.icenorth.baseball.shared.STARTER_SKIP_FATIGUE
import jp.icenorth.baseball.shared.STRATEGY_FIELDS
import jp.icenorth.baseball.shared.SUBSTITUTE_MIN_FITNESS
import jp.icenorth.baseball.shared.SUBSTITUTE_FRESH_FATIGUE
import jp.icenorth.baseball.shared.TACTIC_FIELDS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.conditionIcon
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.roleLabel
import jp.icenorth.baseball.shared.subPositions
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

private enum class PlanTab(val label: String) { Order("スタメン"), Pitching("投手起用"), Tactics("方針・采配"), Staff("指導者") }

/** 編集（今の編集に当てる変換）を渡す */
private typealias Edit = ((PlanDraft) -> PlanDraft) -> Unit

private sealed interface PlanSheet {
    data class Position(val index: Int) : PlanSheet
    data class Replace(val index: Int) : PlanSheet
    data class Bench(val id: Long) : PlanSheet
    data class Role(val id: Long) : PlanSheet
}

/**
 * 編成タブ（スタメン・投手起用・方針と采配）。
 *
 * ⚠ 3つの面を**1つの編集**として持ち、保存も元に戻す／やり直すも上の1か所に置く
 *    （以前の指摘: 保存の場所が面ごとに違うと迷う）。
 * ⚠ 編集はタブを移っても消えないよう、画面ではなくモデル側（model.plan）に置く。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(model: AppViewModel) {
    val view = model.view
    val lineup = view?.lineup
    if (view == null || lineup == null || view.roster.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("編成はシーズンの名簿が決まると編集できます", textAlign = TextAlign.Center, modifier = Modifier.padding(24.dp))
        }
        return
    }
    // サーバーの編成が変わったら、編集していなければ最新に合わせる（編集中は手元を優先。保存時にサーバーが食い違いを見る）
    LaunchedEffect(lineup, view.roster) {
        val fresh = PlanDraft.from(lineup, view.roster)
        val current = model.plan
        // ⚠ 「編集していない」は手を付けていない（元に戻す手が無い）ことでも見る。名簿だけが変わった（トレード・抹消）とき、
        //    作り直した元の案と見比べるだけだと、抜けた選手の枠が空きに変わるぶん「未保存の変更」に見えて、最新に合わなかった
        if (current == null || !current.canUndo || current.present.sameEdit(PlanDraft.from(current.present.base, view.roster))) model.plan = EditHistory(fresh)
    }
    val history = model.plan ?: EditHistory(PlanDraft.from(lineup, view.roster))
    val draft = history.present
    val dirty = !draft.sameEdit(PlanDraft.from(draft.base, view.roster))
    // 編集中にサーバーの編成が変わった（PCで保存した・手続きで名簿が変わった）。このまま保存しても edit_conflict で断られる
    val stale = draft.base != lineup
    // ⚠ 編集は「今の編集に当てる変換」で渡す。ドラッグ中は描き直しの前に何度も呼ばれるので、
    //    描いたときの draft から作ると途中の移動が消える
    val edit: Edit = { f -> (model.plan ?: history).let { h -> model.plan = h.push(f(h.present)) } }
    // ドラッグ1回ぶんの移動は1手にまとめる（元に戻す1回で、つかむ前に戻る）
    val dragging = remember { booleanArrayOf(false) }
    val dragEdit: Edit = { f ->
        (model.plan ?: history).let { h ->
            val next = f(h.present)
            if (next != h.present) model.plan = if (dragging[0]) h.replace(next) else h.push(next).also { dragging[0] = true }
        }
    }
    val onDragStart = { dragging[0] = false }
    var tab by rememberSaveable { mutableStateOf(PlanTab.Order) }
    var sheet by remember { mutableStateOf<PlanSheet?>(null) }
    var orderView by rememberSaveable { mutableStateOf(FielderView.Ability) }
    val players = remember(view.roster) { view.roster.associateBy { it.id } }
    val rawPlayers = remember(model.raw) {
        model.raw?.at("roster").list().mapNotNull { it.obj() }
            .associateBy { it.at("id").num()?.toLong() ?: 0L }
    }
    val open: (Long) -> Unit = { id -> rawPlayers[id]?.let { model.openPlayer = it } }
    val nextId = model.raw?.at("nextStarterId").num()?.toLong()

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        // ⚠ 指導者の面では編成の保存の帯を出さない（任せ方は面の中の「任せ方を保存」で送る。
        //    帯の「保存」と並ぶと、どちらで任せ方が保存されるのか分からなかった）
        if (tab != PlanTab.Staff) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                // ⚠ 4つのボタンと状態の文を1行に収める（ボタンの名前を長くしたら、状態の文が縦に1字ずつ折れた）。
                //    ボタンの内側の余白を詰め、状態の文は折り返さない
                val tight = PaddingValues(horizontal = 6.dp)
                TextButton(onClick = { model.plan = history.undo() }, enabled = history.canUndo, contentPadding = tight) { Text("↶ 元に戻す") }
                TextButton(onClick = { model.plan = history.redo() }, enabled = history.canRedo, contentPadding = tight) { Text("↷ やり直す") }
                Text(if (dirty) "未保存" else "保存済み", style = MaterialTheme.typography.labelSmall, color = if (dirty) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, softWrap = false, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                // ⚠ 取り消すと、編集を始めたときではなく**今の保存済み**の編成に戻す（古い base に戻すと保存が断られ続ける）
                // ⚠ 名前は「変更を取り消す」（手続き・指導者の画面と Web と同じ。以前はここだけ「変更を捨てる」だった）
                TextButton(onClick = { model.plan = history.push(PlanDraft.from(lineup, view.roster)) }, enabled = dirty || stale, contentPadding = tight) { Text("変更を取り消す") }
                Button(
                    onClick = {
                        val problem = draft.problem(view.roster)
                        if (problem != null) model.error = problem
                        else model.saveLineup(draft.toPayload()) {
                            model.view?.lineup?.let { model.plan = EditHistory(PlanDraft.from(it, model.view!!.roster)) }
                        }
                    },
                    enabled = dirty,
                ) { Text("保存") }
            }
            if (stale) {
                Text(
                    "別の画面で編成が更新されました。この編集は保存できないので、「変更を取り消す」で最新の編成を読み直してから編集し直してください。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
        }
        ChipTabs(PlanTab.entries.map { it.name to it.label }, tab.name, { tab = PlanTab.valueOf(it) }, Modifier.padding(top = if (tab == PlanTab.Staff) 8.dp else 0.dp))
        when (tab) {
            PlanTab.Order -> OrderEditor(view, draft, players, nextId, dragEdit, onDragStart, open, orderView, { orderView = it }) { sheet = it }
            PlanTab.Pitching -> PitchingEditor(view, draft, players, nextId, dragEdit, edit, onDragStart, open) { sheet = it }
            PlanTab.Tactics -> TacticsEditor(view, draft, edit)
            // 監督・コーチと任せ方（PC の「指導者」ページと同じ中身）
            PlanTab.Staff -> StaffPanel(model, view)
        }
    }

    val haptic = LocalHapticFeedback.current
    when (val s = sheet) {
        is PlanSheet.Position -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            PositionSheet(draft, s.index, players) { other ->
                edit { it.swapPositions(s.index, other) }; haptic.performHapticFeedback(HapticFeedbackType.LongPress); sheet = null
            }
        }
        is PlanSheet.Replace -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            ReplaceSheet(view, draft, s.index, players, orderView) { id ->
                edit { it.replaceBatter(s.index, id) }; haptic.performHapticFeedback(HapticFeedbackType.LongPress); sheet = null
            }
        }
        is PlanSheet.Bench -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            BenchSheet(draft, s.id, players) { index ->
                edit { it.replaceBatter(index, s.id) }; haptic.performHapticFeedback(HapticFeedbackType.LongPress); sheet = null
            }
        }
        is PlanSheet.Role -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            RoleSheet(
                draft, s.id, players[s.id],
                onRemove = { edit { it.withPitching(it.pitching.removeFromStaff(s.id, view.roster)) }; sheet = null },
            ) { role ->
                edit { it.withPitching(it.pitching.setRole(s.id, role)) }; sheet = null
            }
        }
        null -> Unit
    }
}

// ------------------------------------------------------------------ スタメン

/**
 * スタメン。「打順を組む」「適性を見て守備を決める」「疲れた選手を休ませる」を**この1画面で**できるようにする。
 *  - 行はスタメンも控えも同じ形（[FielderRow]）。2行目は上の切り替えで 能力／今季成績／守備適性 を選ぶ
 *  - 守備の札は投手・捕手・内野・外野で色を分ける。札を押すと守備の入れ替え、名前を押すと交代
 *  - 控えの行を押すと「誰と代えるか」を選べる（休ませたい選手からでも、使いたい控えからでも交代できる）
 *  - 上の「気になる所」に、休養に入る選手と適性の低い守備を出す
 *  - 投手も野手の枠に入れられる（二刀流）。控えの最後に投手を出す（守れる位置のある投手だけ。残りは畳む）
 */
@Composable
private fun OrderEditor(
    view: LeagueView,
    draft: PlanDraft,
    players: Map<Long, Player>,
    nextId: Long?,
    edit: Edit,
    onDragStart: () -> Unit,
    open: (Long) -> Unit,
    mode: FielderView,
    onMode: (FielderView) -> Unit,
    onSheet: (PlanSheet) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val a = (from.key as? String)?.removePrefix("bat:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        val b = (to.key as? String)?.removePrefix("bat:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        edit { d ->
            val i = d.slots.indexOfFirst { it.playerId == a }
            val j = d.slots.indexOfFirst { it.playerId == b }
            if (i < 0 || j < 0) d else d.moveBatter(i, j)
        }
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    val bench = benchOf(view, draft)
    val notes = orderNotes(draft, players, bench)
    // ⚠ 投手は多い（10人以上）。守れる位置（適性 SUBSTITUTE_MIN_FITNESS 以上）のある投手だけを出し、残りは「全員を出す」で開く
    var allPitchers by rememberSaveable { mutableStateOf(false) }
    val pitcherBench = pitcherBenchOf(view, draft)
    val shownPitchers = (if (allPitchers) pitcherBench else pitcherBench.filter { it.subPositions().isNotEmpty() })
        .sortedByDescending { p -> p.bestFieldPosition()?.let { p.fitness(it) } ?: 0 }
    // 次の先発が野手の枠にも入っている（二刀流の先発の日）
    val twoWaySlot = draft.slots.firstOrNull { nextId != null && it.playerId == nextId }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            ChipTabs(FielderView.entries.map { it.name to it.label }, mode.name, { onMode(FielderView.valueOf(it)) }, Modifier.weight(1f))
            InfoButton("スタメン", ORDER_HELP, Modifier.padding(end = 8.dp))
        }
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = TipsBadgeRoom), // 左下の TIPS の印に最後の行が隠れないよう
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            if (notes.isNotEmpty()) {
                item(key = "notes") {
                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                        Column(Modifier.padding(vertical = 4.dp)) {
                            Text("気になる所", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                            notes.forEach { note ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { onSheet(note.sheet) }.padding(horizontal = 12.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    PosBadge(note.position, small = true)
                                    Text(note.text, style = MaterialTheme.typography.bodySmall, color = note.color ?: MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                                    Text(note.action, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }
            }
            item(key = "head:bat") {
                Column {
                    Caption("打順")
                    twoWaySlot?.let { slot ->
                        Muted(
                            "${players[slot.playerId]?.name ?: "次の先発"}は次の先発です。先発の日は9番・投手に回り、${positionLabel(slot.position)}はその日だけ控えが守ります（試合の後は元に戻ります）",
                            Modifier.padding(horizontal = 4.dp),
                        )
                    }
                }
            }
            items(draft.slots, key = { "bat:${it.playerId}" }) { slot ->
                val index = draft.slots.indexOf(slot)
                ReorderableItem(reorder, key = "bat:${slot.playerId}") { dragging ->
                    val elevation by animateDpAsState(if (dragging) 8.dp else 0.dp, label = "lift")
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainer,
                        shadowElevation = elevation,
                        modifier = Modifier.fillMaxWidth().longPressDraggableHandle(onDragStarted = { onDragStart(); haptic.performHapticFeedback(HapticFeedbackType.LongPress) }),
                    ) {
                        FielderRow(
                            order = "${index + 1}",
                            position = slot.position,
                            player = players[slot.playerId],
                            fitnessAt = slot.position,
                            onPosition = { onSheet(PlanSheet.Position(index)) },
                            onName = { onSheet(PlanSheet.Replace(index)) },
                            onInfo = { open(slot.playerId) },
                            draggable = true,
                            mode = mode,
                            placeholder = "空き（押して控えと交代）",
                        )
                    }
                }
            }
            FIELDER_GROUP_LABELS.forEach { (group, label) ->
                val members = bench.filter { positionGroup(it.position) == group }
                if (members.isEmpty()) return@forEach
                item(key = "head:bench:$group") { Caption("控え・$label（${members.size}人）") }
                items(members, key = { "bench:${it.id}" }) { p ->
                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                        FielderRow(
                            order = null,
                            position = p.position,
                            player = p,
                            fitnessAt = p.position,
                            onPosition = { onSheet(PlanSheet.Bench(p.id)) },
                            onName = { onSheet(PlanSheet.Bench(p.id)) },
                            onInfo = { open(p.id) },
                            mode = mode,
                        )
                    }
                }
            }
            if (bench.isEmpty()) item(key = "bench:none") { Muted("控えの野手がいません", Modifier.padding(8.dp)) }
            if (pitcherBench.isNotEmpty()) {
                item(key = "head:bench:pitcher") {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.weight(1f)) { Caption("控え・投手（二刀流で野手の枠に）") }
                        if (allPitchers || shownPitchers.size < pitcherBench.size) {
                            TextButton(onClick = { allPitchers = !allPitchers }) {
                                Text(if (allPitchers) "守れる投手だけ" else "全員を出す（ほか${pitcherBench.size - shownPitchers.size}人）")
                            }
                        }
                    }
                }
                items(shownPitchers, key = { "bench:${it.id}" }) { p ->
                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                        FielderRow(
                            order = null,
                            position = p.position,
                            player = p,
                            // ⚠ 投手の本職（投手）の適性は意味が無い。守るなら一番合う位置で
                            fitnessAt = p.bestFieldPosition() ?: "right",
                            onPosition = { onSheet(PlanSheet.Bench(p.id)) },
                            onName = { onSheet(PlanSheet.Bench(p.id)) },
                            onInfo = { open(p.id) },
                            mode = mode,
                        )
                    }
                }
            }
        }
    }
}

private fun benchOf(view: LeagueView, draft: PlanDraft): List<Player> =
    view.roster.filter { p -> !p.isPitcher && p.isActive && draft.slots.none { it.playerId == p.id } }

/** 控えの投手（野手の枠にも入れられる。二刀流。Web 版 benchPitchers と同じ） */
private fun pitcherBenchOf(view: LeagueView, draft: PlanDraft): List<Player> =
    view.roster.filter { p -> p.isPitcher && p.isActive && draft.slots.none { it.playerId == p.id } }

/** 投手が野手の枠に入るとしたら一番合う守備位置（Web 版 bestFieldPosition と同じ） */
private fun Player.bestFieldPosition(): String? = FIELD_POSITIONS.maxByOrNull { fitness(it) }

private class OrderNote(val position: String, val text: String, val action: String, val sheet: PlanSheet, val color: androidx.compose.ui.graphics.Color? = null)

/** 「気になる所」: 試合の日に休養に入る選手と、適性の低い守備（押すと直すためのシートを開く） */
@Composable
private fun orderNotes(draft: PlanDraft, players: Map<Long, Player>, bench: List<Player>): List<OrderNote> {
    val notes = mutableListOf<OrderNote>()
    draft.slots.forEachIndexed { index, slot ->
        val p = players[slot.playerId]
        if (p == null) {
            notes += OrderNote(slot.position, "${positionLabel(slot.position)}が空いています（選手が抜けました）。控えと交代して埋めてください", "交代", PlanSheet.Replace(index), MaterialTheme.colorScheme.error)
            return@forEachIndexed
        }
        val fatigue = p.fatigue ?: 0
        if (fatigue >= FIELDER_REST_FATIGUE) {
            // サーバー（server/dailyLineup.mjs）と同じ条件: 控えはその位置の適性60以上、かつ疲労40未満
            val canRest = bench.any { it.fitness(slot.position) >= SUBSTITUTE_MIN_FITNESS && (it.fatigue ?: 0) < SUBSTITUTE_FRESH_FATIGUE }
            notes += OrderNote(
                slot.position,
                if (canRest) "${p.name} 疲労$fatigue。試合の日は控えと入れ替わって休みます"
                else "${p.name} 疲労$fatigue。${positionLabel(slot.position)}を守れる控えが居ないので休めません",
                "交代",
                PlanSheet.Replace(index),
                MaterialTheme.colorScheme.error,
            )
        }
        val fit = p.fitness(slot.position)
        if (fit < SUBSTITUTE_MIN_FITNESS) {
            notes += OrderNote(slot.position, "${p.name} ${positionLabel(slot.position)}の適性$fit。守備で失点しやすい", "守備", PlanSheet.Position(index), MaterialTheme.colorScheme.error)
        }
    }
    return notes
}

@Composable
private fun PositionSheet(draft: PlanDraft, index: Int, players: Map<Long, Player>, onSwap: (Int) -> Unit) {
    val slot = draft.slots[index]
    val me = players[slot.playerId]
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PosBadge(slot.position)
            Text("${me?.name ?: ""}と守備を入れ替える", style = MaterialTheme.typography.titleMedium)
        }
        // 列の見出し（数字が誰の・どこでの適性かを、表の上で読めるように）
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val head = MaterialTheme.typography.labelSmall
            val ink = MaterialTheme.colorScheme.onSurfaceVariant
            Text("入れ替える相手", style = head, color = ink, modifier = Modifier.weight(1f))
            Text("本人の適性", style = head, color = ink, maxLines = 1, modifier = Modifier.width(72.dp))
            Text("相手の適性", style = head, color = ink, maxLines = 1, modifier = Modifier.width(72.dp))
        }
        FIELD_POSITIONS.mapNotNull { pos -> draft.slots.indexOfFirst { it.position == pos }.takeIf { it >= 0 && it != index } }
            .forEach { other ->
                val target = draft.slots[other]
                val them = players[target.playerId]
                val mine = me?.fitness(target.position) ?: 0
                val theirs = them?.fitness(slot.position) ?: 0
                Row(Modifier.fillMaxWidth().clickable { onSwap(other) }.padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PosBadge(target.position, small = true)
                    Text(them?.name ?: "?", modifier = Modifier.weight(1f), maxLines = 1)
                    PosBadge(target.position, filled = false, small = true)
                    Text("$mine", fontWeight = FontWeight.Bold, color = fitnessColor(mine), modifier = Modifier.width(36.dp))
                    PosBadge(slot.position, filled = false, small = true)
                    Text("$theirs", fontWeight = FontWeight.Bold, color = fitnessColor(theirs), modifier = Modifier.width(36.dp))
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
    }
}

/** スタメンの1人と交代する控えを選ぶ（その守備位置の適性が高い順、同じなら疲労の少ない順） */
@Composable
private fun ReplaceSheet(view: LeagueView, draft: PlanDraft, index: Int, players: Map<Long, Player>, mode: FielderView, onPick: (Long) -> Unit) {
    val slot = draft.slots[index]
    val bench = benchOf(view, draft).candidatesFor(slot.position)
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PosBadge(slot.position)
            Text(players[slot.playerId]?.let { "${it.name}と交代する控え" } ?: "空いている${positionLabel(slot.position)}に入れる控え", style = MaterialTheme.typography.titleMedium)
        }
        if (bench.isEmpty()) Text("控えの野手がいません", modifier = Modifier.padding(20.dp))
        val row: @Composable (Player) -> Unit = { p ->
            FielderRow(
                order = null,
                // 札は入る位置にして、その下の「適」がこの位置での適性と分かるように
                position = slot.position,
                player = p,
                fitnessAt = slot.position,
                mode = if (mode == FielderView.Fitness) FielderView.Ability else mode,
                modifier = Modifier.fillMaxWidth().clickable { onPick(p.id) }.padding(horizontal = 10.dp),
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        bench.forEach { row(it) }
        // 投手も入れられる（二刀流）。野手の後ろに、その位置の適性の高い順
        val pitchers = pitcherBenchOf(view, draft).candidatesFor(slot.position)
        if (pitchers.isNotEmpty()) {
            Box(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) { Caption("投手（二刀流。先発の日は9番・投手に回ります）") }
            pitchers.forEach { row(it) }
        }
    }
}

/** 控えの1人を、スタメンの誰と代えるか選ぶ（控えのその位置の適性が高い順） */
@Composable
private fun BenchSheet(draft: PlanDraft, id: Long, players: Map<Long, Player>, onPick: (Int) -> Unit) {
    val me = players[id] ?: return
    val order = draft.slots.indices.sortedWith(
        compareByDescending<Int> { me.fitness(draft.slots[it].position) }.thenByDescending { players[draft.slots[it].playerId]?.fatigue ?: 0 },
    )
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PosBadge(me.position)
            Text("${me.name}を誰と代える？", style = MaterialTheme.typography.titleMedium)
        }
        order.forEach { index ->
            val slot = draft.slots[index]
            val them = players[slot.playerId]
            val fit = me.fitness(slot.position)
            Row(Modifier.fillMaxWidth().clickable { onPick(index) }.padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${index + 1}", fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
                PosBadge(slot.position, small = true)
                Text(them?.let { "${conditionIcon(it.condition)} ${it.name}" } ?: "空き", modifier = Modifier.weight(1f), maxLines = 1)
                FatigueBadge(them?.fatigue)
                Row(Modifier.width(44.dp), verticalAlignment = Alignment.Bottom) {
                    Text("適", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$fit", fontWeight = FontWeight.Bold, color = fitnessColor(fit))
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

// ------------------------------------------------------------------ 投手起用

/**
 * 先発ローテと救援の役割を1本の並びで出し、長押しでつかんで別の場所へ落とすと持ち場が変わる
 * （ローテの中＝順番、救援の見出し・救援の投手の上＝その役割、ローテへ＝先発に入る）。
 * 細かい型（ゲームメーカー・完投型など）は投手を押して選ぶ。
 * 野手も投手で起用できる（二刀流）。最後の「野手を投手で起用する」から加え、役割のシートで外す。
 */
@Composable
private fun PitchingEditor(
    view: LeagueView,
    draft: PlanDraft,
    players: Map<Long, Player>,
    nextId: Long?,
    edit: Edit,
    /** 押して1回で終わる編集（ドラッグの1手にまとめない） */
    clickEdit: Edit,
    onDragStart: () -> Unit,
    open: (Long) -> Unit,
    onSheet: (PlanSheet) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val id = (from.key as? String)?.removePrefix("p:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        val target = to.key as? String ?: return@rememberReorderableLazyListState
        edit { d -> d.withPitching(dropPitcher(d.pitching, id, target)) }
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    PitchingList(view, draft, players, nextId, reorder, listState, onDragStart, open, onSheet) { p ->
        clickEdit { it.withPitching(it.pitching.addToStaff(p)) }
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }
}

/** 投手 id を target（別の投手 p:… ／役割の見出し role:… ／ローテの見出し head:rot）へ落としたときの持ち場 */
private fun dropPitcher(state: jp.icenorth.baseball.shared.PitchingState, id: Long, target: String): jp.icenorth.baseball.shared.PitchingState {
        val inRotation = id in state.starters
        return when {
            target.startsWith("p:") -> {
                val other = target.removePrefix("p:").toLongOrNull() ?: return state
                val at = state.starters.indexOf(other)
                when {
                    at >= 0 && inRotation -> state.moveStarter(state.starters.indexOf(id), at)
                    at >= 0 -> if (state.starters.size < MAX_STARTERS) state.setRole(id, "auto_s", at) else state
                    else -> state.roles[other]?.let { role -> if (state.roles[id] != role) state.setRole(id, role) else state } ?: state
                }
            }
            target.startsWith("role:") -> state.setRole(id, target.removePrefix("role:"))
            target == "head:rot" -> if (inRotation) state.moveStarter(state.starters.indexOf(id), 0) else if (state.starters.size < MAX_STARTERS) state.setRole(id, "auto_s", 0) else state
            else -> state
        }
}

@Composable
private fun PitchingList(
    view: LeagueView,
    draft: PlanDraft,
    players: Map<Long, Player>,
    nextId: Long?,
    reorder: sh.calvin.reorderable.ReorderableLazyListState,
    listState: androidx.compose.foundation.lazy.LazyListState,
    onDragStart: () -> Unit,
    open: (Long) -> Unit,
    onSheet: (PlanSheet) -> Unit,
    onAdd: (Player) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val state = draft.pitching
    // 投手起用に加えていない野手（ふだんは畳む。野手は多い）
    var fieldersOpen by rememberSaveable { mutableStateOf(false) }
    val candidates = state.staffCandidates(view.roster)
    val relievers = RELIEF_ORDER.map { role -> role to state.roles.filter { (id, r) -> r == role && id !in state.starters }.keys.mapNotNull { players[it] } }
    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = TipsBadgeRoom), // 左下の TIPS の印に最後の行が隠れないよう
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "head:rot") {
            ReorderableItem(reorder, key = "head:rot") {
                Row(verticalAlignment = Alignment.Bottom) {
                    Box(Modifier.weight(1f)) { Caption("先発ローテーション（${state.starters.size}/${MAX_STARTERS}人）") }
                    InfoButton("投手起用", pitchingHelp())
                }
            }
        }
        items(state.starters, key = { "p:$it" }) { id ->
            val index = state.starters.indexOf(id)
            ReorderableItem(reorder, key = "p:$id") { dragging ->
                PitcherCard(dragging, Modifier.longPressDraggableHandle(onDragStarted = { onDragStart(); haptic.performHapticFeedback(HapticFeedbackType.LongPress) })) {
                    PitcherRow("${index + 1}", players[id], state.roles[id], starter = true, nextId == id, onRole = { onSheet(PlanSheet.Role(id)) }, onInfo = { open(id) })
                }
            }
        }
        relievers.forEach { (role, list) ->
            item(key = "role:$role") {
                ReorderableItem(reorder, key = "role:$role") {
                    // ⚠ 0人の役割も見出しは残す（ここへ落とすとその役割になる）。人数を添え、0人は薄くする
                    //    （以前は0人の見出しも同じ濃さで並び、誰かいるように見えた）
                    val empty = list.isEmpty()
                    // 0人の役割は間を詰める（空の見出しが4つ5つ並ぶと、投手の行が画面の外へ押し出されていた）
                    Row(Modifier.padding(top = if (empty) 2.dp else 10.dp, start = 4.dp), verticalAlignment = Alignment.Bottom) {
                        Text(
                            RELIEF_ROLES[role] ?: role,
                            style = if (empty) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge,
                            fontWeight = if (empty) FontWeight.Normal else FontWeight.Bold,
                            color = if (empty) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                        )
                        Text(if (empty) "  なし" else "  ${list.size}人", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            items(list, key = { "p:${it.id}" }) { p ->
                ReorderableItem(reorder, key = "p:${p.id}") { dragging ->
                    PitcherCard(dragging, Modifier.longPressDraggableHandle(onDragStarted = { onDragStart(); haptic.performHapticFeedback(HapticFeedbackType.LongPress) })) {
                        // ⚠ 救援は役割の札を出さない（すぐ上の見出しと同じ印が二重に並んでいた）
                        PitcherRow("", p, null, starter = false, next = false, onRole = { onSheet(PlanSheet.Role(p.id)) }, onInfo = { open(p.id) })
                    }
                }
            }
        }
        if (candidates.isNotEmpty()) {
            item(key = "head:fielders") {
                Column(Modifier.padding(top = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.weight(1f)) { Caption("野手を投手で起用する（二刀流・${candidates.size}人）") }
                        TextButton(onClick = { fieldersOpen = !fieldersOpen }) { Text(if (fieldersOpen) "畳む" else "出す") }
                    }
                    Muted("加えると救援の「おまかせ」で入ります。役割は押して選び直せます。加えていない野手は投げません", Modifier.padding(horizontal = 4.dp))
                }
            }
            if (fieldersOpen) {
                items(candidates, key = { "add:${it.id}" }) { p ->
                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f)) {
                                PitcherRow("", p, null, starter = false, next = false, onRole = { open(p.id) }, onInfo = { open(p.id) }, draggable = false)
                            }
                            TextButton(onClick = { onAdd(p) }) { Text("加える") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PitcherCard(dragging: Boolean, handle: Modifier, content: @Composable () -> Unit) {
    val elevation by animateDpAsState(if (dragging) 8.dp else 0.dp, label = "lift")
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainer,
        shadowElevation = elevation,
        modifier = Modifier.fillMaxWidth().then(handle),
    ) { content() }
}

/** @param role 札に出す役割（先発の型）。救援は見出しに出ているので null */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PitcherRow(order: String, player: Player?, role: String?, starter: Boolean, next: Boolean, onRole: () -> Unit, onInfo: () -> Unit, draggable: Boolean = true) {
    Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (order.isNotEmpty()) Text(order, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.width(24.dp))
        Column(Modifier.weight(1f).clickable(onClick = onRole)) {
            // ⚠ 札は折り返す（名前が長い・札が3つ並ぶと、1行に収まらず右の札が切れていた）
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("${conditionIcon(player?.condition)} ${player?.name ?: "?"}", fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.CenterVertically))
                val tag = Modifier.align(Alignment.CenterVertically)
                if (role != null) Box(tag) { Tag(roleLabel(role), MaterialTheme.colorScheme.primary) }
                // 野手登録の選手（二刀流）。本職の守備位置も出す
                if (player != null && !player.isPitcher) Box(tag) { Tag("野手・${positionLabel(player.position)}") }
                val fatigue = player?.fatigue ?: 0
                if (starter && fatigue >= STARTER_SKIP_FATIGUE) Box(tag) { Tag("飛ばす") }
                if (!starter && fatigue >= RELIEF_REST_FATIGUE) Box(tag) { Tag("休養") }
                if (next) Box(tag) { Tag("次の先発") }
            }
            player?.let { p ->
                val m = p.performance?.pitching?.metrics
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("防 ${m?.era?.let { "%.2f".format(it) } ?: "-"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    AbilityNum("速", p.pitching?.velocity, velocity = true)
                    AbilityNum("制", p.pitching?.control)
                    AbilityNum("ス", p.pitching?.stamina, stamina = true)
                }
            }
        }
        // 疲労は野手の行と同じく、名前の右端の決まった場所に（先発は飛ばす線、救援は休養の線で赤）
        FatigueBadge(player?.fatigue, restAt = if (starter) STARTER_SKIP_FATIGUE else RELIEF_REST_FATIGUE)
        IconButton(onClick = onInfo, modifier = Modifier.size(32.dp)) { Text("ⓘ", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (draggable) Icon(Icons.Filled.Menu, contentDescription = "長押しで並べ替え", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun RoleSheet(draft: PlanDraft, id: Long, player: Player?, onRemove: () -> Unit, onPick: (String) -> Unit) {
    val state = draft.pitching
    val current = state.roles[id]
    val starter = id in state.starters
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("${player?.name ?: ""} の役割", style = MaterialTheme.typography.titleMedium)
        Caption(if (starter) "先発の型" else "先発に入れる（${state.starters.size}/${MAX_STARTERS}人）")
        STARTER_ORDER.forEach { role ->
            val enabled = starter || state.starters.size < MAX_STARTERS
            RoleOption(STARTER_ROLES[role] ?: role, ROLE_HINT[role], role == current, enabled) { onPick(role) }
        }
        Caption(if (starter) "救援に回す" + if (state.starters.size <= 1) "（先発が1人なので回せません）" else "" else "救援の役割")
        RELIEF_ORDER.forEach { role ->
            val enabled = !starter || state.starters.size > 1
            RoleOption(RELIEF_ROLES[role] ?: role, ROLE_HINT[role], role == current, enabled) { onPick(role) }
        }
        // 加えた野手（二刀流）は投手起用から外せる。⚠ 最後の1人の先発は外せない
        if (player != null && !player.isPitcher) {
            val canRemove = !starter || state.starters.size > 1
            Caption("野手（二刀流）")
            RoleOption("投手起用から外す", if (canRemove) "野手だけで出る" else "先発が1人なので外せません", false, canRemove, onRemove)
        }
    }
}

@Composable
private fun RoleOption(label: String, hint: String?, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (selected) "●" else "○", color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, modifier = Modifier.width(24.dp))
        Text(label, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline, modifier = Modifier.weight(1f))
        hint?.let { Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

// ------------------------------------------------------------------ 方針・采配

@Composable
private fun TacticsEditor(view: LeagueView, draft: PlanDraft, edit: Edit) {
    // ⚠ 下は空けておく（左下の TIPS の印に、最後の項目の「しない」などのボタンが隠れていた）
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = TipsBadgeRoom), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // 指導者に任せているときは、ここで変えると「意見を聞く」に戻ることを先に知らせる（PC と同じ）
        if (view.staff?.mode("tactics")?.effective == "delegate")
            Muted("試合中の采配は指導者に任せています（「AI判断の中身」のとおりに動きます）。ここで変えて保存すると、任せ方は「意見を聞く」に戻ります。")
        Section("方針") {
            STRATEGY_FIELDS.forEach { f ->
                Text(f.label, style = MaterialTheme.typography.labelLarge)
                ChoiceRow(f.options.map { it.key to it.label }, draft.strategy[f.key]) { v -> edit { it.withStrategy(f.key, v) } }
                StaffActual(view, "strategy", f.key)
            }
        }
        Section("自動采配", trailing = { InfoButton("自動采配", listOf("試合中の作戦と継投の決め方です。AI判断のままでも試合は進みます。", "「AI判断の中身」は、指導者が「AI判断」に入れている内容と、決めた人です（保存した設定に対して）。")) }) {
            TACTIC_FIELDS.forEach { f ->
                Text(f.label, style = MaterialTheme.typography.labelLarge)
                ChoiceRow(f.options.map { it.key to it.label }, draft.tactics[f.key]) { v -> edit { it.withTactic(f.key, v) } }
                StaffActual(view, "tactics", f.key)
            }
        }
    }
}

/** スタメンの説明（画面には出さず ⓘ に詰める。いしだ指定） */
private val ORDER_HELP = listOf(
    "長押しでドラッグすると打順を並べ替えます。守備の札を押すと守備位置の入れ替え、名前を押すと控えと交代します。控えの行を押すと、誰と代えるかを選べます。",
    "2行目は上の切り替えで「能力」「今季成績」「守備適性」を出します。守備の札の下の「適」は、守っている位置での適性です（${SUBSTITUTE_MIN_FITNESS}未満は赤、90以上は緑）。",
    "試合の日に疲労${FIELDER_REST_FATIGUE}以上の野手は、その位置の適性${SUBSTITUTE_MIN_FITNESS}以上・疲労${SUBSTITUTE_FRESH_FATIGUE}未満の控えが居れば、その日だけ入れ替わって休みます。",
    "疲労は41以上で黄（成長が鈍り始める）、${FIELDER_REST_FATIGUE}以上で赤です。",
)

/** 投手起用の説明（役割の目安も、行には出さずここに） */
private fun pitchingHelp(): List<String> = listOf(
    "長押しでドラッグするとローテの順番を並べ替えます。救援の役割の見出しへ落とすと持ち場が変わります。行を押すと先発の型・救援の役割を選べます。",
    "疲労${STARTER_SKIP_FATIGUE}以上の先発は順番を飛ばし、疲労${RELIEF_REST_FATIGUE}以上の救援は休ませます。守護神は1人まで。",
    "先発の型: " + STARTER_ORDER.joinToString("、") { "${STARTER_ROLES[it] ?: it}＝${ROLE_HINT[it].orEmpty()}" },
    "救援の役割: " + RELIEF_ORDER.joinToString("、") { "${RELIEF_ROLES[it] ?: it}＝${ROLE_HINT[it].orEmpty()}" },
)
