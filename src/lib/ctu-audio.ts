// src/lib/ctu-audio.ts
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
  volume: 0.85,
  ambient: 28,
  countdown: 85,
  alarm: 85,
  window: 10,
  phone: false,
  snooze: 5,
};

export type ZeroSoundType = "voice" | "boom" | "alarm" | "ctu_beep" | "stinger";

/**
 * Browser audio engine for the CTU tactical terminal.
 * Provides both singleton instance methods and static facade methods for zero-effort calls.
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
  private zeroAudio: HTMLAudioElement | null = null;
  private creditsAudio: HTMLAudioElement | null = null;
  private volume = defaultAudio.volume;

  constructor() {
    this.initContext();
    this.initMedia();
  }

  private initContext() {
    if (typeof window === "undefined" || this.ctx) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // AudioContext unavailable
    }
  }

  private initMedia() {
    if (typeof window === "undefined") return;
    try {
      this.zeroAudio = new Audio("/24 At Zero theme.mp3");
      this.zeroAudio.loop = true;
      this.zeroAudio.volume = this.volume;
    } catch {
      this.zeroAudio = null;
    }

    try {
      this.creditsAudio = new Audio("/24 At Zero theme.mp3");
      this.creditsAudio.loop = true;
      this.creditsAudio.volume = this.volume;
    } catch {
      this.creditsAudio = null;
    }
  }

  public resumeContext(): void {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.zeroAudio) {
      this.zeroAudio.volume = this.volume;
    }
    if (this.creditsAudio) {
      this.creditsAudio.volume = this.volume;
    }
  }

  public playCountdown(intensity: 1 | 2 | 3 = 1): void {
    if (typeof window === "undefined") return;
    try {
      for (let i = 0; i < intensity; i++) {
        setTimeout(() => {
          const track = new Audio("/24 Alarm Countdown.mp3");
          track.volume = Math.min(1, this.volume * 0.95);
          track.play().catch(() => {});
        }, i * 70);
      }
    } catch {
      this.beep(880, 0.08);
    }
  }

  public stopCountdown(): void {
    // Single-shot sounds finish cleanly
  }

  public playZeroSound(soundType: ZeroSoundType = "voice"): void {
    this.resumeContext();
    if (this.zeroAudio) {
      this.zeroAudio.currentTime = 0;
      this.zeroAudio.play().catch(() => {});
    }

    if (soundType === "voice" && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance("Zero");
        utter.rate = 0.9;
        utter.pitch = 0.8;
        utter.volume = this.volume;
        window.speechSynthesis.speak(utter);
      } catch {
        // Speech synthesis fallback
      }
    } else if (soundType === "boom") {
      this.playBoom();
    } else if (soundType === "alarm") {
      this.playAlarmKlaxon();
    } else if (soundType === "ctu_beep") {
      this.beep(1200, 0.15);
    } else if (soundType === "stinger") {
      this.playStingerChord();
    }
  }

  public stopCrisis(): void {
    if (this.zeroAudio) {
      this.zeroAudio.pause();
      this.zeroAudio.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public startCredits(): void {
    if (!this.creditsAudio) this.initMedia();
    if (this.creditsAudio) {
      this.creditsAudio.currentTime = 0;
      this.creditsAudio.play().catch(() => {});
    }
  }

  public stopCredits(): void {
    if (this.creditsAudio) {
      this.creditsAudio.pause();
      this.creditsAudio.currentTime = 0;
    }
  }

  public tick(): void {
    this.beep(1000, 0.03, 0.15);
  }

  public chirp(): void {
    this.beep(1760, 0.04, 0.2);
  }

  public beep(freq = 880, duration = 0.05, relativeVol = 0.3): void {
    this.resumeContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(this.volume * relativeVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {}
  }

  private playBoom(): void {
    this.resumeContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(this.volume * 0.8, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 1.2);
    } catch {}
  }

  private playAlarmKlaxon(): void {
    this.resumeContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(700, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(950, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(this.volume * 0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {}
  }

  private playStingerChord(): void {
    this.resumeContext();
    if (!this.ctx || !this.masterGain) return;
    const freqs = [220, 277.18, 329.63, 415.3];
    for (const f of freqs) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(f, this.ctx.currentTime);
        gain.gain.setValueAtTime(this.volume * 0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.8);
      } catch {}
    }
  }

  public stopAll(): void {
    this.stopCrisis();
    this.stopCredits();
    this.stopCountdown();
  }

  // --- Static Facade Methods ---

  public static unlock(): void {
    CTUAudio.shared.resumeContext();
  }

  public static unlockAudio(): void {
    CTUAudio.shared.resumeContext();
  }

  public static setMasterVolume(v: number): void {
    CTUAudio.shared.setVolume(v);
  }

  public static setVolume(v: number): void {
    CTUAudio.shared.setVolume(v);
  }

  public static playCountdownSound(intensity: 1 | 2 | 3 = 1): void {
    CTUAudio.shared.playCountdown(intensity);
  }

  public static playCountdown(intensity: 1 | 2 | 3 = 1): void {
    CTUAudio.shared.playCountdown(intensity);
  }

  public static stopCountdownSound(): void {
    CTUAudio.shared.stopCountdown();
  }

  public static triggerZeroSound(sound?: ZeroSoundType): void {
    CTUAudio.shared.playZeroSound(sound);
  }

  public static playZeroSound(sound?: ZeroSoundType): void {
    CTUAudio.shared.playZeroSound(sound);
  }

  public static stopCrisisAudio(): void {
    CTUAudio.shared.stopCrisis();
  }

  public static playCreditsAudio(): void {
    CTUAudio.shared.startCredits();
  }

  public static startCreditsAudio(): void {
    CTUAudio.shared.startCredits();
  }

  public static stopCreditsAudio(): void {
    CTUAudio.shared.stopCredits();
  }

  public static tick(): void {
    CTUAudio.shared.tick();
  }

  public static chirp(): void {
    CTUAudio.shared.chirp();
  }

  public static beep(freq?: number, duration?: number): void {
    CTUAudio.shared.beep(freq, duration);
  }

  public static stopAll(): void {
    CTUAudio.shared.stopAll();
  }
}
