import type { GroupLayer, Layer, PathCommand, Scene } from '../../core/src/types.js';
import { validateScene } from '../../core/src/validate.js';
import { evaluateScene } from '../../core/src/evaluate.js';
import { createCharacter } from '../../creative/src/character.js';
import { drift, pop } from '../../creative/src/motion.js';
import { createSurface, drawFrame, wrapText } from '../../renderer/src/draw.js';
import type { CreativePlan, PlannedShot, Subject } from './plan.js';
interface Palette {
    paper: string;
    ink: string;
    accent: string;
    soft: string;
    warm: string;
    green: string;
    gold: string;
    night: string;
    white: string;
}
const palettes: Record<string, Palette> = {
    paper: { paper: '#f8f1e5', ink: '#25263e', accent: '#7761c9', soft: '#e7ddee', warm: '#ed9672', green: '#70a69b', gold: '#e9bd5c', night: '#202841', white: '#fffdf7' },
    ocean: { paper: '#eef4ef', ink: '#193c47', accent: '#377f89', soft: '#d5e6df', warm: '#e58b67', green: '#77ad89', gold: '#e0b65d', night: '#193c47', white: '#fbfdf9' },
    midnight: { paper: '#f0edf6', ink: '#28283f', accent: '#6263b5', soft: '#ddddef', warm: '#d58d91', green: '#7caaa7', gold: '#dfba6e', night: '#20243e', white: '#faf8ff' },
};
const path = (id: string, commands: PathCommand[], fill: string, position: [
    number,
    number
] = [0, 0], extra = {}): Layer => ({ id, type: 'path', position, commands, fill, ...extra });
const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, radius = 0): Layer => ({ id, type: 'rect', position: [x, y], size: [w, h], fill, radius });
const circle = (id: string, x: number, y: number, radius: number, fill: string): Layer => ({ id, type: 'circle', position: [x, y], radius, fill });
const group = (id: string, x: number, y: number, children: Layer[], extra = {}): GroupLayer => ({ id, type: 'group', position: [x, y], children, ...extra });
const line = (id: string, commands: PathCommand[], stroke: string, width = 3): Layer => path(id, commands, '#00000000', [0, 0], { stroke, strokeWidth: width });
const measure = createSurface(64, 64).getContext('2d');
/** Fit to a declared region. Unsupported density is an error, never discarded text. */
function text(id: string, value: string, x: number, y: number, width: number, height: number, color: string, size = 44, min = 28, bold = true, align: 'left' | 'center' | 'right' = 'left'): Layer {
    for (let fontSize = size; fontSize >= min; fontSize--) {
        measure.font = `${bold ? 'bold ' : ''}${fontSize}px "Rachana Sans", "Rachana Devanagari", "Rachana Gujarati"`;
        if (wrapText(measure, value, width).length * fontSize * 1.2 <= height)
            return { id, type: 'text', position: [x, y], text: value, fontSize, color, maxWidth: width, lineHeight: 1.2, fontWeight: bold ? 'bold' : 'normal', align };
    }
    throw new Error(`Display text does not fit ${id}. Shorten the heading or labels in explicit beats.`);
}
function star(id: string, x: number, y: number, size: number, fill: string): Layer {
    const commands: PathCommand[] = [];
    for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? size * .28 : size;
        commands.push([i ? 'L' : 'M', Math.cos(a) * r, Math.sin(a) * r]);
    }
    commands.push(['Z']);
    return path(id, commands, fill, [x, y]);
}
function show(layer: Layer, at: number, end: number, fade = .25): Layer {
    const length = Math.min(fade, (end - at) / 3);
    if (length <= 0)
        throw new Error('A visual needs a positive visible interval.');
    layer.opacity = 0;
    layer.clips = [...(layer.clips ?? []), { property: 'opacity', from: 0, to: 1, start: at, duration: length, ease: 'easeOutCubic' }, { property: 'opacity', from: 1, to: 0, start: end - length, duration: length, ease: 'easeInCubic' }];
    return layer;
}
function motif(id: string, subject: Subject, p: Palette): GroupLayer {
    let art: Layer[];
    if (subject === 'book')
        art = [
            path(`${id}-pages`, [['M', 0, -58], ['Q', -61, -94, -88, -60], ['L', -88, 62], ['Q', -37, 39, 0, 72], ['Q', 40, 38, 88, 62], ['L', 88, -60], ['Q', 52, -94, 0, -58], ['Z']], p.white, [0, 0], { stroke: p.ink, strokeWidth: 3 }),
            line(`${id}-spine`, [['M', 0, -56], ['L', 0, 65]], p.accent, 4),
            ...[-34, -12, 10, 32].flatMap((y, i) => [line(`${id}-left-${i}`, [['M', -70, y], ['Q', -40, y - 10, -15, y + 2]], p.green, 3), line(`${id}-right-${i}`, [['M', 15, y + 2], ['Q', 40, y - 10, 70, y]], p.accent, 3)]),
        ];
    else if (subject === 'leaf')
        art = [
            path(`${id}-leaf-left`, [['M', 0, 30], ['C', -111, 17, -98, -78, -28, -53], ['Q', 11, -37, 0, 30], ['Z']], p.green),
            path(`${id}-leaf-right`, [['M', 1, 6], ['C', -11, -71, 76, -113, 93, -55], ['Q', 99, 2, 1, 6], ['Z']], p.accent),
            line(`${id}-stem`, [['M', 0, 72], ['Q', -7, 2, 39, -53]], p.ink, 4),
            path(`${id}-pot`, [['M', -53, 45], ['L', 53, 45], ['L', 38, 99], ['Q', 0, 111, -38, 99], ['Z']], p.warm),
            rect(`${id}-rim`, -59, 36, 118, 18, p.warm, 6),
        ];
    else if (subject === 'shield')
        art = [
            path(`${id}-shield`, [['M', 0, -100], ['Q', 42, -61, 90, -59], ['L', 78, 20], ['Q', 64, 81, 0, 110], ['Q', -67, 81, -78, 20], ['L', -90, -59], ['Q', -42, -61, 0, -100], ['Z']], p.accent, [0, 0], { stroke: p.ink, strokeWidth: 3 }),
            line(`${id}-check`, [['M', -37, 0], ['L', -6, 32], ['L', 46, -35]], p.white, 12),
        ];
    else if (subject === 'board')
        art = [
            rect(`${id}-back`, -108, -83, 216, 172, p.white, 14),
            ...[-70, 0, 70].flatMap((x, i) => [rect(`${id}-head-${i}`, x - 25, -61, 50, 13, [p.accent, p.green, p.warm][i], 5), rect(`${id}-card-${i}`, x - 25, -25, 50, 40, p.soft, 5), rect(`${id}-card2-${i}`, x - 25, 26, 50, 40, p.soft, 5)]),
            line(`${id}-check`, [['M', -84, -9], ['L', -73, 1], ['L', -57, -15]], p.accent, 3),
        ];
    else
        art = [circle(`${id}-disc`, 0, 0, 80, p.soft), star(`${id}-spark`, 0, 0, 56, p.gold), star(`${id}-small`, 76, -66, 16, p.warm), line(`${id}-trail`, [['M', -98, 72], ['Q', -137, -17, -86, -60]], p.accent, 3)];
    return group(id, 0, 0, art);
}
function presenter(id: string, shot: PlannedShot, p: Palette, x: number, scale: number, pose: 'think' | 'explain' | 'point' | 'celebrate'): Layer {
    return createCharacter({ id, position: [x, 603], scale, pose, expression: pose === 'think' ? 'curious' : pose === 'explain' ? 'focused' : 'happy', shirt: shot.template === 'closing' ? p.gold : p.warm, start: shot.start, end: shot.end });
}
function renderShot(shot: PlannedShot, p: Palette): Layer {
    const id = shot.id, dark = shot.template === 'closing' || shot.template === 'process';
    const color = dark ? p.white : p.ink, background = dark ? p.night : p.paper;
    const layers: Layer[] = [rect(`${id}-bg`, 0, 0, 1280, 720, background)];
    if (shot.template === 'opening') {
        layers.push(path(`${id}-blob`, [['M', 165, 604], ['C', 72, 401, 188, 197, 372, 217], ['Q', 611, 179, 602, 468], ['Q', 589, 653, 165, 604], ['Z']], p.soft), presenter(`${id}-presenter`, shot, p, 345, .88, 'think'), text(`${id}-heading`, shot.heading, 660, 142, 550, 166, color, 47), group(`${id}-motif`, 930, 435, [motif(`${id}-symbol`, shot.subject, p)], { scale: 1.05, clips: drift([930, 435], shot.start, shot.end, 4, 3.5) }));
    }
    else if (shot.template === 'closing') {
        layers.push(path(`${id}-land`, [['M', 650, 720], ['Q', 847, 470, 1280, 615], ['L', 1280, 720], ['Z']], p.accent), text(`${id}-heading`, shot.heading, 67, 167, 760, 200, color, 62, 35), presenter(`${id}-presenter`, shot, p, 1020, .88, 'celebrate'), star(`${id}-spark`, 854, 190, 35, p.gold), star(`${id}-spark2`, 1153, 306, 20, p.warm));
    }
    else if (shot.template === 'focus') {
        layers.push(text(`${id}-heading`, shot.heading, Number(id.split('-').at(-1)) % 2 ? 650 : 64, 130, Number(id.split('-').at(-1)) % 2 ? 565 : 630, 155, color, 46), presenter(`${id}-presenter`, shot, p, Number(id.split('-').at(-1)) % 2 ? 995 : 306, .74, Number(id.split('-').at(-1)) % 2 ? 'explain' : 'point'), circle(`${id}-glow`, Number(id.split('-').at(-1)) % 2 ? 340 : 938, 366, 194, p.soft), group(`${id}-motif`, Number(id.split('-').at(-1)) % 2 ? 340 : 938, 366, [motif(`${id}-symbol`, shot.subject, p)], { scale: 1.5, clips: drift([Number(id.split('-').at(-1)) % 2 ? 340 : 938, 366], shot.start, shot.end, 4, 3.8) }));
    }
    else if (shot.template === 'process') {
        layers.push(text(`${id}-heading`, shot.heading, 64, 128, 1090, 140, color, 46), presenter(`${id}-presenter`, shot, p, 245, .69, 'explain'));
        const items = shot.items.slice(0, 3);
        layers.push(line(`${id}-thread`, [['M', 470, 380], ['C', 610, 265, 710, 496, 850, 380], ['Q', 1010, 272, 1140, 380]], p.green, 4));
        items.forEach((label, i) => {
            const at = shot.itemStarts[i], x = 550 + i * 260;
            layers.push(show(group(`${id}-step-${i}`, x, 380, [circle(`${id}-step-disc-${i}`, 0, 0, 48, p.white), text(`${id}-number-${i}`, String(i + 1), 0, -22, 65, 54, p.accent, 35, 28, true, 'center'), text(`${id}-step-label-${i}`, label, 0, 83, 225, 85, p.white, 20, 16, false, 'center')], { clips: pop(at) }), at, shot.end));
        });
    }
    else {
        const items = shot.items.slice(0, shot.template === 'compare' ? 2 : 3);
        layers.push(text(`${id}-heading`, shot.heading, 64, 127, 1130, 145, color, 48), presenter(`${id}-presenter`, shot, p, 300, .76, 'point'));
        const count = items.length;
        items.forEach((label, i) => {
            const at = shot.itemStarts[i], x = count === 2 ? 730 + i * 320 : 660 + i * 215, w = count === 2 ? 255 : 180;
            const symbol = motif(`${id}-symbol-${i}`, shot.subject, p);
            symbol.position = [0, -20];
            symbol.scale = count === 2 ? .5 : .42;
            layers.push(show(group(`${id}-card-${i}`, x, 405, [rect(`${id}-shadow-${i}`, -w / 2 + 7, -113, w, 284, p.soft, 16), rect(`${id}-paper-${i}`, -w / 2, -120, w, 284, p.white, 16), rect(`${id}-stripe-${i}`, -w / 2, -120, w, 18, [p.accent, p.green, p.warm][i], 9), symbol, text(`${id}-label-${i}`, label, 0, 47, w - 24, 100, p.ink, 20, 16, false, 'center')], { rotation: (i - (count - 1) / 2) * 5, clips: pop(at) }), at, shot.end));
        });
    }
    const actorFloor = shot.template === 'opening' ? 345 : shot.template === 'closing' ? 1020 : shot.template === 'process' ? 245 : shot.template === 'focus' && Number(id.split('-').at(-1)) % 2 ? 995 : 300;
    // Grounding/shapes are already part of a coherent template; never random per frame.
    layers.splice(1, 0, path(`${id}-floor`, [['M', actorFloor - 160, 606], ['Q', actorFloor, 574, actorFloor + 160, 606], ['Q', actorFloor, 627, actorFloor - 160, 606], ['Z']], dark ? '#00000020' : '#25263e12'));
    return show(group(id, 0, 0, layers), shot.start, shot.end, .18);
}
export interface PreviewReport {
    status: 'ready-for-preview';
    humanReviewRequired: true;
    projectId: string;
    planningMode: CreativePlan['planningMode'];
    shotCount: number;
    templates: string[];
    style: string;
    captionWords: number;
    captionCues: number;
    genericMotifShots: string[];
    layoutSamplesChecked: number;
    warnings: string[];
    limits: string[];
}
export function composePlan(plan: CreativePlan): {
    scene: Scene;
    report: PreviewReport;
} {
    const p = palettes[plan.style];
    if (!p)
        throw new Error('Unknown art-direction preset.');
    const scale = plan.output.width / 1280;
    const children: Layer[] = plan.shots.map(shot => renderShot(shot, p));
    children.push(rect('identity-strip', 0, 0, 1280, 72, p.paper), text('project-title', plan.title.toLocaleUpperCase('en'), 40, 25, 900, 27, p.ink, 17, 12), text('film-mode', 'ILLUSTRATED EXPLAINER', 1235, 27, 280, 25, p.ink, 12, 10, false, 'right'), rect('caption-band', 0, 632, 1280, 88, p.paper));
    const words = plan.narration.words;
    plan.captions.forEach((cue, index) => children.push(show(text(`caption-${index}`, cue.text, 640, 651, 1170, 62, p.ink, 21, 18, false, 'center'), cue.start, cue.end, .08)));
    const scene: Scene = { schemaVersion: 1, id: plan.id, output: { ...plan.output }, background: p.paper, narration: structuredClone(plan.narration), audio: { src: 'voice.wav', gain: 1 }, layers: [group('film', 0, 0, children, { scale })] };
    const validation = validateScene(scene);
    if (!validation.valid)
        throw new Error(validation.errors.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    const surface = createSurface(scene.output.width, scene.output.height);
    const times = new Set<number>([0, plan.output.durationSeconds - 1 / plan.output.fps]);
    for (const shot of plan.shots)
        for (const fraction of [.1, .5, .9])
            times.add(shot.start + (shot.end - shot.start) * fraction);
    for (const time of times)
        drawFrame(surface, evaluateScene(scene, time));
    return { scene, report: { status: 'ready-for-preview', humanReviewRequired: true, projectId: plan.id, planningMode: plan.planningMode, shotCount: plan.shots.length, templates: [...new Set(plan.shots.map(shot => shot.template))], style: plan.style, captionWords: words.length, captionCues: plan.captions.length, genericMotifShots: plan.shots.filter(shot => shot.subject === 'idea').map(shot => shot.id), layoutSamplesChecked: times.size, warnings: [...plan.warnings], limits: [
                'No automatic audio alignment or generative asset provider. Timings must match the script.',
                'Subjects are decorative motifs, not verified factual diagrams or authentic product screens.',
                'This report checks configured constraints and sampled layout; human review must assess story, relevance and artistic quality.',
            ] } };
}
