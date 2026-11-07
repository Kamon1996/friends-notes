package expo.modules.telegram

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/**
 * Foreground-сервис на время входа в Telegram и загрузки контактов: с ним Android не усыпляет
 * приложение, когда оно свёрнуто. Сам ничего не делает — работа идёт в TelegramModule,
 * сервис только держит уведомление с прогрессом.
 *
 * Android 15 даёт сервису типа dataSync не больше шести часов, а потом роняет приложение
 * (ForegroundServiceDidNotStopInTimeException), если сервис не остановился сам. Поэтому сервис
 * живёт только пока идёт работа: ожидание кода ограничено сторожевым таймером, а по сигналу
 * onTimeout он останавливается сразу — импорт при этом продолжается, пока приложение живо.
 */
class TelegramImportService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  /** Android 14: сервис исчерпал лимит времени. */
  override fun onTimeout(startId: Int) = stopNow("onTimeout")

  /** Android 15: лимит времени для сервиса типа dataSync. */
  override fun onTimeout(startId: Int, fgsType: Int) = stopNow("onTimeout(type)")

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun stopNow(reason: String) {
    Log.w(TAG, "Import service stopped: $reason")
    running = false
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (t: Throwable) {
      Log.w(TAG, "stopForeground failed", t)
    }
    stopSelf()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Импорт из Telegram…"
    val done = intent?.getIntExtra(EXTRA_DONE, -1) ?: -1
    val total = intent?.getIntExtra(EXTRA_TOTAL, -1) ?: -1
    val notification = build(this, text, if (done >= 0 && total > 0) Pair(done, total) else null)
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(PROGRESS_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(PROGRESS_ID, notification)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "startForeground failed", t)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  companion object {
    private const val TAG = "FriendsTelegram"
    private const val CHANNEL_ID = "telegram_import"
    private const val PROGRESS_ID = 7701
    private const val DONE_ID = 7702
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_DONE = "done"
    private const val EXTRA_TOTAL = "total"

    @Volatile private var running = false
    private val watchdog = Handler(Looper.getMainLooper())
    private var watchdogStop: Runnable? = null

    /** Ожидание ввода кода или пароля не держит сервис дольше 20 минут, загрузка — дольше двух часов. */
    private const val WAIT_LIMIT_MS = 20L * 60 * 1000
    private const val WORK_LIMIT_MS = 2L * 60 * 60 * 1000

    private fun armWatchdog(ctx: Context, limitMs: Long) {
      watchdogStop?.let { watchdog.removeCallbacks(it) }
      val app = ctx.applicationContext
      val r = Runnable {
        Log.w(TAG, "Import service watchdog: stopping after ${limitMs / 60000} min")
        stop(app)
      }
      watchdogStop = r
      watchdog.postDelayed(r, limitMs)
    }

    /** Показать/обновить уведомление; при первом вызове запускает сервис. */
    fun show(ctx: Context, text: String, progress: Pair<Int, Int>?) {
      armWatchdog(ctx, if (progress != null) WORK_LIMIT_MS else WAIT_LIMIT_MS)
      try {
        if (!running) {
          val intent = Intent(ctx, TelegramImportService::class.java)
            .putExtra(EXTRA_TEXT, text)
            .putExtra(EXTRA_DONE, progress?.first ?: -1)
            .putExtra(EXTRA_TOTAL, progress?.second ?: -1)
          if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
          running = true
        } else {
          manager(ctx).notify(PROGRESS_ID, build(ctx, text, progress))
        }
      } catch (t: Throwable) {
        // Например, запрет на запуск сервиса из фона — импорт всё равно продолжится, пока приложение живо.
        Log.w(TAG, "Could not show import notification", t)
      }
    }

    fun stop(ctx: Context) {
      watchdogStop?.let { watchdog.removeCallbacks(it) }
      watchdogStop = null
      if (!running) return
      running = false
      try {
        ctx.stopService(Intent(ctx, TelegramImportService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "Could not stop import service", t)
      }
    }

    /** Отдельное уведомление, что контакты загружены (после остановки сервиса). */
    fun notifyDone(ctx: Context, count: Int) {
      try {
        val n = builder(ctx)
          .setSmallIcon(android.R.drawable.stat_sys_download_done)
          .setContentTitle("Контакты Telegram загружены: $count")
          .setContentText("Сессия Telegram завершена. Нажмите, чтобы выбрать, кого добавить.")
          .setAutoCancel(true)
          .build()
        manager(ctx).notify(DONE_ID, n)
      } catch (t: Throwable) {
        Log.w(TAG, "Could not post done notification", t)
      }
    }

    private fun manager(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun builder(ctx: Context): Notification.Builder {
      val b = if (Build.VERSION.SDK_INT >= 26) {
        val channel = NotificationChannel(CHANNEL_ID, "Импорт из Telegram", NotificationManager.IMPORTANCE_LOW)
        manager(ctx).createNotificationChannel(channel)
        Notification.Builder(ctx, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(ctx)
      }
      ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let { launch ->
        launch.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        b.setContentIntent(PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      }
      return b
    }

    private fun build(ctx: Context, text: String, progress: Pair<Int, Int>?): Notification {
      val b = builder(ctx)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle("Импорт из Telegram")
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
      if (progress != null) b.setProgress(progress.second, progress.first, false)
      return b.build()
    }
  }
}
