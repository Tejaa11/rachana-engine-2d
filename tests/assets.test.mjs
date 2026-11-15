import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { deflateSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { inspectPng, validateAssetRegistry, loadAssetRegistry, buildAssetRegistry, validateAssetRequest, PNG_FILE_LIMIT } from '../dist/packages/assets/src/index.js';

async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rachana-assets-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function png(fill = '#217a63', transparent = false) {
  const canvas = createCanvas(4, 2), ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, transparent ? 2 : 4, 2);
  return canvas.toBuffer('image/png');
}
const provenance = { kind: 'procedural', creator: 'Rachana test fixture', source: 'Original deterministic Canvas colors', usage: 'Original test fixture, MIT source repository' };
async function fixture(t) {
  const dir = await temporary(t);
  const file = path.join(dir, 'asset-registry.json'), imageFile = path.join(dir, 'art.png');
  await writeFile(imageFile, png());
  const { sha256, width, height, hasTransparency } = await inspectPng(imageFile);
  const record = { id: 'original-art', kind: 'illustration', src: 'art.png', sha256, width, height, hasTransparency, provenance: structuredClone(provenance), review: { status: 'draft' } };
  const registry = { schemaVersion: 1, styleId: 'paper-v1', assets: [record] };
  await writeFile(file, JSON.stringify(registry));
  return { dir, file, imageFile, record, registry };
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, payload) {
  const value = Buffer.alloc(12 + payload.length);
  value.writeUInt32BE(payload.length); value.write(name, 4, 'ascii'); payload.copy(value, 8);
  value.writeUInt32BE(crc32(value.subarray(4, 8 + payload.length)), 8 + payload.length);
  return value;
}
function chunks(buffer) {
  const result = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    result.push({ offset, length, type }); offset += length + 12;
  }
  return result;
}

test('PNG inspection reads actual dimensions, stable content hash and pixel transparency', async t => {
  const dir = await temporary(t), opaque = path.join(dir, 'opaque.png'), alpha = path.join(dir, 'cutout.png');
  await writeFile(opaque, png()); await writeFile(alpha, png('#f28e65', true));
  const a = await inspectPng(opaque), b = await inspectPng(alpha);
  assert.equal(a.width, 4); assert.equal(a.height, 2); assert.equal(a.hasTransparency, false);
  assert.equal(b.hasTransparency, true);
  assert.match(a.sha256, /^[a-f0-9]{64}$/); assert.notEqual(a.sha256, b.sha256);
  assert.equal(a.bytes, (await readFile(opaque)).length);
  assert.equal(a.image.width, 4);
});

test('PNG inspection rejects SVG, JPEG signatures, arbitrary bytes and directories', async t => {
  const dir = await temporary(t);
  for (const [name, value] of [['svg.png', '<svg xmlns="http://www.w3.org/2000/svg"/>'], ['jpeg.png', Buffer.from([255,216,255,0,0])], ['empty.png', Buffer.alloc(0)]]) {
    const file = path.join(dir, name); await writeFile(file, value);
    await assert.rejects(inspectPng(file), /Only genuine static PNG/);
  }
  await assert.rejects(inspectPng(dir), /regular file/);
});

test('PNG inspection rejects corruption, truncated chunks and trailing payloads', async t => {
  const dir = await temporary(t), original = png();
  const damaged = Buffer.from(original); damaged[25] ^= 1;
  for (const [name, bytes] of [['damaged.png', damaged], ['truncated.png', original.subarray(0, original.length - 2)], ['trailing.png', Buffer.concat([original, Buffer.from('outside')])]]) {
    const file = path.join(dir, name); await writeFile(file, bytes);
    await assert.rejects(inspectPng(file), /checksum|Truncated|trailing/);
  }
});

test('oversized PNG dimensions are rejected from the checked header before decoding', async t => {
  const dir = await temporary(t), original = png();
  const header = Buffer.from(original.subarray(16, 29)); header.writeUInt32BE(4097, 0);
  const value = Buffer.concat([original.subarray(0, 8), chunk('IHDR', header), original.subarray(33)]);
  const file = path.join(dir, 'oversized.png'); await writeFile(file, value);
  await assert.rejects(inspectPng(file), /dimensions exceed/);
});

test('animated PNG and unknown critical chunks are rejected explicitly', async t => {
  const dir = await temporary(t), original = png();
  for (const [name, extra, expected] of [['animated.png', chunk('acTL', Buffer.from([0,0,0,1,0,0,0,0])), /Animated PNG/], ['critical.png', chunk('ABCD', Buffer.alloc(0)), /critical PNG chunk/]]) {
    const file = path.join(dir, name);
    await writeFile(file, Buffer.concat([original.subarray(0, 33), extra, original.subarray(33)]));
    await assert.rejects(inspectPng(file), expected);
  }
});

test('valid chunk checksums cannot hide invalid compressed image data', async t => {
  const dir = await temporary(t), original = png(), parts = chunks(original);
  const changed = Buffer.concat([original.subarray(0, 8), ...parts.map(({ offset, length, type }) => type === 'IDAT' ? chunk('IDAT', Buffer.from('not a zlib stream')) : original.subarray(offset, offset + length + 12))]);
  const file = path.join(dir, 'bad-data.png'); await writeFile(file, changed);
  await assert.rejects(inspectPng(file), /could not be decoded/);
});

test('PNG byte budget rejects sparse oversized files before reading image content', async t => {
  const dir = await temporary(t), file = path.join(dir, 'too-large.png'), handle = await open(file, 'w');
  try { await handle.truncate(PNG_FILE_LIMIT + 1); } finally { await handle.close(); }
  await assert.rejects(inspectPng(file), /12 MiB/);
});

test('registry loading verifies local art and preserves declared provenance and review state', async t => {
  const { file, registry, record } = await fixture(t);
  const before = JSON.stringify(registry);
  const loaded = await loadAssetRegistry(file);
  assert.deepEqual(loaded.registry, registry);
  assert.equal(loaded.images.get(record.id).width, record.width);
  assert.ok(path.isAbsolute(loaded.files.get(record.id)));
  assert.equal(JSON.stringify(registry), before);
  assert.equal(loaded.registry.assets[0].review.status, 'draft');
  for (const status of ['approved', 'rejected']) {
    const changed = structuredClone(registry); changed.assets[0].review.status = status;
    assert.doesNotThrow(() => validateAssetRegistry(changed));
  }
});

test('hash-identical assets reuse one decoded image within each registry load', async t => {
  const { file, registry } = await fixture(t);
  registry.assets.push({ ...structuredClone(registry.assets[0]), id: 'same-art-other-role', kind: 'prop' });
  await writeFile(file, JSON.stringify(registry));
  const loaded = await loadAssetRegistry(file);
  assert.equal(loaded.images.get('original-art'), loaded.images.get('same-art-other-role'));
});

test('metadata lies about hashes, dimensions and real transparency are rejected', async t => {
  const { file, registry } = await fixture(t);
  for (const [change, expected] of [[{ sha256: 'a'.repeat(64) }, /content hash/], [{ width: 2 }, /dimensions/], [{ hasTransparency: true }, /transparency/]]) {
    const changed = structuredClone(registry); Object.assign(changed.assets[0], change);
    await writeFile(file, JSON.stringify(changed));
    await assert.rejects(loadAssetRegistry(file), expected);
  }
});

test('later file changes are rechecked rather than hidden by a stale global cache', async t => {
  const { file, imageFile } = await fixture(t);
  await loadAssetRegistry(file);
  await writeFile(imageFile, png('#cd6543'));
  await assert.rejects(loadAssetRegistry(file), /content hash/);
});

test('registry schema rejects duplicate IDs, invisible provenance and unknown metadata', async t => {
  const { registry } = await fixture(t);
  const duplicate = structuredClone(registry); duplicate.assets.push(structuredClone(duplicate.assets[0]));
  assert.throws(() => validateAssetRegistry(duplicate), /Duplicate asset ID/);
  for (const mutate of [r => r.assets[0].provenance.secret = 'no', r => r.assets[0].review.status = 'validated', r => r.assets[0].provenance.creator = ' ', r => r.assets[0].sha256 = 'ABC', r => r.assets[0].width = 0, r => r.styleId = '../paper']) {
    const changed = structuredClone(registry); mutate(changed); assert.throws(() => validateAssetRegistry(changed));
  }
});

test('registry schema rejects remote, absolute, traversal, backslash and control-character paths', async t => {
  const { registry } = await fixture(t);
  for (const src of ['https://example.invalid/a.png', '/private/a.png', '../a.png', 'images/../../a.png', 'images\\a.png', 'bad\0.png']) {
    const changed = structuredClone(registry); changed.assets[0].src = src;
    assert.throws(() => validateAssetRegistry(changed), undefined, src);
  }
  const local = structuredClone(registry); local.assets[0].src = 'images/music 01.png';
  assert.doesNotThrow(() => validateAssetRegistry(local));
});

test('symlink escapes are rejected while registry-contained symlinks are allowed', async t => {
  const { dir, file, registry, imageFile } = await fixture(t);
  const nested = path.join(dir, 'nested'); await mkdir(nested);
  const outer = path.join(dir, 'outer.png'); await writeFile(outer, png());
  try {
    await symlink(imageFile, path.join(nested, 'outside.png'), 'file');
    await symlink(imageFile, path.join(dir, 'inside.png'), 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) { t.skip('Symlink privilege unavailable'); return; }
    throw error;
  }
  const internal = structuredClone(registry); internal.assets[0].src = 'inside.png'; await writeFile(file, JSON.stringify(internal));
  assert.equal((await loadAssetRegistry(file)).images.size, 1);
  const escaped = structuredClone(registry); escaped.assets[0].src = 'outside.png';
  const nestedFile = path.join(nested, 'asset-registry.json'); await writeFile(nestedFile, JSON.stringify(escaped));
  await assert.rejects(loadAssetRegistry(nestedFile), /symlink escapes/);
});

test('asset count, registry byte size and decoded pixel budgets are finite', async t => {
  const { dir, record, registry } = await fixture(t);
  const many = { ...registry, assets: Array.from({ length: 33 }, (_, i) => ({ ...record, id: `asset-${i}` })) };
  assert.throws(() => validateAssetRegistry(many), /32 items/);
  const large = { ...registry, assets: Array.from({ length: 3 }, (_, i) => ({ ...record, id: `asset-${i}`, sha256: String(i).repeat(64), width: 4096, height: 4096 })) };
  assert.throws(() => validateAssetRegistry(large), /decoded pixel budget/);
  const file = path.join(dir, 'large-registry.json'); await writeFile(file, ' '.repeat(256 * 1024 + 1));
  await assert.rejects(loadAssetRegistry(file), /256 KiB/);
});


function rawPng(width, height, interlace = 0, filter = 0, extraPixels = 0) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6; header[12] = interlace;
  const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const bytes = [];
  for (const [x,y,dx,dy] of passes) {
    const w = Math.max(0, Math.ceil((width-x)/dx)), h = Math.max(0, Math.ceil((height-y)/dy));
    if (!w) continue;
    for (let row=0;row<h;row++) { bytes.push(filter); for (let col=0;col<w;col++)bytes.push(240,100,30,255); }
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat([Buffer.from(bytes),Buffer.alloc(extraPixels)]))), chunk('IEND', Buffer.alloc(0))]);
}

test('standard Adam7 PNG scanlines are supported and malformed filter/bomb data is bounded', async t => {
  const dir=await temporary(t), interlaced=path.join(dir,'interlaced.png');
  await writeFile(interlaced,rawPng(5,3,1));
  const inspected=await inspectPng(interlaced);
  assert.equal(inspected.width,5);assert.equal(inspected.height,3);assert.equal(inspected.hasTransparency,false);
  for(const [name,bytes] of [['filter.png',rawPng(4,2,0,7)],['bomb.png',rawPng(4,2,0,0,1024*1024)]]) {
    const file=path.join(dir,name);await writeFile(file,bytes);
    await assert.rejects(inspectPng(file),/scanline/);
  }
});

async function registrationFixture(t) {
  const current=await fixture(t);
  const request={schemaVersion:1,styleId:current.registry.styleId,assets:current.registry.assets.map(({sha256,width,height,hasTransparency,...entry})=>entry)};
  const requestFile=path.join(current.dir,'asset-request.json');
  await writeFile(requestFile,JSON.stringify(request));
  return {...current,request,requestFile};
}

test('registry builder derives measurements and retains explicit provenance, style and review',async t=>{
  const {dir,requestFile,request,record}=await registrationFixture(t),out=path.join(dir,'registered.json');
  request.assets[0].review={status:'approved',notes:'Reviewed original fixture.'};
  await writeFile(requestFile,JSON.stringify(request));
  const registered=await buildAssetRegistry(requestFile,out);
  assert.equal(registered.styleId,request.styleId);
  assert.deepEqual(registered.assets[0],{...record,review:request.assets[0].review});
  assert.deepEqual((await loadAssetRegistry(out)).registry,registered);
  assert.deepEqual(JSON.parse(await readFile(requestFile,'utf8')),request);
});

test('registration request rejects derived fields, unknown metadata and missing editorial provenance',async t=>{
  const {dir,requestFile,request}=await registrationFixture(t),out=path.join(dir,'rejected.json');
  for(const mutate of [r=>r.assets[0].sha256='a'.repeat(64),r=>r.assets[0].width=4,r=>r.assets[0].hasTransparency=false,r=>r.assets[0].secret='x',r=>delete r.assets[0].provenance,r=>delete r.assets[0].review]) {
    const changed=structuredClone(request);mutate(changed);
    assert.throws(()=>validateAssetRequest(changed));
    await writeFile(requestFile,JSON.stringify(changed));
    await assert.rejects(buildAssetRegistry(requestFile,out));
  }
  assert.equal((await readdir(dir)).includes('rejected.json'),false);
});

test('registration never overwrites an output, its request, or an existing directory and cleans temporary files',async t=>{
  const {dir,requestFile}=await registrationFixture(t),out=path.join(dir,'keep.json');
  await writeFile(out,'Keep my registry');
  await mkdir(path.join(dir,'directory.json'));
  const before=(await readdir(dir)).sort(),requestBefore=await readFile(requestFile,'utf8');
  for(const target of [out,requestFile,path.join(dir,'directory.json')])await assert.rejects(buildAssetRegistry(requestFile,target));
  assert.equal(await readFile(out,'utf8'),'Keep my registry');
  assert.equal(await readFile(requestFile,'utf8'),requestBefore);
  assert.deepEqual((await readdir(dir)).sort(),before);
});

test('registration output stays beside its request so relative asset paths remain portable',async t=>{
  const {dir,requestFile}=await registrationFixture(t),nested=path.join(dir,'different');await mkdir(nested);
  await assert.rejects(buildAssetRegistry(requestFile,path.join(nested,'asset-registry.json')),/same directory/);
  assert.deepEqual(await readdir(nested),[]);
});

test('registration rejects path and symlink escapes before publishing a registry',async t=>{
  const {dir,requestFile,request,imageFile}=await registrationFixture(t),nested=path.join(dir,'nested');await mkdir(nested);
  const escaped=structuredClone(request);escaped.assets[0].src='../art.png';
  const nestedRequest=path.join(nested,'asset-request.json'),out=path.join(nested,'asset-registry.json');
  await writeFile(nestedRequest,JSON.stringify(escaped));await assert.rejects(buildAssetRegistry(nestedRequest,out));
  try{await symlink(imageFile,path.join(nested,'escape.png'),'file');}
  catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Symlink privilege unavailable');return;}throw error;}
  escaped.assets[0].src='escape.png';await writeFile(nestedRequest,JSON.stringify(escaped));
  await assert.rejects(buildAssetRegistry(nestedRequest,out),/symlink escapes/);
  assert.equal((await readdir(nested)).includes('asset-registry.json'),false);
});

test('invalid image input and oversized requests leave no registration output',async t=>{
  const {dir,requestFile,imageFile}=await registrationFixture(t),out=path.join(dir,'asset-registry-output.json');
  await writeFile(imageFile,'not image data');await assert.rejects(buildAssetRegistry(requestFile,out),/static PNG/);
  await writeFile(requestFile,' '.repeat(256*1024+1));await assert.rejects(buildAssetRegistry(requestFile,out),/256 KiB/);
  assert.equal((await readdir(dir)).includes('asset-registry-output.json'),false);
});


test('fully transparent PNGs cannot be accepted as required artwork', async t => {
  const dir = await temporary(t), file = path.join(dir, 'empty-art.png');
  await writeFile(file, createCanvas(4, 2).toBuffer('image/png'));
  await assert.rejects(inspectPng(file), /no visible pixels/);
  const request = { schemaVersion: 1, styleId: 'paper-v1', assets: [{ id: 'empty-art', kind: 'prop', src: 'empty-art.png', provenance, review: { status: 'approved' } }] };
  const requestFile = path.join(dir, 'asset-request.json'), output = path.join(dir, 'asset-registry.json');
  await writeFile(requestFile, JSON.stringify(request));
  await assert.rejects(buildAssetRegistry(requestFile, output), /no visible pixels/);
  assert.equal((await readdir(dir)).includes('asset-registry.json'), false);
});
