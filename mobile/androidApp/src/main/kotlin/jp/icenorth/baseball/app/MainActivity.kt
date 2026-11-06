package jp.icenorth.baseball.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import jp.icenorth.baseball.app.ui.BaseballTheme
import jp.icenorth.baseball.app.ui.OnlineApp

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
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
