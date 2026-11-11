// src/lib/background-alerts.ts
// Counter Terrorist Unit Background Alert, Floating Picture-in-Picture HUD, & Lockscreen Engine
import { nextAlarm } from "./mission-engine";

export interface ScheduledDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[] | undefined;
}

const STORAGE_KEY = "ctu_active_deadlines";

let pipVideo: HTMLVideoElement | null = null;
let pipCanvas: HTMLCanvasElement | null = null;
let pipCtx: CanvasRenderingContext2D | null = null;
let isPipRunning = false;

export class CTUBackgroundAlerts {
  /**
   * Check current Notification permission status
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
      title: `[CTU CRISIS ALERT] ${label.toUpperCase()} AT ZERO`,
      body: `Operational deadline expired. Tactical override active.`,
      delayMs: remainingSec * 1000,
      targetEpochMs,
    });
  }

  /**
   * Schedule a weekly recurring alarm in Bangkok time
   */
  static scheduleAlarmAlert(
    id: string,
    label: string,
    hour: number,
    minute: number,
    days?: number[]
  ): void {
    const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const targetEpochMs = nextAlarm(timeStr, Date.now(), days);
    const delayMs = Math.max(0, targetEpochMs - Date.now());

    this.saveDeadline({ id, label, targetEpochMs, type: "alarm", days });

    this.postToWorker({
      type: "SCHEDULE_ALERT",
      id,
      title: `[CTU WEEKLY ALARM] ${label.toUpperCase()}`,
      body: `Scheduled operation time: ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} BKK.`,
      delayMs,
      targetEpochMs,
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
   * Update the persistent lockscreen notification status card
   */
  static updateLockscreenHUD(opts: {
    bkkTime: string;
    timerLabel?: string;
    remainingSec?: number;
    nextAlarmText?: string;
    threatLevel?: string;
  }): void {
    let body = `BKK ${opts.bkkTime} | Status: ${opts.threatLevel || "WATCH LEVEL 3"}`;

    if (opts.timerLabel && typeof opts.remainingSec === "number") {
      const hrs = Math.floor(opts.remainingSec / 3600);
      const mins = Math.floor((opts.remainingSec % 3600) / 60);
      const secs = opts.remainingSec % 60;
      const timeStr = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      body = `${opts.timerLabel}: ${timeStr}\n${body}`;
    }

    if (opts.nextAlarmText) {
      body += `\nNext: ${opts.nextAlarmText}`;
    }

    this.postToWorker({
      type: "UPDATE_LOCKSCREEN_HUD",
      title: `[CTU TACTICAL HUD] LIVE MONITOR`,
      body,
    });
  }

  /**
   * Remove the persistent lockscreen notification status card
   */
  static clearLockscreenHUD(): void {
    this.postToWorker({
      type: "CLEAR_LOCKSCREEN_HUD",
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

  /**
   * Launch the always-on-top Picture-in-Picture Tactical Mini-HUD
   */
  static async startFloatingHUD(opts: {
    bkkTime: string;
    label: string;
    remainingSec: number;
    threatLevel?: string;
  }): Promise<boolean> {
    if (typeof window === "undefined" || !("document" in window)) return false;

    try {
      if (!pipCanvas) {
        pipCanvas = document.createElement("canvas");
        pipCanvas.width = 380;
        pipCanvas.height = 160;
        pipCtx = pipCanvas.getContext("2d");
      }

      this.renderCanvasHUD(opts);

      if (!pipVideo) {
        pipVideo = document.createElement("video");
        pipVideo.muted = true;
        pipVideo.playsInline = true;
        pipVideo.autoplay = true;
        pipVideo.style.display = "none";
        document.body.appendChild(pipVideo);

        pipVideo.addEventListener("leavepictureinpicture", () => {
          isPipRunning = false;
        });
      }

      const stream = (pipCanvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(10);
      pipVideo.srcObject = stream;
      await pipVideo.play();
      await pipVideo.requestPictureInPicture();
      isPipRunning = true;
      return true;
    } catch {
      isPipRunning = false;
      return false;
    }
  }

  /**
   * Update the live frame inside the floating Picture-in-Picture window
   */
  static updateFloatingHUD(opts: {
    bkkTime: string;
    label: string;
    remainingSec: number;
    threatLevel?: string;
  }): void {
    if (!isPipRunning || !pipCanvas || !pipCtx) return;
    this.renderCanvasHUD(opts);
  }

  /**
   * Close the floating Picture-in-Picture window
   */
  static async stopFloatingHUD(): Promise<void> {
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // Ignored
      }
    }
    isPipRunning = false;
  }

  static isFloatingHUDActive(): boolean {
    return isPipRunning && !!document.pictureInPictureElement;
  }

  private static renderCanvasHUD(opts: {
    bkkTime: string;
    label: string;
    remainingSec: number;
    threatLevel?: string;
  }) {
    if (!pipCanvas || !pipCtx) return;
    const ctx = pipCtx;
    const w = pipCanvas.width;
    const h = pipCanvas.height;
    const isCrisis = opts.remainingSec <= 10 && opts.remainingSec > 0;

    ctx.fillStyle = "#020202";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isCrisis ? "#ef4444" : "#ffcc00";
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    ctx.fillStyle = isCrisis ? "#7f1d1d" : "#1a1603";
    ctx.fillRect(5, 5, w - 10, 26);

    ctx.fillStyle = isCrisis ? "#fca5a5" : "#ffcc00";
    ctx.font = "bold 13px monospace";
    ctx.fillText("CTU TACTICAL HUD", 12, 23);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`BKK ${opts.bkkTime}`, w - 95, 23);

    ctx.fillStyle = "#a3a3a3";
    ctx.font = "11px monospace";
    ctx.fillText(opts.label.toUpperCase().slice(0, 26), 12, 48);

    const hrs = Math.floor(opts.remainingSec / 3600);
    const mins = Math.floor((opts.remainingSec % 3600) / 60);
    const secs = opts.remainingSec % 60;
    const timeStr = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    ctx.fillStyle = isCrisis ? "#ef4444" : "#ffcc00";
    ctx.font = "bold 44px monospace";
    ctx.fillText(timeStr, 12, 100);

    ctx.fillStyle = isCrisis ? "#ef4444" : "#ffcc00";
    ctx.font = "bold 11px monospace";
    const threat = isCrisis ? "CRISIS LEVEL 1 (COUNTDOWN)" : opts.threatLevel || "WATCH LEVEL 3";
    ctx.fillText(`STATUS: ${threat}`, 12, 132);

    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 2);
    }
  }

  private static postToWorker(message: unknown): void {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(message);
      } else {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage(message);
        });
      }
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
