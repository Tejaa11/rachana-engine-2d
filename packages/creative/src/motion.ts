import type { Clip, Vec2 } from '../../core/src/types.js';

/** Small reusable motion presets compiled into editable scene clips. */
export function appear(at: number, end: number, duration = 0.35): Clip[] {
  if (![at, end, duration].every(Number.isFinite) || at < 0 || duration <= 0 || end < at + duration + Math.min(duration, 0.22)) throw new Error('Reveal needs time to enter and hold.');
  const exit = Math.min(duration, 0.22);
  return [
    { property: 'opacity', from: 0, to: 1, start: at, duration, ease: 'easeOutCubic' },
    { property: 'opacity', from: 1, to: 0, start: end - exit, duration: exit, ease: 'easeInCubic' },
  ];
}

export function pop(at: number, scale = 1): Clip[] {
  if (!Number.isFinite(at) || at < 0 || !Number.isFinite(scale) || scale <= 0) throw new Error('Invalid pop timing or scale.');
  return [
    { property: 'scale', from: scale * 0.7, to: scale * 1.045, start: at, duration: 0.32, ease: 'easeOutCubic' },
    { property: 'scale', from: scale * 1.045, to: scale, start: at + 0.32, duration: 0.18, ease: 'easeInOutCubic' },
  ];
}

/** A deliberate arc expressed as deterministic, editable position clips. */
export function arcMotion(center: Vec2, radii: Vec2, fromAngle: number, toAngle: number, at: number, duration: number, segments = 24): Clip[] {
  if (![...center, ...radii, fromAngle, toAngle, at, duration].every(Number.isFinite) || at < 0 || duration <= 0 || !Number.isInteger(segments) || segments < 1 || segments > 128) throw new Error('Invalid arc duration or segment count.');
  const point = (i: number): Vec2 => {
    const angle = (fromAngle + (toAngle - fromAngle) * i / segments) * Math.PI / 180;
    return [center[0] + Math.cos(angle) * radii[0], center[1] + Math.sin(angle) * radii[1]];
  };
  return Array.from({ length: segments }, (_, i) => ({
    property: 'position', from: point(i), to: point(i + 1), start: at + duration * i / segments,
    duration: duration / segments, ease: 'linear',
  }));
}

export function drift(position: Vec2, at: number, end: number, amplitude = 5, period = 2.8): Clip[] {
  if (![...position, at, end, amplitude, period].every(Number.isFinite) || at < 0 || end <= at || period <= 0 || Math.ceil((end-at)/(period/2)) > 1000) throw new Error('Invalid drift interval.');
  const clips: Clip[] = [];
  for (let time = at, phase = 0; time < end - 1e-6; phase++) {
    const duration = Math.min(period / 2, end - time);
    const from: Vec2 = phase === 0 ? [...position] : [position[0], position[1] + (phase % 2 ? -amplitude : amplitude)];
    const to: Vec2 = [position[0], position[1] + (phase % 2 ? amplitude : -amplitude)];
    clips.push({ property: 'position', from, to, start: time, duration, ease: 'easeInOutCubic' });
    time += duration;
  }
  return clips;
}
