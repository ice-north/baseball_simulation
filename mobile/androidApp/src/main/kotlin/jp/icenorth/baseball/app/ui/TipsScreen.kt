package jp.icenorth.baseball.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextOverflow
import jp.icenorth.baseball.shared.SituationTip
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.shared.GAME_TIPS
import jp.icenorth.baseball.shared.GameTip
import jp.icenorth.baseball.shared.TIP_CATEGORIES
import jp.icenorth.baseball.shared.hasUnreadTips

/**
 * ゲームのTIPS一覧（ホームから開く。戻るボタンで閉じる）。
 * @param situations 今のスタメン・ローテに当てはまるTIPS。あれば先頭に、当てはまる人（「名前（疲労85）」）と一緒に出す。
 *   ⚠ 左下の印は未読のときだけ出す（いしだ決定 2026-11-11）。読んだあと、同じ種類のTIPSに別の選手が当てはまっても
 *   印は出ないので、当てはまる人を見直す入口をここ（ホームのメニュー・紙面のコラム・印のダイアログから開く）に置く
 * @param onRead 当てはまるTIPSを見せたら読んだことにする（印と同じ扱い）
 */
@Composable
fun TipsScreen(situations: List<SituationTip> = emptyList(), onRead: (Set<String>) -> Unit = {}, close: () -> Unit) {
    BackHandler(onBack = close)
    LaunchedEffect(situations) { if (situations.isNotEmpty()) onRead(situations.map { it.tip.id }.toSet()) }
    Surface(Modifier.fillMaxSize().testTag("tips"), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る") }
                Text("ゲームのTIPS", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item(key = "lead") { Muted("画面には出ないけれど、勝敗や成長に効くゲームの決まりです。") }
                if (situations.isNotEmpty()) {
                    item(key = "now") { Caption("いまの状態に当てはまるTIPS") }
                    items(situations, key = { "now-" + it.tip.id }) { TipCard(it.tip, it.who) }
                }
                TIP_CATEGORIES.forEach { category ->
                    item(key = "h-$category") { Caption(category) }
                    items(GAME_TIPS.filter { it.category == category }, key = { it.title }) { TipCard(it) }
                }
            }
        }
    }
}

/** @param who 当てはまる人（今の状態のTIPSだけ。「名前（疲労85）」） */
@Composable
private fun TipCard(tip: GameTip, who: List<String> = emptyList()) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(tip.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            if (who.isNotEmpty()) {
                Text(who.joinToString("、"), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.secondary)
            }
            Text(tip.body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/**
 * 今のチームに当てはまるTIPSがあるときだけ出す「i」マーク。押すとTIPSを出す。
 * まだ読んでいないTIPSがあるときだけ点滅し、一度開いたら止まる（いしだ指定。[hasUnreadTips]）。
 * ⚠ 画面の枠は取らない（角に重ねるだけ）。当てはまらなければ何も出さない。
 */
@Composable
fun SituationTipsBadge(
    tips: List<SituationTip>,
    seen: Set<String>,
    onRead: (Set<String>) -> Unit,
    onOpenAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (tips.isEmpty()) return
    // ⚠ 開いているかは回転でも残す（remember だと、端末を回すとダイアログが閉じ、読んだ扱いで印も消えていた）
    var open by rememberSaveable { mutableStateOf(false) }
    // ⚠ 印は**未読があるときだけ**出す（いしだ決定 2026-11-11）。読んだあとも居座ると、いつも角に物がある。
    //    読んだTIPSと当てはまる人は、ホームのメニューの「ゲームのTIPS」の先頭でいつでも読み返せる（[TipsScreen]）
    if (!open && !hasUnreadTips(tips, seen)) return
    val alpha = if (!open && hasUnreadTips(tips, seen)) {
        val pulse by rememberInfiniteTransition(label = "tip-pulse").animateFloat(
            initialValue = 1f,
            targetValue = 0.35f,
            animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
            label = "tip-alpha",
        )
        pulse
    } else {
        1f
    }
    SmallFloatingActionButton(
        onClick = {
            open = true
            onRead(tips.map { it.tip.id }.toSet())
        },
        containerColor = MaterialTheme.colorScheme.secondary,
        modifier = modifier.alpha(alpha).testTag("situation-tips"),
    ) {
        Icon(Icons.Filled.Info, contentDescription = "今の状態に当てはまるTIPS")
    }
    if (open) TipsDialog(tips, "今の状態に当てはまるTIPS", onOpenAll) { open = false }
}

@Composable
private fun TipsDialog(tips: List<SituationTip>, heading: String, onOpenAll: () -> Unit, close: () -> Unit) {
    AlertDialog(
        onDismissRequest = close,
        title = { Text(heading) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                tips.forEach { (tip, who) ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(tip.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (who.isNotEmpty()) {
                            Text(who.joinToString("、"), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.secondary)
                        }
                        Text(tip.body, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = close) { Text("閉じる") } },
        dismissButton = { TextButton(onClick = { close(); onOpenAll() }) { Text("TIPSをすべて見る") } },
    )
}
