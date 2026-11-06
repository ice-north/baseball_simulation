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
import androidx.compose.material3.AssistChip
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
import jp.icenorth.baseball.shared.TACTIC_FIELDS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.conditionIcon
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.rate3
import jp.icenorth.baseball.shared.roleLabel
import kotlinx.serialization.json.JsonObject
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

private enum class PlanTab(val label: String) { Order("スタメン"), Pitching("投手起用"), Tactics("方針・采配") }

private sealed interface PlanSheet {
    data class Position(val index: Int) : PlanSheet
    data class Replace(val index: Int) : PlanSheet
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
    val edit: (PlanDraft) -> Unit = { model.plan = history.push(it) }
    var tab by rememberSaveable { mutableStateOf(PlanTab.Order) }
    var sheet by remember { mutableStateOf<PlanSheet?>(null) }
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
            TextButton(onClick = { model.plan = history.push(PlanDraft.from(draft.base, view.roster)) }, enabled = dirty) { Text("取り消す") }
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
        ChipTabs(PlanTab.entries.map { it.name to it.label }, tab.name, { tab = PlanTab.valueOf(it) })
        when (tab) {
            PlanTab.Order -> OrderEditor(view, draft, players, edit, open) { sheet = it }
            PlanTab.Pitching -> PitchingEditor(draft, players, model.raw?.at("nextStarterId").num()?.toLong(), edit, open) { sheet = it }
            PlanTab.Tactics -> TacticsEditor(draft, edit)
        }
    }

    val haptic = LocalHapticFeedback.current
    when (val s = sheet) {
        is PlanSheet.Position -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            PositionSheet(draft, s.index, players) { other ->
                edit(draft.swapPositions(s.index, other)); haptic.performHapticFeedback(HapticFeedbackType.LongPress); sheet = null
            }
        }
        is PlanSheet.Replace -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            ReplaceSheet(view, draft, s.index, players) { id ->
                edit(draft.replaceBatter(s.index, id)); haptic.performHapticFeedback(HapticFeedbackType.LongPress); sheet = null
            }
        }
        is PlanSheet.Role -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            RoleSheet(draft, s.id, players[s.id]) { role ->
                edit(draft.withPitching(draft.pitching.setRole(s.id, role))); sheet = null
            }
        }
        null -> Unit
    }
}

// ------------------------------------------------------------------ スタメン

@Composable
private fun OrderEditor(view: LeagueView, draft: PlanDraft, players: Map<Long, Player>, edit: (PlanDraft) -> Unit, open: (Long) -> Unit, onSheet: (PlanSheet) -> Unit) {
    val haptic = LocalHapticFeedback.current
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val a = (from.key as? String)?.removePrefix("bat:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        val b = (to.key as? String)?.removePrefix("bat:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        val i = draft.slots.indexOfFirst { it.playerId == a }
        val j = draft.slots.indexOfFirst { it.playerId == b }
        if (i < 0 || j < 0) return@rememberReorderableLazyListState
        edit(draft.moveBatter(i, j))
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    val bench = view.roster.filter { p -> !p.isPitcher && p.isActive && draft.slots.none { it.playerId == p.id } }
    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "head:bat") { Caption("打順（長押しでつかんで並べ替え・守備をタップで入れ替え・名前をタップで控えと交代）") }
        items(draft.slots, key = { "bat:${it.playerId}" }) { slot ->
            val index = draft.slots.indexOf(slot)
            ReorderableItem(reorder, key = "bat:${slot.playerId}") { dragging ->
                val elevation by animateDpAsState(if (dragging) 8.dp else 0.dp, label = "lift")
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainer,
                    shadowElevation = elevation,
                    modifier = Modifier.fillMaxWidth().longPressDraggableHandle(onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) }),
                ) {
                    BatterRow(index + 1, slot.position, players[slot.playerId], onPosition = { onSheet(PlanSheet.Position(index)) }, onPlayer = { onSheet(PlanSheet.Replace(index)) }, onInfo = { open(slot.playerId) })
                }
            }
        }
        item(key = "head:bench") { Caption("控えの野手（${bench.size}人）") }
        items(bench, key = { "bench:${it.id}" }) { p ->
            Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.clickable { open(p.id) }.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${conditionIcon(p.condition)} ${p.name}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Muted("本職 ${positionLabel(p.position)}")
                    }
                    BattingLine(p, null)
                }
            }
        }
        item(key = "rest") {
            Muted(
                "試合の日は、疲労${FIELDER_REST_FATIGUE}以上の野手は守れる控え（適性${SUBSTITUTE_MIN_FITNESS}以上）が居ればその日だけ入れ替わって休みます。",
                Modifier.padding(top = 8.dp, start = 4.dp),
            )
        }
    }
}

@Composable
private fun BatterRow(order: Int, position: String, player: Player?, onPosition: () -> Unit, onPlayer: () -> Unit, onInfo: () -> Unit) {
    Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$order", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
        AssistChip(onClick = onPosition, label = { Text(positionLabel(position), fontWeight = FontWeight.Bold) })
        Column(Modifier.weight(1f).clickable(onClick = onPlayer).padding(start = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${conditionIcon(player?.condition)} ${player?.name ?: "?"}", fontWeight = FontWeight.SemiBold)
                if ((player?.fatigue ?: 0) >= FIELDER_REST_FATIGUE) { Box(Modifier.width(6.dp)); Tag("休養") }
            }
            player?.let { BattingLine(it, position) }
            player?.let { p ->
                val playable = FIELD_POSITIONS.filter { it != position && p.fitness(it) >= SUBSTITUTE_MIN_FITNESS }
                if (playable.isNotEmpty()) Muted("守れる位置 " + playable.joinToString(" ") { positionLabel(it) })
            }
        }
        IconButton(onClick = onInfo, modifier = Modifier.size(32.dp)) { Text("ⓘ", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Icon(Icons.Filled.Menu, contentDescription = "長押しで並べ替え", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

/** 打率・本塁打と、ミート/パワー/走力/守備をランク色の数字で */
@Composable
private fun BattingLine(player: Player, position: String?) {
    val m = player.performance?.batting?.metrics
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            if (m == null || m.pa == 0) "-" else "${rate3(m.avg)} ${m.homeruns}本",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        AbilityNum("ミ", player.batting?.meet)
        AbilityNum("パ", player.batting?.power)
        AbilityNum("走", player.physical?.speed)
        AbilityNum("守", player.fielding?.defense)
        if (position != null && player.position != position) {
            Text("適性${player.fitness(position)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        player.fatigue?.takeIf { it > 0 }?.let { Text("疲$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun PositionSheet(draft: PlanDraft, index: Int, players: Map<Long, Player>, onSwap: (Int) -> Unit) {
    val slot = draft.slots[index]
    val me = players[slot.playerId]
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Text("${me?.name ?: ""}（${positionLabel(slot.position)}）と守備を入れ替える", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        FIELD_POSITIONS.mapNotNull { pos -> draft.slots.indexOfFirst { it.position == pos }.takeIf { it >= 0 && it != index } }
            .forEach { other ->
                val target = draft.slots[other]
                val them = players[target.playerId]
                Row(Modifier.fillMaxWidth().clickable { onSwap(other) }.padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(positionLabel(target.position), fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                    Text(them?.name ?: "?", modifier = Modifier.weight(1f))
                    // 入れ替えたあとの2人の適性
                    Muted(
                        "→${positionLabel(target.position)} ${me?.fitness(target.position) ?: 0} / " +
                            "→${positionLabel(slot.position)} ${them?.fitness(slot.position) ?: 0}",
                    )
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
    }
}

@Composable
private fun ReplaceSheet(view: LeagueView, draft: PlanDraft, index: Int, players: Map<Long, Player>, onPick: (Long) -> Unit) {
    val slot = draft.slots[index]
    val bench = view.roster
        .filter { p -> !p.isPitcher && p.isActive && draft.slots.none { it.playerId == p.id } }
        .sortedByDescending { it.fitness(slot.position) }
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Text("${players[slot.playerId]?.name ?: ""}（${positionLabel(slot.position)}）と交代する控え", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        if (bench.isEmpty()) Text("控えの野手がいません", modifier = Modifier.padding(20.dp))
        bench.forEach { p ->
            Column(Modifier.fillMaxWidth().clickable { onPick(p.id) }.padding(horizontal = 20.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${conditionIcon(p.condition)} ${p.name}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Muted("本職 ${positionLabel(p.position)}")
                }
                BattingLine(p, slot.position)
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
private fun PitchingEditor(draft: PlanDraft, players: Map<Long, Player>, nextId: Long?, edit: (PlanDraft) -> Unit, open: (Long) -> Unit, onSheet: (PlanSheet) -> Unit) {
    val haptic = LocalHapticFeedback.current
    val state = draft.pitching
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val id = (from.key as? String)?.removePrefix("p:")?.toLongOrNull() ?: return@rememberReorderableLazyListState
        val target = to.key as? String ?: return@rememberReorderableLazyListState
        val inRotation = id in state.starters
        val next = when {
            target.startsWith("p:") -> {
                val other = target.removePrefix("p:").toLongOrNull() ?: return@rememberReorderableLazyListState
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
        if (next != state) {
            edit(draft.withPitching(next))
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }
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
                PitcherCard(dragging, Modifier.longPressDraggableHandle(onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) })) {
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
                    PitcherCard(dragging, Modifier.longPressDraggableHandle(onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) })) {
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
                    p.fatigue?.takeIf { it > 0 }?.let { Text("疲$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
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
private fun TacticsEditor(draft: PlanDraft, edit: (PlanDraft) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Section("方針") {
            STRATEGY_FIELDS.forEach { f ->
                Text(f.label, style = MaterialTheme.typography.labelLarge)
                ChoiceRow(f.options.map { it.key to it.label }, draft.strategy[f.key]) { edit(draft.withStrategy(f.key, it)) }
            }
        }
        Section("自動采配") {
            Muted("試合中の作戦と継投の決め方です。AI判断のままでも試合は進みます。")
            TACTIC_FIELDS.forEach { f ->
                Text(f.label, style = MaterialTheme.typography.labelLarge)
                ChoiceRow(f.options.map { it.key to it.label }, draft.tactics[f.key]) { edit(draft.withTactic(f.key, it)) }
            }
        }
    }
}
