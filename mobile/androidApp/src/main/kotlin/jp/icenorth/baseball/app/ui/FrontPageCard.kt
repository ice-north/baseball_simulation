package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.shared.FrontPage

/*
 * ホームの「スポーツ新聞」。アプリのほかの画面は暗い色だが、ここだけ新聞紙の色（生成り）にして
 * 紙面らしさを出す。見出しは明朝（端末の Serif。日本語は Noto Serif CJK）で太く。
 * 勝った日の大見出しは赤、負けた日は黒（スポーツ紙の1面の決まり）。
 */
private val Paper = Color(0xFFF4EFE3)
private val Ink = Color(0xFF1B1A17)
private val InkSoft = Color(0xFF5B5548)
private val Red = Color(0xFFC8102E)
private val Rule = Color(0xFF2B2A27)

@Composable
fun FrontPageCard(page: FrontPage, onOpenGames: () -> Unit, onOpenLineup: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Paper, RoundedCornerShape(4.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Masthead(page.issue)
        // 大見出し
        page.kicker?.let {
            Text(
                it,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 10.dp).background(if (page.tone == FrontPage.Tone.Win) Red else Ink).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        Text(
            page.headline,
            fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.Black,
            fontSize = 32.sp,
            lineHeight = 38.sp,
            color = if (page.tone == FrontPage.Tone.Win) Red else Ink,
            modifier = Modifier.padding(top = 6.dp).clickable(onClick = onOpenGames),
        )
        page.score?.let { ScoreLine(it) }
        page.subhead?.let {
            Text(it, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Ink, modifier = Modifier.padding(top = 6.dp))
        }
        page.lead?.let {
            Text("　$it", fontFamily = FontFamily.Serif, fontSize = 14.sp, lineHeight = 22.sp, color = Ink, modifier = Modifier.padding(top = 8.dp))
        }
        // 記事は2段に組む（最初の1本は全幅）
        if (page.articles.isNotEmpty()) {
            HRule(Modifier.padding(top = 12.dp))
            ArticleBlock(page.articles.first(), Modifier.fillMaxWidth().padding(vertical = 10.dp), onClick = if (page.articles.first().kicker == "次戦予告") onOpenLineup else null)
            page.articles.drop(1).chunked(2).forEach { pair ->
                HRule()
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(vertical = 10.dp)) {
                    ArticleBlock(pair[0], Modifier.weight(1f).padding(end = 8.dp))
                    if (pair.size > 1) {
                        Box(Modifier.width(1.dp).fillMaxHeight().background(Rule.copy(alpha = 0.4f)))
                        ArticleBlock(pair[1], Modifier.weight(1f).padding(start = 8.dp))
                    }
                }
            }
        }
        if (page.shorts.isNotEmpty()) {
            HRule()
            Text("リーグ短信", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Black, fontSize = 14.sp, color = Ink, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
            page.shorts.forEach { Text("■ $it", fontSize = 13.sp, color = Ink, lineHeight = 19.sp) }
        }
        HRule(Modifier.padding(top = 10.dp))
        Text(
            "順位表・タイトル争い・リーグ便りは「試合」タブへ →",
            fontSize = 12.sp,
            color = InkSoft,
            textAlign = TextAlign.End,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenGames).padding(top = 8.dp),
        )
    }
}

@Composable
private fun Masthead(issue: String) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text("NEXT STAGE", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Black, fontSize = 24.sp, letterSpacing = 1.sp, color = Ink)
        Text(
            "スポーツ",
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.padding(start = 6.dp, bottom = 3.dp).background(Red).padding(horizontal = 5.dp, vertical = 1.dp),
        )
        Text(issue, fontSize = 11.sp, color = InkSoft, textAlign = TextAlign.End, modifier = Modifier.weight(1f).padding(bottom = 3.dp))
    }
    // 題字の下の二重線
    Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(2.dp).background(Rule))
    Box(Modifier.padding(top = 2.dp).fillMaxWidth().height(1.dp).background(Rule))
}

@Composable
private fun ScoreLine(score: FrontPage.Score) {
    Row(
        Modifier.padding(top = 8.dp).border(1.dp, Rule).padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(score.away, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Ink)
        Text("${score.awayScore}", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Black, fontSize = 26.sp, color = Ink)
        Text("－", fontSize = 15.sp, color = InkSoft)
        Text("${score.homeScore}", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Black, fontSize = 26.sp, color = Ink)
        Text(score.home, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Ink)
    }
}

@Composable
private fun ArticleBlock(article: FrontPage.Article, modifier: Modifier, onClick: (() -> Unit)? = null) {
    Column(modifier.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)) {
        Text(
            article.kicker,
            color = Paper,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.background(Ink).padding(horizontal = 4.dp, vertical = 1.dp),
        )
        Text(article.title, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Black, fontSize = 17.sp, lineHeight = 22.sp, color = Ink, modifier = Modifier.padding(top = 4.dp))
        Text(article.body, fontFamily = FontFamily.Serif, fontSize = 13.sp, lineHeight = 20.sp, color = Ink, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable
private fun HRule(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Rule.copy(alpha = 0.5f)))
}
