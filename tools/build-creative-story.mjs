/** Original, authored art direction compiled to ordinary reusable scene data. */
import { readFile, writeFile } from 'node:fs/promises';
import { createCharacter } from '../dist/packages/creative/src/character.js';
import { appear, pop, arcMotion, drift } from '../dist/packages/creative/src/motion.js';
import { validateScene } from '../dist/packages/core/src/validate.js';

const timing = JSON.parse(await readFile('examples/narrated-story/timing.json', 'utf8'));
const D = timing.durationSeconds;
const word = n => timing.words[n - 1].start;
const P = { paper: '#f8f1e5', ink: '#25263e', purple: '#7761c9', lilac: '#d9c9ef', coral: '#ed9672', mint: '#70a69b', gold: '#e9bd5c', night: '#202841', white: '#fffdf7', muted: '#797589' };
const path = (id, commands, fill, position = [0, 0], extra = {}) => ({ id, type: 'path', position, commands, fill, ...extra });
const circle = (id, x, y, radius, fill, extra = {}) => ({ id, type: 'circle', position: [x, y], radius, fill, ...extra });
const rect = (id, x, y, w, h, fill, radius = 0, extra = {}) => ({ id, type: 'rect', position: [x, y], size: [w, h], radius, fill, ...extra });
const group = (id, x, y, children, extra = {}) => ({ id, type: 'group', position: [x, y], children, ...extra });
const text = (id, content, x, y, size = 32, color = P.ink, width = 900, extra = {}) => ({ id, type: 'text', text: content, position: [x, y], fontSize: size, maxWidth: width, color, ...extra });
function star(id, x, y, radius = 18, fill = P.gold, extra = {}) {
  const commands = [];
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? radius * 0.28 : radius;
    commands.push([i ? 'L' : 'M', Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  commands.push(['Z']);
  return path(id, commands, fill, [x, y], extra);
}
function ellipse(id, x, y, rx, ry, fill, extra = {}) {
  const k = 0.5522847498;
  return path(id, [['M', -rx, 0], ['C', -rx, -ry*k, -rx*k, -ry, 0, -ry], ['C', rx*k, -ry, rx, -ry*k, rx, 0], ['C', rx, ry*k, rx*k, ry, 0, ry], ['C', -rx*k, ry, -rx, ry*k, -rx, 0], ['Z']], fill, [x, y], extra);
}
function line(id, points, stroke = P.ink, width = 3, extra = {}) {
  return path(id, points, '#00000000', [0, 0], { stroke, strokeWidth: width, ...extra });
}
function paper(id, x, y, angle, color = P.white) {
  return group(id, x, y, [
    rect(`${id}-shadow`, 5, 7, 160, 190, '#25263e15', 8), rect(`${id}-sheet`, 0, 0, 160, 190, color, 8),
    rect(`${id}-line1`, 22, 29, 84, 8, P.purple, 4), rect(`${id}-line2`, 22, 53, 116, 5, '#bcb5c7', 3),
    rect(`${id}-line3`, 22, 70, 100, 5, '#bcb5c7', 3),
    star(`${id}-art`, 79, 129, 31, P.coral),
  ], { rotation: angle });
}
function sparkField(id, color, count = 23) {
  return Array.from({ length: count }, (_, i) => {
    const x = 72 + (i * 137) % 1130, y = 120 + (i * 79) % 440;
    return i % 4 === 0 ? star(`${id}-${i}`, x, y, 5 + i % 5, color) : circle(`${id}-${i}`, x, y, 1.5 + i % 2, color);
  });
}
function shot(id, start, end, children, fill) {
  return group(id, 0, 0, [rect(`${id}-back`, 0, 0, 1280, 720, fill), ...children], {
    opacity: start === 0 ? 1 : 0,
    clips: start === 0 ? [{ property: 'opacity', from: 1, to: 0, start: end - 0.22, duration: 0.22, ease: 'easeInCubic' }]
      : end === D ? [{ property: 'opacity', from: 0, to: 1, start, duration: 0.28, ease: 'easeOutCubic' }]
      : appear(start, end, 0.28),
  });
}
function reveal(layer, at, duration = 0.3) {
  layer.opacity = 0;
  layer.clips = [...(layer.clips || []), { property: 'opacity', from: 0, to: 1, start: at, duration, ease: 'easeOutCubic' }];
  return layer;
}
const cuts = [0, word(13)-0.08, word(35)-0.12, word(42)-0.1, word(51)-0.12, D];

// 01: A human idea, told through an actual character, paper and an emerging spark.
const intro = [
  path('intro-blob', [['M',180,601], ['C',90,440,143,196,355,204], ['C',556,170,674,407,569,575], ['C',478,654,285,666,180,601], ['Z']], '#e8dcee'),
  ellipse('intro-floor', 380, 593, 250, 25, '#cbbbc871'),
  paper('draft-paper', 650, 326, -14), paper('idea-paper', 842, 300, 12, '#f0e5c8'),
  createCharacter({ id: 'mira-thinks', position: [375, 594], scale: 0.91, pose: 'think', expression: 'curious', start: 0, end: cuts[1] }),
  text('intro-title', 'Every story\nstarts somewhere.', 690, 127, 47, P.ink, 520, { fontWeight: 'bold', lineHeight: 1.14 }),
  text('intro-note', 'A small thought. A whole possibility.', 691, 249, 17, P.muted, 500),
  line('idea-trail', [['M',425,279],['C',461,173,542,238,566,165],['C',590,102,660,153,654,177]], P.purple, 3),
  reveal(star('opening-spark', 566, 177, 38, P.gold, { clips: pop(word(6)) }), word(6)),
  star('intro-spark-small', 234, 245, 13, P.coral), star('intro-spark-left', 143, 394, 12, P.purple),
  line('pencil-line', [['M',714,469],['L',856,442]], P.ink, 11),
];

// 02: An illustrated world. Orbit follows a real arc rather than diagonal jumps.
const worldStart = cuts[1], worldEnd = cuts[2];
const moon = group('moon-character', 1090, 360, [
  circle('moon-body', 0, 0, 38, P.gold), circle('moon-crater1', -15, -13, 8, '#d09f49'), circle('moon-crater2', 15, 16, 5, '#d09f49'),
  circle('moon-eye1', -8, -1, 2.2, P.ink), circle('moon-eye2', 8, -1, 2.2, P.ink),
  line('moon-smile', [['M',-6,9],['Q',0,15,7,9]], P.ink, 2),
], { opacity: 0, clips: [
  { property:'opacity',from:0,to:1,start:word(18),duration:.35,ease:'easeOutCubic' },
  ...arcMotion([870,355],[220,140],0,-150,word(26),3.2,32),
] });
const world = [
  ...sparkField('space-dust', '#8c89ad', 29),
  ellipse('planet-glow', 870, 355, 188, 180, '#9fa9cb12'),
  ellipse('orbit-outer', 870, 355, 220, 140, '#00000000', { stroke:'#6f7597', strokeWidth:1.5, rotation:-7 }),
  circle('earth-back', 870, 355, 116, '#6096a4'),
  path('earth-continent1', [['M',-72,-83],['C',-23,-116,18,-101,24,-59],['Q',54,-33,11,-14],['Q',-34,-18,-38,16],['Q',-77,28,-86,-18],['Q',-115,-41,-72,-83],['Z']], '#9fc5a3', [870,355]),
  path('earth-continent2', [['M',16,48],['Q',33,17,71,33],['Q',106,59,60,96],['Q',19,110,16,48],['Z']], '#9fc5a3', [870,355]),
  ellipse('earth-highlight', 838, 298, 24, 9, '#d0e4d261', { rotation:-33 }), moon,
  createCharacter({ id:'mira-explores',position:[340,598],scale:.75,pose:'point',expression:'happy',start:worldStart,end:worldEnd,shirt:P.gold }),
  text('world-title','A whole world\nfrom one idea.',65,148,46,P.white,610,{fontWeight:'bold',lineHeight:1.12}),
  text('diagram-note','ILLUSTRATIVE WORLD · NOT TO SCALE',657,539,12,'#a8b2cb',570),
  reveal(text('earth-tag','EARTH',870,488,15,P.white,200,{align:'center',fontWeight:'bold'}),word(17)),
];

// 03: Word anchors become an illustrated thread joining thought to performance.
const anchors = [
  path('anchor-backdrop',[['M',0,493],['C',312,612,543,169,916,298],['Q',1211,445,1280,209],['L',1280,720],['L',0,720],['Z']],'#e5e8dd'),
  text('anchor-head','Give every beat\na reason to move.',66,147,46,P.ink,700,{fontWeight:'bold',lineHeight:1.15}),
  createCharacter({id:'mira-explains',position:[1015,600],scale:.84,pose:'explain',expression:'focused',start:cuts[2],end:cuts[3]}),
  line('voice-thread',[['M',76,443],['C',166,379,154,494,236,437],['C',310,363,346,501,411,435],['C',468,369,508,497,578,431],['C',661,360,694,478,763,425],['Q',804,397,851,430]],P.purple,4),
  ...[word(35),word(39),word(40),word(41)].map((at,i)=>reveal(group(`voice-node-${i}`,180+i*180,430,[circle(`voice-node-ring-${i}`,0,0,20,P.white),star(`voice-node-star-${i}`,0,0,13,[P.gold,P.coral,P.mint,P.purple][i])],{clips:pop(at)}),at)),
  text('anchor-footer','The voice gives the scene its rhythm.',70,538,20,P.muted,780),
];

// 04: Three art-directed cards, carried by the same character and design system.
function poster(id,x,y,angle,color,kind,at) {
  const art = kind === 0 ? [circle(`${id}-sun`,0,0,34,P.gold),star(`${id}-spark`,43,-35,14,P.coral)]
    : kind === 1 ? [line(`${id}-thread`,[['M',-48,0],['Q',0,-46,48,0]],P.purple,5),circle(`${id}-dot`,0,-18,15,P.coral)]
    : [path(`${id}-leaf`,[['M',-27,27],['C',-68,-37,38,-66,38,-27],['Q',60,31,-27,27],['Z']],P.mint),star(`${id}-shine`,46,-43,13,P.gold)];
  return reveal(group(id,x,y,[rect(`${id}-shadow`,-82,-102,176,225,'#25263e1b',15),rect(`${id}-paper`,-88,-110,176,225,P.white,15),rect(`${id}-header`,-88,-110,176,22,color,10),...art,text(`${id}-label`,['COLOUR','TIMING','EXPRESSION'][kind],0,63,13,P.ink,160,{align:'center',fontWeight:'bold'})],{rotation:angle,clips:pop(at)}),at);
}
const revision = [
  circle('revision-glow',977,350,276,'#e2d8ee'),
  text('revision-title','Make it yours.',67,153,61,P.ink,900,{fontWeight:'bold'}),
  text('revision-note','A little colour. A different feeling.',69,237,21,P.muted,780),
  createCharacter({id:'mira-revises',position:[343,600],scale:.8,pose:'point',expression:'happy',start:cuts[3],end:cuts[4],shirt:P.mint}),
  poster('colour-poster',695,407,-10,P.coral,0,word(42)),
  poster('timing-poster',891,375,3,P.purple,1,word(45)),
  poster('expression-poster',1093,407,11,P.mint,2,word(49)),
  star('revision-spark',590,319,15,P.gold),star('revision-spark2',1190,234,20,P.coral),
];
const close = [
  ...sparkField('closing-stars','#c4b8e5',17),
  path('closing-land',[['M',628,720],['C',769,473,986,483,1280,626],['L',1280,720],['Z']],'#5a4b9a'),
  text('closing-title','Your story.\nIn motion.',67,170,76,P.white,800,{fontWeight:'bold',lineHeight:1.08}),
  text('closing-brand','RACHANA ENGINE 2D',72,384,21,'#e2d9f2',750,{fontWeight:'bold'}),
  text('closing-note','Imagination, with a little direction.',73,431,20,'#e2d9f2',740),
  createCharacter({id:'mira-celebrates',position:[1000,603],scale:.9,pose:'celebrate',expression:'happy',start:cuts[4],end:D,shirt:P.gold}),
  star('closing-idea',855,209,40,P.gold,{clips:[...pop(word(57)),...drift([855,209],word(57),D,5,2)]}),
  star('closing-star2',1150,300,21,P.coral),
];
const stages = [shot('opening',cuts[0],cuts[1]+.22,intro,P.paper),shot('world',cuts[1],cuts[2]+.22,world,P.night),shot('anchors',cuts[2],cuts[3]+.22,anchors,P.paper),shot('revision',cuts[3],cuts[4]+.22,revision,'#f2edf5'),shot('closing',cuts[4],D,close,P.purple)];
// Consistent branding and a reserved caption band keep the illustrated sets readable.
const overlay = [rect('brand-paper',0,0,1280,72,P.paper),text('brand-mark','R / RACHANA ENGINE 2D',42,25,16,P.ink,750,{fontWeight:'bold'}),text('brand-director','AN IDEA, BROUGHT TO LIFE',1235,27,12,P.muted,500,{align:'right'}),rect('caption-paper',0,631,1280,89,P.paper)];
const groups = [[1,6],[7,12],[13,17],[18,23],[24,34],[35,41],[42,50],[51,53],[54,56],[57,60]];
for (let i=0;i<groups.length;i++) {
  const [a,b]=groups[i], at=word(a), end=i+1<groups.length?word(groups[i+1][0]):D;
  const lineText=timing.words.slice(a-1,b).map(w=>w.text).join(' ');
  overlay.push(text(`caption-${i}`,lineText,640,657,20,P.ink,1170,{align:'center',opacity:0,clips:appear(at,end,.12)}));
}
const scene={schemaVersion:1,id:'creative-narrated-story',output:{width:1920,height:1080,fps:30,durationSeconds:D},background:P.paper,audio:{src:'creative-mix.wav',gain:1},narration:{words:timing.words,timingSource:'synthesis-events'},layers:[group('film',0,0,[...stages,...overlay],{scale:1.5})]};
const checked=validateScene(scene);
if(!checked.valid)throw new Error(JSON.stringify(checked.errors,null,2));
await writeFile('examples/narrated-story/creative.scene.json',JSON.stringify(scene,null,2)+'\n');
console.log('Creative scene compiled from original character, motion and composition prefabs.');
