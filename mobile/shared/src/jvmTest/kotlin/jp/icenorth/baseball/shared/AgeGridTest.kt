package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals

class AgeGridTest {
    private val people = listOf(
        AgeGridPerson(1, "田中", "pitcher", 0, 29, 32, core = true),
        AgeGridPerson(2, "佐藤", "left", 3, 28, 31),
        AgeGridPerson(3, "鈴木", "short", 2, 33, 36, core = true, warn = true),
        AgeGridPerson(4, "高橋", "catcher", 1, 18, 21),
    )

    /** 上が「30以上」、1歳ずつ下がり、19歳より若い人がいればその歳まで（Web 版 ageGridRows と同じ） */
    @Test
    fun rowsNow() {
        val rows = ageGridRows(people)
        assertEquals("30以上", rows.first().label)
        assertEquals("18", rows.last().label)
        assertEquals(listOf("鈴木"), rows[0].cells[2].map { it.name })
        assertEquals(listOf("田中"), rows[1].cells[0].map { it.name })
        assertEquals(listOf("高橋"), rows.last().cells[1].map { it.name })
    }

    /** 3年後は全員3つ上へ。下の段は19歳まで残る（空いた段が分かるように） */
    @Test
    fun rowsLater() {
        val rows = ageGridRows(people, later = true)
        assertEquals("19", rows.last().label)
        assertEquals(listOf("田中"), rows[0].cells[0].map { it.name })
        assertEquals(listOf("佐藤"), rows[0].cells[3].map { it.name })
    }
}
