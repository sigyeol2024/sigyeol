#!/usr/bin/env node
/**
 * content/poems/*.json → poems.js
 * Netlify build 또는 로컬에서: npm run build / node scripts/build-poems.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'poems');
const OUT_FILE = path.join(ROOT, 'poems.js');

function loadPoems() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error('Missing content directory:', CONTENT_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('No poem JSON files in', CONTENT_DIR);
    process.exit(1);
  }

  const poems = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON:', file, err.message);
      process.exit(1);
    }
    if (data.id == null) {
      // filename without .json as numeric id fallback
      const fromName = Number(path.basename(file, '.json'));
      data.id = Number.isFinite(fromName) ? fromName : Date.now();
    }
    data.id = Number(data.id);
    data.category = data.category || '신작시';
    data.title = data.title || '';
    data.author = data.author || '';
    data.isMain = !!data.isMain;
    data.content = data.content || '';
    poems.push({
      id: data.id,
      category: data.category,
      title: data.title,
      author: data.author,
      isMain: data.isMain,
      content: data.content,
    });
  }

  poems.sort((a, b) => Number(b.id) - Number(a.id));
  return poems;
}

const poems = loadPoems();
const out = 'const poems = ' + JSON.stringify(poems, null, 2) + ';\n';
fs.writeFileSync(OUT_FILE, out, 'utf8');
console.log(`Wrote ${poems.length} poems → ${path.relative(ROOT, OUT_FILE)}`);
