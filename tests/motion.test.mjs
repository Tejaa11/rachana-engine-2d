import test from 'node:test';
import assert from 'node:assert/strict';
import { appear, pop, arcMotion, drift } from '../dist/packages/creative/src/motion.js';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';
import { validateScene } from '../dist/packages/core/src/validate.js';

function scene(clips, extra = {}) {
  return { schemaVersion:1,id:'motion-presets',output:{width:320,height:200,fps:30,durationSeconds:8},background:'#ffffff',
    layers:[{id:'shape',type:'circle',position:[100,100],radius:10,fill:'#123456',clips,...extra}] };
}

test('reveal and pop presets compile to valid ordinary clips and settle', () => {
  const value=scene([...appear(1,5),...pop(1)],{opacity:0});
  assert.deepEqual(validateScene(value).errors,[]);
  assert.equal(evaluateScene(value,0).layers[0].opacity,0);
  assert.equal(evaluateScene(value,2).layers[0].scale,1);
  assert.equal(evaluateScene(value,5).layers[0].opacity,0);
});

test('arc movement samples stay on a deliberate ellipse and reach their endpoint', () => {
  const center=[100,100],radii=[50,25];
  const clips=arcMotion(center,radii,0,180,1,2,16);
  const value=scene(clips);
  assert.deepEqual(validateScene(value).errors,[]);
  assert.deepEqual(evaluateScene(value,1).layers[0].position,[150,100]);
  assert.ok(Math.abs(evaluateScene(value,2).layers[0].position[1]-125)<1e-9);
  assert.ok(Math.abs(evaluateScene(value,3).layers[0].position[0]-50)<1e-9);
  for(const clip of clips) {
    const [x,y]=clip.from;
    assert.ok(Math.abs(((x-100)/50)**2+((y-100)/25)**2-1)<1e-9);
  }
});

test('drift clips are continuous, finite, bounded and seekable', () => {
  const clips=drift([100,100],1,5,4,1.8);
  const value=scene(clips);
  assert.deepEqual(validateScene(value).errors,[]);
  for(let i=1;i<clips.length;i++) assert.deepEqual(clips[i].from,clips[i-1].to);
  assert.deepEqual(evaluateScene(value,5),evaluateScene(value,7));
});

test('motion presets reject invalid durations and unbounded work', () => {
  assert.throws(()=>appear(0,.4,.35));
  assert.throws(()=>appear(0,Infinity));
  assert.throws(()=>pop(-1));
  assert.throws(()=>arcMotion([0,0],[1,1],0,180,0,1,10000));
  assert.throws(()=>arcMotion([0,0],[1,1],0,Infinity,0,1));
  assert.throws(()=>drift([0,0],0,5,4,.000001));
  assert.throws(()=>drift([0,NaN],0,5));
});
