export type AudioSettings = { enabled: boolean; ambient: number; countdown: number; alarm: number; media: number; window: number; phone: boolean; snooze: number };
export const defaultAudio: AudioSettings = {enabled:false,ambient:20,countdown:70,alarm:100,media:70,window:30,phone:false,snooze:5};
export class CTUAudio {
  context: AudioContext | null = null;
  async unlock() { if (!this.context) this.context = new AudioContext(); if (this.context.state === 'suspended') await this.context.resume(); }
  tone(frequency: number, duration: number, volume: number, offset = 0, type: OscillatorType = 'sine') {
    const ctx = this.context; if (!ctx || ctx.state !== 'running' || volume <= 0) return;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); const start = ctx.currentTime+offset;
    oscillator.type=type; oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(volume*0.12,start+0.006); gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start+duration+0.02);
  }
  chirp(volume: number) { this.tone(1100,0.06,volume); this.tone(1600,0.1,volume,0.08); }
  tick(tier: number, settings: AudioSettings, beat: number) {
    if (!settings.enabled) return;
    if (tier === 3) {
      if (settings.phone) { this.tone(440,0.25,settings.alarm/100); this.tone(480,0.25,settings.alarm/100); this.tone(440,0.25,settings.alarm/100,0.35); this.tone(480,0.25,settings.alarm/100,0.35); }
      else { [220,277,330,440].forEach((n,i) => this.tone(n,0.18,settings.alarm/100,i*0.18,'triangle')); this.tone(110,0.7,settings.alarm/100,0,'sawtooth'); }
    } else if (tier === 2) { this.tone(beat%2 ? 880 : 660,0.22,settings.countdown/100); this.tone(110,0.15,settings.countdown/100); }
    else { this.tone(beat%2 ? 1100 : 800,0.04,settings.ambient/100); this.tone(90,0.045,settings.ambient/200); }
  }
  async mute() { if (this.context?.state === 'running') await this.context.suspend(); }
  close() { void this.context?.close(); }
}