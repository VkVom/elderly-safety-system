package expo.modules.insightcall

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Phone-call primitives for the emergency auto-call chain:
 *  - placeCall(number): places a real SIM call (ACTION_CALL, CALL_PHONE).
 *  - answerCall(): answers the ringing call now (ANSWER_PHONE_CALLS).
 *  - armAutoAnswer(windowMs): while armed, any incoming ringing call within the
 *    window is answered automatically; then disarms. Used by the elder's phone
 *    during an active episode so the caretaker's callback connects even if the
 *    elder cannot tap. Note: incoming-number filtering needs READ_CALL_LOG, so
 *    v1 arms over a short, episode-scoped window instead.
 *
 * acceptRingingCall is deprecated (API 29) but remains the only third-party
 * path; it works on many devices and silently no-ops where restricted.
 */
class InsightCallModule : Module() {
  private var listener: PhoneStateListener? = null
  private var disarmHandler: Handler? = null

  override fun definition() = ModuleDefinition {
    Name("InsightCall")

    Function("canPlaceCall") {
      granted(Manifest.permission.CALL_PHONE)
    }

    Function("canAnswerCall") {
      granted(Manifest.permission.ANSWER_PHONE_CALLS)
    }

    AsyncFunction("placeCall") { number: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      if (number.isBlank() || !granted(Manifest.permission.CALL_PHONE)) {
        return@AsyncFunction false
      }
      try {
        val uri = Uri.fromParts("tel", number, null)
        val intent = Intent(Intent.ACTION_CALL, uri)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("answerCall") {
      answerNow() ?: false
    }

    AsyncFunction("armAutoAnswer") { windowMs: Int ->
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      if (!granted(Manifest.permission.READ_PHONE_STATE)) return@AsyncFunction false
      val tm = ctx.getSystemService(TelephonyManager::class.java)
        ?: return@AsyncFunction false
      disarm()
      @Suppress("DEPRECATION")
      val l = object : PhoneStateListener() {
        @Deprecated("Deprecated in Java")
        override fun onCallStateChanged(state: Int, phoneNumber: String?) {
          if (state == TelephonyManager.CALL_STATE_RINGING) {
            answerNow()
          }
        }
      }
      listener = l
      try {
        @Suppress("DEPRECATION")
        tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
      } catch (e: Exception) {
        listener = null
        return@AsyncFunction false
      }
      val h = Handler(Looper.getMainLooper())
      disarmHandler = h
      h.postDelayed({ disarm() }, windowMs.coerceAtLeast(1000).toLong())
      true
    }

    AsyncFunction("disarmAutoAnswer") {
      disarm()
      true
    }
  }

  private fun granted(permission: String): Boolean {
    val ctx = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(ctx, permission) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun answerNow(): Boolean? {
    val ctx = appContext.reactContext ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    if (!granted(Manifest.permission.ANSWER_PHONE_CALLS)) return false
    return try {
      @Suppress("DEPRECATION")
      val tm = ctx.getSystemService(TelecomManager::class.java) ?: return false
      @Suppress("DEPRECATION")
      tm.acceptRingingCall()
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun disarm() {
    disarmHandler?.removeCallbacksAndMessages(null)
    disarmHandler = null
    val ctx = appContext.reactContext
    val l = listener
    if (ctx != null && l != null) {
      try {
        val tm = ctx.getSystemService(TelephonyManager::class.java)
        @Suppress("DEPRECATION")
        tm?.listen(l, PhoneStateListener.LISTEN_NONE)
      } catch (e: Exception) {
        // ignore
      }
    }
    listener = null
  }
}
