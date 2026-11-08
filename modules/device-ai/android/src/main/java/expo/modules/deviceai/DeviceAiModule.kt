package expo.modules.deviceai

import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Content
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerationConfig
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ModelConfig
import com.google.mlkit.genai.prompt.ModelPreference
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.TextPart
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Встроенный в телефон ИИ (Gemini Nano через AICore): работает без интернета, данные не покидают устройство.
 * Есть только на части телефонов. Модель сами не скачиваем — она большая; если её нет, приложение
 * идёт к следующей ступени. Любая ошибка — «недоступен», а не падение.
 */
class DeviceAiModule : Module() {
  private fun client(): GenerativeModel = Generation.getClient(GenerationConfig.Builder().apply {
    modelConfig = ModelConfig.Builder().apply {
      releaseStage = ModelReleaseStage.STABLE
      preference = ModelPreference.FULL
    }.build()
  }.build())

  override fun definition() = ModuleDefinition {
    Name("DeviceAi")

    AsyncFunction("status") Coroutine { ->
      try {
        val model = client()
        try {
          when (model.checkStatus()) {
            FeatureStatus.AVAILABLE -> "available"
            FeatureStatus.DOWNLOADABLE -> "downloadable"
            FeatureStatus.DOWNLOADING -> "downloading"
            else -> "unavailable"
          }
        } finally {
          model.close()
        }
      } catch (e: Throwable) {
        "unavailable"
      }
    }

    AsyncFunction("generate") Coroutine { prompt: String ->
      val model = client()
      try {
        val content = Content.Builder().addPart(TextPart(prompt)).build()
        val request = GenerateContentRequest.Builder(content).apply {
          temperature = 0f
          maxOutputTokens = 16
        }.build()
        model.generateContent(request).candidates.firstOrNull()?.text ?: ""
      } finally {
        model.close()
      }
    }
  }
}
