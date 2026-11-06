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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.FIELD_POSITIONS
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.LineupDraft
import jp.icenorth.baseball.shared.Player
import jp.icenorth.baseball.shared.abilityRank
import jp.icenorth.baseball.shared.conditionIcon
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.rate3
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

/** 開いているシート（守備の入れ替え／控えとの交代） */
private sealed interface Sheet {
    data class Position(val index: Int) : Sheet
    data class Replace(val index: Int) : Sheet
}

/**
 * 打順・守備・先発ローテーション。
 *
 * - 長押しでつかんで上下にドラッグ → 打順（ローテーションの順）を入れ替え
 * - 守備位置のチップをタップ → ほかの野手と守備を入れ替え
 * - 選手をタップ → 控えの野手と交代
 * - 保存するまでサーバーには送らない。「元に戻す」で編集前に戻る
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LineupScreen(model: AppViewModel) {
    val view = model.view
    val lineup = view?.lineup
    if (view == null || lineup == null || view.roster.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("編成はシーズンの名簿が決まると編集できます", textAlign = TextAlign.Center, modifier = Modifier.padding(24.dp))
        }
        return
    }
    var draft by remember { mutableStateOf(LineupDraft.from(lineup)) }
    // サーバー側が変わったら、編集していなければ最新に合わせる（編集中は手元を優先。保存時にサーバーが食い違いを見る）
    LaunchedEffect(lineup) {
        val fresh = LineupDraft.from(lineup)
        if (!draft.isDirty || (fresh.slots == draft.slots && fresh.starters == draft.starters)) draft = fresh
    }
    var sheet by remember { mutableStateOf<Sheet?>(null) }
    val players = remember(view.roster) { view.roster.associateBy { it.id } }
    val haptic = LocalHapticFeedback.current
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val a = from.key as? String ?: return@rememberReorderableLazyListState
        val b = to.key as? String ?: return@rememberReorderableLazyListState
        // 同じ区切り（打順どうし・先発どうし）の中だけで動かす
        if (a.startsWith("bat:") && b.startsWith("bat:")) {
            val i = draft.slots.indexOfFirst { "bat:${it.playerId}" == a }
            val j = draft.slots.indexOfFirst { "bat:${it.playerId}" == b }
            draft = draft.moveBatter(i, j)
        } else if (a.startsWith("rot:") && b.startsWith("rot:")) {
            val i = draft.starters.indexOfFirst { "rot:$it" == a }
            val j = draft.starters.indexOfFirst { "rot:$it" == b }
            draft = draft.moveStarter(i, j)
        } else {
            return@rememberReorderableLazyListState
        }
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("打順・ローテーション") },
            actions = {
                TextButton(onClick = { draft = LineupDraft.from(lineup) }, enabled = draft.isDirty && !model.busy) { Text("元に戻す") }
                Button(
                    onClick = {
                        val problem = draft.problem()
                        if (problem != null) model.error = problem
                        else model.saveLineup(draft.toPayload()) { model.view?.lineup?.let { draft = LineupDraft.from(it) } }
                    },
                    enabled = draft.isDirty && !model.busy,
                    modifier = Modifier.padding(end = 8.dp),
                ) { Text(if (model.busy) "保存中…" else "保存") }
            },
        )
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "head:bat") { Caption("打順（長押しで並べ替え、守備をタップで入れ替え）") }
            items(draft.slots, key = { "bat:${it.playerId}" }) { slot ->
                val index = draft.slots.indexOf(slot)
                ReorderableItem(reorder, key = "bat:${slot.playerId}") { dragging ->
                    val elevation by animateDpAsState(if (dragging) 8.dp else 0.dp, label = "lift")
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainer,
                        shadowElevation = elevation,
                        modifier = Modifier
                            .fillMaxWidth()
                            .longPressDraggableHandle(onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) }),
                    ) {
                        BatterRow(
                            order = index + 1,
                            position = slot.position,
                            player = players[slot.playerId],
                            onPosition = { sheet = Sheet.Position(index) },
                            onPlayer = { sheet = Sheet.Replace(index) },
                        )
                    }
                }
            }
            item(key = "head:rot") { Caption("先発ローテーション（長押しで並べ替え）") }
            items(draft.starters, key = { "rot:$it" }) { id ->
                val index = draft.starters.indexOf(id)
                ReorderableItem(reorder, key = "rot:$id") { dragging ->
                    val elevation by animateDpAsState(if (dragging) 8.dp else 0.dp, label = "lift")
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainer,
                        shadowElevation = elevation,
                        modifier = Modifier
                            .fillMaxWidth()
                            .longPressDraggableHandle(onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) }),
                    ) { StarterRow(index + 1, players[id]) }
                }
            }
        }
    }

    when (val open = sheet) {
        is Sheet.Position -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            PositionSheet(view, draft, open.index, players) { other ->
                draft = draft.swapPositions(open.index, other)
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                sheet = null
            }
        }
        is Sheet.Replace -> ModalBottomSheet(onDismissRequest = { sheet = null }) {
            ReplaceSheet(view, draft, open.index, players) { id ->
                draft = draft.replaceBatter(open.index, id)
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                sheet = null
            }
        }
        null -> Unit
    }
}

@Composable
private fun Caption(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp, start = 4.dp),
    )
}

@Composable
private fun BatterRow(order: Int, position: String, player: Player?, onPosition: () -> Unit, onPlayer: () -> Unit) {
    Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$order", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
        AssistChip(onClick = onPosition, label = { Text(positionLabel(position), fontWeight = FontWeight.Bold) })
        Column(
            Modifier
                .weight(1f)
                .clickable(onClick = onPlayer)
                .padding(start = 10.dp),
        ) {
            Text("${conditionIcon(player?.condition)} ${player?.name ?: "?"}", fontWeight = FontWeight.SemiBold)
            player?.let { BattingLine(it, position) }
        }
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
        Ability("ミ", player.batting?.meet)
        Ability("パ", player.batting?.power)
        Ability("走", player.physical?.speed)
        Ability("守", player.fielding?.defense)
        if (position != null && player.position != position) {
            Text("適性${player.fitness(position)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
    }
}

@Composable
private fun Ability(label: String, value: Int?, velocity: Boolean = false, stamina: Boolean = false) {
    value ?: return
    Row(verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("$value", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = rankColor(abilityRank(value, velocity, stamina)))
    }
}

@Composable
private fun StarterRow(order: Int, player: Player?) {
    Row(Modifier.padding(horizontal = 10.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$order", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
        Column(Modifier.weight(1f)) {
            Text("${conditionIcon(player?.condition)} ${player?.name ?: "?"}", fontWeight = FontWeight.SemiBold)
            player?.let { p ->
                val m = p.performance?.pitching?.metrics
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "防御率 ${m?.era?.let { "%.2f".format(it) } ?: "-"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Ability("速", p.pitching?.velocity, velocity = true)
                    Ability("制", p.pitching?.control)
                    Ability("ス", p.pitching?.stamina, stamina = true)
                    p.fatigue?.takeIf { it > 0 }?.let {
                        Text("疲労$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                    }
                }
            }
        }
        Icon(Icons.Filled.Menu, contentDescription = "長押しで並べ替え", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun PositionSheet(view: LeagueView, draft: LineupDraft, index: Int, players: Map<Long, Player>, onSwap: (Int) -> Unit) {
    val slot = draft.slots[index]
    val me = players[slot.playerId]
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Text(
            "${me?.name ?: ""}（${positionLabel(slot.position)}）と守備を入れ替える",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        FIELD_POSITIONS.mapNotNull { pos -> draft.slots.indexOfFirst { it.position == pos }.takeIf { it >= 0 && it != index } }
            .forEach { other ->
                val target = draft.slots[other]
                val them = players[target.playerId]
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onSwap(other) }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(positionLabel(target.position), fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                    Text(them?.name ?: "?", modifier = Modifier.weight(1f))
                    // 入れ替えたあとの2人の適性
                    Text(
                        "${me?.name?.substringBefore(' ') ?: ""}→${positionLabel(target.position)} ${me?.fitness(target.position) ?: 0} / " +
                            "${them?.name?.substringBefore(' ') ?: ""}→${positionLabel(slot.position)} ${them?.fitness(slot.position) ?: 0}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
    }
}

@Composable
private fun ReplaceSheet(view: LeagueView, draft: LineupDraft, index: Int, players: Map<Long, Player>, onPick: (Long) -> Unit) {
    val slot = draft.slots[index]
    val bench = view.roster
        .filter { p -> !p.isPitcher && p.isActive && draft.slots.none { it.playerId == p.id } }
        .sortedByDescending { it.fitness(slot.position) }
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        Text(
            "${players[slot.playerId]?.name ?: ""}（${positionLabel(slot.position)}）と交代する控え",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        if (bench.isEmpty()) {
            Text("控えの野手がいません", modifier = Modifier.padding(20.dp))
        }
        bench.forEach { p ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clickable { onPick(p.id) }
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${conditionIcon(p.condition)} ${p.name}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("本職 ${positionLabel(p.position)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                BattingLine(p, slot.position)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}
