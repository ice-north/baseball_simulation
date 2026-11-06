package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import jp.icenorth.baseball.app.BuildConfig

@Composable
fun LoginScreen(model: AppViewModel) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showServer by rememberSaveable { mutableStateOf(false) }
    val local = model.endpoint != BuildConfig.DEFAULT_ENDPOINT
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .systemBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(48.dp))
            Text("オンライン対人リーグ", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "Web 版と同じアカウントでログインします。ログインすると、ほかの端末（ブラウザなど）からは操作できなくなります。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            if (!local) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("メールアドレス") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("パスワード") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { model.login(email, password) }),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { model.login(email, password) },
                    enabled = !model.busy && email.isNotBlank() && password.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) { Text(if (model.busy) "ログイン中…" else "ログイン") }
            } else {
                Text("開発用サーバーの参加者でログイン", style = MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf("player1", "player2").forEach { user ->
                        OutlinedButton(onClick = { model.localLogin(user) }, enabled = !model.busy) { Text(user) }
                    }
                }
            }
            model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            TextButton(onClick = { showServer = !showServer }) { Text(if (showServer) "接続先を閉じる" else "接続先を変える（開発用）") }
            if (showServer) {
                var draft by rememberSaveable { mutableStateOf(model.endpoint) }
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    label = { Text("接続先") },
                    supportingText = { Text("エミュレーターから PC の開発サーバーへは http://10.0.2.2:3002/") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { model.changeEndpoint(draft) }) { Text("この接続先にする") }
                    OutlinedButton(onClick = {
                        draft = BuildConfig.DEFAULT_ENDPOINT
                        model.changeEndpoint(draft)
                    }) { Text("本番に戻す") }
                }
            }
        }
    }
}
