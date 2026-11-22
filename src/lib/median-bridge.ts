// src/lib/median-bridge.ts — FULL DROP-IN REPLACEMENT FILE (MEDIAN JS BRIDGE HELPER)

/**
 * Detects whether the app is executing inside the Median Android APK
 */
export function isMedianApp(): boolean {
  if (typeof window === "undefined") return false;

  const ua = (window.navigator?.userAgent || "").toLowerCase();
  if (ua.includes("median") || ua.includes("gonative")) {
    return true;
  }

  const win = window as any;
  if (win.median?.isMedianApp || win.gonative) {
    return true;
  }

  return false;
}

/**
 * Requests native Android notification permission via Median's OneSignal bridge.
 * Returns true if granted/registered, false if denied/unavailable.
 */
export async function requestMedianOneSignalPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const win = window as any;
  const median = win.median || win.gonative;

  if (!median) {
    console.warn("[CTU/Median] Median JavaScript Bridge not found on window object.");
    return false;
  }

  try {
    // Enable foreground notifications so alerts appear even when viewing the terminal
    if (typeof median.onesignal?.enableForegroundNotifications === "function") {
      median.onesignal.enableForegroundNotifications(true);
    }

    // 1. OneSignal prompt with user response if available
    if (typeof median.onesignal?.promptForPushNotificationsWithUserResponse === "function") {
      return new Promise<boolean>((resolve) => {
        median.onesignal.promptForPushNotificationsWithUserResponse((response: any) => {
          const granted = response === true || response?.accepted === true;
          if (granted) {
            setMedianAlertsArmed(true);
          }
          resolve(granted);
        });
      });
    }

    // 2. Standard Median OneSignal registration trigger
    if (typeof median.onesignal?.register === "function") {
      median.onesignal.register();
      setMedianAlertsArmed(true);
      return true;
    }

    // 3. OneSignal user privacy consent if configured
    if (typeof median.onesignal?.userPrivacyConsent?.grant === "function") {
      median.onesignal.userPrivacyConsent.grant();
    }

    return true;
  } catch (err) {
    console.warn("[CTU/Median] Failed to trigger OneSignal permission prompt:", err);
    return false;
  }
}

/**
 * Checks whether OneSignal permissions have been armed previously
 */
export function isMedianAlertsArmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("ctu_median_onesignal_armed") === "true";
  } catch {
    return false;
  }
}

/**
 * Marks Median OneSignal alert state
 */
export function setMedianAlertsArmed(armed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (armed) {
      localStorage.setItem("ctu_median_onesignal_armed", "true");
    } else {
      localStorage.removeItem("ctu_median_onesignal_armed");
    }
  } catch {}
}

/**
 * Commands Android hardware to keep screen illuminated indefinitely
 */
export function keepScreenOnMedian(keepAwake: boolean): void {
  if (typeof window === "undefined") return;
  const win = window as any;
  const median = win.median || win.gonative;
  if (!median?.screen) return;

  try {
    if (keepAwake) {
      if (typeof median.screen.keepScreenOn === "function") {
        median.screen.keepScreenOn();
      }
    } else {
      if (typeof median.screen.keepScreenNormal === "function") {
        median.screen.keepScreenNormal();
      }
    }
  } catch (err) {
    console.warn("[CTU/Median] Failed to toggle screen timeout:", err);
  }
}

/**
 * Starts Median Native Media Player background audio track
 * Surfaces live countdown status directly to Android lock screen and notification media widget
 */
export async function playMedianBackgroundTrack(title: string, subtitle: string, audioUrl: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const win = window as any;
  const median = win.median || win.gonative;
  if (!median?.backgroundMedia?.playTrack) return false;

  try {
    const track = {
      url: audioUrl,
      title: title,
      album: "CTU Tactical Ops",
      artist: subtitle,
    };
    const res = await median.backgroundMedia.playTrack(track);
    return res?.success === true;
  } catch (err) {
    console.warn("[CTU/Median] Background media player error:", err);
    return false;
  }
}

/**
 * Stops Median native background media player
 */
export function stopMedianBackgroundTrack(): void {
  if (typeof window === "undefined") return;
  const win = window as any;
  const median = win.median || win.gonative;
  try {
    if (typeof median?.backgroundMedia?.stop === "function") {
      median.backgroundMedia.stop();
    }
  } catch {}
}

/**
 * Sends a native test notification and vibration using the Median bridge
 */
export async function sendMedianTestAlert(title: string, message: string): Promise<void> {
  if (typeof window === "undefined") return;

  const win = window as any;
  const median = win.median || win.gonative;

  // 1. Hardware vibration via Median Android bridge
  try {
    if (typeof median?.android?.vibrate === "function") {
      median.android.vibrate({ pattern: [200, 100, 200, 100, 400] });
    } else if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  } catch {}

  // 2. Native Notification via Median Local Notification plugin
  try {
    if (typeof median?.notifications?.create === "function") {
      median.notifications.create({
        title,
        message,
      });
      return;
    }
  } catch {}

  // 3. Fallback to OneSignal local notification if supported
  try {
    if (typeof median?.onesignal?.createNotification === "function") {
      median.onesignal.createNotification({
        title,
        message,
      });
    }
  } catch {}
}
