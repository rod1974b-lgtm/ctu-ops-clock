// src/lib/ctu-audio.ts — FULL DROP-IN REPLACEMENT FILE
export type AudioSettings = {
  enabled: boolean;
  volume: number;
  ambient: number;
  countdown: number;
  alarm: number;
  window: number;
  phone: boolean;
  snooze: number;
};

export const defaultAudio: AudioSettings = {
  enabled: true,
  volume: 0.8,
  ambient: 0.2,
  countdown: 0.8,
  alarm: 0.9,
  window: 10,
  phone: false,
  snooze: 5,
};

export type ZeroSoundType = "theme" | "voice" | "boom" | "alarm" | "ctu_beep" | "stinger";

/**
 * CTU Tactical Terminal Audio Engine.
 * Supports:
 * - Direct static helpers (unlockAudio, playChirp, playTick, startCountdownTakeoverAudio, triggerZeroSound, stopAllAudio)
 * - Countdown audio (/24 Alarm Countdown.mp3 / /countdown.mp3)
 * - At Zero theme playback (/24 At Zero theme.mp3)
 * - Haunting alarm loop & synthetic pulse fallbacks
 * - Clean stopAll() stopping all audio elements and synthetic intervals
 */
export class CTUAudio {
  private static sharedInstance: CTUAudio | null = null;

  public static get shared(): CTUAudio {
    if (!CTUAudio.sharedInstance) {
      CTUAudio.sharedInstance = new CTUAudio();
    }
    return CTUAudio.sharedInstance;
  }

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private alarmInterval: number | null = null;
  private countdownAudioElement: HTMLAudioElement | null = null;
  private zeroThemeAudioElement: HTMLAudioElement | null = null;
  private voiceAudioElement: HTMLAudioElement | null = null;
  private creditsAudioElement: HTMLAudioElement | null = null;
  private volume = defaultAudio.volume;

  constructor() {
    this.initContext();
  }

  private initContext(): void {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch (e) {
      console.warn("[CTU Audio] Failed to initialize AudioContext:", e);
    }
  }

  public async unlock(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      this.initContext();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {}
    }
  }

  public setMasterVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.countdownAudioElement) {
      this.countdownAudioElement.volume = this.volume;
    }
    if (this.zeroThemeAudioElement) {
      this.zeroThemeAudioElement.volume = this.volume;
    }
    if (this.creditsAudioElement) {
      this.creditsAudioElement.volume = this.volume;
    }
  }

  /**
   * CTU Interface Chirp on button tap
   */
  public playChirp(): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(2400, t + 0.04);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.05);
    } catch {}
  }

  /**
   * Exact v74 Digital Tick
   * isCrimson = false -> Amber CTU digital tick (800Hz / 1100Hz)
   * isCrimson = true  -> Crimson high urgency tick (2000Hz + 2400Hz)
   */
  public playTick(isCrimson = false, isUrgent = true): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (isCrimson) {
        osc1.type = "square";
        osc1.frequency.setValueAtTime(2000, t);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(2400, t);
      } else {
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(isUrgent ? 1100 : 800, t);
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(isUrgent ? 550 : 400, t);
      }

      const dur = isCrimson ? 0.08 : 0.05;
      gain.gain.setValueAtTime(isCrimson ? 0.6 : 0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(t);
      osc1.stop(t + dur + 0.01);
      osc2.start(t);
      osc2.stop(t + dur + 0.01);
    } catch {}
  }

  /**
   * Play Zero Payload based on user selection
   */
  public playZeroPayload(type: ZeroSoundType = "theme"): void {
    if (type === "theme" || type === "voice") {
      this.playZeroTheme();
      return;
    }

    if (!this.ctx || !this.masterGain) {
      this.playZeroTheme();
      return;
    }

    try {
      const t = this.ctx.currentTime;
      if (type === "boom") {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 1.8);
        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 1.9);
      } else if (type === "stinger") {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(1600, t + 1.4);
        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 1.5);
      } else if (type === "ctu_beep") {
        for (let i = 0; i < 4; i++) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const start = t + i * 0.16;
          osc.type = "sine";
          osc.frequency.setValueAtTime(1400, start);
          gain.gain.setValueAtTime(0.5, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(start);
          osc.stop(start + 0.09);
        }
      } else {
        this.startAlarmLoop();
      }
    } catch {
      this.playZeroTheme();
    }
  }

  /**
   * Start T-10 Countdown audio track
   */
  public startCountdownAudio(): void {
    if (typeof window === "undefined") return;

    if (!this.countdownAudioElement) {
      const audio = new Audio("/24 Alarm Countdown.mp3");
      audio.preload = "auto";
      audio.volume = this.volume;
      this.countdownAudioElement = audio;
    }

    try {
      this.countdownAudioElement.currentTime = 0;
      this.countdownAudioElement.play().catch(() => {
        // Fallback to synthetic ticks if MP3 fails to load or autoplay policy blocks
        this.playTick(true, true);
      });
    } catch {
      this.playTick(true, true);
    }
  }

  public stopCountdownAudio(): void {
    if (this.countdownAudioElement) {
      try {
        this.countdownAudioElement.pause();
        this.countdownAudioElement.currentTime = 0;
      } catch {}
    }
  }

  /**
   * Play At Zero theme (/24 At Zero theme.mp3)
   */
  public playZeroTheme(): void {
    if (typeof window === "undefined") return;

    if (!this.zeroThemeAudioElement) {
      const audio = new Audio("/24 At Zero theme.mp3");
      audio.preload = "auto";
      audio.volume = this.volume;
      audio.loop = false;
      this.zeroThemeAudioElement = audio;
    }

    try {
      this.zeroThemeAudioElement.currentTime = 0;
      this.zeroThemeAudioElement.play().catch(() => {
        this.startAlarmLoop();
      });
    } catch {
      this.startAlarmLoop();
    }
  }

  public stopZeroTheme(): void {
    if (this.zeroThemeAudioElement) {
      try {
        this.zeroThemeAudioElement.pause();
        this.zeroThemeAudioElement.currentTime = 0;
      } catch {}
    }
  }

  /**
   * Route compatibility for credits audio
   */
  public startCreditsAudio(): void {
    this.playZeroTheme();
  }

  public stopCreditsAudio(): void {
    this.stopZeroTheme();
  }

  /**
   * Synthetic Pulsing Alarm Loop fallback
   */
  public startAlarmLoop(): void {
    this.stopAlarmLoop();
    this.playAlarmPulse();
    this.alarmInterval = window.setInterval(() => {
      this.playAlarmPulse();
    }, 1200);
  }

  public stopAlarmLoop(): void {
    if (this.alarmInterval !== null) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  private playAlarmPulse(): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(440, t + 0.35);

      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.38);
    } catch {}
  }

  public stopAll(): void {
    this.stopCountdownAudio();
    this.stopZeroTheme();
    this.stopAlarmLoop();
    if (this.voiceAudioElement) {
      try {
        this.voiceAudioElement.pause();
        this.voiceAudioElement.currentTime = 0;
      } catch {}
    }
    if (this.creditsAudioElement) {
      try {
        this.creditsAudioElement.pause();
        this.creditsAudioElement.currentTime = 0;
      } catch {}
    }
  }

  // Static API convenience methods
  public static unlockAudio(): Promise<void> {
    return CTUAudio.shared.unlock();
  }

  public static playChirp(): void {
    CTUAudio.shared.playChirp();
  }

  public static startCountdownTakeoverAudio(_sec?: number): void {
    CTUAudio.shared.startCountdownAudio();
  }

  public static startCountdownAudio(): void {
    CTUAudio.shared.startCountdownAudio();
  }

  public static stopCountdownAudio(): void {
    CTUAudio.shared.stopCountdownAudio();
  }

  public static triggerZeroSound(type: ZeroSoundType = "theme"): void {
    CTUAudio.shared.playZeroPayload(type);
  }

  public static playZeroPayload(type: ZeroSoundType = "theme"): void {
    CTUAudio.shared.playZeroPayload(type);
  }

  public static playZeroTheme(): void {
    CTUAudio.shared.playZeroTheme();
  }

  public static stopZeroTheme(): void {
    CTUAudio.shared.stopZeroTheme();
  }

  public static startCreditsAudio(): void {
    CTUAudio.shared.startCreditsAudio();
  }

  public static stopCreditsAudio(): void {
    CTUAudio.shared.stopCreditsAudio();
  }

  public static playTick(isCrimson = false, isUrgent = true): void {
    CTUAudio.shared.playTick(isCrimson, isUrgent);
  }

  public static stopAllAudio(): void {
    CTUAudio.shared.stopAll();
  }

  public static stopAll(): void {
    CTUAudio.shared.stopAll();
  }
}
