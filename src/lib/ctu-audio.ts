export type AudioSettings = {
  enabled: boolean;
  ambient: number;
  countdown: number;
  alarm: number;
  media: number;
  window: number;
  phone: boolean;
  snooze: number;
};

export const defaultAudio: AudioSettings = {
  enabled: true,
  ambient: 70,
  countdown: 85,
  alarm: 100,
  media: 70,
  window: 30,
  phone: false,
  snooze: 5,
};

export class CTUAudio {
  private context: AudioContext | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.context = new AudioCtx();
        } catch {
          /* delayed initialization */
        }
      }
    }
  }

  unlock(): boolean {
    if (typeof window === "undefined") return false;
    if (!this.context) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.context = new AudioCtx();
        } catch {
          return false;
        }
      }
    }
    if (this.context && this.context.state === "suspended") {
      void this.context.resume();
    }
    return !!this.context && this.context.state === "running";
  }

  tone(
    frequency: number,
    duration: number,
    volume: number,
    offset = 0,
    type: OscillatorType = "sine",
  ) {
    if (!this.context || volume <= 0) return;

    try {
      if (this.context.state === "suspended") {
        void this.context.resume();
      }

      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = this.context.currentTime + offset;

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      const peak = Math.min(1, volume * 0.7);
      gain.gain.linearRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(this.context.destination);

      osc.start(start);
      osc.stop(start + duration + 0.03);
    } catch {
      /* Audio context error */
    }
  }

  /**
   * Signature 24 digital clock tick:
   * 1400Hz click + 240Hz punch, 65ms body for phone speakers
   */
  tickClock(volume = 0.6) {
    this.tone(1400, 0.045, volume * 0.9, 0, "square");
    this.tone(240, 0.065, volume * 0.75, 0, "triangle");
  }

  /**
   * Arming confirmation chirp
   */
  chirp(volume = 0.7) {
    this.tone(1200, 0.06, volume, 0, "triangle");
    this.tone(1800, 0.1, volume, 0.05, "sine");
  }

  /**
   * Operational tier dispatcher:
   * tier 1 = active timer ambient tick
   * tier 2 = urgent countdown final seconds
   * tier 3 = crisis alarm (timer expired)
   */
  tick(tier: number, settings: AudioSettings, beat: number) {
    if (!settings.enabled) return;

    if (tier === 3) {
      // CRISIS / ALARM: Signature CTU tactical warble
      const vol = settings.alarm / 100;
      if (settings.phone) {
        this.tone(850, 0.22, vol, 0, "square");
        this.tone(1200, 0.22, vol, 0, "sine");
        this.tone(850, 0.22, vol, 0.28, "square");
        this.tone(1200, 0.22, vol, 0.28, "sine");
      } else {
        [440, 554, 659, 880].forEach((freq, idx) => {
          this.tone(freq, 0.32, vol * 0.9, idx * 0.06, "triangle");
        });
        this.tone(110, 0.6, vol, 0, "sawtooth");
      }
    } else if (tier === 2) {
      // COUNTDOWN URGENCY: Double-tone syncopated pulse
      const vol = settings.countdown / 100;
      this.tone(beat % 2 ? 980 : 740, 0.14, vol * 0.9, 0, "sine");
      this.tone(240, 0.1, vol * 0.8, 0, "triangle");
    } else {
      // TIER 1: Standard tactical second clock tick
      const vol = settings.ambient / 100;
      this.tickClock(vol);
    }
  }

  async mute() {
    if (this.context && this.context.state === "running") {
      await this.context.suspend();
    }
  }

  close() {
    try {
      void this.context?.close();
    } catch {
      /* ignore */
    }
  }
}
