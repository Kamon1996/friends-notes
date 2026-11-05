package expo.modules.telegram

import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.drinkless.tdlib.Client
import org.drinkless.tdlib.TdApi
import java.io.File

/**
 * Минимальная обёртка над официальной TDLib для разового импорта контактов.
 * Умеет только: войти по номеру/коду/паролю, прочитать контакты и их профили (дни рождения), выйти.
 * Сообщения, чаты и файлы не запрашиваются; базы сообщений и чатов отключены.
 */
class TelegramModule : Module() {
  @Volatile private var client: Client? = null
  @Volatile private var cfgApiId = 0
  @Volatile private var cfgApiHash = ""
  @Volatile private var cfgAppVersion = "1.0"
  @Volatile private var lastState: Map<String, Any?> = mapOf("state" to "none")

  override fun definition() = ModuleDefinition {
    Name("Telegram")

    Events("onAuthState")

    // Записываем Java-сбои в файл, чтобы после перезапуска показать их в «Отчёте об ошибке».
    OnCreate {
      val dir = appContext.reactContext?.filesDir
      if (dir != null) {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        if (previous !is CrashRecorder) {
          Thread.setDefaultUncaughtExceptionHandler(CrashRecorder(File(dir, CRASH_FILE), previous))
        }
      }
    }

    /** Последний записанный сбой и хвост лога TDLib. */
    AsyncFunction("getDiagnostics") {
      val dir = appContext.reactContext?.filesDir
      mapOf(
        "lastCrash" to (dir?.let { readTail(File(it, CRASH_FILE), 20_000) } ?: ""),
        "tdlibLog" to (dir?.let { readTail(File(it, TDLIB_LOG_FILE), 30_000) } ?: "")
      )
    }

    AsyncFunction("clearDiagnostics") {
      appContext.reactContext?.filesDir?.let {
        File(it, CRASH_FILE).delete()
        File(it, TDLIB_LOG_FILE).delete()
      }
      true
    }

    /** Последнее известное состояние авторизации. */
    Function("getState") { lastState }

    /** Запускает TDLib. Дальше состояние приходит событиями onAuthState. */
    AsyncFunction("start") { apiId: Int, apiHash: String, appVersion: String, promise: Promise ->
      if (client != null) {
        promise.resolve(lastState)
        return@AsyncFunction
      }
      cfgApiId = apiId
      cfgApiHash = apiHash
      cfgAppVersion = appVersion
      try {
        // Лог TDLib (в т.ч. фатальные ошибки) — в файл, чтобы его можно было посмотреть в приложении.
        appContext.reactContext?.filesDir?.let { dir ->
          val logPath = File(dir, TDLIB_LOG_FILE).absolutePath
          try {
            Client.execute(TdApi.SetLogStream(TdApi.LogStreamFile(logPath, 1_000_000L, true)))
            Client.execute(TdApi.SetLogVerbosityLevel(2))
          } catch (e: Client.ExecutionException) {
            Log.w(TAG, "TDLib log setup failed", e)
          }
        }
        lastState = mapOf("state" to "starting")
        client = Client.create(Client.ResultHandler { onUpdate(it) }, null, null)
        promise.resolve(lastState)
      } catch (t: Throwable) {
        // Например, UnsatisfiedLinkError, если libtdjni.so не загрузилась, — не роняем приложение.
        Log.e(TAG, "TDLib start failed", t)
        promise.reject("TG_START", "${t.javaClass.simpleName}: ${t.message}", t)
      }
    }

    AsyncFunction("setPhoneNumber") { phone: String, promise: Promise ->
      send(TdApi.SetAuthenticationPhoneNumber(phone, null), promise) { null }
    }

    AsyncFunction("checkCode") { code: String, promise: Promise ->
      send(TdApi.CheckAuthenticationCode(code), promise) { null }
    }

    AsyncFunction("checkPassword") { password: String, promise: Promise ->
      send(TdApi.CheckAuthenticationPassword(password), promise) { null }
    }

    /** id всех контактов Telegram. */
    AsyncFunction("getContactIds") { promise: Promise ->
      send(TdApi.GetContacts(), promise) { result ->
        (result as TdApi.Users).userIds.map { it.toDouble() }
      }
    }

    AsyncFunction("getUser") { userId: Double, promise: Promise ->
      send(TdApi.GetUser(userId.toLong()), promise) { result ->
        val u = result as TdApi.User
        mapOf(
          "id" to u.id.toDouble(),
          "firstName" to u.firstName,
          "lastName" to u.lastName,
          "phoneNumber" to u.phoneNumber,
          "usernames" to (u.usernames?.activeUsernames?.toList() ?: emptyList<String>()),
          "isMutualContact" to u.isMutualContact
        )
      }
    }

    /** Полный профиль: день рождения и «о себе». */
    AsyncFunction("getUserFullInfo") { userId: Double, promise: Promise ->
      send(TdApi.GetUserFullInfo(userId.toLong()), promise) { result ->
        val f = result as TdApi.UserFullInfo
        val b = f.birthdate
        mapOf(
          "birthdate" to (if (b != null) mapOf("day" to b.day, "month" to b.month, "year" to b.year) else null),
          "bio" to f.bio?.text
        )
      }
    }

    /** Выход из аккаунта: сессия завершается, локальные данные TDLib удаляются. */
    AsyncFunction("logOut") { promise: Promise ->
      send(TdApi.LogOut(), promise) { null }
    }

    /** Закрыть и стереть локальные данные без выхода (когда вход не завершён). */
    AsyncFunction("destroy") { promise: Promise ->
      send(TdApi.Destroy(), promise) { null }
    }
  }

  companion object {
    private const val TAG = "FriendsTelegram"
    private const val CRASH_FILE = "last-crash.txt"
    private const val TDLIB_LOG_FILE = "tdlib.log"

    private fun readTail(file: File, maxChars: Int): String {
      if (!file.exists()) return ""
      return try {
        val text = file.readText()
        if (text.length > maxChars) text.substring(text.length - maxChars) else text
      } catch (t: Throwable) {
        "read error: ${t.message}"
      }
    }
  }

  private class CrashRecorder(
    private val file: File,
    private val next: Thread.UncaughtExceptionHandler?
  ) : Thread.UncaughtExceptionHandler {
    override fun uncaughtException(thread: Thread, error: Throwable) {
      try {
        file.writeText("${java.util.Date()}\nthread: ${thread.name}\n${Log.getStackTraceString(error)}")
      } catch (t: Throwable) {
        // не мешаем системной обработке сбоя
      }
      next?.uncaughtException(thread, error)
    }
  }

  private fun send(fn: TdApi.Function<*>, promise: Promise, map: (TdApi.Object) -> Any?) {
    val c = client
    if (c == null) {
      promise.reject("TG_NO_CLIENT", "Telegram не запущен", null)
      return
    }
    try {
      c.send(fn, Client.ResultHandler { result ->
        if (result is TdApi.Error) {
          promise.reject("TG_${result.code}", result.message, null)
        } else {
          try {
            promise.resolve(map(result))
          } catch (e: Throwable) {
            promise.reject("TG_RESULT", e.message ?: "Unexpected TDLib result", e)
          }
        }
      })
    } catch (t: Throwable) {
      promise.reject("TG_SEND", "${t.javaClass.simpleName}: ${t.message}", t)
    }
  }

  private fun onUpdate(update: TdApi.Object) {
    if (update !is TdApi.UpdateAuthorizationState) return
    val st = update.authorizationState

    if (st is TdApi.AuthorizationStateWaitTdlibParameters) {
      val ctx = appContext.reactContext
      if (ctx == null) {
        emitState(mapOf("state" to "error", "message" to "No Android context"))
        return
      }
      val dir = File(ctx.noBackupFilesDir, "tdlib-import").absolutePath
      val params = TdApi.SetTdlibParameters()
      params.useTestDc = false
      params.databaseDirectory = dir
      params.filesDirectory = "$dir/files"
      params.databaseEncryptionKey = ByteArray(0)
      params.useFileDatabase = false
      params.useChatInfoDatabase = false
      params.useMessageDatabase = false
      params.useSecretChats = false
      params.apiId = cfgApiId
      params.apiHash = cfgApiHash
      params.systemLanguageCode = "ru"
      params.deviceModel = Build.MODEL ?: "Android"
      params.systemVersion = Build.VERSION.RELEASE ?: ""
      params.applicationVersion = cfgAppVersion
      client?.send(params, Client.ResultHandler { result ->
        if (result is TdApi.Error) emitState(mapOf("state" to "error", "message" to result.message))
      })
    }

    if (st is TdApi.AuthorizationStateClosed) client = null

    val name = st.javaClass.simpleName.removePrefix("AuthorizationState").replaceFirstChar { it.lowercaseChar() }
    val info = mutableMapOf<String, Any?>("state" to name)
    when (st) {
      is TdApi.AuthorizationStateWaitCode -> {
        info["codeType"] = st.codeInfo?.type?.javaClass?.simpleName
        info["phone"] = st.codeInfo?.phoneNumber
      }
      is TdApi.AuthorizationStateWaitPassword -> info["passwordHint"] = st.passwordHint
      else -> {}
    }
    emitState(info)
  }

  private fun emitState(info: Map<String, Any?>) {
    lastState = info
    sendEvent("onAuthState", info)
  }
}
