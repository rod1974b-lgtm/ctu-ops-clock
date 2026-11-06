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

export const defaultAudio = {
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
 * Browser audio engine for the CTU terminal. Static methods preserve the
 * existing route API; instance methods support the mission hook.
 */
export class CTUAudio {
  private static sharedInstance: CTUAudio | null = null;

  private static get shared(): CTUAudio {
    if (!CTUAudio.sharedInstance) CTUAudio.sharedInstance = new CTUAudio();
    return CTUAudio.sharedInstance;
  }

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private zeroAudio: HTMLAudioElement | null = null;
  private creditsAudio: HTMLAudioElement | null = null;
  private countdownTracks: Array<HTMLAudioElement | null> = [null, null, null];
  private volume = defaultAudio.volume;
  private activeNodes = new Set<OscillatorNode>();

  constructor() {
    this.initContext();
    this.initMedia();
  }

  private initContext() {
    if (typeof window === "undefined" || this.ctx) return;

    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;

      this.ctx = new AudioContextConstructor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.masterGain = null;
    }
  }

  private createAudioElement(src: string, loop: boolean): HTMLAudioElement | null {
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

  private initMedia() {
    if (typeof window === "undefined") return;
    if (!this.zeroAudio) {
      this.zeroAudio = this.createAudioElement("/24 At Zero theme.mp3", true);
    }
    if (!this.creditsAudio) {
      this.creditsAudio = this.createAudioElement("/24 At Zero theme.mp3", true);
    }
    if (this.countdownTracks.every((track) => track === null)) {
      this.countdownTracks = [
        this.createAudioElement("/24 Alarm Countdown.mp3", true),
        this.createAudioElement("/24 Alarm Countdown.mp3", true),
        this.createAudioElement("/24 Alarm Countdown.mp3", true),
      ];
    }
  }

  public async unlock(): Promise<void> {
    this.initContext();
    this.initMedia();
    if (this.ctx?.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        // The browser may still require a later user gesture.
      }
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch {
        // Speech synthesis is optional in some browsers.
      }
    }
  }

  public unlockAudio(): void {
    void this.unlock();
  }

  public getAudioContext(): AudioContext | null {
    this.initContext();
    return this.ctx;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    this.initMedia();
    for (const audio of [this.zeroAudio, this.creditsAudio, ...this.countdownTracks]) {
      if (audio) audio.volume = this.volume;
    }
  }

  /** Plays the original alarm track once, twice at five seconds, three times at three. */
  public playCountdownAlert(intensity: 1 | 2 | 3 = 1): void {
    void this.unlock();
    this.countdownTracks.forEach((audio, index) => {
      if (!audio) return;
      if (index < intensity) {
        try {
          audio.playbackRate = 1;
          audio.volume = Math.min(1, this.volume * (index === 0 ? 1 : 0.9));
          if (audio.paused) {
            if (index > 0) audio.currentTime = index === 1 ? 0.18 : 0.36;
            else audio.currentTime = 0;
            void audio.play().catch(() => undefined);
          }
        } catch {
          // Media playback may be unavailable until the next user gesture.
        }
      } else {
        this.pauseAndReset(audio);
      }
    });
  }

  public stopCountdownAlert(): void {
    this.countdownTracks.forEach((audio) => {
      if (audio) this.pauseAndReset(audio);
    });
  }

  public playCountdownAlertForSecond(secondsRemaining: number): void {
    const intensity: 1 | 2 | 3 = secondsRemaining <= 3 ? 3 : secondsRemaining <= 5 ? 2 : 1;
    this.playCountdownAlert(intensity);
  }

  public playZeroVoiceAndTheme(): void {
    void this.unlock();
    this.stopCountdownAlert();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Zero");
        utterance.rate = 1;
        utterance.pitch = 0.85;
        utterance.volume = Math.max(0.85, this.volume);
        window.speechSynthesis.speak(utterance);
      } catch {
        // The original theme still plays if speech synthesis is unavailable.
      }
    }
    this.playMediaFromStart(this.zeroAudio);
  }

  public playAtZero(): void {
    this.playZeroVoiceAndTheme();
  }

  public playZeroTheme(): void {
    this.playZeroVoiceAndTheme();
  }

  public playZeroSound(sound: ZeroSoundType): void {
    if (sound === "voice") {
      this.playZeroVoiceAndTheme();
      return;
    }
    void this.unlock();
    this.stopCountdownAlert();
    this.stopZeroTheme();
    this.playSynthesizedCue(sound);
  }

  public stopZeroTheme(): void {
    if (this.zeroAudio) this.pauseAndReset(this.zeroAudio);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Speech synthesis is optional.
      }
    }
    this.stopSynthesizedCues();
  }

  public stopAtZero(): void {
    this.stopZeroTheme();
  }

  public chirp(durationSeconds = 0.08): void {
    this.playTone(880, 0.12, Math.max(0.04, durationSeconds));
  }

  /** Keeps the timer hook compatible while remaining silent outside its alert window. */
  public tick(level: 1 | 2 | 3, settings: AudioSettings, secondsRemaining: number): void {
    if (!settings.enabled || this.volume <= 0) return;
    if (level === 3) {
      this.stopCountdownAlert();
      return;
    }
    if (level === 2 && secondsRemaining <= 10) {
      this.playCountdownAlertForSecond(secondsRemaining);
      return;
    }
    this.stopCountdownAlert();
  }

  public playAlertCountdown(): void {
    this.playCountdownAlert(1);
  }

  public stopAlert(): void {
    this.stopCountdownAlert();
  }

  public startCreditsAudio(): void {
    void this.unlock();
    if (this.creditsAudio) void this.creditsAudio.play().catch(() => undefined);
  }

  public stopCreditsAudio(): void {
    if (this.creditsAudio) this.pauseAndReset(this.creditsAudio);
  }

  public stopAll(): void {
    this.stopCountdownAlert();
    this.stopZeroTheme();
    this.stopCreditsAudio();
  }

  private pauseAndReset(audio: HTMLAudioElement): void {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.playbackRate = 1;
    } catch {
      // Ignore media elements that have not loaded metadata yet.
    }
  }

  private playMediaFromStart(audio: HTMLAudioElement | null): void {
    if (!audio) return;
    try {
      audio.currentTime = 0;
      audio.volume = this.volume;
      void audio.play().catch(() => undefined);
    } catch {
      // Playback can fail when the browser blocks media.
    }
  }

  private playSynthesizedCue(sound: Exclude<ZeroSoundType, "voice">): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    if (sound === "boom") {
      this.playTone(105, 0.9, 0.65, "sawtooth", 42);
    } else if (sound === "alarm") {
      [0, 0.3, 0.6].forEach((offset) => this.playTone(740, 0.4, 0.18, "square", 520, offset));
    } else if (sound === "ctu_beep") {
      [0, 0.18].forEach((offset) => this.playTone(880, 0.32, 0.09, "sine", 660, offset));
    } else {
      this.playTone(523, 0.35, 0.55, "sine", 392);
      this.playTone(659, 0.25, 0.55, "sine", 494);
    }
    void now;
  }

  private playTone(
    frequency: number,
    peak: number,
    duration: number,
    type: OscillatorType = "sine",
    endFrequency = frequency,
    delay = 0,
  ): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0) return;
    try {
      const start = this.ctx.currentTime + delay;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.masterGain);
      this.activeNodes.add(oscillator);
      oscillator.onended = () => {
        this.activeNodes.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      // Audio hardware may be unavailable; timers remain functional without sound.
    }
  }

  private stopSynthesizedCues(): void {
    for (const oscillator of this.activeNodes) {
      try {
        oscillator.stop();
      } catch {
        // It may already have ended.
      }
    }
    this.activeNodes.clear();
  }

  // Static facade used by the current route.
  public static setVolume(volume: number): void {
    CTUAudio.shared.setVolume(volume);
  }

  public static resumeContext(): void {
    void CTUAudio.shared.unlock();
  }

  public static playCountdown(secondsRemaining: number): void {
    CTUAudio.shared.playCountdownAlertForSecond(secondsRemaining);
  }

  public static playZeroSound(sound: ZeroSoundType): void {
    CTUAudio.shared.playZeroSound(sound);
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
}