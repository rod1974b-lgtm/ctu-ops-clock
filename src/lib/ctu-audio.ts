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
  silentClock: boolean;
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
  silentClock: false,
};

export type ZeroSoundType = "theme" | "cisco_ring" | "silent_clock" | "voice" | "boom" | "alarm" | "ctu_beep" | "stinger";

/**
 * CTU Tactical Terminal Audio Engine.
 * Supports:
 * - Direct static helpers (unlockAudio, playChirp, playTick, playBroadcastCadence, playCiscoRing, startCountdownTakeoverAudio, triggerZeroSound, stopAllAudio)
 * - Countdown audio (/24 Alarm Countdown.mp3 / /countdown.mp3)
 * - At Zero theme playback (/24 At Zero theme.mp3)
 * - Authentic 4-beep television broadcast cadence (3x 800Hz ticks + 1x 1000Hz sync chirp)
 * - Cisco 7960 CTU desk phone ringtone synthesizer
 * - Silent Clock tribute protocol
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
  private ciscoInterval: number | null = null;
  private countdownAudioElement: HTMLAudioElement | null = null;
  private zeroThemeAudioElement: HTMLAudioElement | null = null;
  private voiceAudioElement: HTMLAudioElement | null = null;
  private creditsAudioElement: HTMLAudioElement | null = null;
  private volume = defaultAudio.volume;
  private silentClockActive = false;

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

  public setSilentClock(enabled: boolean): void {
    this.silentClockActive = enabled;
  }

  public isSilentClock(): boolean {
    return this.silentClockActive;
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
    if (this.silentClockActive) return;
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
   * Iconic 24 broadcast 4-beep clock sequence:
   * 3x uniform 800 Hz pulses + 1x high-pitch 1000 Hz sync beep
   */
  public playBroadcastCadence(): void {
    if (this.silentClockActive) return;
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = this.ctx.currentTime;
      const intervals = [0.0, 0.22, 0.44, 0.66];
      intervals.forEach((offset, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const isLastBeep = idx === 3;
        const freq = isLastBeep ? 1000 : 800;
        const dur = isLastBeep ? 0.12 : 0.07;
        const startTime = t + offset;

        osc.type = isLastBeep ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(isLastBeep ? 0.6 : 0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + dur + 0.01);
      });
    } catch {}
  }

  /**
   * Synthesizes the authentic CTU Cisco 7960 VoIP Desk Phone Ringtone
   * Distinctive dual alternating tones (440Hz / 480Hz modulated with high chirp)
   */
  public playCiscoRing(): void {
    if (this.silentClockActive) return;
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = this.ctx.currentTime;
      // Pair 1
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1336, t);
      osc1.frequency.setValueAtTime(1477, t + 0.15);

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(941, t);
      osc2.frequency.setValueAtTime(852, t + 0.15);

      gain.gain.setValueAtTime(0.5, t);
      gain.gain.setValueAtTime(0.5, t + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(t);
      osc1.stop(t + 0.4);
      osc2.start(t);
      osc2.stop(t + 0.4);
    } catch {}
  }

  public startCiscoRingLoop(): void {
    this.stopCiscoRingLoop();
    this.playCiscoRing();
    this.ciscoInterval = window.setInterval(() => {
      this.playCiscoRing();
    }, 2200);
  }

  public stopCiscoRingLoop(): void {
    if (this.ciscoInterval !== null) {
      clearInterval(this.ciscoInterval);
      this.ciscoInterval = null;
    }
  }

  /**
   * Play Zero Payload based on user selection
   */
  public playZeroPayload(type: ZeroSoundType = "theme"): void {
    if (this.silentClockActive || type === "silent_clock") {
      // Silent Clock tribute mode: full silence, stop ongoing loops
      this.stopAll();
      return;
    }

    if (type === "cisco_ring") {
      this.startCiscoRingLoop();
      return;
    }

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
        this.playBroadcastCadence();
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
    if (this.silentClockActive) return;
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
    if (this.silentClockActive) return;
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

  public startCreditsAudio(): void {
    this.playZeroTheme();
  }

  public stopCreditsAudio(): void {
    this.stopZeroTheme();
  }

  public startAlarmLoop(): void {
    if (this.silentClockActive) return;
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
    if (this.silentClockActive) return;
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
    this.stopCiscoRingLoop();
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

  public static playBroadcastCadence(): void {
    CTUAudio.shared.playBroadcastCadence();
  }

  public static playCiscoRing(): void {
    CTUAudio.shared.playCiscoRing();
  }

  public static stopAllAudio(): void {
    CTUAudio.shared.stopAll();
  }

  public static stopAll(): void {
    CTUAudio.shared.stopAll();
  }
}
