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

const ZERO_THEME_URL = encodeURI("/24 At Zero theme.mp3");
const COUNTDOWN_MEDIA_URL = encodeURI("/24 Countdown.mp4");

export class CTUAudio {
  private context: AudioContext | null = null;
  private zeroAudio: HTMLAudioElement | null = null;
  private countdownAudio: HTMLAudioElement | null = null;
  private isZeroPlaying = false;
  private isCountdownPlaying = false;

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
      this.initMediaElements();
    }
  }

  private initMediaElements() {
    if (typeof window === "undefined") return;

    if (!this.zeroAudio) {
      try {
        this.zeroAudio = new Audio(ZERO_THEME_URL);
        this.zeroAudio.preload = "auto";
        this.zeroAudio.loop = true;
      } catch {
        /* audio element blocked */
      }
    }

    if (!this.countdownAudio) {
      try {
        this.countdownAudio = new Audio(COUNTDOWN_MEDIA_URL);
        this.countdownAudio.preload = "auto";
        this.countdownAudio.loop = true;
      } catch {
        /* audio element blocked */
      }
    }
  }

  unlock(): boolean {
    if (typeof window === "undefined") return false;
    this.initMediaElements();

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

    // Pre-warm HTML5 audio elements on user gesture
    if (this.zeroAudio) {
      this.zeroAudio.load();
    }
    if (this.countdownAudio) {
      this.countdownAudio.load();
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
   * 1400Hz click + 240Hz punch body
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
   * Play the official 24 At Zero theme (public/24 At Zero theme.mp3)
   */
  playAtZero(volume = 1.0) {
    this.stopCountdown();
    this.initMediaElements();

    const targetVolume = Math.max(0, Math.min(1, volume));

    if (this.zeroAudio) {
      this.zeroAudio.volume = targetVolume;
      if (!this.isZeroPlaying) {
        this.zeroAudio.currentTime = 0;
        this.zeroAudio
          .play()
          .then(() => {
            this.isZeroPlaying = true;
          })
          .catch(() => {
            // Browser autoplay fallback: synthetic CTU crisis chord
            this.syntheticCrisisAlert(targetVolume);
          });
      }
    } else {
      this.syntheticCrisisAlert(targetVolume);
    }
  }

  /**
   * Stop the 24 At Zero theme
   */
  stopAtZero() {
    if (this.zeroAudio && this.isZeroPlaying) {
      try {
        this.zeroAudio.pause();
        this.zeroAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    this.isZeroPlaying = false;
  }

  /**
   * Play the official 24 Countdown audio (public/24 Countdown.mp4)
   */
  playCountdown(volume = 0.85) {
    this.stopAtZero();
    this.initMediaElements();

    const targetVolume = Math.max(0, Math.min(1, volume));

    if (this.countdownAudio) {
      this.countdownAudio.volume = targetVolume;
      if (!this.isCountdownPlaying) {
        this.countdownAudio
          .play()
          .then(() => {
            this.isCountdownPlaying = true;
          })
          .catch(() => {
            // Fallback syncopated tick
            this.tickClock(targetVolume);
          });
      }
    } else {
      this.tickClock(targetVolume);
    }
  }

  /**
   * Stop the 24 Countdown audio
   */
  stopCountdown() {
    if (this.countdownAudio && this.isCountdownPlaying) {
      try {
        this.countdownAudio.pause();
        this.countdownAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    this.isCountdownPlaying = false;
  }

  /**
   * Synthetic crisis chord fallback when media is blocked or on phone
   */
  private syntheticCrisisAlert(vol: number) {
    [440, 554, 659, 880].forEach((freq, idx) => {
      this.tone(freq, 0.32, vol * 0.9, idx * 0.06, "triangle");
    });
    this.tone(110, 0.6, vol, 0, "sawtooth");
  }

  /**
   * Operational tier dispatcher:
   * tier 1 = active timer ambient tick
   * tier 2 = urgent countdown (public/24 Countdown.mp4)
   * tier 3 = at zero crisis (public/24 At Zero theme.mp3)
   */
  tick(tier: number, settings: AudioSettings, beat: number) {
    if (!settings.enabled) {
      this.stopAll();
      return;
    }

    if (tier === 3) {
      // AT ZERO: 24 At Zero theme
      this.playAtZero(settings.alarm / 100);
    } else if (tier === 2) {
      // COUNTDOWN WINDOW: 24 Countdown media
      this.playCountdown(settings.countdown / 100);
    } else {
      // TIER 1: Ambient clock tick
      this.stopAtZero();
      this.stopCountdown();
      const vol = settings.ambient / 100;
      this.tickClock(vol);
    }
  }

  stopAll() {
    this.stopAtZero();
    this.stopCountdown();
  }

  async mute() {
    this.stopAll();
    if (this.context && this.context.state === "running") {
      await this.context.suspend();
    }
  }

  close() {
    this.stopAll();
    try {
      void this.context?.close();
    } catch {
      /* ignore */
    }
  }
}
