package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/** 生の JSON から値を引く小さな道具（ビューの形をすべて型にしないため） */
fun JsonElement?.at(vararg keys: String): JsonElement? {
    var cur: JsonElement? = this
    for (k in keys) cur = (cur as? JsonObject)?.get(k)
    return cur
}

fun JsonElement?.obj(): JsonObject? = this as? JsonObject
fun JsonElement?.list(): List<JsonElement> = (this as? JsonArray) ?: emptyList()
fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
fun JsonElement?.int(): Int? = num()?.toInt()
fun JsonElement?.long(): Long? = num()?.toLong()
fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
fun JsonElement?.bool(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull

/**
 * 選手などの `id` を文字の鍵にする（数の 12 も文字の "12" も同じ "12"。12.0 にしない）。
 * 結果の `gains` の鍵（文字）と名簿の `id`（数）を突き合わせるときに使う
 */
fun JsonElement?.idKey(): String? = at("id").let { it.num()?.toLong()?.toString() ?: it.str() }
