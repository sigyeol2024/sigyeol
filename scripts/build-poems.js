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
const SITE_TITLE_FILE = path.join(ROOT, 'content', 'site-title.json'); // /admin '사이트 제목'
const OUT_HOME_HTML = path.join(ROOT, 'index.html'); // publish = "." → rewritten in place at build
const DEFAULT_SITE_TITLE = '웹진《시결》';
const SITE_URL = (process.env.SITE_URL || 'https://sigyeol.com').replace(/\/+$/, '');
const OG_IMAGE = SITE_URL + '/static/og/sigyeol-og.png?v=20261011';
const OUT_SITEMAP = path.join(ROOT, 'sitemap.xml'); // build output (gitignored)
const OUT_ROBOTS = path.join(ROOT, 'robots.txt'); // build output (gitignored)
// Optional search-engine ownership tags: {"naver": "<content>", "google": "<content>"} (see CMS.md)
const VERIFICATION_FILE = path.join(ROOT, 'content', 'verification.json');

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

  const siteTitle = readSiteTitle();
  applySiteTitleToHome(siteTitle);
  applyHomePoemLinks(poems);
  applyVerificationTags();
  writeSharePages(poems, siteTitle, readAnalyticsSnippet());
  writeSitemap(poems);
  writeRobots();
  writeSiteSettings();

  return { indexCount: index.length, bodiesDir: OUT_BODIES_DIR };
}

/** Attribute-safe text (also escapes ' for single-quoted contexts). */
function escAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/** Poem HTML (from the editor) → plain text lines; blank line = stanza break. */
function poemTextLines(html) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
  const lines = text.split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.filter((l, i) => l || lines[i - 1]); // collapse runs of blank lines
}

/** Plain-text excerpt (first lines of the poem) for meta description, ~80–120 chars. */
function poemExcerpt(lines, max = 110) {
  let out = '';
  for (const l of lines) {
    if (!l) continue;
    const next = out ? out + ' / ' + l : l;
    if (next.length > max) {
      if (out.length >= 60) break;
      const cut = next.slice(0, max);
      const sp = cut.lastIndexOf(' ');
      return (sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s/·,.]+$/, '') + '…';
    }
    out = next;
    if (out.length >= 80) break;
  }
  return out;
}

/** Lines → stanzas (<p>) with <br> between lines; all text escaped. */
function poemBodyHtml(lines) {
  const stanzas = [];
  let cur = [];
  for (const l of lines) {
    if (l) cur.push(escapeHtml(l));
    else if (cur.length) { stanzas.push(cur); cur = []; }
  }
  if (cur.length) stanzas.push(cur);
  return stanzas.map((st) => '<p>' + st.join('<br>\n') + '</p>').join('\n');
}

/** The Cloudflare Web Analytics snippet, reused verbatim from index.html (one source of truth). */
function readAnalyticsSnippet() {
  const html = fs.readFileSync(OUT_HOME_HTML, 'utf8');
  const m = html.match(/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/);
  return m ? m[0] : '';
}

/**
 * p/{id}/index.html — the crawlable page of one poem (sitemap URL, share-card URL).
 * Carries the full poem as real HTML (Naver and other crawlers don't run JS), its own
 * canonical, title, description and share card. Readers with JS are sent on to the site
 * (/?id=…) at once; the SPA then points its canonical back here (see setPageMeta in index.html).
 */
function sharePageHtml(p, siteTitle = DEFAULT_SITE_TITLE, analytics = '') {
  const id = String(p.id);
  const pageUrl = SITE_URL + '/p/' + encodeURIComponent(id) + '/';
  const appUrl = '/?id=' + encodeURIComponent(id);
  const who = p.author ? p.author : '';
  const ogTitle = p.title + (who ? ' — ' + who : '');
  const cardDesc = [who, p.category].filter(Boolean).join(' · ') + ' | ' + siteTitle;
  const lines = poemTextLines(p.content);
  const excerpt = poemExcerpt(lines) || cardDesc;
  const e = escAttr;
  const ld = {
    '@context': 'https://schema.org',
    '@type': p.category === '공지사항' ? 'Article' : 'CreativeWork',
    name: p.title,
    headline: p.title,
    genre: p.category,
    inLanguage: 'ko',
    url: pageUrl,
    isPartOf: { '@type': 'Periodical', name: siteTitle, url: SITE_URL + '/' },
  };
  if (who) ld.author = { '@type': 'Person', name: who };
  return [
    '<!DOCTYPE html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>' + escapeHtml(ogTitle + ' | ' + siteTitle) + '</title>',
    '<meta name="description" content="' + e(excerpt) + '">',
    '<link rel="canonical" href="' + e(pageUrl) + '">',
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="시결">',
    '<meta property="og:locale" content="ko_KR">',
    '<meta property="og:title" content="' + e(ogTitle) + '">',
    '<meta property="og:description" content="' + e(cardDesc) + '">',
    '<meta property="og:url" content="' + e(pageUrl) + '">',
    '<meta property="og:image" content="' + e(OG_IMAGE) + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="시결 POETRY WEBZINE 로고">',
    who ? '<meta property="article:author" content="' + e(who) + '">' : '',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + e(ogTitle) + '">',
    '<meta name="twitter:description" content="' + e(cardDesc) + '">',
    '<meta name="twitter:image" content="' + e(OG_IMAGE) + '">',
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">',
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>',
    '<script>location.replace(' + JSON.stringify(appUrl).replace(/</g, '\\u003c') + ');</script>',
    '<style>',
    'body{margin:0;background:#f3efe8;color:#141312;font-family:"Noto Serif KR","Nanum Myeongjo",serif;line-height:1.9;word-break:keep-all}',
    '.wrap{max-width:640px;margin:0 auto;padding:28px 24px 64px}',
    'header{border-bottom:2px solid #1a1917;padding-bottom:12px;margin-bottom:36px}',
    'header a{color:#2f6b4f;text-decoration:none;font-size:1.5rem;letter-spacing:.08em}',
    '.cat{color:#2f6b4f;font-size:.8rem;letter-spacing:.12em;margin:0}',
    'h1{font-size:1.9rem;font-weight:600;line-height:1.35;margin:.2em 0 .1em}',
    '.poet{color:#6a655d;margin:0 0 2rem}',
    '.poem p{margin:0 0 1.5em}',
    '.more{margin-top:2.5rem;border-top:1px solid #cfc7bb;padding-top:1rem}',
    'a{color:#2f6b4f}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="wrap">',
    '<header><a href="/">시결</a></header>',
    '<main>',
    '<article>',
    '<p class="cat">' + escapeHtml(p.category) + '</p>',
    '<h1>' + escapeHtml(p.title) + '</h1>',
    who ? '<p class="poet">' + escapeHtml(who) + '</p>' : '',
    '<div class="poem">',
    poemBodyHtml(lines),
    '</div>',
    '</article>',
    '<p class="more"><a href="' + e(appUrl) + '">' + escapeHtml(siteTitle) + '에서 읽기</a> · <a href="/">처음으로</a></p>',
    '</main>',
    '</div>',
    analytics,
    '</body>',
    '</html>',
    '',
  ].filter((l) => l !== '').join('\n');
}

/* ---------- Search engines: sitemap.xml, robots.txt, home links, verification ---------- */

/** Last commit date (ISO) of a path, or null when git history isn't usable (no git / shallow clone). */
let GIT_OK = null;
function gitLastmod(relPath) {
  const { execFileSync } = require('child_process');
  if (GIT_OK === null) {
    try {
      GIT_OK = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim() === 'false';
    } catch (err) {
      GIT_OK = false;
    }
  }
  if (!GIT_OK) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], { cwd: ROOT, encoding: 'utf8' }).trim();
    return out || null;
  } catch (err) {
    return null;
  }
}

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** sitemap.xml: home + every post's crawlable page /p/{id}/ (poems and notices). */
function writeSitemap(poems) {
  const urls = [];
  let newest = null;
  for (const p of poems) {
    const lm = gitLastmod(path.join('content', 'poems', String(p.id) + '.json'));
    if (lm && (!newest || lm > newest)) newest = lm;
    urls.push({ loc: SITE_URL + '/p/' + encodeURIComponent(String(p.id)) + '/', lastmod: lm });
  }
  urls.unshift({ loc: SITE_URL + '/', lastmod: newest });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => '  <url><loc>' + xmlEsc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>'),
    '</urlset>',
    '',
  ].join('\n');
  fs.writeFileSync(OUT_SITEMAP, xml, 'utf8');
}

function writeRobots() {
  fs.writeFileSync(
    OUT_ROBOTS,
    ['User-agent: *', 'Allow: /', 'Disallow: /admin/', '', 'Sitemap: ' + SITE_URL + '/sitemap.xml', ''].join('\n'),
    'utf8'
  );
}

/**
 * index.html: the <noscript> list of main-page poems (links to /p/{id}/) between
 * <!-- poem-links:start --> and <!-- poem-links:end -->, so crawlers without JS find them.
 */
function applyHomePoemLinks(poems) {
  const html = fs.readFileSync(OUT_HOME_HTML, 'utf8');
  const re = /(<!-- poem-links:start -->)[\s\S]*?(<!-- poem-links:end -->)/;
  if (!re.test(html)) return;
  const main = poems
    .filter((p) => p.isMain)
    .sort((a, b) => {
      const ao = a.mainOrder == null ? Infinity : a.mainOrder;
      const bo = b.mainOrder == null ? Infinity : b.mainOrder;
      return ao !== bo ? ao - bo : Number(b.id) - Number(a.id);
    });
  const items = main
    .map((p) => '<li><a href="/p/' + encodeURIComponent(String(p.id)) + '/">' + escapeHtml(p.title) + '</a>' + (p.author ? ' — ' + escapeHtml(p.author) : '') + '</li>')
    .join('\n            ');
  const block = '\n        <noscript>\n          <ul class="noscript-list">\n            ' + items + '\n          </ul>\n        </noscript>\n        ';
  const out = html.replace(re, (m, a, b) => a + block + b);
  if (out !== html) fs.writeFileSync(OUT_HOME_HTML, out, 'utf8');
}

/**
 * content/verification.json (optional) → <meta name="naver-site-verification"> /
 * <meta name="google-site-verification"> in index.html's <head>. Without the file nothing is touched.
 */
function applyVerificationTags() {
  if (!fs.existsSync(VERIFICATION_FILE)) return;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(VERIFICATION_FILE, 'utf8')) || {};
  } catch (err) {
    console.error('Invalid JSON:', VERIFICATION_FILE, err.message);
    process.exit(1);
  }
  const html = fs.readFileSync(OUT_HOME_HTML, 'utf8');
  let out = html.replace(/\n[ \t]*<meta name="(naver|google)-site-verification"[^>]*>/g, '');
  const tags = [];
  for (const [key, name] of [['naver', 'naver-site-verification'], ['google', 'google-site-verification']]) {
    const v = typeof cfg[key] === 'string' ? cfg[key].trim() : '';
    if (v) tags.push('    <meta name="' + name + '" content="' + escAttr(v) + '">');
  }
  if (tags.length) out = out.replace(/(\n[ \t]*<meta name="robots"[^>]*>)/, '$1\n' + tags.join('\n'));
  if (out !== html) fs.writeFileSync(OUT_HOME_HTML, out, 'utf8');
}

/** content/site-title.json (/admin '사이트 제목') → title string; empty/missing → default. */
function readSiteTitle() {
  if (!fs.existsSync(SITE_TITLE_FILE)) return DEFAULT_SITE_TITLE;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SITE_TITLE_FILE, 'utf8')) || {};
  } catch (err) {
    console.error('Invalid JSON:', SITE_TITLE_FILE, err.message);
    process.exit(1);
  }
  const t = typeof raw.siteTitle === 'string' ? raw.siteTitle.replace(/\s+/g, ' ').trim() : '';
  return t || DEFAULT_SITE_TITLE;
}

/**
 * Put the site title into index.html's <title>, og:title and twitter:title so crawlers
 * (Kakao, X, …) see it without JS. Netlify publishes the repo root, so the file is
 * rewritten in place; with the default title the file stays byte-identical.
 */
function applySiteTitleToHome(siteTitle) {
  const html = fs.readFileSync(OUT_HOME_HTML, 'utf8');
  const t = escapeHtml(siteTitle);
  const a = escAttr(siteTitle);
  const rules = [
    [/<title>[^<]*<\/title>/, () => '<title>' + t + '</title>'],
    [/(<meta property="og:title" content=")[^"]*(">)/, (m, p1, p2) => p1 + a + p2],
    [/(<meta name="twitter:title" content=")[^"]*(">)/, (m, p1, p2) => p1 + a + p2],
  ];
  let out = html;
  for (const [re, fn] of rules) {
    if (!re.test(out)) {
      console.error('index.html: tag not found for site title:', re);
      process.exit(1);
    }
    out = out.replace(re, fn);
  }
  if (out !== html) fs.writeFileSync(OUT_HOME_HTML, out, 'utf8');
}

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

function writeSharePages(poems, siteTitle = DEFAULT_SITE_TITLE, analytics = '') {
  fs.rmSync(OUT_SHARE_DIR, { recursive: true, force: true }); // drop pages of deleted poems
  for (const p of poems) {
    const dir = path.join(OUT_SHARE_DIR, String(p.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), sharePageHtml(p, siteTitle, analytics), 'utf8');
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
