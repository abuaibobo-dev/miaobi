package expo.modules.termuxcommand

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TermuxCommandModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

  override fun definition() = ModuleDefinition {
    Name("TermuxCommand")

    AsyncFunction("run") { commandPath: String, arguments: List<String>, promise: Promise ->
      try {
        val intent = Intent("com.termux.RUN_COMMAND").apply {
          component = ComponentName("com.termux", "com.termux.app.RunCommandService")
          putExtra("com.termux.RUN_COMMAND_PATH", commandPath)
          putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arguments.toTypedArray())
          putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home")
          putExtra("com.termux.RUN_COMMAND_RUNNER", "app-shell")
          putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
          putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "MiaoBi start Ollama")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("TERMUX_RUN_COMMAND_FAILED", error.message ?: "Unable to run Termux command", error)
      }
    }
  }
}
