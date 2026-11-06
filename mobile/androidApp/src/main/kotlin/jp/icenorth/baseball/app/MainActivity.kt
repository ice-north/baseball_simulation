package jp.icenorth.baseball.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import jp.icenorth.baseball.app.ui.BaseballTheme
import jp.icenorth.baseball.app.ui.OnlineApp

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // ⚠ 画面はいつも暗い色なので、ステータスバーの時計・電池は端末の設定（ライト）に関係なく白で描く。
        //    既定のままだとライト設定の端末で黒っぽい文字になり、暗い背景で読めなかった
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        setContent {
            BaseballTheme {
                OnlineApp(model)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // アプリに戻ってきたら最新に（Web 版の visibilitychange と同じ）
        model.reload()
    }
}
