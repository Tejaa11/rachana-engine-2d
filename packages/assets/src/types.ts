import type { Image } from '@napi-rs/canvas';

export type AssetKind = 'background' | 'prop' | 'illustration';
export type ProvenanceKind = 'generated' | 'procedural' | 'imported' | 'supplied' | 'captured';
export interface AssetProvenance {
  kind: ProvenanceKind;
  creator: string;
  source: string;
  usage: string;
  tool?: string;
  model?: string;
  prompt?: string;
}
export interface AssetRecord {
  id: string;
  kind: AssetKind;
  src: string;
  sha256: string;
  width: number;
  height: number;
  hasTransparency: boolean;
  provenance: AssetProvenance;
  review: { status: 'draft' | 'approved' | 'rejected'; notes?: string };
}
export interface AssetRegistry {
  schemaVersion: 1;
  styleId: string;
  assets: AssetRecord[];
}
export interface PngInspection {
  image: Image;
  sha256: string;
  width: number;
  height: number;
  hasTransparency: boolean;
  bytes: number;
}

/** Registration input keeps editorial metadata explicit and derives measured file data. */
export interface AssetRequest extends Omit<AssetRegistry, 'assets'> {
  assets: Omit<AssetRecord, 'sha256' | 'width' | 'height' | 'hasTransparency'>[];
}
