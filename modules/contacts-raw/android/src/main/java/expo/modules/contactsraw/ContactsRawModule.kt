package expo.modules.contactsraw

import android.content.ContentResolver
import android.database.Cursor
import android.provider.ContactsContract.Contacts
import android.provider.ContactsContract.Data
import android.provider.ContactsContract.RawContacts
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Читает телефонную книгу Android напрямую, без склейки контактов:
 * у каждого аккаунта (Google, Telegram, WhatsApp, Viber…) свои «сырые» контакты
 * и свои строки данных, в том числе собственные типы (mimetype) мессенджеров.
 * Только чтение, нужно разрешение READ_CONTACTS.
 */
class ContactsRawModule : Module() {
  private val resolver: ContentResolver
    get() = appContext.reactContext?.contentResolver ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ContactsRaw")

    /** Все аккаунты, у которых есть контакты, с количеством. */
    AsyncFunction("getAccounts") {
      val counts = LinkedHashMap<String, Int>()
      val names = LinkedHashMap<String, Pair<String, String>>()
      resolver.query(
        RawContacts.CONTENT_URI,
        arrayOf(RawContacts.ACCOUNT_TYPE, RawContacts.ACCOUNT_NAME),
        "${RawContacts.DELETED} = 0",
        null,
        null
      )?.use { c ->
        while (c.moveToNext()) {
          val type = c.getString(0) ?: ""
          val name = c.getString(1) ?: ""
          val key = "$type\u0000$name"
          names[key] = Pair(type, name)
          counts[key] = (counts[key] ?: 0) + 1
        }
      }
      names.map { (key, pair) ->
        mapOf("accountType" to pair.first, "accountName" to pair.second, "rawContacts" to (counts[key] ?: 0))
      }
    }

    /**
     * Сырые контакты аккаунта со всеми строками данных.
     * accountType: null — все аккаунты, "" — контакты без аккаунта (память телефона).
     */
    AsyncFunction("dump") { accountType: String?, limit: Int ->
      val selection = StringBuilder("${RawContacts.DELETED} = 0")
      val args = ArrayList<String>()
      when {
        accountType == null -> {}
        accountType.isEmpty() -> selection.append(" AND ${RawContacts.ACCOUNT_TYPE} IS NULL")
        else -> {
          selection.append(" AND ${RawContacts.ACCOUNT_TYPE} = ?")
          args.add(accountType)
        }
      }

      val fullProjection = arrayOf(
        RawContacts._ID, RawContacts.CONTACT_ID, RawContacts.ACCOUNT_TYPE, RawContacts.ACCOUNT_NAME,
        RawContacts.DISPLAY_NAME_PRIMARY, RawContacts.STARRED, RawContacts.SOURCE_ID,
        RawContacts.SYNC1, RawContacts.SYNC2, RawContacts.SYNC3, RawContacts.SYNC4
      )
      val minimalProjection = arrayOf(
        RawContacts._ID, RawContacts.CONTACT_ID, RawContacts.ACCOUNT_TYPE, RawContacts.ACCOUNT_NAME
      )

      val raws = ArrayList<MutableMap<String, Any>>()
      var total = 0
      val query = { projection: Array<String> ->
        resolver.query(
          RawContacts.CONTENT_URI, projection, selection.toString(), args.toTypedArray(), null
        )
      }
      val cursor = try {
        query(fullProjection)
      } catch (e: Exception) {
        query(minimalProjection)
      }
      cursor?.use { c ->
        total = c.count
        while (c.moveToNext() && raws.size < limit) {
          raws.add(rowToMap(c))
        }
      }

      // Строки данных (имя, телефоны, даты, профили мессенджеров…) — пачками по 500 id.
      val dataByRaw = HashMap<String, ArrayList<Map<String, Any>>>()
      val ids = raws.mapNotNull { idOf(it[RawContacts._ID]) }
      val dataProjection = arrayOf(
        Data.RAW_CONTACT_ID, Data.MIMETYPE,
        Data.DATA1, Data.DATA2, Data.DATA3, Data.DATA4, Data.DATA5, Data.DATA6, Data.DATA7,
        Data.DATA8, Data.DATA9, Data.DATA10, Data.DATA11, Data.DATA12, Data.DATA13, Data.DATA14,
        Data.SYNC1, Data.SYNC2, Data.SYNC3, Data.SYNC4
      )
      for (chunk in ids.chunked(500)) {
        val placeholders = chunk.joinToString(",") { "?" }
        val dataCursor = try {
          resolver.query(Data.CONTENT_URI, dataProjection, "${Data.RAW_CONTACT_ID} IN ($placeholders)", chunk.toTypedArray(), null)
        } catch (e: Exception) {
          resolver.query(Data.CONTENT_URI, dataProjection.copyOfRange(0, 16), "${Data.RAW_CONTACT_ID} IN ($placeholders)", chunk.toTypedArray(), null)
        }
        dataCursor?.use { c ->
          while (c.moveToNext()) {
            val row = rowToMap(c)
            val rawId = idOf(row.remove(Data.RAW_CONTACT_ID))
            if (rawId != null) dataByRaw.getOrPut(rawId) { ArrayList() }.add(row)
          }
        }
      }

      val items = raws.map { raw ->
        val id = idOf(raw[RawContacts._ID])
        mapOf("raw" to raw, "data" to (dataByRaw[id] ?: emptyList<Map<String, Any>>()))
      }
      mapOf("accountType" to (accountType ?: "*"), "total" to total, "items" to items)
    }

    /**
     * Строки данных нужных типов (телефоны, профили Telegram/WhatsApp/Viber) с привязкой
     * к склеенному контакту и аккаунту, из которого они пришли.
     */
    AsyncFunction("dataRows") { mimetypes: List<String> ->
      val accounts = HashMap<Long, Pair<String, String>>()
      resolver.query(
        RawContacts.CONTENT_URI,
        arrayOf(RawContacts._ID, RawContacts.ACCOUNT_NAME, RawContacts.SYNC1),
        "${RawContacts.DELETED} = 0",
        null,
        null
      )?.use { c ->
        while (c.moveToNext()) {
          accounts[c.getLong(0)] = Pair(c.getString(1) ?: "", c.getString(2) ?: "")
        }
      }

      val rows = ArrayList<Map<String, String>>()
      if (mimetypes.isEmpty()) return@AsyncFunction rows
      val placeholders = mimetypes.joinToString(",") { "?" }
      resolver.query(
        Data.CONTENT_URI,
        arrayOf(Data.CONTACT_ID, Data.RAW_CONTACT_ID, Data.MIMETYPE, Data.DATA1, Data.DATA4),
        "${Data.MIMETYPE} IN ($placeholders)",
        mimetypes.toTypedArray(),
        null
      )?.use { c ->
        while (c.moveToNext()) {
          val account = accounts[c.getLong(1)]
          rows.add(
            mapOf(
              "contactId" to c.getLong(0).toString(),
              "mimetype" to (c.getString(2) ?: ""),
              "data1" to (c.getString(3) ?: ""),
              "data4" to (c.getString(4) ?: ""),
              "accountName" to (account?.first ?: ""),
              "sync1" to (account?.second ?: "")
            )
          )
        }
      }
      rows
    }

    /** Фото склеенных контактов: content:// ссылки на полноразмерное фото и миниатюру. */
    AsyncFunction("contactPhotos") {
      val photos = ArrayList<Map<String, String>>()
      resolver.query(
        Contacts.CONTENT_URI,
        arrayOf(Contacts._ID, Contacts.PHOTO_URI, Contacts.PHOTO_THUMBNAIL_URI),
        "${Contacts.PHOTO_URI} IS NOT NULL",
        null,
        null
      )?.use { c ->
        while (c.moveToNext()) {
          val uri = c.getString(1)
          if (uri != null) {
            photos.add(mapOf("contactId" to c.getLong(0).toString(), "photoUri" to uri, "thumbUri" to (c.getString(2) ?: uri)))
          }
        }
      }
      photos
    }
  }

  private fun idOf(v: Any?): String? = (v as? Number)?.toLong()?.toString()

  /** Строка курсора → словарь без пустых значений; бинарные данные заменяем описанием. */
  private fun rowToMap(c: Cursor): MutableMap<String, Any> {
    val map = LinkedHashMap<String, Any>()
    for (i in 0 until c.columnCount) {
      val name = c.getColumnName(i)
      when (c.getType(i)) {
        Cursor.FIELD_TYPE_NULL -> {}
        Cursor.FIELD_TYPE_INTEGER -> map[name] = c.getLong(i).toDouble()
        Cursor.FIELD_TYPE_FLOAT -> map[name] = c.getDouble(i)
        Cursor.FIELD_TYPE_BLOB -> map[name] = "<blob ${c.getBlob(i)?.size ?: 0} bytes>"
        else -> {
          val s = c.getString(i)
          if (!s.isNullOrEmpty()) map[name] = s
        }
      }
    }
    return map
  }
}
