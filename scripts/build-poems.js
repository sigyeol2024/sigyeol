#!/usr/bin/env node
/**
 * content/poems/*.json → poems.js
 * Netlify build 또는 로컬에서: npm run build / node scripts/build-poems.js
 *
 * content 필드는 Decap markdown/richtext 위젯용 마크다운으로 저장되며,
 * 여기서 사이트용 HTML로 변환합니다. (레거시 HTML은 그대로 통과)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'poems');
const OUT_FILE = path.join(ROOT, 'poems.js');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markdown → HTML (bold, italic, links). Input is plain text. */
function renderInline(text) {
  let s = escapeHtml(text);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // bold ** ** or __ __
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/__(.+?)__/g, '<b>$1</b>');
  // italic * * or _ _ (after bold so ** is consumed)
  s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
  s = s.replace(/(^|[^a-zA-Z0-9])_(.+?)_([^a-zA-Z0-9]|$)/g, '$1<i>$2</i>$3');
  return s;
}

function isBlankBlock(block) {
  const t = block.replace(/\u00a0/g, ' ').trim();
  return t === '' || t === '\\' || t === '&nbsp;';
}

function blockToHtml(block) {
  if (isBlankBlock(block)) {
    return '<div><br></div>';
  }
  // Soft breaks within a paragraph (Shift+Enter) → separate poem lines
  return block
    .split('\n')
    .map((line) => {
      if (isBlankBlock(line)) return '<div><br></div>';
      const t = line.replace(/\u00a0/g, ' ');
      if (/^###\s+/.test(t)) {
        return '<div><b>' + renderInline(t.replace(/^###\s+/, '')) + '</b></div>';
      }
      if (/^##\s+/.test(t)) {
        return '<div><b>' + renderInline(t.replace(/^##\s+/, '')) + '</b></div>';
      }
      if (/^#\s+/.test(t)) {
        return '<div><b>' + renderInline(t.replace(/^#\s+/, '')) + '</b></div>';
      }
      if (/^>\s?/.test(t)) {
        return '<div><i>' + renderInline(t.replace(/^>\s?/, '')) + '</i></div>';
      }
      // Only '-' bullets (Decap list). Leading '*' is often a poem footnote/separator.
      if (/^-\s+/.test(t)) {
        return '<div>• ' + renderInline(t.replace(/^-\s+/, '')) + '</div>';
      }
      if (/^\d+\.\s+/.test(t)) {
        return '<div>' + renderInline(t) + '</div>';
      }
      return '<div>' + renderInline(t) + '</div>';
    })
    .join('');
}

/**
 * Markdown (Decap) → poem HTML matching historical contenteditable shape:
 * <div style="text-align: left;"><div>line</div><div><br></div>...</div>
 * Legacy HTML bodies are returned unchanged.
 */
function markdownToContentHtml(md) {
  if (md == null || md === '') return '';
  const raw = String(md);
  // Legacy HTML from before the markdown migration
  if (/^\s*</.test(raw) && /<\/(div|p|span)>/i.test(raw)) {
    return raw;
  }
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const inner = blocks.map(blockToHtml).join('');
  return '<div style="text-align: left;">' + inner + '</div>';
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
    data.content = markdownToContentHtml(data.content || '');
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
