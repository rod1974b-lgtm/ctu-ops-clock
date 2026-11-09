// src/lib/background-alerts.ts
// Counter Terrorist Unit Background Alert & Notification Engine

export interface ScheduledDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
}

const STORAGE_KEY = "ctu_active_deadlines";

export class CTUBackgroundAlerts {
  /**
   * Check current Notification permission status safely
   */
  static getPermission(): NotificationPermission {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    return Notification.permission;
  }

  /**
   * Request system-level notification permissions from the user
   */
  static async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted" && "vibrate" in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      return permission;
    } catch {
      return "denied";
    }
  }

  /**
   * Schedule a countdown timer alert with the Service Worker
   */
  static scheduleTimerAlert(id: string, label: string, remainingSec: number): void {
    if (remainingSec <= 0) return;

    const targetEpochMs = Date.now() + remainingSec * 1000;
    this.saveDeadline({ id, label, targetEpochMs, type: "timer" });

    this.postToWorker({
      type: "SCHEDULE_ALERT",
      id,
      title: `[CTU CRISIS ALERT] ${label.toUpperCase()} REACHED ZERO`,
      body: `Operational deadline expired. Tactical override active.`,
      delayMs: remainingSec * 1000,
    });
  }

  /**
   * Schedule a daily alarm in Bangkok time (or local device timezone)
   */
  static scheduleAlarmAlert(id: string, label: string, hour: number, minute: number): void {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);

    // If target time already passed today, advance to tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const delayMs = target.getTime() - now.getTime();
    this.saveDeadline({ id, label, targetEpochMs: target.getTime(), type: "alarm" });

    this.postToWorker({
      type: "SCHEDULE_ALERT",
      id,
      title: `[CTU DAILY ALARM] ${label.toUpperCase()}`,
      body: `Scheduled operation time: ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}.`,
      delayMs,
    });
  }

  /**
   * Cancel an active scheduled alert
   */
  static cancelAlert(id: string): void {
    this.removeDeadline(id);
    this.postToWorker({
      type: "CANCEL_ALERT",
      id,
    });
  }

  /**
   * Check for expired deadlines upon app reopening (Catch-Up Takeover)
   */
  static checkExpiredDeadlines(): ScheduledDeadline | null {
    if (typeof window === "undefined") return null;
    const deadlines = this.getStoredDeadlines();
    const now = Date.now();

    for (const item of deadlines) {
      if (item.targetEpochMs <= now) {
        this.removeDeadline(item.id);
        return item;
      }
    }
    return null;
  }

  private static postToWorker(message: unknown): void {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage(message);
    }
  }

  private static getStoredDeadlines(): ScheduledDeadline[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private static saveDeadline(item: ScheduledDeadline): void {
    const deadlines = this.getStoredDeadlines().filter((d) => d.id !== item.id);
    deadlines.push(item);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines));
    } catch {
      // Storage unavailable
    }
  }

  private static removeDeadline(id: string): void {
    const deadlines = this.getStoredDeadlines().filter((d) => d.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines));
    } catch {
      // Storage unavailable
    }
  }
}
