package jp.icenorth.baseball.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import jp.icenorth.baseball.shared.abilityRank
import jp.icenorth.baseball.shared.normalizedAbility

private val Scheme = darkColorScheme(
    primary = Color(0xFF38BDF8),
    onPrimary = Color(0xFF0B1220),
    primaryContainer = Color(0xFF0C4A6E),
    onPrimaryContainer = Color(0xFFE0F2FE),
    secondary = Color(0xFFFBBF24),
    onSecondary = Color(0xFF1C1917),
    background = Color(0xFF0F172A),
    onBackground = Color(0xFFE2E8F0),
    surface = Color(0xFF0F172A),
    onSurface = Color(0xFFE2E8F0),
    surfaceContainerLowest = Color(0xFF0B1220),
    surfaceContainerLow = Color(0xFF131C2F),
    surfaceContainer = Color(0xFF172036),
    surfaceContainerHigh = Color(0xFF1E293B),
    surfaceContainerHighest = Color(0xFF273449),
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF475569),
    outlineVariant = Color(0xFF334155),
    error = Color(0xFFF87171),
)

/** 能力のランク色（Web 版 getRankColor と同じ並び） */
fun rankColor(rank: Char): Color = when (rank) {
    'S' -> Color(0xFFF472B6)
    'A' -> Color(0xFFF87171)
    'B' -> Color(0xFFFB923C)
    'C' -> Color(0xFFFACC15)
    'D' -> Color(0xFF4ADE80)
    'E' -> Color(0xFF60A5FA)
    else -> Color(0xFFD1D5DB)
}

/**
 * 能力値の色。S〜E は段位の色（[rankColor]）、F（40未満）は明るさで3段に分ける（Web 版 `lowTone` と同じ境目と色）。
 * ⚠ F は0〜39と幅が広く、初期メンバーセットの表示値の4割強が入る。1色だと「3」と「39」が同じに見える
 *   （監査 2026-11-13: Web だけ分けていた）。低いほど沈ませて、良い値を浮き上がらせる。
 */
fun abilityColor(value: Int, velocity: Boolean = false, stamina: Boolean = false): Color {
    val rank = abilityRank(value, velocity, stamina)
    if (rank != 'F') return rankColor(rank)
    val v = normalizedAbility(value, velocity, stamina)
    return when {
        v >= 30 -> Color(0xFFA9B8CB)
        v >= 20 -> Color(0xFF8B98A8)
        else -> Color(0xFF6B7684)
    }
}

val WinColor = Color(0xFFF87171)
val LoseColor = Color(0xFF60A5FA)

@Composable
fun BaseballTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
