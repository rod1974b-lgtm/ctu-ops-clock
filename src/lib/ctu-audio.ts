export type AudioSettings = {
  enabled: boolean;
  ambient: number;     // 0..100
  countdown: number;   // 0..100
  alarm: number;       // 0..100
  media: number;
  window: number;      // countdown window in seconds
  phone: boolean;
  snooze: number;
};

export const defaultAudio: AudioSettings = {
  enabled: true,
  ambient: 60,
  countdown: 85,
  alarm: 100,
  media: 70,
  window: 30,
  phone: false,
  snooze: 5,
};

export class CTUAudio {
  context: AudioContext | null = null;

  async unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.context = new AudioCtx();
    }
    if (this.context && this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  tone(
    frequency: number,
    duration: number,
    volume: number,
    offset = 0,
    type: OscillatorType = "sine",
  ) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || volume <= 0) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + offset;

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0, start);
      // Punchy attack and exponential decay
      const peak = Math.min(1, volume * 0.45);
      gain.gain.linearRampToValueAtTime(peak, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch {
      /* Audio context dropped */
    }
  }

  /**
   * Signature 24 digital clock tick:
   * A crisp high click (1400Hz) layered over a punchy digital body (160Hz)
   */
  tickClock(volume = 0.5) {
    if (!this.context || this.context.state !== "running") return;
    // Digital clock click
    this.tone(1400, 0.035, volume * 0.9, 0, "square");
    // Resonant tactical thud
    this.tone(180, 0.05, volume * 0.6, 0, "triangle");
  }

  /**
   * Arming confirmation chirp
   */
  chirp(volume = 0.6) {
    this.tone(1200, 0.05, volume, 0, "triangle");
    this.tone(1800, 0.09, volume, 0.06, "sine");
  }

  /**
   * Play the tick or crisis based on the current operational tier
   * tier 1 = active timer ambient tick
   * tier 2 = urgent countdown final seconds
   * tier 3 = crisis alarm (timer expired)
   */
  tick(tier: number, settings: AudioSettings, beat: number) {
    if (!settings.enabled || !this.context || this.context.state !== "running") return;

    if (tier === 3) {
      // CRISIS / ALARM: Signature CTU tactical warble
      const vol = settings.alarm / 100;
      if (settings.phone) {
        // High-low tactical telephone ring
        this.tone(850, 0.22, vol, 0, "square");
        this.tone(1200, 0.22, vol, 0, "sine");
        this.tone(850, 0.22, vol, 0.28, "square");
        this.tone(1200, 0.22, vol, 0.28, "sine");
      } else {
        // Iconic 24 crisis pulse chord
        [440, 554, 659, 880].forEach((freq, idx) => {
          this.tone(freq, 0.28, vol * 0.8, idx * 0.07, "triangle");
        });
        this.tone(110, 0.55, vol * 0.9, 0, "sawtooth");
      }
    } else if (tier === 2) {
      // COUNTDOWN URGENCY: Double-tone syncopated pulse
      const vol = settings.countdown / 100;
      this.tone(beat % 2 ? 960 : 720, 0.12, vol * 0.8, 0, "sine");
      this.tone(220, 0.09, vol * 0.7, 0, "triangle");
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
