// src/lib/ctu-audio.ts
export type AudioSettings = {
  enabled: boolean;
  volume: number;
};

export class CTUAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private zeroAudio: HTMLAudioElement | null = null;
  private countdownAudio: HTMLAudioElement | null = null;
  private volume: number = 0.85;

  constructor() {
    this.initContext();
  }

  private initContext() {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch {}

    if (!this.zeroAudio && typeof Audio !== "undefined") {
      try {
        this.zeroAudio = new Audio("/24 At Zero theme.mp3");
        this.zeroAudio.preload = "auto";
        this.zeroAudio.loop = true;
      } catch {}
    }

    if (!this.countdownAudio && typeof Audio !== "undefined") {
      try {
        this.countdownAudio = new Audio("/24 Alarm Countdown.mp3");
        this.countdownAudio.preload = "auto";
        this.countdownAudio.loop = true;
      } catch {}
    }
  }

  public unlock() {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public unlockAudio() {
    this.unlock();
  }

  public getAudioContext(): AudioContext | null {
    this.unlock();
    return this.ctx;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.zeroAudio) {
      this.zeroAudio.volume = this.volume;
    }
    if (this.countdownAudio) {
      this.countdownAudio.volume = this.volume;
    }
  }

  /**
   * Escalating Countdown Alert:
   * - intensity 1 (10s to 6s): Standard rate (1.0x) + base warning pip
   * - intensity 2 (5s to 4s): DOUBLE SOUND -> rate 1.18x + 1.5x volume boost + double-pip klaxon
   * - intensity 3 (3s to 1s): TRIPLE SOUND -> rate 1.35x + 2.0x volume peak + urgent triple-pip klaxon
   */
  public playCountdownAlert(intensity: 1 | 2 | 3 = 1) {
    this.unlock();

    // 1. Play & Escalate Background MP3 Alert
    if (this.countdownAudio) {
      try {
        const rate = intensity === 3 ? 1.35 : intensity === 2 ? 1.18 : 1.0;
        const volMultiplier = intensity === 3 ? 1.0 : intensity === 2 ? Math.min(1.0, this.volume * 1.35) : this.volume;

        this.countdownAudio.playbackRate = rate;
        this.countdownAudio.volume = volMultiplier;

        if (this.countdownAudio.paused) {
          this.countdownAudio.currentTime = 0;
          this.countdownAudio.play().catch(() => {
            this.fallbackCrisisSynth();
          });
        }
      } catch {
        this.fallbackCrisisSynth();
      }
    } else {
      this.fallbackCrisisSynth();
    }

    // 2. Layer Synthesizer Klaxon Pulses (Double at 5s, Triple at 3s)
    this.layerCrisisPulse(intensity);
  }

  private layerCrisisPulse(intensity: 1 | 2 | 3) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime + 0.01;
      const count = intensity; // 1 pip at 10-6s, 2 pips at 5-4s, 3 pips at 3-1s
      const baseFreq = intensity === 3 ? 1800 : intensity === 2 ? 1500 : 1200;

      for (let i = 0; i < count; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + i * 0.12;

        osc.type = intensity === 3 ? "sawtooth" : "square";
        osc.frequency.setValueAtTime(baseFreq + i * 150, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.5 * this.volume, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.09);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.1);
      }
    } catch {}
  }

  public stopCountdownAlert() {
    if (this.countdownAudio) {
      try {
        this.countdownAudio.pause();
        this.countdownAudio.currentTime = 0;
        this.countdownAudio.playbackRate = 1.0;
      } catch {}
    }
  }

  /**
   * Spoken Voice + 24 At Zero Theme:
   * Speaks "Zero" loudly and clearly using browser SpeechSynthesis,
   * while simultaneously engaging the 24 Zero Crisis music loop.
   */
  public playZeroVoiceAndTheme() {
    this.unlock();
    this.stopCountdownAlert();

    // 1. Spoken Tactical Announcement: "Zero"
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel(); // Clear any queued utterances
        const utter = new SpeechSynthesisUtterance("Zero");
        utter.rate = 1.05;
        utter.pitch = 0.9;
        utter.volume = Math.max(0.6, this.volume);
        window.speechSynthesis.speak(utter);
      } catch (err) {
        console.warn("SpeechSynthesis error:", err);
      }
    }

    // 2. Play 24 At Zero Theme MP3
    if (this.zeroAudio) {
      try {
        this.zeroAudio.currentTime = 0;
        this.zeroAudio.volume = this.volume;
        this.zeroAudio.play().catch(() => {
          this.fallbackCrisisSynth();
        });
      } catch {
        this.fallbackCrisisSynth();
      }
    } else {
      this.fallbackCrisisSynth();
    }
  }

  public playZeroTheme() {
    this.playZeroVoiceAndTheme();
  }

  public stopZeroTheme() {
    if (this.zeroAudio) {
      try {
        this.zeroAudio.pause();
        this.zeroAudio.currentTime = 0;
      } catch {}
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public stopAll() {
    this.stopCountdownAlert();
    this.stopZeroTheme();
  }

  private fallbackCrisisSynth() {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime + 0.01;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.4);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.5 * this.volume, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }
}
