package jp.icenorth.baseball.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.core.content.FileProvider
import java.io.File

/**
 * 紙面を画像にして、LINE などへ送る（D2）。
 *
 * ⚠ 画像は端末のキャッシュの shared/ に1枚だけ置く（毎回上書き）。外へ出すのは FileProvider の読み取りの許可だけ
 *    （AndroidManifest の provider・res/xml/share_paths.xml）。サーバーには何も送らない。
 * ⚠ 紙面の地が透けないよう、生成りの地に描いてから PNG にする。描いた結果がハードウェアの画像でも
 *    書き出せるよう、ふつうの画像に写す。
 */
object ShareImage {
    private const val PAPER = 0xFFF4EFE4.toInt()

    fun share(context: Context, picture: Bitmap, text: String) {
        val out = Bitmap.createBitmap(picture.width, picture.height, Bitmap.Config.ARGB_8888)
        Canvas(out).apply {
            drawColor(PAPER)
            drawBitmap(picture.copy(Bitmap.Config.ARGB_8888, false), 0f, 0f, null)
        }
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        val file = File(dir, "paper.png")
        file.outputStream().use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.share", file)
        val send = Intent(Intent.ACTION_SEND)
            .setType("image/png")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TEXT, text)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(send, "紙面を共有").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
