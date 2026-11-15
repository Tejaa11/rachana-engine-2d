import type { Clip, GroupLayer, Layer, PathCommand, Vec2 } from '../../core/src/types.js';

export type CharacterPose = 'think' | 'explain' | 'point' | 'celebrate';
export type CharacterExpression = 'curious' | 'happy' | 'focused';
export interface CharacterOptions {
  id: string;
  position: Vec2;
  scale?: number;
  pose: CharacterPose;
  expression?: CharacterExpression;
  shirt?: string;
  /** Acting is authored only inside this finite interval; visibility is separate. */
  start?: number;
  end?: number;
}

const INK = '#222B46';
const HAIR = '#252B48';
const HAIR_LIGHT = '#3E4667';
const SKIN = '#C38A62';
const SKIN_SHADOW = '#A86B4D';
const CORAL = '#F27E70';
const PAPER = '#FFF2DC';
const CLEAR = '#00000000';

/**
 * Original editorial-style creator Mira, authored as ordinary engine layers.
 * Origin is the ground between the shoes. Crown height is approximately 390
 * local pixels; a pointing/raised hand intentionally extends the silhouette.
 * This is a reusable prefab, not an external illustration or scene renderer.
 */
export function createCharacter(options: CharacterOptions): GroupLayer {
  checkOptions(options);
  const { id, pose } = options;
  const shirt = options.shirt ?? CORAL;
  const expression = options.expression ?? (pose === 'think' ? 'curious' : pose === 'celebrate' ? 'happy' : 'focused');
  const interval = options.end === undefined ? null : { start: options.start ?? 0, end: options.end };
  const prefix = (name: string) => `${id}/${name}`;

  function vector(name: string, commands: PathCommand[], fill: string, stroke?: string, strokeWidth = 0): Layer {
    return { id: prefix(name), type: 'path', position: [0, 0], commands, fill, ...(stroke ? { stroke, strokeWidth } : {}) };
  }
  function ellipse(name: string, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, strokeWidth = 0): Layer {
    const k = 0.5522847498307936;
    return vector(name, [
      ['M', x + rx, y],
      ['C', x + rx, y + ry * k, x + rx * k, y + ry, x, y + ry],
      ['C', x - rx * k, y + ry, x - rx, y + ry * k, x - rx, y],
      ['C', x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry],
      ['C', x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y], ['Z'],
    ], fill, stroke, strokeWidth);
  }
  function line(name: string, points: Vec2[], color: string, width: number): Layer {
    return vector(name, points.map((p, i) => [i ? 'L' : 'M', ...p] as PathCommand), CLEAR, color, width);
  }
  function group(name: string, position: Vec2, children: Layer[], extra: Partial<Pick<GroupLayer, 'rotation' | 'scale' | 'opacity' | 'clips'>> = {}): GroupLayer {
    return { id: prefix(name), type: 'group', position, children, ...extra };
  }

  // Individual ankle/sole layers give the standing silhouette clear weight.
  const trousers = vector('trousers', [
    ['M', -45, -148], ['Q', 0, -157, 46, -148], ['L', 47, -92], ['L', 40, -25],
    ['L', 12, -25], ['L', 1, -109], ['L', -9, -25], ['L', -39, -25], ['L', -47, -91], ['Z'],
  ], '#303B5E', INK, 3);
  const trouserSeam = vector('trouser-seam', [['M', 1, -144], ['L', 1, -109]], CLEAR, '#1F2944', 2.5);
  const leftCrease = line('left-trouser-crease', [[-32, -126], [-29, -48]], '#455273', 2);
  const rightCrease = line('right-trouser-crease', [[29, -125], [28, -49]], '#455273', 2);
  const shoeLeft = vector('left-sneaker', [
    ['M', -40, -31], ['L', -11, -31], ['L', -10, -16], ['L', 1, -11],
    ['Q', 8, -5, 0, -1], ['L', -49, -1], ['Q', -56, -6, -52, -15], ['Z'],
  ], PAPER, INK, 3);
  const shoeRight = vector('right-sneaker', [
    ['M', 12, -31], ['L', 40, -31], ['L', 44, -17], ['L', 57, -12],
    ['Q', 66, -5, 57, -1], ['L', 10, -1], ['Q', 4, -6, 8, -14], ['Z'],
  ], PAPER, INK, 3);
  const shoeDetails = [
    line('left-shoe-sole', [[-48, -7], [0, -7]], '#C4BBAF', 2),
    line('right-shoe-sole', [[11, -7], [57, -7]], '#C4BBAF', 2),
    line('left-shoe-laces', [[-27, -23], [-14, -20], [-27, -17]], INK, 1.8),
    line('right-shoe-laces', [[25, -23], [39, -20], [25, -17]], INK, 1.8),
  ];

  // Upper body is rooted at the waist: breathing never slides the shoes.
  const leftShoulder: Vec2 = [-51, -92];
  const rightShoulder: Vec2 = [51, -92];
  const wrists: Record<CharacterPose, [Vec2, Vec2]> = {
    think: [[-65, -18], [60, -137]],
    explain: [[-109, -34], [113, -61]],
    point: [[-68, -12], [158, -109]],
    celebrate: [[-111, -199], [109, -206]],
  };
  const [leftWrist, rightWrist] = wrists[pose];
  const leftArm = makeArm('left', leftShoulder, leftWrist, pose === 'celebrate' || pose === 'explain' ? -1 : 1, 'open');
  const rightArm = makeArm('right', rightShoulder, rightWrist, 1, pose === 'point' ? 'point' : pose === 'think' ? 'think' : 'open');

  function makeArm(side: string, shoulder: Vec2, wrist: Vec2, bend: number, handKind: 'open' | 'point' | 'think'): GroupLayer {
    const localWrist: Vec2 = [wrist[0] - shoulder[0], wrist[1] - shoulder[1]];
    const elbow = solveElbow(localWrist, 64, pose === 'think' && side === 'right' ? 66 : 69, bend);
    const sleeveEnd: Vec2 = [elbow[0] * 0.61, elbow[1] * 0.61];
    const handAngle = Math.atan2(localWrist[1] - elbow[1], localWrist[0] - elbow[0]) * 180 / Math.PI + 90;
    const handChildren: Layer[] = handKind === 'point' ? [
      vector(`${side}-pointing-hand`, [
        ['M', -8, 8], ['Q', -13, -1, -7, -10], ['L', -5, -25], ['Q', -3, -30, 0, -25],
        ['L', 1, -11], ['Q', 11, -15, 13, -6], ['L', 11, 5], ['Q', 4, 15, -8, 8], ['Z'],
      ], SKIN, INK, 2.3),
      line(`${side}-hand-fold`, [[1, -8], [7, -5], [6, 3]], SKIN_SHADOW, 1.8),
    ] : handKind === 'think' ? [
      vector(`${side}-thinking-hand`, [
        ['M', -8, 8], ['Q', -14, -2, -6, -11], ['L', -5, -20], ['Q', -2, -25, 1, -20],
        ['L', 2, -10], ['Q', 12, -10, 12, 0], ['Q', 10, 13, -1, 13], ['Z'],
      ], SKIN, INK, 2.3),
    ] : [
      vector(`${side}-open-hand`, [
        ['M', -9, 7], ['L', -13, -2], ['Q', -15, -9, -10, -9], ['L', -6, -3],
        ['L', -7, -18], ['Q', -6, -24, -3, -18], ['L', -1, -8],
        ['L', 1, -23], ['Q', 4, -27, 5, -21], ['L', 6, -8],
        ['L', 9, -19], ['Q', 13, -22, 13, -15], ['L', 11, 4], ['Q', 7, 17, -3, 14], ['Z'],
      ], SKIN, INK, 2.3),
      vector(`${side}-palm-fold`, [['M', -5, 2], ['Q', 0, -2, 5, 1]], CLEAR, SKIN_SHADOW, 1.7),
    ];
    const child = group(`${side}-arm`, [...shoulder], [
      line(`${side}-arm-outline`, [[0, 0], elbow, localWrist], INK, 25),
      line(`${side}-arm-skin`, [[0, 0], elbow, localWrist], SKIN, 20),
      line(`${side}-sleeve-outline`, [[0, 0], sleeveEnd], INK, 33),
      line(`${side}-sleeve`, [[0, 0], sleeveEnd], shirt, 28),
      group(`${side}-hand`, localWrist, handChildren, { rotation: handAngle }),
    ]);
    if (interval) child.clips = pulses(interval.start + 0.45, interval.end, 3.8, 1.55, 'rotation', side === 'right' ? (pose === 'celebrate' ? -4 : -3) : 2.5);
    return child;
  }

  const neck = vector('neck', [
    ['M', -16, -129], ['L', 16, -129], ['L', 17, -99], ['Q', 0, -83, -17, -99], ['Z'],
  ], SKIN, INK, 2.5);
  const neckShadow = vector('neck-shadow', [['M', -15, -128], ['L', 15, -128], ['L', 15, -114], ['Q', 0, -105, -15, -117], ['Z']], SKIN_SHADOW);
  const torso = vector('shirt', [
    ['M', -17, -106], ['Q', -41, -110, -56, -98], ['L', -61, -68], ['L', -47, -47],
    ['L', -44, 8], ['Q', -1, 18, 45, 8], ['L', 48, -47], ['L', 62, -70], ['L', 55, -97],
    ['Q', 38, -111, 17, -106], ['Q', 0, -87, -17, -106], ['Z'],
  ], shirt, INK, 3);
  const shirtSeams = [
    vector('collar', [['M', -20, -105], ['Q', 0, -81, 20, -105]], CLEAR, '#B64E4B', 2.4),
    line('shirt-hem', [[-35, 2], [35, 2]], '#B64E4B', 2),
    vector('shirt-fold', [['M', -33, -37], ['Q', -38, -17, -33, -6]], CLEAR, '#B64E4B', 2),
  ];

  const hairBack = vector('hair-back', [
    ['M', -48, 37], ['C', -69, 12, -65, -29, -47, -52], ['C', -30, -73, 4, -77, 29, -59],
    ['C', 59, -62, 74, -29, 61, 3], ['L', 57, 43], ['Q', 39, 62, 30, 37],
    ['L', -30, 38], ['Q', -41, 54, -48, 37], ['Z'],
  ], HAIR, INK, 2.5);
  const ears = [ellipse('left-ear', -43, 7, 10, 15, SKIN, INK, 2), ellipse('right-ear', 43, 7, 10, 15, SKIN, INK, 2)];
  const face = vector('face', [
    ['M', -39, -28], ['C', -24, -51, 23, -52, 39, -27], ['L', 41, 5],
    ['C', 40, 34, 24, 51, 0, 52], ['C', -24, 50, -41, 33, -42, 4], ['Z'],
  ], SKIN, INK, 2.6);
  const faceShade = vector('face-shadow', [['M', 33, -14], ['Q', 41, 27, 16, 44], ['Q', 37, 43, 41, 10], ['L', 40, -17], ['Z']], '#B47754');
  const hairFront = vector('hair-fringe', [
    ['M', -43, -13], ['Q', -50, -32, -35, -46], ['Q', -34, -61, -15, -56],
    ['Q', -3, -70, 13, -56], ['Q', 33, -60, 38, -41], ['Q', 55, -33, 43, -13],
    ['L', 32, -28], ['Q', 23, -35, 15, -31], ['Q', 3, -21, -7, -29],
    ['Q', -20, -18, -28, -29], ['Q', -37, -25, -43, -13], ['Z'],
  ], HAIR);
  const curlHighlights = [
    vector('curl-left', [['M', -48, -39], ['C', -55, -57, -30, -66, -28, -48]], CLEAR, HAIR_LIGHT, 4),
    vector('curl-top', [['M', -21, -58], ['C', -12, -75, 11, -70, 9, -55]], CLEAR, HAIR_LIGHT, 4),
    vector('curl-right', [['M', 23, -55], ['C', 42, -61, 56, -42, 44, -30]], CLEAR, HAIR_LIGHT, 4),
  ];

  const eyeY = expression === 'happy' ? 1 : 0;
  const gaze = pose === 'point' ? 3.2 : pose === 'think' ? 1.5 : 1;
  const eyeHeight = expression === 'curious' ? 7.8 : 6.5;
  const eyes = group('open-eyes', [0, 0], [
    ellipse('left-eye-white', -18, eyeY, 10.5, eyeHeight, PAPER),
    ellipse('right-eye-white', 18, eyeY, 10.5, eyeHeight, PAPER),
    ellipse('left-pupil', -18 + gaze, eyeY + 0.5, 4, 5, INK),
    ellipse('right-pupil', 18 + gaze, eyeY + 0.5, 4, 5, INK),
    ellipse('left-eye-catchlight', -19 + gaze, eyeY - 1.3, 1.2, 1.5, '#FFFFFF'),
    ellipse('right-eye-catchlight', 17 + gaze, eyeY - 1.3, 1.2, 1.5, '#FFFFFF'),
  ]);
  const closedEyes = group('closed-eyes', [0, 0], [
    vector('left-lid', [['M', -27, 0], ['Q', -18, 5, -9, 0]], CLEAR, INK, 3),
    vector('right-lid', [['M', 9, 0], ['Q', 18, 5, 27, 0]], CLEAR, INK, 3),
  ], { opacity: 0 });
  if (interval) {
    eyes.clips = [];
    closedEyes.clips = [];
    for (let at = interval.start + 1.7; at + 0.18 <= interval.end; at += 4.1) {
      eyes.clips.push(...blink(at, false));
      closedEyes.clips.push(...blink(at, true));
    }
  }
  const brows = expression === 'curious'
    ? [vector('left-brow', [['M', -29, -16], ['Q', -20, -25, -10, -19]], CLEAR, INK, 3.3), vector('right-brow', [['M', 10, -15], ['Q', 19, -18, 28, -14]], CLEAR, INK, 3.3)]
    : [vector('left-brow', [['M', -28, -16], ['Q', -19, expression === 'happy' ? -22 : -18, -10, -15]], CLEAR, INK, 3.3), vector('right-brow', [['M', 10, -15], ['Q', 19, expression === 'happy' ? -22 : -18, 28, -16]], CLEAR, INK, 3.3)];
  const mouth = expression === 'happy'
    ? vector('smile', [['M', -15, 25], ['Q', 0, 34, 16, 23], ['Q', 11, 43, -3, 38], ['Q', -12, 36, -15, 25], ['Z']], INK)
    : vector('smile', [['M', -10, 28], ['Q', 1, expression === 'curious' ? 30 : 36, 12, 26]], CLEAR, INK, 2.7);
  const mouthDetail = expression === 'happy' ? [vector('teeth', [['M', -10, 28], ['Q', 1, 34, 11, 27], ['L', 7, 33], ['Q', -3, 37, -10, 28], ['Z']], PAPER)] : [];
  const head = group('head', [0, -166], [
    hairBack, ...ears, face, faceShade,
    ellipse('left-cheek', -26, 19, 8, 4.8, '#E99D7B80'),
    ellipse('right-cheek', 27, 19, 8, 4.8, '#E99D7B80'),
    eyes, closedEyes, ...brows,
    vector('nose', [['M', 2, 5], ['L', -2, 15], ['Q', 2, 19, 8, 16]], CLEAR, SKIN_SHADOW, 2.2),
    mouth, ...mouthDetail, hairFront, ...curlHighlights,
    ellipse('left-earring', -46, 21, 3.2, 5.5, '#EABD72', INK, 1.2),
    ellipse('right-earring', 47, 21, 3.2, 5.5, '#EABD72', INK, 1.2),
  ], { rotation: pose === 'think' ? -4 : pose === 'celebrate' ? -2 : 0 });
  if (interval) head.clips = pulses(interval.start + 0.3, interval.end, 4.4, 2.1, 'rotation', pose === 'think' ? -6 : 2, head.rotation ?? 0);

  const upperBody = group('upper-body', [0, -145], [leftArm, rightArm, neck, neckShadow, torso, ...shirtSeams, head]);
  // In thinking poses the bent hand is in front of the face/torso.
  if (pose === 'think') {
    upperBody.children = [leftArm, neck, neckShadow, torso, ...shirtSeams, head, rightArm];
  }
  if (interval) upperBody.clips = pulses(interval.start, interval.end, 3.1, 2.7, 'scale', 1.009, 1);

  return {
    id,
    type: 'group',
    position: [...options.position],
    scale: options.scale ?? 1,
    children: [trousers, trouserSeam, leftCrease, rightCrease, shoeLeft, shoeRight, ...shoeDetails, upperBody],
  };
}

/** Two-link solution with a bounded target distance; no frame state or randomness. */
function solveElbow(wrist: Vec2, upper: number, lower: number, side: number): Vec2 {
  const distance = Math.max(0.001, Math.min(upper + lower - 0.001, Math.hypot(...wrist)));
  const direction = Math.atan2(wrist[1], wrist[0]);
  const cosine = Math.max(-1, Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance)));
  const angle = direction + side * Math.acos(cosine);
  return [upper * Math.cos(angle), upper * Math.sin(angle)];
}

function pulses(start: number, end: number, period: number, duration: number, property: 'rotation' | 'scale', peak: number, base = 0): Clip[] {
  const clips: Clip[] = [];
  for (let at = start; at + 0.3 < end; at += period) {
    const length = Math.min(duration, end - at);
    const half = length / 2;
    clips.push({ property, start: at, duration: half, from: base, to: peak, ease: 'easeInOutCubic' });
    clips.push({ property, start: at + half, duration: half, from: peak, to: base, ease: 'easeInOutCubic' });
  }
  return clips;
}

function blink(start: number, closed: boolean): Clip[] {
  const base = closed ? 0 : 1;
  const peak = closed ? 1 : 0;
  return [
    { property: 'opacity', start, duration: 0.07, from: base, to: peak },
    { property: 'opacity', start: start + 0.1, duration: 0.08, from: peak, to: base },
  ];
}

function checkOptions(options: CharacterOptions): void {
  if (typeof options.id !== 'string' || !options.id.trim() || options.id.length > 80) throw new Error('Character ID must be a nonempty string of at most 80 characters.');
  if (!Array.isArray(options.position) || options.position.length !== 2 || !options.position.every(Number.isFinite)) throw new Error('Character position must contain two finite numbers.');
  if (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 100)) throw new Error('Character scale must be positive and at most 100.');
  if (!['think', 'explain', 'point', 'celebrate'].includes(options.pose)) throw new Error('Unknown character pose.');
  if (options.expression !== undefined && !['curious', 'happy', 'focused'].includes(options.expression)) throw new Error('Unknown character expression.');
  if (options.shirt !== undefined && !/^#[\da-f]{6}([\da-f]{2})?$/i.test(options.shirt)) throw new Error('Character shirt must be a hexadecimal color.');
  const start = options.start ?? 0;
  if (!Number.isFinite(start) || start < 0) throw new Error('Acting start must be finite and nonnegative.');
  if (options.end !== undefined && (!Number.isFinite(options.end) || options.end <= start)) throw new Error('Acting end must be finite and after start.');
  if (options.end !== undefined && (options.end > 1800 || options.end - start > 600)) throw new Error('Acting is limited to a 600-second interval inside the scene time limit. Split longer performances into separate actors or scenes.');
}
