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
 * CTU Tactical Terminal Audio Engine.
 * Implements the exact synthesizer architecture from v74:
 * - ig(): Deep amber ticks and high-pitch crimson urgency ticks
 * - Bg(): Zero payloads (boom, alarm, ctu_beep, stinger)
 * - XB(): 24 Voice loop ("Events occur in real time...")
 * - br(): Haunting dual-oscillator alarm loop (1000Hz / 1500Hz)
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
  private voiceSource: AudioBufferSourceNode | null = null;
  private voiceAudioElement: HTMLAudioElement | null = null;
  private isAlarmLooping = false;
  private isVoiceLooping = false;
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
    return !!this.ctx && this.ctx.state === "running";
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Confirmation chirp when arming or starting a timer (1200Hz, 80ms)
   */
  public playChirp(): void {
    if (!this.ctx || !this.masterGain) return;
    this.unlock();
    const t = this.ctx.currentTime + 0.01;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  /**
   * v74 ig() Tick Synthesizer:
   * isCrimson = false -> Deep amber CTU digital tick (850Hz + 420Hz harmonic)
   * isCrimson = true  -> High-pitch urgent crimson tick (1400Hz + 1900Hz harmonic)
   */
  public playTick(isCrimson = false, isUrgent = true): void {
    if (!this.ctx || !this.masterGain) return;
    this.unlock();

    const t = this.ctx.currentTime + 0.01;
    const baseFreq = isCrimson ? 1400 : 850;
    const harmonicFreq = isCrimson ? 1900 : 420;
    const dur = isCrimson ? 0.045 : 0.055;
    const gainLevel = isUrgent ? (isCrimson ? 0.95 : 0.85) : 0.45;

    // Primary pulse
    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(baseFreq, t);
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.linearRampToValueAtTime(gainLevel * this.volume, t + 0.005);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc1.connect(g1);
    g1.connect(this.masterGain);
    osc1.start(t);
    osc1.stop(t + dur + 0.01);

    // Harmonic pulse
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(harmonicFreq, t);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(gainLevel * 0.45 * this.volume, t + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc2.connect(g2);
    g2.connect(this.masterGain);
    osc2.start(t);
    osc2.stop(t + dur + 0.01);
  }

  /**
   * v74 Bg() Zero Audio Payloads:
   * "boom", "alarm", "ctu_beep", "stinger"
   */
  public playZeroPayload(type: ZeroSoundType = "ctu_beep"): void {
    if (type === "voice") {
      this.startVoiceLoop();
      return;
    }

    if (!this.ctx || !this.masterGain) return;
    this.unlock();

    const t = this.ctx.currentTime + 0.02;

    if (type === "boom") {
      // Deep sub-bass triple rumble + resonant punch
      [30, 55, 110].forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t);
        const maxG = Math.max(0.1, 0.85 - idx * 0.1) * this.volume;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(maxG, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 1.9);
      });

      const punch = this.ctx.createOscillator();
      const pGain = this.ctx.createGain();
      punch.type = "sine";
      punch.frequency.setValueAtTime(800, t);
      pGain.gain.setValueAtTime(0.0001, t);
      pGain.gain.linearRampToValueAtTime(0.85 * this.volume, t + 0.02);
      pGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      punch.connect(pGain);
      pGain.connect(this.masterGain);
      punch.start(t);
      punch.stop(t + 1.0);
    } else if (type === "stinger") {
      // High-tension dramatic crescendo
      [220, 440, 660, 880].forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime((0.15 + idx * 0.05) * this.volume, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 1.5);
      });
    } else if (type === "alarm") {
      this.startHauntingAlarmLoop();
    } else {
      // ctu_beep (Default double-burst signature beep)
      [0, 0.15].forEach((offset) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1400, t + offset);
        gain.gain.setValueAtTime(0.0001, t + offset);
        gain.gain.linearRampToValueAtTime(0.9 * this.volume, t + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.09);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + offset);
        osc.stop(t + offset + 0.1);
      });
    }
  }

  /**
   * v74 br() Haunting Alarm Loop:
   * Alternating 1000Hz and 1500Hz dual oscillators pulsed every 950ms
   */
  public startHauntingAlarmLoop(): void {
    this.stopHauntingAlarmLoop();
    if (!this.ctx || !this.masterGain) return;
    this.unlock();
    this.isAlarmLooping = true;

    const playDualTone = () => {
      if (!this.ctx || !this.masterGain || !this.isAlarmLooping) return;
      const c = this.ctx.currentTime + 0.02;

      // First tone: 1000 Hz
      const osc1 = this.ctx.createOscillator();
      const g1 = this.ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1000, c);
      g1.gain.setValueAtTime(0.0001, c);
      g1.gain.linearRampToValueAtTime(0.92 * this.volume, c + 0.005);
      g1.gain.exponentialRampToValueAtTime(0.0001, c + 0.2);
      osc1.connect(g1);
      g1.connect(this.masterGain);
      osc1.start(c);
      osc1.stop(c + 0.22);

      // Second tone: 1500 Hz (delayed by 220ms)
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1500, c + 0.22);
      g2.gain.setValueAtTime(0.0001, c + 0.22);
      g2.gain.linearRampToValueAtTime(0.92 * this.volume, c + 0.225);
      g2.gain.exponentialRampToValueAtTime(0.0001, c + 0.42);
      osc2.connect(g2);
      g2.connect(this.masterGain);
      osc2.start(c + 0.22);
      osc2.stop(c + 0.44);
    };

    playDualTone();
    this.alarmInterval = window.setInterval(playDualTone, 950);
  }

  public stopHauntingAlarmLoop(): void {
    this.isAlarmLooping = false;
    if (this.alarmInterval !== null) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  /**
   * v74 XB() 24 Voice Loop:
   * Continuous looping countdown voice with synthesized fallback
   */
  public startVoiceLoop(): void {
    this.stopVoiceLoop();
    this.unlock();
    this.isVoiceLooping = true;

    // Use embedded audio element if available, or synthesized voice pulse sequence
    try {
      if (!this.voiceAudioElement) {
        this.voiceAudioElement = new Audio("/audio/24-voice-6am-7am.mp3");
        this.voiceAudioElement.loop = true;
      }
      this.voiceAudioElement.volume = this.volume;
      this.voiceAudioElement.play().catch(() => {
        // Fallback to alarm loop if external audio asset is blocked
        this.startHauntingAlarmLoop();
      });
    } catch {
      this.startHauntingAlarmLoop();
    }
  }

  public stopVoiceLoop(): void {
    this.isVoiceLooping = false;
    if (this.voiceSource) {
      try {
        this.voiceSource.stop();
        this.voiceSource.disconnect();
      } catch {
        // Ignored
      }
      this.voiceSource = null;
    }
    if (this.voiceAudioElement) {
      try {
        this.voiceAudioElement.pause();
        this.voiceAudioElement.currentTime = 0;
      } catch {
        // Ignored
      }
    }
  }

  public stopAll(): void {
    this.stopHauntingAlarmLoop();
    this.stopVoiceLoop();
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

  public static stopAll(): void {
    CTUAudio.shared.stopAll();
  }

  public static stopCrisisAudio(): void {
    CTUAudio.shared.stopAll();
  }
}
