import type { TrackDefinition, TrackSegment } from '../types';

/** Find the segment index containing `pos`, starting the search at `hint`. */
export function segmentIndexAt(track: TrackDefinition, pos: number, hint = 0): number {
  const segs = track.segments;
  let i = Math.max(0, Math.min(hint, segs.length - 1));
  while (i < segs.length - 1 && pos >= segs[i].end) i++;
  while (i > 0 && pos < segs[i].start) i--;
  return i;
}

/**
 * First segment after `fromIndex` whose recommended dino differs from the
 * segment at `fromIndex` – i.e. the next point where the player must react.
 */
export function nextChange(track: TrackDefinition, fromIndex: number, maxAhead = 400): TrackSegment | null {
  const segs = track.segments;
  const cur = segs[fromIndex];
  if (!cur) return null;
  for (let i = fromIndex + 1; i < segs.length; i++) {
    const s = segs[i];
    if (s.start - cur.start > maxAhead + (cur.end - cur.start)) return null;
    if (s.recommended !== cur.recommended) return s;
  }
  return null;
}

/** Next segment with a different terrain (for visual previews). */
export function nextTerrainSegment(track: TrackDefinition, fromIndex: number): TrackSegment | null {
  const segs = track.segments;
  const cur = segs[fromIndex];
  if (!cur) return null;
  for (let i = fromIndex + 1; i < segs.length; i++) {
    if (segs[i].terrain !== cur.terrain) return segs[i];
  }
  return null;
}
