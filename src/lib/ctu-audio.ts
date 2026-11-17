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
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch {
      // AudioContext unavailable
    }
  }

  public async unlock(): Promise<boolean> {
    if (!this.ctx) {
      this.initContext();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return true;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.countdownAudioElement) {
      this.countdownAudioElement.volume = this.volume;
    }
    if (this.zeroThemeAudioElement) {
      this.zeroThemeAudioElement.volume = this.volume;
    }
    if (this.voiceAudioElement) {
      this.voiceAudioElement.volume = this.volume;
    }
    if (this.creditsAudioElement) {
      this.creditsAudioElement.volume = this.volume;
    }
  }

  /**
   * Confirmation chirp when arming or starting a timer (1200Hz, 80ms)
   */
  public playChirp(): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch {}
  }

  /**
   * Countdown Audio Track:
   * Plays the 24 countdown audio track (/24 Alarm Countdown.mp3 with fallback to /countdown.mp3)
   */
  public startCountdownAudio(): void {
    this.stopCountdownAudio();
    if (typeof window === "undefined") return;

    try {
      if (!this.countdownAudioElement) {
        const audio = new Audio("/24 Alarm Countdown.mp3");
        audio.onerror = () => {
          if (this.countdownAudioElement) {
            this.countdownAudioElement.src = "/countdown.mp3";
            this.countdownAudioElement.load();
            this.countdownAudioElement.play().catch(() => {});
          }
        };
        this.countdownAudioElement = audio;
      }
      this.countdownAudioElement.volume = this.volume;
      this.countdownAudioElement.currentTime = 0;
      this.countdownAudioElement.play().catch(() => {
        try {
          const fallback = new Audio("/countdown.mp3");
          fallback.volume = this.volume;
          fallback.play().catch(() => {});
          this.countdownAudioElement = fallback;
        } catch {}
      });
    } catch {}
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
   * At Zero 24 Theme:
   * Plays the signature /24 At Zero theme.mp3 when a timer or alarm strikes zero
   */
  public playZeroTheme(): void {
    this.stopCountdownAudio();
    this.stopZeroTheme();
    if (typeof window === "undefined") return;

    try {
      if (!this.zeroThemeAudioElement) {
        this.zeroThemeAudioElement = new Audio("/24 At Zero theme.mp3");
        this.zeroThemeAudioElement.loop = true;
      }
      this.zeroThemeAudioElement.volume = this.volume;
      this.zeroThemeAudioElement.currentTime = 0;
      this.zeroThemeAudioElement.play().catch(() => {
        // Fallback to haunting dual-tone alarm
        this.startHauntingAlarmLoop();
      });
    } catch {
      this.startHauntingAlarmLoop();
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
      } else if (type === "alarm") {
        this.startHauntingAlarmLoop();
      } else {
        // ctu_beep signature triple pulse
        [0, 0.15, 0.3].forEach((offset) => {
          if (!this.ctx || !this.masterGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1400, t + offset);
          gain.gain.setValueAtTime(0.5, t + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.09);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(t + offset);
          osc.stop(t + offset + 0.1);
        });
      }
    } catch {
      this.playZeroTheme();
    }
  }

  /**
   * Dual-Tone Alarm Loop
   */
  public startHauntingAlarmLoop(): void {
    this.stopHauntingAlarmLoop();
    if (!this.ctx || !this.masterGain) return;

    const playDualTone = () => {
      if (!this.ctx || !this.masterGain) return;
      try {
        const c = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = "square";
        osc1.frequency.setValueAtTime(1000, c);
        gain1.gain.setValueAtTime(0.5, c);
        gain1.gain.exponentialRampToValueAtTime(0.001, c + 0.2);
        osc1.connect(gain1);
        gain1.connect(this.masterGain);
        osc1.start(c);
        osc1.stop(c + 0.22);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = "square";
        osc2.frequency.setValueAtTime(1500, c + 0.22);
        gain2.gain.setValueAtTime(0.5, c + 0.22);
        gain2.gain.exponentialRampToValueAtTime(0.001, c + 0.42);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(c + 0.22);
        osc2.stop(c + 0.44);
      } catch {}
    };

    playDualTone();
    this.alarmInterval = window.setInterval(playDualTone, 950);
  }

  public stopHauntingAlarmLoop(): void {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  public startVoiceLoop(): void {
    this.playZeroTheme();
  }

  public stopVoiceLoop(): void {
    this.stopZeroTheme();
  }

  public startCreditsAudio(): void {
    this.playZeroTheme();
  }

  public stopCreditsAudio(): void {
    this.stopZeroTheme();
  }

  public stopAll(): void {
    this.stopCountdownAudio();
    this.stopZeroTheme();
    this.stopHauntingAlarmLoop();
    this.stopVoiceLoop();
    this.stopCreditsAudio();
  }

  // --- Static Facade Methods ---

  public static async unlock(): Promise<boolean> {
    return CTUAudio.shared.unlock();
  }

  public static setVolume(vol: number): void {
    CTUAudio.shared.setVolume(vol);
  }

  public static playChirp(): void {
    CTUAudio.shared.playChirp();
  }

  public static startCountdownAudio(): void {
    CTUAudio.shared.startCountdownAudio();
  }

  public static stopCountdownAudio(): void {
    CTUAudio.shared.stopCountdownAudio();
  }

  public static playCountdownAudio(): void {
    CTUAudio.shared.startCountdownAudio();
  }

  public static playZeroTheme(): void {
    CTUAudio.shared.playZeroTheme();
  }

  public static stopZeroTheme(): void {
    CTUAudio.shared.stopZeroTheme();
  }

  public static playTick(isCrimson = false, isUrgent = true): void {
    CTUAudio.shared.playTick(isCrimson, isUrgent);
  }

  public static playZeroPayload(type: ZeroSoundType = "theme"): void {
    CTUAudio.shared.playZeroPayload(type);
  }

  public static startHauntingAlarm(): void {
    CTUAudio.shared.startHauntingAlarmLoop();
  }

  public static stopHauntingAlarm(): void {
    CTUAudio.shared.stopHauntingAlarmLoop();
  }

  public static startVoiceLoop(): void {
    CTUAudio.shared.playZeroTheme();
  }

  public static stopVoiceLoop(): void {
    CTUAudio.shared.stopZeroTheme();
  }

  public static startCreditsAudio(): void {
    CTUAudio.shared.playZeroTheme();
  }

  public static stopCreditsAudio(): void {
    CTUAudio.shared.stopZeroTheme();
  }

  public static stopAll(): void {
    CTUAudio.shared.stopAll();
  }

  public static stopCrisisAudio(): void {
    CTUAudio.shared.stopAll();
  }
}
