import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const required = [
  'README.md', 'LICENSE', 'THIRD_PARTY.md', 'CONTRIBUTING.md', 'ROADMAP.md',
  'package.json', 'package-lock.json', '.gitignore', '.github/workflows/check.yml',
  'docs/ENGINE_PRODUCT_PLAN.md', 'docs/ASSET_PIPELINE.md',
  'docs/RELEASE_STANDARD.md', 'docs/ORIGINS.md', 'showcase/banner.svg',
  'QUICKSTART.md', 'docs/SCENE_FORMAT.md', 'docs/adr/0001-renderer.md',
  'schemas/scene.schema.json', 'examples/minimal-scene/scene.json',
  'examples/narrated-story/scene.json', 'examples/narrated-story/voice.wav',
  'showcase/rachana-demo.mp4', 'showcase/demo.gif',
  'docs/IMAGE_ASSETS.md', 'schemas/asset-registry.schema.json', 'schemas/asset-request.schema.json',
  'examples/lantern-workshop/asset-registry.json', 'examples/lantern-workshop/voice.wav',
  'showcase/lantern-workshop/film.mp4',
  'docs/CREATIVE_DIRECTOR.md', 'schemas/director.schema.json',
  'examples/director-signal/production.json', 'examples/director-signal/voice.wav',
];

for (const relative of required) {
  try {
    if (!(await stat(path.join(root, relative))).isFile()) {
      errors.push(`Required file is not a regular file: ${relative}`);
    }
  } catch {
    errors.push(`Missing required file: ${relative}`);
  }
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', '.cache', 'local-projects'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
  }
  return files;
}

// Check file destinations, not heading anchors or remote URL availability.
// Strip fenced code blocks so illustrative Markdown is not treated as a link.
let linkCount = 0;
const markdown = await markdownFiles(root);
for (const file of markdown) {
  const text = await readFile(file, 'utf8');
  const relative = path.relative(root, file);
  if (/\/Users\/|\/home\//.test(text)) errors.push(`Private absolute path in ${relative}`);
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const destinations = [...prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  destinations.push(...[...prose.matchAll(/\bsrc="([^"]+)"/g)].map(match => match[1]));
  for (const destination of destinations) {
    const target = destination.trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:)/i.test(target) || target.startsWith('#')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
      errors.push(`Unsupported link scheme in ${relative}: ${target}`);
      continue;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(target.split('#')[0].split('?')[0]);
    } catch {
      errors.push(`Invalid URL encoding in ${relative}: ${target}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), decoded);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      errors.push(`Link leaves repository in ${relative}: ${target}`);
      continue;
    }
    linkCount++;
    try {
      await stat(resolved);
    } catch {
      errors.push(`Broken local link in ${relative}: ${target}`);
    }
  }
}

try {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  if (pkg.name !== 'rachana-engine-2d') errors.push('Unexpected package name.');
  if (pkg.license !== 'MIT') errors.push('Package license differs from the selected source license.');
  if (!pkg.private) errors.push('Foundation package must remain private to avoid accidental npm publication.');
  if (lock.name !== pkg.name || lock.version !== pkg.version) errors.push('Package and lockfile metadata differ.');
} catch (error) {
  errors.push(`Cannot validate package metadata: ${error.message}`);
}

try {
  const banner = await readFile(path.join(root, 'showcase/banner.svg'), 'utf8');
  if (!/<svg\b/.test(banner) || !/<title\b/.test(banner) || !/<desc\b/.test(banner)) {
    errors.push('Banner must have an SVG root, accessible title, and description.');
  }
} catch (error) {
  errors.push(`Cannot inspect banner: ${error.message}`);
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${required.length} required files; ${markdown.length} Markdown files; ${linkCount} local links; package metadata; banner accessibility markers.`);
  console.log('Scope: repository integrity only. Run npm test for runtime checks and verify:smoke for encoded output.');
}
