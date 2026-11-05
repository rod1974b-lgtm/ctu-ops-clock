// src/lib/ctu-audio.ts
export type AudioSettings = {
  enabled: boolean;
  volume: number;
};

export class CTUAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private zeroAudio: HTMLAudioElement | null = null;

  // Tripled instances of the exact original countdown audio file
  private countdownAudio1: HTMLAudioElement | null = null;
  private countdownAudio2: HTMLAudioElement | null = null;
  private countdownAudio3: HTMLAudioElement | null = null;

  private volume: number = 0.85;

  constructor() {
    this.initContext();
  }

  private createAudioElement(src: string, loop: boolean = true): HTMLAudioElement | null {
    if (typeof Audio === "undefined") return null;
    try {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.loop = loop;
      audio.volume = this.volume;
      return audio;
    } catch {
      return null;
    }
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

    if (!this.zeroAudio) {
      this.zeroAudio = this.createAudioElement("/24 At Zero theme.mp3", true);
    }

    // Initialize 3 instances of the identical original alarm file
    if (!this.countdownAudio1) {
      this.countdownAudio1 = this.createAudioElement("/24 Alarm Countdown.mp3", true);
    }
    if (!this.countdownAudio2) {
      this.countdownAudio2 = this.createAudioElement("/24 Alarm Countdown.mp3", true);
    }
    if (!this.countdownAudio3) {
      this.countdownAudio3 = this.createAudioElement("/24 Alarm Countdown.mp3", true);
    }
  }

  public unlock() {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    // Pre-warm browser speech synthesis so zero voice can speak from intervals
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
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
    if (this.countdownAudio1) {
      this.countdownAudio1.volume = this.volume;
    }
    if (this.countdownAudio2) {
      this.countdownAudio2.volume = this.volume;
    }
    if (this.countdownAudio3) {
      this.countdownAudio3.volume = this.volume;
    }
  }

  /**
   * Escalating Countdown Alert using ONLY the original alarm track:
   * - intensity 1 (10s to 6s): Single original alarm playing at 1.0x rate
   * - intensity 2 (5s to 4s): DOUBLE sounding -> 1.55x playback rate + 2nd staggered original alarm track
   * - intensity 3 (3s to 1s): TRIPLE sounding -> 1.95x playback rate + 3 simultaneous layered original alarm tracks
   */
  public playCountdownAlert(intensity: 1 | 2 | 3 = 1) {
    this.unlock();

    const rate = intensity === 3 ? 1.95 : intensity === 2 ? 1.55 : 1.0;

    // Track 1 (Base Alarm)
    if (this.countdownAudio1) {
      try {
        this.countdownAudio1.playbackRate = rate;
        this.countdownAudio1.volume = this.volume;
        if (this.countdownAudio1.paused) {
          this.countdownAudio1.currentTime = 0;
          this.countdownAudio1.play().catch(() => {});
        }
      } catch {}
    }

    // Track 2 (Engages at <= 5s for DOUBLE sounding alarm)
    if (this.countdownAudio2) {
      try {
        if (intensity >= 2) {
          this.countdownAudio2.playbackRate = rate;
          this.countdownAudio2.volume = Math.min(1.0, this.volume * 0.9);
          if (this.countdownAudio2.paused) {
            // Slight acoustic offset for rich dual-alarm sound
            this.countdownAudio2.currentTime = 0.18;
            this.countdownAudio2.play().catch(() => {});
          }
        } else {
          this.countdownAudio2.pause();
          this.countdownAudio2.currentTime = 0;
        }
      } catch {}
    }

    // Track 3 (Engages at <= 3s for TRIPLE sounding alarm)
    if (this.countdownAudio3) {
      try {
        if (intensity === 3) {
          this.countdownAudio3.playbackRate = rate;
          this.countdownAudio3.volume = Math.min(1.0, this.volume * 0.85);
          if (this.countdownAudio3.paused) {
            // Second acoustic offset for wall-of-sound triple alarm
            this.countdownAudio3.currentTime = 0.36;
            this.countdownAudio3.play().catch(() => {});
          }
        } else {
          this.countdownAudio3.pause();
          this.countdownAudio3.currentTime = 0;
        }
      } catch {}
    }
  }

  public stopCountdownAlert() {
    [this.countdownAudio1, this.countdownAudio2, this.countdownAudio3].forEach((audio) => {
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.playbackRate = 1.0;
        } catch {}
      }
    });
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
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();

        // 40ms timeout ensures Chromium does not swallow the speak() invocation
        setTimeout(() => {
          try {
            const utter = new SpeechSynthesisUtterance("Zero");
            utter.rate = 1.0;
            utter.pitch = 0.85;
            utter.volume = Math.max(0.85, this.volume);
            window.speechSynthesis.speak(utter);
          } catch (err) {
            console.warn("SpeechSynthesis utterance error:", err);
          }
        }, 40);
      } catch (err) {
        console.warn("SpeechSynthesis error:", err);
      }
    }

    // 2. Play 24 At Zero Theme MP3
    if (this.zeroAudio) {
      try {
        this.zeroAudio.currentTime = 0;
        this.zeroAudio.volume = this.volume;
        this.zeroAudio.play().catch(() => {});
      } catch {}
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
}
