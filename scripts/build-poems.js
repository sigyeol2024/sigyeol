#!/usr/bin/env node
/**
 * content/poems/*.json → poems-index.js + poems/{id}.json
 *
 * Index (metadata only): id, order, category, title, author, isMain, mainOrder, v
 *   v = short hash of the body. The site fetches poems/{id}.json?v={v}, so an edited
 *   body gets a new URL and browsers never show a stale cached copy.
 * Bodies: poems/{id}.json with { id, content } — fetched on demand by the site.
 *
 * Also writes poems.js as a copy of the light index so legacy admin
 * (order-autoset) and docs that still mention poems.js keep working.
 *
 * Also writes p/{id}/index.html: a tiny static share page per poem with Open Graph /
 * Twitter meta (title, poet, logo image) for KakaoTalk & social crawlers (no JS needed),
 * which then sends readers to the SPA route /?id={id}. p/ is build output (gitignored).
 *
 * Netlify: npm run build / node scripts/build-poems.js
 *
 * content 필드는 Decap poem-html 위젯이 저장하는 HTML을 우선 사용합니다.
 * (레거시 마크다운은 HTML로 변환; 이미 HTML이면 그대로 통과)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'poems');
const OUT_INDEX = path.join(ROOT, 'poems-index.js');
const OUT_LEGACY = path.join(ROOT, 'poems.js'); // light index alias
const OUT_BODIES_DIR = path.join(ROOT, 'poems');
const OUT_SHARE_DIR = path.join(ROOT, 'p'); // share pages: p/{id}/index.html
const SITE_SETTINGS_FILE = path.join(ROOT, 'content', 'site.json'); // /admin '호 설정'
const OUT_SITE_SETTINGS = path.join(ROOT, 'site-settings.js'); // build output (gitignored)
const SITE_URL = (process.env.SITE_URL || 'https://sigyeol.com').replace(/\/+$/, '');
const OG_IMAGE = SITE_URL + '/static/og/sigyeol-og.png';

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
    const mainOrderRaw = data.mainOrder;
    const mainOrderNum =
      mainOrderRaw == null || mainOrderRaw === ''
        ? null
        : parseFloat(String(mainOrderRaw).trim());
    poems.push({
      id: data.id,
      order: Number.isFinite(orderNum) ? orderNum : null,
      mainOrder: Number.isFinite(mainOrderNum) ? mainOrderNum : null,
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
    mainOrder: p.mainOrder,
    v: contentVersion(p.content),
  };
}

/** Short content hash used as a cache-busting version for poems/{id}.json. */
function contentVersion(html) {
  return crypto.createHash('sha1').update(String(html || ''), 'utf8').digest('hex').slice(0, 10);
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

  writeSharePages(poems);
  writeSiteSettings();

  return { indexCount: index.length, bodiesDir: OUT_BODIES_DIR };
}

/** Attribute-safe text (also escapes ' for single-quoted contexts). */
function escAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/**
 * p/{id}/index.html — static page whose <head> carries the poem's share card.
 * No meta refresh on purpose: some crawlers follow it and would read the generic
 * home card instead. Readers are sent on by JS (location.replace), with a plain link
 * as the no-JS fallback.
 */
function sharePageHtml(p) {
  const id = String(p.id);
  const pageUrl = SITE_URL + '/p/' + encodeURIComponent(id) + '/';
  const appUrl = '/?id=' + encodeURIComponent(id);
  const who = p.author ? p.author : '';
  const ogTitle = p.title + (who ? ' — ' + who : '');
  const desc = [who, p.category].filter(Boolean).join(' · ') + ' | 웹진《시결》';
  const e = escAttr;
  return [
    '<!DOCTYPE html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>' + escapeHtml(ogTitle) + ' | 시결</title>',
    '<meta name="description" content="' + e(desc) + '">',
    '<link rel="canonical" href="' + e(pageUrl) + '">',
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="시결">',
    '<meta property="og:locale" content="ko_KR">',
    '<meta property="og:title" content="' + e(ogTitle) + '">',
    '<meta property="og:description" content="' + e(desc) + '">',
    '<meta property="og:url" content="' + e(pageUrl) + '">',
    '<meta property="og:image" content="' + e(OG_IMAGE) + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="시결 POETRY WEBZINE 로고">',
    who ? '<meta property="article:author" content="' + e(who) + '">' : '',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + e(ogTitle) + '">',
    '<meta name="twitter:description" content="' + e(desc) + '">',
    '<meta name="twitter:image" content="' + e(OG_IMAGE) + '">',
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">',
    '<script>location.replace(' + JSON.stringify(appUrl).replace(/</g, '\\u003c') + ');</script>',
    '<style>body{margin:0;background:#f3efe8;color:#141312;font-family:"Noto Serif KR",serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}a{color:#2f6b4f}</style>',
    '</head>',
    '<body>',
    '<p>' + escapeHtml(ogTitle) + '<br><a href="' + e(appUrl) + '">시결에서 읽기</a></p>',
    '</body>',
    '</html>',
    '',
  ].filter((l) => l !== '').join('\n');
}

/**
 * content/site.json (/admin '호 설정') → site-settings.js: `const siteSettings = {...};`
 * A separate file (not poems-index.js) so admin/order-autoset.js can keep parsing the index.
 * Only whitelisted string/boolean fields are emitted.
 */
function writeSiteSettings() {
  let raw = {};
  if (fs.existsSync(SITE_SETTINGS_FILE)) {
    try {
      raw = JSON.parse(fs.readFileSync(SITE_SETTINGS_FILE, 'utf8')) || {};
    } catch (err) {
      console.error('Invalid JSON:', SITE_SETTINGS_FILE, err.message);
      process.exit(1);
    }
  }
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const settings = {
    showIssue: raw.showIssue !== false && !!str(raw.issueTitle),
    issueTitle: str(raw.issueTitle),
    issueSubtitle: str(raw.issueSubtitle),
  };
  const js = 'const siteSettings = ' + JSON.stringify(settings, null, 2).replace(/</g, '\\u003c') + ';\n';
  fs.writeFileSync(OUT_SITE_SETTINGS, js, 'utf8');
  return settings;
}

function writeSharePages(poems) {
  fs.rmSync(OUT_SHARE_DIR, { recursive: true, force: true }); // drop pages of deleted poems
  for (const p of poems) {
    const dir = path.join(OUT_SHARE_DIR, String(p.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), sharePageHtml(p), 'utf8');
  }
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
  OUT_SHARE_DIR,
  sharePageHtml,
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
