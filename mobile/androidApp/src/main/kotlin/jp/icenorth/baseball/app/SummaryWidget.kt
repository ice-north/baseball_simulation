package jp.icenorth.baseball.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.OnlineJson
import jp.icenorth.baseball.shared.widgetSummary

/**
 * ホーム画面のウィジェット（D1）。順位・前の試合・次の試合の3行。押すとアプリが開く。
 *
 * ⚠ 自分では読みに行かない。端末に残したビュー（[SessionStore.viewJson]）を出すだけで、
 *    アプリがビューを受け取ったとき（[AppViewModel]）と、裏の試合結果の確認（[ResultWorker]）が読んだときに描き直す。
 *    通知を切っていると裏の確認が動かないので、そのときはアプリを開いたときに新しくなる。
 * ⚠ 文は shared の [widgetSummary]（試合結果の通知と同じ書き方）。
 */
class SummaryWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        draw(context, manager, ids)
    }

    companion object {
        /** 置かれているウィジェットを全部描き直す（置かれていなければ何もしない） */
        fun refresh(context: Context) {
            runCatching {
                val manager = AppWidgetManager.getInstance(context) ?: return
                val ids = manager.getAppWidgetIds(ComponentName(context, SummaryWidget::class.java))
                if (ids.isNotEmpty()) draw(context, manager, ids)
            }
        }

        private fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val store = SessionStore(context)
            val view = store.viewJson?.let { runCatching { OnlineJson.decodeFromString<LeagueView>(it) }.getOrNull() }
            val summary = if (store.auth == null) null else widgetSummary(view, store.quickSeen ?: emptySet())
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_summary)
                rv.setTextViewText(R.id.widget_title, summary?.title ?: context.getString(R.string.app_name))
                rv.setTextViewText(R.id.widget_standing, summary?.standing ?: "アプリを開いてログインしてください")
                rv.setTextViewText(R.id.widget_last, summary?.last ?: "")
                rv.setTextViewText(R.id.widget_next, summary?.next ?: "")
                rv.setOnClickPendingIntent(R.id.widget_root, open)
                manager.updateAppWidget(id, rv)
            }
        }
    }
}
