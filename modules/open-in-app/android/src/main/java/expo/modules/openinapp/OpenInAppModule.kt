package expo.modules.openinapp

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Открывает веб-ссылку на профиль сразу в приложении соцсети, если оно установлено:
 * сначала в перечисленных пакетах (Telegram, Instagram…), затем в любом приложении, кроме браузера.
 * Возвращает false, если подходящего приложения нет — тогда ссылку открывают как обычно, в браузере.
 */
class OpenInAppModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OpenInApp")

    AsyncFunction("open") { url: String, packages: List<String> ->
      open(url, packages)
    }.runOnQueue(Queues.MAIN)
  }

  private fun open(url: String, packages: List<String>): Boolean {
    val context: Context = appContext.currentActivity ?: appContext.reactContext ?: return false
    val uri = Uri.parse(url)
    // Только веб-адреса: другие схемы (intent:, file:, content:) сюда не попадают.
    val scheme = uri.scheme?.lowercase()
    if (scheme != "https" && scheme != "http") return false

    // 1. Официальное приложение этой сети — напрямую, даже если Android не связал с ним домен.
    for (pkg in packages) {
      if (start(context, Intent(Intent.ACTION_VIEW, uri).setPackage(pkg))) return true
    }
    // 2. Любое другое приложение, которое умеет открывать такие ссылки, но не браузер (Android 11+).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val intent = Intent(Intent.ACTION_VIEW, uri)
        .addCategory(Intent.CATEGORY_BROWSABLE)
        .addFlags(Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER)
      if (start(context, intent)) return true
    }
    return false
  }

  private fun start(context: Context, intent: Intent): Boolean {
    if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      context.startActivity(intent)
      true
    } catch (e: ActivityNotFoundException) {
      false
    } catch (e: SecurityException) {
      false
    }
  }
}
