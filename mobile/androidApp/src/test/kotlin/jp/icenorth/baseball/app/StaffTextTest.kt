package jp.icenorth.baseball.app

import jp.icenorth.baseball.app.ui.staffDoneText
import org.junit.Assert.assertEquals
import org.junit.Test

/** 指導者の操作が済んだときの知らせ */
class StaffTextTest {
    @Test fun eachActionSaysWhatHappened() {
        // ⚠ 以前は解任・呼ぶ・入れ替えのどれも「指導者を入れ替えました」だった
        assertEquals("山田監督を解任しました", staffDoneText("release", "manager", null, "山田"))
        assertEquals("佐藤を投手コーチに呼びました", staffDoneText("hire", "pitching", null, "佐藤"))
        assertEquals("監督と野手コーチを入れ替えました", staffDoneText("swap", "manager", "batting", null))
    }
}
