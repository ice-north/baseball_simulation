package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals

class ChangeReasonTest {
    @Test
    fun internalTermsAreRewritten() {
        assertEquals("先発山田が打ち込まれて降板", readableChangeReason("先発山田がダメージ蓄積で降板(DP:54/53.75)"))
        assertEquals("山田が球数の上限（100球）に到達", readableChangeReason("山田が球数制限到達(101/100球)"))
        assertEquals("山田のスタミナ切れ（残り12%）", readableChangeReason("山田のスタミナ限界(12%)"))
        assertEquals("ピンチ(ランナー2人・1アウト)でスタミナ40%", readableChangeReason("ピンチ(ランナー2人・1アウト)でスタミナ40%"))
    }
}
