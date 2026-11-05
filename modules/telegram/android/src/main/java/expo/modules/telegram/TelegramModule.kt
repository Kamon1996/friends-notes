package expo.modules.telegram

import android.content.Context
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.drinkless.tdlib.Client
import org.drinkless.tdlib.TdApi
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Минимальная обёртка над официальной TDLib для разового импорта контактов.
 *
 * Что модуль умеет — и это весь его API: войти по номеру/коду/паролю, прочитать список контактов
 * и их профили (имя, телефон, username, день рождения, «о себе»), выйти из аккаунта.
 * Функций для сообщений, чатов, групп и файлов здесь нет; базы сообщений и чатов TDLib отключены.
 *
 * Загрузка идёт в фоновом потоке и стартует сама сразу после входа; пока TDLib работает,
 * запущен foreground-сервис с уведомлением, чтобы Android не усыпил приложение в фоне.
 * После загрузки модуль сам выходит из аккаунта.
 */
class TelegramModule : Module() {
  @Volatile private var client: Client? = null
  @Volatile private var cfgApiId = 0
  @Volatile private var cfgApiHash = ""
  @Volatile private var cfgAppVersion = "1.0"
  @Volatile private var lastState: Map<String, Any?> = mapOf("state" to "none")

  private val worker = Executors.newSingleThreadExecutor()
  @Volatile private var importRunning = false
  @Volatile private var cancelRequested = false
  @Volatile private var importState: Map<String, Any?> = mapOf("phase" to "idle")
  private val people = ArrayList<Map<String, Any?>>()

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("Telegram")

    Events("onAuthState", "onImport")

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

    /** Последнее известное состояние входа. */
    Function("getState") { lastState }

    /** Состояние импорта: phase (idle/loading/finishing/done/error/cancelled), прогресс, счётчики запросов. */
    Function("getImportState") { importState }

    /** Запускает TDLib. Дальше состояние входа приходит событиями onAuthState. */
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
        cancelRequested = false
        setImport(mapOf("phase" to "idle"))
        lastState = mapOf("state" to "starting")
        context?.let { TelegramImportService.show(it, "Вход в Telegram…", null) }
        client = Client.create(Client.ResultHandler { onUpdate(it) }, null, null)
        promise.resolve(lastState)
      } catch (t: Throwable) {
        // Например, UnsatisfiedLinkError, если libtdjni.so не загрузилась, — не роняем приложение.
        Log.e(TAG, "TDLib start failed", t)
        context?.let { TelegramImportService.stop(it) }
        promise.reject("TG_START", "${t.javaClass.simpleName}: ${t.message}", t)
      }
    }

    AsyncFunction("setPhoneNumber") { phone: String, promise: Promise ->
      send(TdApi.SetAuthenticationPhoneNumber(phone, null), promise)
    }

    AsyncFunction("checkCode") { code: String, promise: Promise ->
      send(TdApi.CheckAuthenticationCode(code), promise)
    }

    AsyncFunction("checkPassword") { password: String, promise: Promise ->
      send(TdApi.CheckAuthenticationPassword(password), promise)
    }

    /** Загруженные контакты (после phase=done). Хранятся до clearImportResult. */
    AsyncFunction("getImportResult") {
      synchronized(people) {
        if (people.isEmpty()) loadResultFile()
        ArrayList(people)
      }
    }

    /** Стереть загруженные данные и аватарки (отмена или «начать заново»). */
    AsyncFunction("clearImportResult") {
      synchronized(people) { people.clear() }
      resultFile()?.delete()
      pendingAvatarDir()?.deleteRecursively()
      if (!importRunning && client == null) setImport(mapOf("phase" to "idle"))
      true
    }

    /**
     * Пользователь выбрал, кого добавить: аватарки этих людей переносим в постоянную папку,
     * остальные удаляем вместе с загруженными данными. Возвращает { id Telegram → file://… }.
     */
    AsyncFunction("finalizeImport") { keepIds: List<Double> ->
      val keep = keepIds.map { it.toLong().toString() }.toSet()
      val kept = HashMap<String, String>()
      val pending = pendingAvatarDir()
      val permanent = context?.let { File(it.filesDir, AVATARS_DIR).apply { mkdirs() } }
      pending?.listFiles()?.forEach { f ->
        val id = f.nameWithoutExtension
        if (id in keep && permanent != null) {
          val dest = File(permanent, "tg-$id-${System.currentTimeMillis()}.jpg")
          try {
            f.copyTo(dest, overwrite = true)
            kept[id] = "file://${dest.absolutePath}"
          } catch (t: Throwable) {
            Log.w(TAG, "Could not keep avatar", t)
          }
        }
      }
      pending?.deleteRecursively()
      synchronized(people) { people.clear() }
      resultFile()?.delete()
      if (!importRunning && client == null) setImport(mapOf("phase" to "idle"))
      kept
    }

    /** Отменить вход/загрузку: выйти из аккаунта (или стереть незавершённый вход). */
    AsyncFunction("cancel") {
      cancelRequested = true
      if (!importRunning) closeSession()
      true
    }
  }

  // ---------- Импорт ----------

  private fun startImport() {
    if (importRunning) return
    importRunning = true
    worker.execute {
      try {
        runImport()
      } finally {
        importRunning = false
      }
    }
  }

  private fun runImport() {
    var requestsContacts = 0
    var requestsUsers = 0
    var requestsProfiles = 0
    var requestsPhotos = 0
    var partial = false
    var total = 0
    fun progress(phase: String, done: Int, extra: Map<String, Any?> = emptyMap()) {
      val base: Map<String, Any?> = mapOf(
        "phase" to phase,
        "done" to done,
        "total" to total,
        "partial" to partial,
        "requestsContacts" to requestsContacts,
        "requestsUsers" to requestsUsers,
        "requestsProfiles" to requestsProfiles,
        "requestsPhotos" to requestsPhotos,
        // Функций чтения сообщений в модуле нет — счётчик всегда 0.
        "requestsMessages" to 0
      )
      setImport(base + extra)
    }

    synchronized(people) { people.clear() }
    resultFile()?.delete()
    pendingAvatarDir()?.deleteRecursively()
    try {
      progress("loading", 0)
      val ids = (call(TdApi.GetContacts()) as TdApi.Users).userIds
      requestsContacts++
      total = ids.size
      progress("loading", 0)

      for ((index, id) in ids.withIndex()) {
        if (cancelRequested) break
        val user = call(TdApi.GetUser(id)) as TdApi.User
        requestsUsers++
        var full: TdApi.UserFullInfo? = null
        if (!partial) {
          var attempt = 0
          while (attempt < 2) {
            try {
              full = call(TdApi.GetUserFullInfo(id)) as TdApi.UserFullInfo
              requestsProfiles++
              break
            } catch (e: TdError) {
              val wait = floodWaitSeconds(e.message)
              if (wait != null && wait <= 60 && attempt == 0) {
                progress("loading", index, mapOf("waitingSeconds" to wait))
                Thread.sleep((wait + 1) * 1000L)
                attempt++
                continue
              }
              // Telegram просит ждать слишком долго — дни рождения остальных пропускаем.
              if (wait != null) partial = true
              break
            }
          }
          Thread.sleep(120)
        }
        // Текущая аватарка (уменьшенная копия 160×160) — копируем к себе до выхода из аккаунта.
        val avatar = try {
          downloadAvatar(user)?.also { requestsPhotos++ }
        } catch (e: Throwable) {
          Log.w(TAG, "Avatar download failed", e)
          null
        }
        synchronized(people) { people.add(personMap(user, full, avatar)) }
        progress("loading", index + 1)
        context?.let { TelegramImportService.show(it, "Загружаю контакты: ${index + 1} из $total", Pair(index + 1, total)) }
      }

      saveResultFile()
      val cancelled = cancelRequested
      progress("finishing", synchronized(people) { people.size })
      context?.let { TelegramImportService.show(it, "Выхожу из аккаунта Telegram…", null) }
      val loggedOut = try {
        call(TdApi.LogOut(), 30)
        true
      } catch (e: Throwable) {
        Log.w(TAG, "LogOut failed", e)
        false
      }
      progress(if (cancelled) "cancelled" else "done", synchronized(people) { people.size }, mapOf("loggedOut" to loggedOut))
    } catch (e: Throwable) {
      Log.e(TAG, "Import failed", e)
      progress("error", synchronized(people) { people.size }, mapOf("error" to (e.message ?: e.javaClass.simpleName)))
      closeSession()
    }
  }

  /** Скачивает маленькую аватарку пользователя и копирует во временную папку приложения. */
  private fun downloadAvatar(user: TdApi.User): String? {
    val small = user.profilePhoto?.small ?: return null
    val file = if (small.local?.isDownloadingCompleted == true) {
      small
    } else {
      call(TdApi.DownloadFile(small.id, 1, 0, 0, true), 30) as TdApi.File
    }
    val path = file.local?.path
    if (path.isNullOrEmpty()) return null
    val dir = pendingAvatarDir() ?: return null
    dir.mkdirs()
    val dest = File(dir, "${user.id}.jpg")
    File(path).copyTo(dest, overwrite = true)
    return "file://${dest.absolutePath}"
  }

  private fun pendingAvatarDir(): File? = context?.let { File(it.noBackupFilesDir, PENDING_AVATARS_DIR) }

  private fun personMap(u: TdApi.User, f: TdApi.UserFullInfo?, photoUri: String?): Map<String, Any?> {
    val b = f?.birthdate
    return mapOf(
      "photoUri" to photoUri,
      "id" to u.id.toDouble(),
      "firstName" to u.firstName,
      "lastName" to u.lastName,
      "phoneNumber" to u.phoneNumber,
      "usernames" to (u.usernames?.activeUsernames?.toList() ?: emptyList<String>()),
      "birthdate" to (if (b != null) mapOf("day" to b.day, "month" to b.month, "year" to b.year) else null),
      "bio" to f?.bio?.text
    )
  }

  private fun setImport(state: Map<String, Any?>) {
    importState = state
    try {
      sendEvent("onImport", state)
    } catch (t: Throwable) {
      // JS может быть приостановлен — состояние заберут через getImportState
    }
  }

  // ---------- Результат в файле (на случай перезапуска JS), удаляется после выбора ----------

  private fun resultFile(): File? = context?.let { File(it.noBackupFilesDir, RESULT_FILE) }

  private fun saveResultFile() {
    val file = resultFile() ?: return
    val arr = JSONArray()
    synchronized(people) {
      for (p in people) {
        val o = JSONObject()
        o.put("id", p["id"])
        o.put("firstName", p["firstName"])
        o.put("lastName", p["lastName"])
        o.put("phoneNumber", p["phoneNumber"])
        o.put("usernames", JSONArray(p["usernames"] as List<*>))
        o.put("bio", p["bio"] ?: JSONObject.NULL)
        o.put("photoUri", p["photoUri"] ?: JSONObject.NULL)
        val b = p["birthdate"] as Map<*, *>?
        o.put("birthdate", if (b != null) JSONObject(b) else JSONObject.NULL)
        arr.put(o)
      }
    }
    try {
      file.writeText(arr.toString())
    } catch (t: Throwable) {
      Log.w(TAG, "Could not save import result", t)
    }
  }

  private fun loadResultFile() {
    val file = resultFile() ?: return
    if (!file.exists()) return
    try {
      val arr = JSONArray(file.readText())
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val usernames = o.optJSONArray("usernames")
        val b = o.optJSONObject("birthdate")
        people.add(
          mapOf(
            "id" to o.getDouble("id"),
            "firstName" to o.optString("firstName"),
            "lastName" to o.optString("lastName"),
            "phoneNumber" to o.optString("phoneNumber"),
            "usernames" to (0 until (usernames?.length() ?: 0)).map { usernames!!.getString(it) },
            "birthdate" to (if (b != null) mapOf("day" to b.getInt("day"), "month" to b.getInt("month"), "year" to b.getInt("year")) else null),
            "bio" to (if (o.isNull("bio")) null else o.optString("bio")),
            "photoUri" to (if (o.isNull("photoUri")) null else o.optString("photoUri"))
          )
        )
      }
    } catch (t: Throwable) {
      Log.w(TAG, "Could not read import result", t)
    }
  }

  // ---------- TDLib ----------

  private class TdError(val code: Int, message: String) : Exception(message)

  /** Синхронный запрос к TDLib (только из фонового потока). */
  private fun call(fn: TdApi.Function<*>, timeoutSeconds: Long = 60): TdApi.Object {
    val c = client ?: throw TdError(0, "Telegram не запущен")
    val result = AtomicReference<TdApi.Object?>(null)
    val latch = CountDownLatch(1)
    c.send(fn, Client.ResultHandler {
      result.set(it)
      latch.countDown()
    })
    if (!latch.await(timeoutSeconds, TimeUnit.SECONDS)) throw TdError(0, "Telegram не ответил за $timeoutSeconds с")
    val r = result.get() ?: throw TdError(0, "Пустой ответ Telegram")
    if (r is TdApi.Error) throw TdError(r.code, r.message)
    return r
  }

  private fun send(fn: TdApi.Function<*>, promise: Promise) {
    val c = client
    if (c == null) {
      promise.reject("TG_NO_CLIENT", "Telegram не запущен", null)
      return
    }
    try {
      c.send(fn, Client.ResultHandler { result ->
        if (result is TdApi.Error) promise.reject("TG_${result.code}", result.message, null)
        else promise.resolve(true)
      })
    } catch (t: Throwable) {
      promise.reject("TG_SEND", "${t.javaClass.simpleName}: ${t.message}", t)
    }
  }

  /** Выйти, если вход выполнен; иначе закрыть и стереть локальные данные незавершённого входа. */
  private fun closeSession() {
    val c = client ?: return
    val fn: TdApi.Function<*> = if (lastState["state"] == "ready") TdApi.LogOut() else TdApi.Destroy()
    try {
      c.send(fn, Client.ResultHandler { })
    } catch (t: Throwable) {
      Log.w(TAG, "closeSession failed", t)
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
      // Так сессия называется в Telegram → Настройки → Устройства: сразу понятно, что это за вход.
      params.deviceModel = "Друзья · импорт контактов"
      params.systemVersion = "Android ${Build.VERSION.RELEASE ?: ""}"
      params.applicationVersion = cfgAppVersion
      client?.send(params, Client.ResultHandler { result ->
        if (result is TdApi.Error) emitState(mapOf("state" to "error", "message" to result.message))
      })
    }

    when (st) {
      is TdApi.AuthorizationStateWaitPhoneNumber -> context?.let { TelegramImportService.show(it, "Вход в Telegram: введите номер в приложении «Друзья»", null) }
      is TdApi.AuthorizationStateWaitCode -> context?.let { TelegramImportService.show(it, "Вход в Telegram: введите код в приложении «Друзья»", null) }
      is TdApi.AuthorizationStateWaitPassword -> context?.let { TelegramImportService.show(it, "Вход в Telegram: введите облачный пароль", null) }
      is TdApi.AuthorizationStateReady -> {
        // Вход выполнен — сразу загружаем контакты (или выходим, если пользователь уже отменил).
        if (cancelRequested) closeSession() else startImport()
      }
      is TdApi.AuthorizationStateClosed -> {
        client = null
        context?.let { ctx ->
          TelegramImportService.stop(ctx)
          if (importState["phase"] == "done") {
            TelegramImportService.notifyDone(ctx, (importState["done"] as? Int) ?: 0)
          }
        }
      }
      else -> {}
    }

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
    try {
      sendEvent("onAuthState", info)
    } catch (t: Throwable) {
      // JS может быть приостановлен — состояние заберут через getState
    }
  }

  companion object {
    private const val TAG = "FriendsTelegram"
    private const val CRASH_FILE = "last-crash.txt"
    private const val TDLIB_LOG_FILE = "tdlib.log"
    private const val RESULT_FILE = "tg-import.json"
    private const val PENDING_AVATARS_DIR = "tg-avatars-pending"
    private const val AVATARS_DIR = "avatars"

    private fun readTail(file: File, maxChars: Int): String {
      if (!file.exists()) return ""
      return try {
        val text = file.readText()
        if (text.length > maxChars) text.substring(text.length - maxChars) else text
      } catch (t: Throwable) {
        "read error: ${t.message}"
      }
    }

    /** «Too Many Requests: retry after 17» / «FLOOD_WAIT_17» → 17. */
    private fun floodWaitSeconds(message: String?): Int? {
      val m = Regex("retry after (\\d+)|FLOOD_WAIT_(\\d+)", RegexOption.IGNORE_CASE).find(message ?: "") ?: return null
      return (m.groupValues[1].ifEmpty { m.groupValues[2] }).toIntOrNull()
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
}
