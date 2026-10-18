import { state } from './state';

let ctx: AudioContext | null = null;

export function chime(kind: 'plant' | 'water' | 'pick' | 'trade'): void {
  if (!state.sound) return;
  try {
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return;
    ctx ??= new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitch = kind === 'pick' ? 660 : kind === 'trade' ? 520 : kind === 'water' ? 480 : 390;
    osc.type = 'sine';
    osc.frequency.value = pitch;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* Sound is optional. */
  }
}
