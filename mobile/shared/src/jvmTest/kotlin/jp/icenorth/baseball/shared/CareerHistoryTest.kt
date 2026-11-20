package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals

/** 経歴の仮の「高校卒」（Web 版 `src/utils/careerHistory.js` と同じ決まり） */
class CareerHistoryTest {
    private fun strip(vararg entries: Pair<String, String>) =
        withoutPlaceholderHighSchool(entries.toList(), { it.first }, { it.second }).map { it.second }

    @Test
    fun dropsPlaceholderNextToNamedHighSchool() {
        // 古いリーグに残っている「〇〇高 → 高校卒 → 入団」
        assertEquals(
            listOf("札幌第一高", "三陸"),
            strip("highschool" to "札幌第一高", "highschool" to "高校卒", "join" to "三陸"),
        )
    }

    @Test
    fun keepsPlaceholderWhenItIsTheOnlyHighSchool() {
        assertEquals(listOf("高校卒", "三陸"), strip("highschool" to "高校卒", "join" to "三陸"))
    }
}
