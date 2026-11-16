import type { Scene, Word } from '../../core/src/types.js';
export const templates = ['opening', 'focus', 'cards', 'process', 'compare', 'closing', 'illustration'] as const;
export type Template = typeof templates[number];
export type Style = 'paper' | 'ocean' | 'midnight';
export type Subject = 'idea' | 'book' | 'leaf' | 'board' | 'shield';
export interface VisualInput {
    image?: string;
    prop?: string;
    layout?: 'left' | 'right' | 'full';
    focalPoint?: [number, number];
}
export interface BeatInput {
    fromWord: string;
    toWord: string;
    heading: string;
    template?: Template;
    items?: string[];
    subject?: Subject;
    visual?: VisualInput;
    intent?: string;
    acting?: 'think' | 'explain' | 'point' | 'celebrate';
    transition?: 'cut'|'fade';
}
export interface ProductionConfig {
    schemaVersion: 1;
    id: string;
    title: string;
    script: string;
    audio: string;
    timing: string;
    style?: Style;
    beats?: BeatInput[];
    assetRegistry?: string;
    assetStyle?: string;
    defaultVisual?: VisualInput;
    output?: {
        width: 1280 | 1920;
        height: 720 | 1080;
        fps: 24 | 30 | 60;
    };
}
export interface Timing {
    durationSeconds: number;
    words: Word[];
    timingSource: NonNullable<Scene['narration']>['timingSource'];
}
export interface PlannedShot {
    id: string;
    template: Template;
    start: number;
    end: number;
    fromWord: string;
    toWord: string;
    heading: string;
    items: string[];
    subject: Subject;
    itemStarts: number[];
    direction: string;
    visual?: VisualInput;
    intent?: string;
    acting?: BeatInput['acting'];
    transition?: 'cut'|'fade';
}
export interface CreativePlan {
    schemaVersion: 1;
    id: string;
    title: string;
    style: Style;
    output: {
        width: number;
        height: number;
        fps: number;
        durationSeconds: number;
    };
    narration: NonNullable<Scene['narration']>;
    shots: PlannedShot[];
    captions: {
        text: string;
        start: number;
        end: number;
        fromWord: string;
        toWord: string;
    }[];
    warnings: string[];
    planningMode: 'explicit-beats' | 'local-rules';
}
export function compact(text: string): string {
    return text.toLocaleLowerCase('en').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}
function subjectFor(text: string): Subject {
    if (/\b(seed|plant|root|leaf|garden|grow)\b/i.test(text))
        return 'leaf';
    if (/\b(learn|read|book|study|practice|lesson)\b/i.test(text))
        return 'book';
    if (/\b(task|team|project|board|plan|work)\b/i.test(text))
        return 'board';
    if (/\b(protect|safe|secure|password|private)\b/i.test(text))
        return 'shield';
    return 'idea';
}
function sourceSentences(script: string, words: Word[], from: number, to: number): string[] {
    const begin = words.slice(0, from).reduce((n, w) => n + compact(w.text).length, 0);
    const finish = words.slice(0, to + 1).reduce((n, w) => n + compact(w.text).length, 0);
    let offset = 0;
    const matches: string[] = [];
    for (const { segment } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(script)) {
        const end = offset + compact(segment).length;
        if (offset >= begin && end <= finish)
            matches.push(segment.trim().replace(/[.!?]+$/, ''));
        offset = end;
    }
    return matches.length ? matches : [words.slice(from, to + 1).map(w => w.text).join(' ')];
}
function comparison(text: string): string[] | null {
    const value = text.replace(/^[Ff]irst,?\s+/, '').trim();
    const instead = value.match(/^(.+?)\s+instead of\s+(.+)$/i);
    if (instead)
        return [instead[1], instead[2]];
    const compare = value.match(/^Compare\s+(.+?)\s+(?:with|to)\s+(.+)$/i);
    return compare ? [compare[1], compare[2]] : null;
}
function chooseTemplate(index: number, total: number, text: string): Template {
    if (index === 0)
        return 'opening';
    if (index === total - 1)
        return 'closing';
    if (/\b(instead|before|after|rather|compare|while)\b/i.test(text))
        return 'compare';
    if (/\b(first|then|next|step|follow|start|becomes)\b/i.test(text))
        return 'process';
    return (['focus', 'cards', 'process'] as Template[])[(index - 1) % 3];
}
function phraseStart(words: Word[], phrase: string): number | undefined {
    const wanted = compact(phrase);
    for (let from = 0; from < words.length; from++) {
        let text = '';
        for (let to = from; to < words.length && text.length < wanted.length; to++) {
            text += compact(words[to].text);
            if (text === wanted)
                return words[from].start;
        }
    }
    return undefined;
}
/** A constrained planner: source text and local rules, not a language model or factual researcher. */
export function planProduction(config: ProductionConfig, script: string, timing: Timing): CreativePlan {
    if (!Number.isFinite(timing.durationSeconds) || timing.durationSeconds < 6 || timing.durationSeconds > 90)
        throw new Error('The production composer currently supports 6–90 second pilots. Split longer work into smaller projects.');
    const words = timing.words;
    if (!Array.isArray(words) || words.length < 12 || words.length > 350)
        throw new Error('A pilot needs 12–350 supplied narration words.');
    if (!['manual', 'reviewed', 'synthesis-events'].includes(timing.timingSource))
        throw new Error('Declare the source of supplied word timings.');
    const ids = new Set<string>();
    let previousEnd = 0;
    for (const word of words) {
        if (!word || typeof word.id !== 'string' || !word.id || ids.has(word.id) || typeof word.text !== 'string' || !compact(word.text))
            throw new Error('Word IDs must be unique and every word needs text.');
        if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previousEnd - 1e-6 || word.end <= word.start || word.end > timing.durationSeconds + 1e-6)
            throw new Error(`Invalid or overlapping word timing: ${word.id}`);
        ids.add(word.id);
        previousEnd = word.end;
    }
    if (compact(script) !== compact(words.map(word => word.text).join(' ')))
        throw new Error('Script and timing text differ. Correct the transcript or supply matching timing before composing.');
    const warnings: string[] = [];
    const sentenceStops = new Map<number, string>();
    let chars = 0;
    const ends = new Map<number, string>();
    for (const { segment } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(script)) {
        chars += compact(segment).length;
        ends.set(chars, segment.trim().match(/[.!?]+["'’”]*$/)?.[0] ?? '');
    }
    chars = 0;
    words.forEach((word, index) => { chars += compact(word.text).length; if (ends.has(chars))
        sentenceStops.set(index, ends.get(chars)!); });
    let ranges: {
        from: number;
        to: number;
        explicit?: BeatInput;
    }[] = [];
    if (config.beats?.length) {
        let next = 0;
        for (const beat of config.beats) {
            const from = words.findIndex(word => word.id === beat.fromWord);
            const to = words.findIndex(word => word.id === beat.toWord);
            if (from !== next || to < from)
                throw new Error('Explicit beats must cover every word once, in order, with valid anchors.');
            ranges.push({ from, to, explicit: beat });
            next = to + 1;
        }
        if (next !== words.length)
            throw new Error('Explicit beats omit narration words.');
    }
    else {
        // Resolve sentence boundaries through cumulative normalized text, not word-text lookup.
        const boundaries = new Set(sentenceStops.keys());
        let from = 0;
        for (let i = 0; i < words.length; i++) {
            const start = from === 0 ? 0 : words[from].start;
            const end = i + 1 < words.length ? words[i + 1].start : timing.durationSeconds;
            if ((boundaries.has(i) && end - start >= 2.4 - 1e-6) || i === words.length - 1) {
                ranges.push({ from, to: i });
                from = i + 1;
            }
        }
        if (ranges.length > 1) {
            const last = ranges.at(-1)!;
            if (timing.durationSeconds - words[last.from].start < 2.3) {
                ranges[ranges.length - 2].to = last.to;
                ranges.pop();
            }
        }
        warnings.push('Headings use complete source sentences and labels use source phrases selected by local rules. Review emphasis and supply explicit beats for stronger storytelling.');
    }
    if (ranges.length > 12)
        throw new Error('The composer supports at most 12 shots per pilot. Merge beats or split the project.');
    const shots = ranges.map(({ from, to, explicit }, index): PlannedShot => {
        const span = words.slice(from, to + 1);
        const start = from === 0 ? 0 : words[from].start;
        const end = to === words.length - 1 ? timing.durationSeconds : words[to + 1].start;
        if (end - start < 1.6)
            throw new Error(`Shot ${index + 1} is too short to read. Merge it with a neighboring beat.`);
        const sentences = sourceSentences(script, words, from, to);
        const topic = span.map(word => word.text).join(' ');
        let template = explicit?.template ?? chooseTemplate(index, ranges.length, topic);
        const comparedSentence = sentences.find(sentence => comparison(sentence));
        const compared = comparedSentence ? comparison(comparedSentence) : null;
        if (!explicit && index > 0 && index < ranges.length - 1) {
            if (compared)
                template = 'compare';
            else if (sentences.length >= 2)
                template = /\b(first|then|next|step)\b/i.test(topic) ? 'process' : 'cards';
            else
                template = 'focus';
        }
        const rawVisual=explicit?.visual??config.defaultVisual;
        const visual=rawVisual?{...structuredClone(rawVisual),layout:rawVisual.layout??(index%2===0?'left':'right') as 'left'|'right'}:undefined;
        if(visual) {
            if(explicit?.template&&explicit.template!=='illustration')throw new Error(`Shot ${index+1}: visual artwork requires the illustration template or an omitted template.`);
            template='illustration';
        } else if(template==='illustration')throw new Error(`Shot ${index+1}: illustration needs image or prop artwork.`);
        const heading = explicit?.heading ?? (template === 'compare' && comparedSentence ? comparedSentence : sentences[0]);
        const usesItems = ['cards', 'compare', 'process'].includes(template);
        const items = usesItems ? (explicit?.items ?? (template === 'compare' && compared ? compared : sentences.slice(0, 3))) : [];
        if (usesItems && (items.length < 2 || items.length > 3 || (template === 'compare' && items.length !== 2)))
            throw new Error(`Shot ${index + 1}: compare needs exactly two items; cards/process need two or three.`);
        if (!usesItems && explicit?.items?.length)
            throw new Error(`Shot ${index + 1}: ${template} does not display items. Choose a list template or remove the unused labels.`);
        if (heading.length > 110 || items.some(item => item.length > 70))
            throw new Error(`Shot ${index + 1} has too much display text. Provide shorter beat headings/items.`);
        const itemStarts = items.map((label, i) => {
            const matched = phraseStart(span, label);
            if (matched !== undefined)
                return Math.min(Math.max(start + .2, matched), end - .7);
            warnings.push(`Shot ${index + 1}, item ${i + 1}: label is editorial text; reveal uses a stagger rather than a matched word.`);
            return start + .28 + i * Math.min(.5, (end - start) / 7);
        });
        if (heading.split(/\s+/).length / (end - start) > 3)
            warnings.push(`Shot ${index + 1}: the heading may be too dense for its duration.`);
        items.forEach((label, i) => { if (label.split(/\s+/).length / (end - itemStarts[i]) > 3)
            warnings.push(`Shot ${index + 1}, item ${i + 1}: short reading hold; revise the beat or use a shorter label.`); });
        if (end - start > 12)
            warnings.push(`Shot ${index + 1} lasts over 12 seconds; review its pacing.`);
        return { id: `shot-${index + 1}`, template, start, end, fromWord: words[from].id, toWord: words[to].id,
            heading, items, itemStarts, ...(visual?{visual:structuredClone(visual)}:{}), ...(explicit?.intent?{intent:explicit.intent}:{}), ...(explicit?.acting?{acting:explicit.acting}:{}), ...(explicit?.transition?{transition:explicit.transition}:{}),subject: explicit?.subject ?? subjectFor(topic),
            direction: `${template}: readable text, a stable presenter, an illustrative ${explicit?.subject ?? subjectFor(topic)} motif, and narration-timed reveals.` };
    });
    if (shots.length < 3)
        warnings.push('Fewer than three shots: this script has few usable sentence boundaries. Supply explicit beats to vary the staging.');
    if (new Set(shots.map(shot => shot.template)).size < Math.min(3, shots.length))
        warnings.push('Low composition variety: choose additional templates for explicit beats.');
    const shotStops = new Set(shots.map(shot => words.findIndex(word => word.id === shot.toWord)));
    const captions: CreativePlan['captions'] = [];
    let segmentFrom = 0;
    for (let i = 0; i < words.length; i++) {
        if (!sentenceStops.has(i) && !shotStops.has(i) && i !== words.length - 1 && words[i + 1].start - words[i].end < .6)
            continue;
        let from = segmentFrom;
        // Balance a sentence across cues instead of leaving a one-word orphan.
        const count = Math.ceil((i - segmentFrom + 1) / 8);
        for (let part = 0; part < count; part++) {
            const size = Math.ceil((i - from + 1) / (count - part)), to = from + size - 1, span = words.slice(from, to + 1);
            const end = to + 1 < words.length ? Math.min(words[to + 1].start, words[to].end + .35) : timing.durationSeconds;
            const value = span.map(word => word.text).join(' ').replace(/[.!?]+$/, '') + (sentenceStops.get(to) ?? '');
            captions.push({ text: value, start: span[0].start, end, fromWord: span[0].id, toWord: span.at(-1)!.id });
            from = to + 1;
        }
        segmentFrom = i + 1;
    }
    for (let i = 2; i < shots.length; i++)
        if (shots[i].template === shots[i - 1].template && shots[i].template === shots[i - 2].template && shots[i].visual?.layout === shots[i-1].visual?.layout && shots[i].visual?.layout === shots[i-2].visual?.layout)
            warnings.push(`Shot ${i + 1}: three consecutive ${shots[i].template} compositions; review staging variety or supply explicit beats.`);
    if (shots.filter(shot => !shot.visual&&shot.subject === 'idea').length > shots.length / 2)
        warnings.push('Most shots use the generic idea motif. Add topic-specific artwork before treating this as a finished film.');
    return { schemaVersion: 1, id: config.id, title: config.title, style: config.style ?? 'paper', output: { width: config.output?.width ?? 1920, height: config.output?.height ?? 1080, fps: config.output?.fps ?? 30, durationSeconds: timing.durationSeconds },
        narration: { words: words.map(word => ({ ...word })), timingSource: timing.timingSource }, shots, captions, warnings,
        planningMode: config.beats?.length ? 'explicit-beats' : 'local-rules' };
}
