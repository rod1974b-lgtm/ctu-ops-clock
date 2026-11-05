// src/lib/ctu-audio.ts
export type AudioSettings = {
  enabled: boolean;
  volume: number;
};

export class CTUAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private zeroAudio: HTMLAudioElement | null = null;
  private volume: number = 0.85;

  constructor() {
    this.initContext();
  }

  private initContext() {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  }

  public unlock() {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.zeroAudio) {
      this.zeroAudio.volume = this.volume;
    }
  }

  /**
   * Tiered Clock Ticks:
   * Tier 1 (Normal >10s): SILENT (returns immediately)
   * Tier 2 (Countdown 10s-4s): High-priority CTU warning pulse
   * Tier 3 (Crisis <=3s): Urgent double-staccato pip
   */
  public tick(tier: 1 | 2 | 3) {
    // Keep normal operations completely silent as requested
    if (tier === 1) return;

    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime + 0.01;

      if (tier === 2) {
        // High-priority 24 countdown tick
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(1400, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.4 * this.volume, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.09);
      } else if (tier === 3) {
        // Urgent dual-tone crisis pip
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = "square";
        osc2.type = "sawtooth";
        osc1.frequency.setValueAtTime(1800, now);
        osc2.frequency.setValueAtTime(900, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.6 * this.volume, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.11);
        osc2.stop(now + 0.11);
      }
    } catch {}
  }

  public playZeroTheme() {
    this.unlock();
    if (this.zeroAudio) {
      this.zeroAudio.currentTime = 0;
      this.zeroAudio.volume = this.volume;
      this.zeroAudio.play().catch(() => {
        this.fallbackCrisisSynth();
      });
    } else {
      this.fallbackCrisisSynth();
    }
  }

  public stopZeroTheme() {
    if (this.zeroAudio) {
      try {
        this.zeroAudio.pause();
        this.zeroAudio.currentTime = 0;
      } catch {}
    }
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
