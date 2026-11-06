package jp.icenorth.baseball.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import jp.icenorth.baseball.app.AppViewModel

private enum class Tab(val label: String) { Home("ホーム"), Lineup("打順") }

@Composable
fun OnlineApp(model: AppViewModel) {
    val snackbar = remember { SnackbarHostState() }
    // 失敗とお知らせは画面下に出す（ログイン画面では画面内に出す）
    LaunchedEffect(model.message) {
        model.message?.let { snackbar.showSnackbar(it); model.message = null }
    }
    LaunchedEffect(model.error, model.auth) {
        if (model.auth != null) model.error?.let { snackbar.showSnackbar(it); model.error = null }
    }
    if (model.auth == null) {
        LoginScreen(model)
        return
    }
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = {
                            Icon(
                                if (item == Tab.Home) Icons.Filled.Home else Icons.Filled.List,
                                contentDescription = null,
                            )
                        },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        AnimatedContent(
            targetState = tab,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            modifier = Modifier.padding(padding),
            label = "tab",
        ) { current ->
            when (current) {
                Tab.Home -> HomeScreen(model, onOpenLineup = { tab = Tab.Lineup })
                Tab.Lineup -> LineupScreen(model)
            }
        }
    }
}
