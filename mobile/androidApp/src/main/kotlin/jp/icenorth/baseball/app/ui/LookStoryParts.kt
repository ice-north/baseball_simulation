package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.Reporter
import jp.icenorth.baseball.shared.eventScene
import jp.icenorth.baseball.shared.reporterChat
import jp.icenorth.baseball.shared.reporterOf

// ============================================================
// 新しい見た目（試作）段4: 番記者のメモ（新聞の社告の代わり）と、球団の出来事の場面
// （優勝・昇格・残留・降格が決まったとき、ホームを開くと1度だけ出る）。中身は共通部の `LookStory.kt`
// （Web 版 `src/online/look/story.js` の写し。Web と答え合わせしてある）。画面は Web 版 `Story.jsx` と同じ考え。
// ⚠ **切のときは何も出さない**（社告は今までのまま）。表示専用（見た場面の印だけ端末に覚える）。
// ============================================================

/** 番記者のメモの中身（ホームで作り、新聞の社告の場所で使う） */
@Immutable
data class ReporterNote(val team: String, val reporter: Reporter, val chat: List<String>)

/** ホームが渡す番記者のメモ（切・自球団の無いときは null） */
val LocalReporterNote = compositionLocalOf<ReporterNote?> { null }

/** 番記者のメモの中身を作る（切なら null） */
@Composable
fun rememberReporterNote(view: LeagueView): ReporterNote? {
    val on = LocalLook.current.on
    return remember(on, view) {
        val team = view.teamName
        if (!on || team == null) null else ReporterNote(team, reporterOf(team, view.teamLabels), reporterChat(view))
    }
}

private val MemoInk = Color(0xFF1B1A17)
private val MemoRed = Color(0xFFC8102E)

/**
 * 番記者のメモ（新聞の1面。社告の代わり）。手続きの知らせがあれば先に「お知らせです」と並べ、
 * 押すと手続きへ。言うことが何も無ければ出さない
 */
@Composable
fun ReporterMemo(note: ReporterNote, alerts: List<String>, onOpenProcedures: () -> Unit) {
    if (alerts.isEmpty() && note.chat.isEmpty()) return
    Box(Modifier.padding(top = 14.dp).fillMaxWidth().testTag("reporter-memo")) {
        Row(
            Modifier.fillMaxWidth().border(2.dp, MemoInk).background(Color(0xFFFBF8F0))
                .then(if (alerts.isNotEmpty()) Modifier.clickable(onClick = onOpenProcedures) else Modifier)
                .padding(start = 10.dp, end = 10.dp, top = 14.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StoryFace(note.reporter.seed, note.team, note.reporter.age, 3, suit = true, size = 54.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("${note.reporter.title}　${note.reporter.name}", fontSize = 11.sp, color = Color(0xFF57534E))
                if (alerts.isNotEmpty()) {
                    Text(if (alerts.size == 1) "オーナー、お知らせです。" else "オーナー、お知らせが${alerts.size}つあります。", fontSize = 14.sp, color = MemoInk)
                    alerts.forEach { Text("・$it", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MemoInk) }
                }
                note.chat.forEach { Text(it, fontSize = 14.sp, color = MemoInk, lineHeight = 21.sp) }
                if (alerts.isNotEmpty()) Text("手続きへ →", fontSize = 11.sp, color = MemoRed, fontWeight = FontWeight.Black, modifier = Modifier.align(Alignment.End))
            }
        }
        Text(
            "番記者メモ",
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.padding(start = 8.dp).offset(y = (-8).dp).background(MemoRed).padding(horizontal = 6.dp, vertical = 1.dp),
        )
    }
}

private val TalkNavy = Color(0xFF13294B)
private val Gold = Color(0xFFFDE68A)

/** 球団の出来事の場面（ホームを開いたとき。1度見たら出さない） */
@Composable
fun EventSceneDialog(model: AppViewModel, view: LeagueView) {
    val on = LocalLook.current.on
    val scene = remember(on, view) { if (on) eventScene(view) else null } ?: return
    if (scene.key in model.lookSeen) return
    val team = view.teamName ?: return
    val close = { model.markLookSeen(scene.key) }
    val face = if (scene.good) 4 else 1
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier.padding(12.dp).widthIn(max = 440.dp).fillMaxWidth().height(640.dp)
                .clip(RoundedCornerShape(18.dp)).background(Color(0xFF0B1220)).testTag("event-scene"),
        ) {
            StadiumBackdrop(team, view.teamLabels[team]?.city.orEmpty(), if (scene.good) 1.0 else 0.4, Modifier.fillMaxSize().blur(1.5.dp))
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.25f)))
            Column(Modifier.fillMaxSize().padding(14.dp)) {
                Row(Modifier.padding(top = 10.dp).fillMaxWidth().background(Color(0xD60B1220))) {
                    Box(Modifier.padding(end = 10.dp).background(Gold).padding(horizontal = 2.5.dp, vertical = 26.dp))
                    Column(Modifier.padding(vertical = 8.dp)) {
                        Text(scene.title, fontSize = 12.sp, color = Gold)
                        Text(scene.heading, fontSize = 19.sp, color = Color.White, fontWeight = FontWeight.Black)
                    }
                }
                Spacer(Modifier.weight(1f))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.Bottom) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        StoryFace(scene.speaker.seed, team, scene.speaker.age, face, suit = scene.speaker.kind == "reporter", size = 132.dp)
                        Text(scene.speaker.label, fontSize = 12.sp, color = Color.White, style = TextStyle(shadow = Shadow(Color.Black, blurRadius = 8f)))
                    }
                    scene.star?.let { star ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            StoryFace("p${star.id}", team, star.age, face, size = 108.dp)
                            Text(star.name, fontSize = 12.sp, color = Color.White, style = TextStyle(shadow = Shadow(Color.Black, blurRadius = 8f)))
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                Column(Modifier.fillMaxWidth().background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 12.dp)) {
                    Text(
                        scene.speaker.label,
                        fontSize = 13.sp,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.background(TalkNavy, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 2.dp),
                    )
                    Text(scene.line, fontSize = 15.sp, color = Color(0xFF0F172A), lineHeight = 24.sp, modifier = Modifier.padding(top = 6.dp))
                }
                Button(
                    onClick = close,
                    colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Color(0xFF422006)),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.padding(top = 12.dp).fillMaxWidth().height(46.dp),
                ) { Text("閉じる", fontWeight = FontWeight.Bold, fontSize = 15.sp) }
            }
        }
    }
}
