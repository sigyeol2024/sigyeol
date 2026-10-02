#!/usr/bin/env node
/**
 * content/poems/*.json → poems-index.js + poems/{id}.json
 *
 * Index (metadata only): id, order, category, title, author, isMain
 * Bodies: poems/{id}.json with { id, content } — fetched on demand by the site.
 *
 * Also writes poems.js as a copy of the light index so legacy admin
 * (order-autoset) and docs that still mention poems.js keep working.
 *
 * Netlify: npm run build / node scripts/build-poems.js
 *
 * content 필드는 Decap poem-html 위젯이 저장하는 HTML을 우선 사용합니다.
 * (레거시 마크다운은 HTML로 변환; 이미 HTML이면 그대로 통과)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'poems');
const OUT_INDEX = path.join(ROOT, 'poems-index.js');
const OUT_LEGACY = path.join(ROOT, 'poems.js'); // light index alias
const OUT_BODIES_DIR = path.join(ROOT, 'poems');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** True if body is already poem/div HTML (historical SPA shape or poem-html widget). */
function looksLikeHtml(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('<')) return false;
  return /<\/(div|p|span|b|i|u|s|strike|strong|em|br)\b/i.test(s) || /<br\s*\/?>/i.test(s);
}

/** Inline markdown → HTML. Input is plain text (already escaped where needed). */
function renderInline(text) {
  let s = escapeHtml(text);
  // strikethrough ~~ ~~
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // bold ** ** or __ __
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/__(.+?)__/g, '<b>$1</b>');
  // italic * * or _ _
  s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
  s = s.replace(/(^|[^a-zA-Z0-9])_(.+?)_([^a-zA-Z0-9]|$)/g, '$1<i>$2</i>$3');
  return s;
}

function isBlankLine(line) {
  const t = String(line)
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u200b/g, '')
    .trim();
  return t === '' || t === '\\';
}

/**
 * One visual poem line → <div>...</div> or <div><br></div>.
 * Optional leading alignment marker from legacy markdown:
 *   :::left / :::center / :::right
 */
function lineToHtml(line) {
  if (isBlankLine(line)) {
    return '<div><br></div>';
  }
  let t = String(line).replace(/\u00a0/g, ' ');
  let align = null;
  const alignMatch = t.match(/^:::?(left|center|right)\s+/i);
  if (alignMatch) {
    align = alignMatch[1].toLowerCase();
    t = t.slice(alignMatch[0].length);
  }
  let inner;
  if (/^###\s+/.test(t)) {
    inner = '<b>' + renderInline(t.replace(/^###\s+/, '')) + '</b>';
  } else if (/^##\s+/.test(t)) {
    inner = '<b>' + renderInline(t.replace(/^##\s+/, '')) + '</b>';
  } else if (/^#\s+/.test(t)) {
    inner = '<b>' + renderInline(t.replace(/^#\s+/, '')) + '</b>';
  } else if (/^>\s?/.test(t)) {
    inner = '<i>' + renderInline(t.replace(/^>\s?/, '')) + '</i>';
  } else if (/^-\s+/.test(t)) {
    inner = '• ' + renderInline(t.replace(/^-\s+/, ''));
  } else {
    inner = renderInline(t);
  }
  if (align) {
    return '<div style="text-align: ' + align + ';">' + inner + '</div>';
  }
  return '<div>' + inner + '</div>';
}

/**
 * Split poem text into visual lines, preserving intentional blank lines.
 * Decap markdown often stores every line as its own paragraph (`\n\n`)
 * and blank lines as NBSP paragraphs. Also handle single `\n` soft breaks
 * and runs of empty paragraphs (`\n\n\n\n` → multiple blanks).
 */
function poemTextToLines(raw) {
  const normalized = String(raw).replace(/\r\n/g, '\n');
  // Decap markdown stores each poem line as a paragraph (\n\n).
  // Extra consecutive newlines → extra blank lines; NBSP paragraphs → blanks.
  const lines = [];
  let buf = '';
  let i = 0;
  while (i < normalized.length) {
    if (normalized[i] === '\n' && normalized[i + 1] === '\n') {
      lines.push(buf);
      buf = '';
      i += 2;
      while (normalized[i] === '\n') {
        lines.push('');
        i += 1;
      }
    } else {
      buf += normalized[i];
      i += 1;
    }
  }
  lines.push(buf);
  return lines;
}

/**
 * Markdown / plain poem text → historical SPA HTML:
 * <div style="text-align: left;"><div>line</div><div><br></div>...</div>
 */
function markdownToContentHtml(md) {
  if (md == null || md === '') return '';
  const lines = poemTextToLines(md);
  const inner = lines.map(lineToHtml).join('');
  return '<div style="text-align: left;">' + inner + '</div>';
}

/**
 * Light cleanup for HTML from poem-html / contenteditable:
 * - keep blank lines as <div><br></div>
 * - unwrap empty <p> / normalize <p> to <div> for consistency
 * - preserve text-align styles, <u>, <s>/<strike>, <b>/<i>
 */
function normalizePoemHtml(html) {
  let s = String(html).trim();
  if (!s) return '';

  // Convert <p>…</p> to <div>…</div> (contenteditable sometimes emits p)
  s = s.replace(/<\/?p\b[^>]*>/gi, (tag) => {
    if (/^<\/p/i.test(tag)) return '</div>';
    const styleMatch = tag.match(/\sstyle\s*=\s*(["'])(.*?)\1/i);
    if (styleMatch) {
      return '<div style="' + styleMatch[2] + '">';
    }
    return '<div>';
  });

  // Empty blocks → explicit <br> so blank lines don’t collapse
  s = s.replace(/<div(\s[^>]*)?>\s*(&nbsp;|\u00a0|\u200b)?\s*<\/div>/gi, (full, attrs) => {
    const a = attrs || '';
    if (/text-align/i.test(a)) {
      return '<div' + a + '><br></div>';
    }
    return '<div><br></div>';
  });

  // Ensure at least one outer wrapper with text-align for legacy SPA CSS expectations
  const hasOuterAlign =
    /^\s*<div\b[^>]*style\s*=\s*(["'])[^"']*text-align[^"']*\1/i.test(s);
  if (!hasOuterAlign) {
    s = '<div style="text-align: left;">' + s + '</div>';
  }
  return s;
}

/** Public: content field → site HTML */
function contentToHtml(raw) {
  if (raw == null || raw === '') return '';
  if (looksLikeHtml(raw)) {
    return normalizePoemHtml(raw);
  }
  return markdownToContentHtml(raw);
}

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
      const fromName = Number(path.basename(file, '.json'));
      data.id = Number.isFinite(fromName) ? fromName : Date.now();
    }
    data.id = Number(data.id);
    data.category = data.category || '신작시';
    data.title = data.title || '';
    data.author = data.author || '';
    data.isMain = !!data.isMain;
    data.content = contentToHtml(data.content || '');
    const orderRaw = data.order;
    const orderNum =
      orderRaw == null || orderRaw === ''
        ? null
        : parseFloat(String(orderRaw).trim());
    poems.push({
      id: data.id,
      order: Number.isFinite(orderNum) ? orderNum : null,
      category: data.category,
      title: data.title,
      author: data.author,
      isMain: data.isMain,
      content: data.content,
    });
  }

  // Lower order = appears first (numeric parseFloat). Missing → after numbered.
  // Tie-break: higher id first (legacy Date.now() / previous default).
  poems.sort((a, b) => {
    const ao =
      a.order == null ? Number.POSITIVE_INFINITY : parseFloat(a.order);
    const bo =
      b.order == null ? Number.POSITIVE_INFINITY : parseFloat(b.order);
    if (ao !== bo) return ao - bo;
    return Number(b.id) - Number(a.id);
  });
  return poems;
}

function toIndexEntry(p) {
  return {
    id: p.id,
    order: p.order,
    category: p.category,
    title: p.title,
    author: p.author,
    isMain: p.isMain,
  };
}

function writeOutputs(poems) {
  fs.mkdirSync(OUT_BODIES_DIR, { recursive: true });

  const index = poems.map(toIndexEntry);
  const indexJs =
    'const poems = ' +
    JSON.stringify(index, null, 2) +
    ';\n';
  fs.writeFileSync(OUT_INDEX, indexJs, 'utf8');
  fs.writeFileSync(OUT_LEGACY, indexJs, 'utf8');

  const keep = new Set();
  for (const p of poems) {
    const bodyPath = path.join(OUT_BODIES_DIR, String(p.id) + '.json');
    const body = { id: p.id, content: p.content };
    fs.writeFileSync(bodyPath, JSON.stringify(body) + '\n', 'utf8');
    keep.add(String(p.id) + '.json');
  }

  // Remove stale body files from previous builds
  for (const name of fs.readdirSync(OUT_BODIES_DIR)) {
    if (!name.endsWith('.json')) continue;
    if (!keep.has(name)) {
      fs.unlinkSync(path.join(OUT_BODIES_DIR, name));
    }
  }

  return { indexCount: index.length, bodiesDir: OUT_BODIES_DIR };
}

module.exports = {
  contentToHtml,
  looksLikeHtml,
  markdownToContentHtml,
  normalizePoemHtml,
  loadPoems,
  toIndexEntry,
  writeOutputs,
  CONTENT_DIR,
  OUT_INDEX,
  OUT_LEGACY,
  OUT_BODIES_DIR,
  OUT_FILE: OUT_LEGACY, // back-compat for any require() of OUT_FILE
  ROOT,
};

if (require.main === module) {
  const poems = loadPoems();
  const { indexCount } = writeOutputs(poems);
  console.log(
    `Wrote ${indexCount} poems → ${path.relative(ROOT, OUT_INDEX)} + ${path.relative(ROOT, OUT_BODIES_DIR)}/{id}.json (and light ${path.relative(ROOT, OUT_LEGACY)})`
  );
}
