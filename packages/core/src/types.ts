/** Authoring times are seconds. Render samples use integer frame indices. */
export type Vec2 = [number, number];
export type Ease = 'linear' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic';
export type Start = number | { anchor: string; edge?: 'start' | 'end'; offset?: number };
export type Clip = {
  start: Start;
  duration: number;
  ease?: Ease;
} & (
  | { property: 'position'; from: Vec2; to: Vec2 }
  | { property: 'opacity' | 'scale' | 'rotation'; from: number; to: number }
);
export interface Word { id: string; text: string; start: number; end: number }
export interface BaseLayer {
  id: string;
  position: Vec2;
  opacity?: number;
  scale?: number;
  /** Degrees about the layer origin. */
  rotation?: number;
  clips?: Clip[];
}
export type Layer = BaseLayer & (
  | { type: 'rect'; size: Vec2; fill: string; radius?: number }
  | { type: 'circle'; radius: number; fill: string; stroke?: string; strokeWidth?: number }
  | { type: 'text'; text: string; fontSize: number; color: string; align?: 'left' | 'center' | 'right'; maxWidth: number; lineHeight?: number }
);
export interface Scene {
  schemaVersion: 1;
  id: string;
  output: { width: number; height: number; fps: number; durationSeconds: number };
  background: string;
  audio?: { src: string; gain?: number };
  narration?: { words: Word[]; timingSource: 'manual' | 'reviewed' | 'synthesis-events' };
  layers: Layer[];
}
type Evaluated<T> = T extends Layer ? Omit<T, 'clips' | 'opacity' | 'scale' | 'rotation'> & {
  opacity: number; scale: number; rotation: number;
} : never;
export type EvaluatedLayer = Evaluated<Layer>;
export interface FrameState {
  width: number; height: number; background: string; layers: EvaluatedLayer[];
}
export interface Issue { path: string; message: string }
export interface ValidationResult { valid: boolean; errors: Issue[] }
