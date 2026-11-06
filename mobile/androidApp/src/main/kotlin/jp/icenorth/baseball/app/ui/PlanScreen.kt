package jp.icenorth.baseball.app.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import kotlinx.serialization.json.JsonObject
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

private enum class PlanTab(val label: String) { Order("スタメン"), Pitching("投手起用"), Tactics("方針・采配") }

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
        if (current == null || current.present.sameEdit(PlanDraft.from(current.present.base, view.roster))) model.plan = EditHistory(fresh)
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

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { model.plan = history.undo() }, enabled = history.canUndo) { Text("↶ 戻す") }
            TextButton(onClick = { model.plan = history.redo() }, enabled = history.canRedo) { Text("↷ 進む") }
            Text(if (dirty) "保存していない変更があります" else "保存済み", style = MaterialTheme.typography.bodySmall, color = if (dirty) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            // ⚠ 取り消すと、編集を始めたときではなく**今の保存済み**の編成に戻す（古い base に戻すと保存が断られ続ける）
            TextButton(onClick = { model.plan = history.push(PlanDraft.from(lineup, view.roster)) }, enabled = dirty || stale) { Text("取り消す") }
            Button(
                onClick = {
                    val problem = draft.problem()
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
                "別の画面で編成が更新されました。この編集は保存できないので、「取り消す」で最新の編成を読み直してから編集し直してください。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        ChipTabs(PlanTab.entries.map { it.name to it.label }, tab.name, { tab = PlanTab.valueOf(it) })
        when (tab) {
            PlanTab.Order -> OrderEditor(view, draft, players, dragEdit, onDragStart, open, orderView, { orderView = it }) { sheet = it }
            PlanTab.Pitching -> PitchingEditor(draft, players, model.raw?.at("nextStarterId").num()?.toLong(), dragEdit, onDragStart, open) { sheet = it }
            PlanTab.Tactics -> TacticsEditor(draft, edit)
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
            RoleSheet(draft, s.id, players[s.id]) { role ->
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
 */
@Composable
private fun OrderEditor(
    view: LeagueView,
    draft: PlanDraft,
    players: Map<Long, Player>,
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
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Muted("表示")
            ChipTabs(FielderView.entries.map { it.name to it.label }, mode.name, { onMode(FielderView.valueOf(it)) }, Modifier.padding(start = 0.dp))
        }
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
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
            item(key = "head:bat") { Caption("打順（長押しで並べ替え・守備の札で入れ替え・名前で控えと交代）") }
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
                item(key = "head:bench:$group") { Caption("控え・$label（${members.size}人）　押すと誰と代えるか選べます") }
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
            item(key = "rest") {
                Muted(
                    "試合の日は、疲労${FIELDER_REST_FATIGUE}以上の野手は守れる控え（その位置の適性${SUBSTITUTE_MIN_FITNESS}以上・疲労${SUBSTITUTE_FRESH_FATIGUE}未満）が居ればその日だけ入れ替わって休みます。" +
                        "疲労は41以上で黄（成長が鈍り始める）、休養の線を超えると赤です。",
                    Modifier.padding(top = 8.dp, start = 4.dp),
                )
            }
        }
    }
}

private fun benchOf(view: LeagueView, draft: PlanDraft): List<Player> =
    view.roster.filter { p -> !p.isPitcher && p.isActive && draft.slots.none { it.playerId == p.id } }

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
        Muted("数字は入れ替えたあとの適性（左が${me?.name ?: ""}、右が相手）", Modifier.padding(horizontal = 20.dp))
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
        Muted("${positionLabel(slot.position)}の適性が高い順。「適」はこの位置での適性です", Modifier.padding(horizontal = 20.dp))
        if (bench.isEmpty()) Text("控えの野手がいません", modifier = Modifier.padding(20.dp))
        bench.forEach { p ->
            FielderRow(
                order = null,
                position = p.position,
                player = p,
                fitnessAt = slot.position,
                mode = if (mode == FielderView.Fitness) FielderView.Ability else mode,
                modifier = Modifier.fillMaxWidth().clickable { onPick(p.id) }.padding(horizontal = 10.dp),
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
        Muted("右の数字は${me.name}がその位置を守ったときの適性。打順と守備位置は引き継ぎます", Modifier.padding(horizontal = 20.dp))
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
 */
@Composable
private fun PitchingEditor(draft: PlanDraft, players: Map<Long, Player>, nextId: Long?, edit: Edit, onDragStart: () -> Unit, open: (Long) -> Unit, onSheet: (PlanSheet) -> Unit) {
    val haptic = LocalHapticFeedback.current
    val state = draft.pitching
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val id = (from.key as? String)?.removePrefix("p:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        val target = to.key as? String ?: return@rememberReorderableLazyListState
        edit { d -> d.withPitching(dropPitcher(d.pitching, id, target)) }
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    PitchingList(draft, players, nextId, reorder, listState, onDragStart, open, onSheet)
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
    draft: PlanDraft,
    players: Map<Long, Player>,
    nextId: Long?,
    reorder: sh.calvin.reorderable.ReorderableLazyListState,
    listState: androidx.compose.foundation.lazy.LazyListState,
    onDragStart: () -> Unit,
    open: (Long) -> Unit,
    onSheet: (PlanSheet) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val state = draft.pitching
    val relievers = RELIEF_ORDER.map { role -> role to state.roles.filter { (id, r) -> r == role && id !in state.starters }.keys.mapNotNull { players[it] } }
    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "head:rot") {
            ReorderableItem(reorder, key = "head:rot") {
                Caption("先発ローテーション（${state.starters.size}/${MAX_STARTERS}人・長押しで並べ替え、救援へ落とすと役割が変わる）")
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
                    Row(Modifier.padding(top = 10.dp, start = 4.dp), verticalAlignment = Alignment.Bottom) {
                        Text(RELIEF_ROLES[role] ?: role, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        Muted("  ${ROLE_HINT[role].orEmpty()}")
                    }
                }
            }
            items(list, key = { "p:${it.id}" }) { p ->
                ReorderableItem(reorder, key = "p:${p.id}") { dragging ->
                    PitcherCard(dragging, Modifier.longPressDraggableHandle(onDragStarted = { onDragStart(); haptic.performHapticFeedback(HapticFeedbackType.LongPress) })) {
                        PitcherRow("", p, role, starter = false, next = false, onRole = { onSheet(PlanSheet.Role(p.id)) }, onInfo = { open(p.id) })
                    }
                }
            }
        }
        item(key = "note") {
            Muted(
                "疲労${STARTER_SKIP_FATIGUE}以上の先発は順番を飛ばし、疲労${RELIEF_REST_FATIGUE}以上の救援は休ませます。守護神は1人まで。",
                Modifier.padding(top = 8.dp, start = 4.dp),
            )
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

@Composable
private fun PitcherRow(order: String, player: Player?, role: String?, starter: Boolean, next: Boolean, onRole: () -> Unit, onInfo: () -> Unit) {
    Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (order.isNotEmpty()) Text(order, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.width(24.dp))
        Column(Modifier.weight(1f).clickable(onClick = onRole)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("${conditionIcon(player?.condition)} ${player?.name ?: "?"}", fontWeight = FontWeight.SemiBold)
                Tag(roleLabel(role), MaterialTheme.colorScheme.primary)
                val fatigue = player?.fatigue ?: 0
                if (starter && fatigue >= STARTER_SKIP_FATIGUE) Tag("飛ばす")
                if (!starter && fatigue >= RELIEF_REST_FATIGUE) Tag("休養")
                if (next) Tag("次の先発")
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
        Icon(Icons.Filled.Menu, contentDescription = "長押しで並べ替え", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun RoleSheet(draft: PlanDraft, id: Long, player: Player?, onPick: (String) -> Unit) {
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
private fun TacticsEditor(draft: PlanDraft, edit: Edit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Section("方針") {
            STRATEGY_FIELDS.forEach { f ->
                Text(f.label, style = MaterialTheme.typography.labelLarge)
                ChoiceRow(f.options.map { it.key to it.label }, draft.strategy[f.key]) { v -> edit { it.withStrategy(f.key, v) } }
            }
        }
        Section("自動采配") {
            Muted("試合中の作戦と継投の決め方です。AI判断のままでも試合は進みます。")
            TACTIC_FIELDS.forEach { f ->
                Text(f.label, style = MaterialTheme.typography.labelLarge)
                ChoiceRow(f.options.map { it.key to it.label }, draft.tactics[f.key]) { v -> edit { it.withTactic(f.key, v) } }
            }
        }
    }
}
