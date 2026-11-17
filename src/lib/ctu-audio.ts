// src/lib/ctu-audio.ts — FULL REPLACEMENT FILE
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

export type ZeroSoundType = "voice" | "boom" | "alarm" | "ctu_beep" | "stinger";

/**
 * CTU Tactical Terminal Audio Engine.
 * Implements the exact synthesizer architecture from v74:
 * - ig(): Deep amber ticks and high-pitch crimson urgency ticks
 * - Bg(): Zero payloads (boom, alarm, ctu_beep, stinger)
 * - XB(): 24 Voice loop ("Events occur in real time...")
 * - br(): Haunting dual-oscillator alarm loop (1000Hz / 1500Hz)
 * - startCreditsAudio / stopCreditsAudio for credits sequence
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
    } catch {
      // AudioContext unavailable or restricted
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
   * Exact v74 Digital Tick (ig)
   * isCrimson = false -> Deep amber CTU digital tick (800Hz with sub-harmonic)
   * isCrimson = true  -> High-pitch urgency tick (2000Hz + 2400Hz sharp chirp)
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
   * Exact v74 At-Zero Sound Payloads (Bg)
   */
  public playZeroPayload(type: ZeroSoundType = "ctu_beep"): void {
    if (!this.ctx || !this.masterGain) return;

    if (type === "voice") {
      this.startVoiceLoop();
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

        const punch = this.ctx.createOscillator();
        const punchGain = this.ctx.createGain();
        punch.type = "triangle";
        punch.frequency.setValueAtTime(85, t);
        punch.frequency.exponentialRampToValueAtTime(20, t + 0.9);
        punchGain.gain.setValueAtTime(0.7, t);
        punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        punch.connect(punchGain);
        punchGain.connect(this.masterGain);
        punch.start(t);
        punch.stop(t + 1.0);
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
        // ctu_beep triple burst
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
    } catch {}
  }

  /**
   * Exact v74 Haunting Dual-Tone Alarm Loop (br)
   * Alternates 1000Hz and 1500Hz pulses every 950ms until stopped
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

  /**
   * 24 Theme Loop / Voice Loop (XB)
   */
  public startVoiceLoop(): void {
    this.stopVoiceLoop();
    try {
      if (!this.voiceAudioElement) {
        this.voiceAudioElement = new Audio("/24 At Zero theme.mp3");
        this.voiceAudioElement.loop = true;
      }
      this.voiceAudioElement.volume = this.volume;
      this.voiceAudioElement.currentTime = 0;
      this.voiceAudioElement.play().catch(() => {
        this.startHauntingAlarmLoop();
      });
    } catch {
      this.startHauntingAlarmLoop();
    }
  }

  public stopVoiceLoop(): void {
    if (this.voiceAudioElement) {
      this.voiceAudioElement.pause();
      this.voiceAudioElement.currentTime = 0;
    }
  }

  /**
   * Credits sequence audio playback
   */
  public startCreditsAudio(): void {
    this.stopCreditsAudio();
    try {
      if (!this.creditsAudioElement) {
        this.creditsAudioElement = new Audio("/24 At Zero theme.mp3");
        this.creditsAudioElement.loop = true;
      }
      this.creditsAudioElement.volume = this.volume;
      this.creditsAudioElement.currentTime = 0;
      this.creditsAudioElement.play().catch(() => {});
    } catch {}
  }

  public stopCreditsAudio(): void {
    if (this.creditsAudioElement) {
      this.creditsAudioElement.pause();
      this.creditsAudioElement.currentTime = 0;
    }
  }

  public stopAll(): void {
    this.stopHauntingAlarmLoop();
    this.stopVoiceLoop();
    this.stopCreditsAudio();
  }

  // Static Facade methods
  public static async unlock(): Promise<boolean> {
    return CTUAudio.shared.unlock();
  }

  public static setVolume(vol: number): void {
    CTUAudio.shared.setVolume(vol);
  }

  public static playChirp(): void {
    CTUAudio.shared.playChirp();
  }

  public static playTick(isCrimson = false, isUrgent = true): void {
    CTUAudio.shared.playTick(isCrimson, isUrgent);
  }

  public static playZeroPayload(type: ZeroSoundType = "ctu_beep"): void {
    CTUAudio.shared.playZeroPayload(type);
  }

  public static startHauntingAlarm(): void {
    CTUAudio.shared.startHauntingAlarmLoop();
  }

  public static stopHauntingAlarm(): void {
    CTUAudio.shared.stopHauntingAlarmLoop();
  }

  public static startVoiceLoop(): void {
    CTUAudio.shared.startVoiceLoop();
  }

  public static stopVoiceLoop(): void {
    CTUAudio.shared.stopVoiceLoop();
  }

  public static startCreditsAudio(): void {
    CTUAudio.shared.startCreditsAudio();
  }

  public static stopCreditsAudio(): void {
    CTUAudio.shared.stopCreditsAudio();
  }

  public static stopAll(): void {
    CTUAudio.shared.stopAll();
  }

  public static stopCrisisAudio(): void {
    CTUAudio.shared.stopAll();
  }
}
