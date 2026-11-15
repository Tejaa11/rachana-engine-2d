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
export type PathCommand =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Q', number, number, number, number]
  | ['Z'];
export type ShapeLayer = BaseLayer & (
  | { type: 'rect'; size: Vec2; fill: string; radius?: number }
  | { type: 'circle'; radius: number; fill: string; stroke?: string; strokeWidth?: number }
  | { type: 'text'; text: string; fontSize: number; color: string; align?: 'left' | 'center' | 'right'; maxWidth: number; lineHeight?: number; fontWeight?: 'normal' | 'bold' }
  | { type: 'image'; asset: string; size: Vec2; fit?: 'contain' | 'cover'; focalPoint?: Vec2 }
  | { type: 'path'; commands: PathCommand[]; fill: string; stroke?: string; strokeWidth?: number }
);
export type GroupLayer = BaseLayer & { type: 'group'; children: Layer[] };
export type Layer = ShapeLayer | GroupLayer;
/** Local decoded image inputs pinned to bytes and dimensions by the scene. */
export interface ImageAssetRef {
  id: string;
  src: string;
  sha256: string;
  width: number;
  height: number;
}
export interface Scene {
  schemaVersion: 1;
  id: string;
  output: { width: number; height: number; fps: number; durationSeconds: number };
  background: string;
  audio?: { src: string; gain?: number };
  images?: ImageAssetRef[];
  narration?: { words: Word[]; timingSource: 'manual' | 'reviewed' | 'synthesis-events' };
  layers: Layer[];
}
type Evaluated<T> = T extends ShapeLayer ? Omit<T, 'clips' | 'opacity' | 'scale' | 'rotation'> & {
  opacity: number; scale: number; rotation: number;
} : never;
export interface EvaluatedGroup extends Omit<GroupLayer, 'clips' | 'opacity' | 'scale' | 'rotation' | 'children'> {
  opacity: number; scale: number; rotation: number; children: EvaluatedLayer[];
}
export type EvaluatedLayer = Evaluated<ShapeLayer> | EvaluatedGroup;
export interface FrameState {
  width: number; height: number; background: string; layers: EvaluatedLayer[];
}
export interface Issue { path: string; message: string }
export interface ValidationResult { valid: boolean; errors: Issue[] }
