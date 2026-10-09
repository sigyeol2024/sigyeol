/**
 * Decap custom widget: poem-html
 * contenteditable body with toolbar: bold, italic, underline, strikethrough,
 * font size (7 levels), left / center / right align. Stores HTML matching the live SPA shape.
 *
 * Font size: <span class="fs-m3|fs-m2|fs-m1|fs-p1|fs-p2|fs-p3">…</span>
 *   (0.8 / 0.87 / 0.93 / [기본 1] / 1.12 / 1.25 / 1.4 em — CSS in index.html & poem-editor.css).
 *   Applies to the selected text; with no selection, to the whole current line.
 *   기본 = remove the span.
 * Visual chrome mirrors sigyeol.com poem detail (Noto Serif KR, column, spacing).
 */
(function () {
  function looksLikeHtml(raw) {
    var s = String(raw || '').trim();
    if (!s || s.charAt(0) !== '<') return false;
    return /<\/(div|p|span|b|i|u|s|strike|strong|em|br)\b/i.test(s) || /<br\s*\/?>/i.test(s);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInline(text) {
    var s = escapeHtml(text);
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/__(.+?)__/g, '<b>$1</b>');
    s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
    s = s.replace(/(^|[^a-zA-Z0-9])_(.+?)_([^a-zA-Z0-9]|$)/g, '$1<i>$2</i>$3');
    return s;
  }

  function isBlankLine(line) {
    var t = String(line)
      .replace(/\u00a0/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\u200b/g, '')
      .trim();
    return t === '' || t === '\\';
  }

  function lineToHtml(line) {
    if (isBlankLine(line)) return '<div><br></div>';
    var t = String(line).replace(/\u00a0/g, ' ');
    var inner;
    if (/^###\s+/.test(t)) inner = '<b>' + renderInline(t.replace(/^###\s+/, '')) + '</b>';
    else if (/^##\s+/.test(t)) inner = '<b>' + renderInline(t.replace(/^##\s+/, '')) + '</b>';
    else if (/^#\s+/.test(t)) inner = '<b>' + renderInline(t.replace(/^#\s+/, '')) + '</b>';
    else if (/^>\s?/.test(t)) inner = '<i>' + renderInline(t.replace(/^>\s?/, '')) + '</i>';
    else if (/^-\s+/.test(t)) inner = '• ' + renderInline(t.replace(/^-\s+/, ''));
    else inner = renderInline(t);
    return '<div>' + inner + '</div>';
  }

  function poemTextToLines(raw) {
    var normalized = String(raw).replace(/\r\n/g, '\n');
    var lines = [];
    var buf = '';
    var i = 0;
    while (i < normalized.length) {
      if (normalized.charAt(i) === '\n' && normalized.charAt(i + 1) === '\n') {
        lines.push(buf);
        buf = '';
        i += 2;
        while (normalized.charAt(i) === '\n') {
          lines.push('');
          i += 1;
        }
      } else {
        buf += normalized.charAt(i);
        i += 1;
      }
    }
    lines.push(buf);
    return lines;
  }

  function markdownToHtml(md) {
    return (
      '<div style="text-align: left;">' +
      poemTextToLines(md).map(lineToHtml).join('') +
      '</div>'
    );
  }

  function emptyEditorHtml() {
    return '<div style="text-align: left;"><div><br></div></div>';
  }

  function toEditorHtml(value) {
    if (value == null || value === '') return emptyEditorHtml();
    if (looksLikeHtml(value)) return String(value);
    return markdownToHtml(value);
  }

  function entryField(entry, key) {
    if (!entry) return '';
    try {
      if (typeof entry.getIn === 'function') {
        var v = entry.getIn(['data', key]);
        if (v == null) return '';
        return String(v);
      }
      if (entry.data && entry.data[key] != null) return String(entry.data[key]);
    } catch (e) {
      /* ignore */
    }
    return '';
  }

  // ---------- Font size (7 levels: -3 … +3, 0 = 기본) ----------
  var FS_MIN = -3;
  var FS_MAX = 3;
  var FS_LABELS = { '-3': '작게 3', '-2': '작게 2', '-1': '작게 1', '0': '기본', '1': '크게 1', '2': '크게 2', '3': '크게 3' };

  function fsClass(level) {
    return level < 0 ? 'fs-m' + -level : 'fs-p' + level;
  }
  function fsLevelOfEl(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'SPAN') return null;
    var m = /(?:^|\s)fs-([mp])([123])(?:\s|$)/.exec(el.className || '');
    if (!m) return null;
    return (m[1] === 'm' ? -1 : 1) * Number(m[2]);
  }
  function fsAncestor(node, root) {
    for (var n = node; n && n !== root; n = n.parentNode) {
      if (fsLevelOfEl(n) != null) return n;
    }
    return null;
  }
  function fsLevelAt(node, root) {
    var a = fsAncestor(node, root);
    return a ? fsLevelOfEl(a) : 0;
  }
  function isBlock(el) {
    return el && el.nodeType === 1 && /^(DIV|P|LI|BLOCKQUOTE|H[1-6])$/.test(el.tagName);
  }
  /** The visual line (innermost block) that contains node, inside root. */
  function lineOf(node, root) {
    for (var n = node; n && n !== root; n = n.parentNode) {
      if (isBlock(n)) return n;
    }
    return null;
  }
  function textNodesIn(root) {
    var out = [];
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var t;
    while ((t = w.nextNode())) if (t.nodeValue !== '') out.push(t);
    return out;
  }
  function wrapIn(node, cls) {
    var span = document.createElement('span');
    span.className = cls;
    node.parentNode.insertBefore(span, node);
    span.appendChild(node);
    return span;
  }
  function unwrap(el) {
    var parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
  /** Merge adjacent same-class fs spans and drop empty ones (keeps the stored HTML small). */
  function tidyFs(root, merge) {
    var spans = root.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var sp = spans[i];
      if (fsLevelOfEl(sp) == null || !sp.parentNode) continue;
      if (sp.textContent === '' && !sp.querySelector('br')) { sp.parentNode.removeChild(sp); continue; }
      var next = sp.nextSibling;
      while (next && next.nodeType === 1 && next.tagName === 'SPAN' && next.className === sp.className) {
        while (next.firstChild) sp.appendChild(next.firstChild);
        var after = next.nextSibling;
        next.parentNode.removeChild(next);
        next = after;
      }
    }
    // Merging text nodes is skipped for 기본 so the restored selection stays exactly on the edited text.
    if (merge) root.normalize();
  }

  /**
   * Set font level on the current selection (or, if collapsed, on the whole line(s) it touches).
   * Returns the level applied, or null if nothing was changed.
   */
  function applyFontLevel(root, level) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    level = Math.max(FS_MIN, Math.min(FS_MAX, level));

    if (range.collapsed) {
      var line = lineOf(range.startContainer, root);
      range = document.createRange();
      range.selectNodeContents(line || root);
    }

    // 1) Split partially selected text nodes at the range edges.
    var sc = range.startContainer, so = range.startOffset, ec = range.endContainer, eo = range.endOffset;
    if (ec.nodeType === 3 && eo > 0 && eo < ec.nodeValue.length) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0 && so < sc.nodeValue.length) {
      var rest = sc.splitText(so);
      if (ec === sc) { ec = rest; eo = eo - so; }
      sc = rest; so = 0;
    }
    var r2 = document.createRange();
    r2.setStart(sc, so);
    r2.setEnd(ec, ec.nodeType === 3 ? Math.min(eo, ec.nodeValue.length) : eo);

    // 2) Text nodes fully inside the range.
    var chosen = textNodesIn(root).filter(function (t) {
      return r2.intersectsNode(t) &&
        !(t === r2.endContainer && r2.endOffset === 0) &&
        !(t === r2.startContainer && r2.startOffset >= t.nodeValue.length);
    });
    if (chosen.length === 0) return null;
    var chosenSet = new Set(chosen);

    // 3) Take chosen text out of any existing fs span; other text in that span keeps its size.
    var seen = new Set();
    chosen.forEach(function (t) {
      var anc = fsAncestor(t, root);
      if (!anc || seen.has(anc)) return;
      seen.add(anc);
      var cls = anc.className;
      var others = textNodesIn(anc).filter(function (x) { return !chosenSet.has(x); });
      unwrap(anc);
      others.forEach(function (x) { wrapIn(x, cls); });
    });

    // 4) Wrap chosen text with the new level (기본 = no span).
    var first = chosen[0], last = chosen[chosen.length - 1];
    if (level !== 0) {
      var cls = fsClass(level);
      chosen.forEach(function (t) { wrapIn(t, cls); });
    }
    var startNode = level !== 0 ? first.parentNode : first;
    var endNode = level !== 0 ? last.parentNode : last;
    tidyFs(root, level !== 0);

    // 5) Keep the edited text selected so A−/A+ can be pressed repeatedly.
    try {
      var nr = document.createRange();
      if (startNode.parentNode && endNode.parentNode) {
        nr.setStartBefore(startNode);
        nr.setEndAfter(endNode);
        sel.removeAllRanges();
        sel.addRange(nr);
      }
    } catch (e) { /* ignore */ }
    return level;
  }

  /** Level at the selection start (first character of the line when collapsed). */
  function currentFontLevel(root) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    var r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer)) return 0;
    var node = r.startContainer;
    if (node.nodeType === 1 && node.childNodes[r.startOffset]) node = node.childNodes[r.startOffset];
    if (r.collapsed && node.nodeType !== 3) {
      var line = lineOf(node, root) || root;
      var ts = textNodesIn(line);
      if (ts.length) node = ts[0];
    }
    return fsLevelAt(node, root);
  }

  // For tests / debugging in the browser console.
  window.__sigyeolFontSize = { apply: applyFontLevel, current: currentFontLevel, labels: FS_LABELS };

  var PoemHtmlControl = createClass({
    getInitialState: function () {
      return { fsLevel: 0 };
    },

    syncFontLevel: function () {
      if (!this.editorEl) return;
      var lv = currentFontLevel(this.editorEl);
      if (lv !== this.state.fsLevel) this.setState({ fsLevel: lv });
    },

    fontSize: function (mode) {
      if (!this.editorEl) return;
      this.editorEl.focus();
      var cur = currentFontLevel(this.editorEl);
      var target = mode === 'reset' ? 0 : cur + (mode === 'up' ? 1 : -1);
      if (target < FS_MIN || target > FS_MAX) return;
      var applied = applyFontLevel(this.editorEl, target);
      if (applied == null) return;
      this.setState({ fsLevel: applied });
      this.emitChange();
    },

    componentDidMount: function () {
      this._applyHtml(toEditorHtml(this.props.value));
    },

    componentDidUpdate: function (prevProps) {
      if (prevProps.value === this.props.value) return;
      if (this.editorEl && document.activeElement === this.editorEl) return;
      this._applyHtml(toEditorHtml(this.props.value));
    },

    _applyHtml: function (html) {
      if (!this.editorEl) return;
      if (this.editorEl.innerHTML !== html) {
        this.editorEl.innerHTML = html;
      }
    },

    emitChange: function () {
      if (!this.editorEl) return;
      this.props.onChange(this.editorEl.innerHTML);
    },

    exec: function (cmd) {
      if (this.editorEl) this.editorEl.focus();
      try {
        document.execCommand(cmd, false, null);
      } catch (e) {
        /* ignore */
      }
      this.emitChange();
    },

    render: function () {
      var self = this;
      var title = entryField(this.props.entry, 'title');
      var author = entryField(this.props.entry, 'author');
      var hasMeta = !!(title || author);

      function toolBtn(label, cmd, titleAttr) {
        return h(
          'button',
          {
            type: 'button',
            title: titleAttr || cmd,
            onMouseDown: function (e) {
              e.preventDefault();
              self.exec(cmd);
            },
          },
          label
        );
      }

      function fsBtn(label, mode, titleAttr, disabled) {
        return h(
          'button',
          {
            type: 'button',
            title: titleAttr,
            'aria-label': titleAttr,
            // Not the real `disabled` attribute: a click on a disabled button would drop the text selection.
            className: 'sigyeol-fs-btn' + (disabled ? ' is-disabled' : ''),
            'aria-disabled': disabled ? 'true' : 'false',
            onMouseDown: function (e) {
              e.preventDefault(); // keep the text selection
              self.fontSize(mode);
            },
          },
          label
        );
      }

      return h(
        'div',
        { id: this.props.forID, className: 'sigyeol-poem-widget' },
        h(
          'div',
          { className: 'sigyeol-poem-toolbar' },
          toolBtn(h('b', {}, 'B'), 'bold', '굵게'),
          toolBtn(h('i', {}, 'I'), 'italic', '기울임'),
          toolBtn(h('u', {}, 'U'), 'underline', '밑줄'),
          toolBtn(h('s', {}, 'S'), 'strikeThrough', '취소선'),
          h('span', { className: 'sigyeol-poem-toolbar-sep' }),
          fsBtn(h('span', { className: 'sigyeol-fs-glyph is-small' }, '가'), 'down', '글자 작게 (선택한 글자, 선택이 없으면 그 줄)', this.state.fsLevel <= FS_MIN),
          h(
            'span',
            {
              className: 'sigyeol-fs-level' + (this.state.fsLevel !== 0 ? ' is-set' : ''),
              title: '현재 글자 크기',
              'aria-live': 'polite',
            },
            FS_LABELS[String(this.state.fsLevel)]
          ),
          fsBtn(h('span', { className: 'sigyeol-fs-glyph is-large' }, '가'), 'up', '글자 크게 (선택한 글자, 선택이 없으면 그 줄)', this.state.fsLevel >= FS_MAX),
          fsBtn('기본', 'reset', '글자 크기를 기본으로', false),
          h('span', { className: 'sigyeol-poem-toolbar-sep' }),
          toolBtn('좌', 'justifyLeft', '왼쪽 정렬'),
          toolBtn('중', 'justifyCenter', '가운데 정렬'),
          toolBtn('우', 'justifyRight', '오른쪽 정렬'),
        ),
        h(
          'div',
          {
            className: 'sigyeol-poem-stage',
          },
          h(
            'div',
            { className: 'sigyeol-poem-card' },
            h(
              'div',
              {
                className:
                  'sigyeol-poem-meta' + (hasMeta ? '' : ' is-empty'),
              },
              title
                ? h('div', { className: 'sigyeol-poem-meta-title' }, title)
                : null,
              author || title
                ? h(
                    'div',
                    { className: 'sigyeol-poem-meta-author' },
                    author || '\u00a0'
                  )
                : null
            ),
            h('div', {
              className: (this.props.classNameWrapper || '') + ' sigyeol-poem-body',
              contentEditable: true,
              suppressContentEditableWarning: true,
              ref: function (el) {
                self.editorEl = el;
              },
              onInput: function () {
                self.emitChange();
              },
              onBlur: function () {
                self.emitChange();
              },
              onKeyUp: function () {
                self.syncFontLevel();
              },
              onMouseUp: function () {
                self.syncFontLevel();
              },
            })
          )
        ),
        h(
          'p',
          { className: 'sigyeol-poem-hint' },
          'Enter로 줄바꿈, 빈 줄은 Enter를 한 번 더. 밑줄·취소선·글자 크기·정렬은 위 도구모음을 쓰세요. 글자 크기(작은 가/큰 가)는 선택한 글자에, 선택이 없으면 커서가 있는 줄 전체에 적용되며 「기본」은 크기 지정을 없앱니다. 편집 화면은 시결 본문 보기와 비슷한 서체·여백입니다.'
        )
      );
    },
  });

  var PoemHtmlPreview = createClass({
    render: function () {
      var title = entryField(this.props.entry, 'title');
      var author = entryField(this.props.entry, 'author');
      return h(
        'div',
        { className: 'sigyeol-poem-widget' },
        h(
          'div',
          { className: 'sigyeol-poem-stage', style: { borderRadius: '4px' } },
          h(
            'div',
            { className: 'sigyeol-poem-card' },
            title || author
              ? h(
                  'div',
                  { className: 'sigyeol-poem-meta' },
                  title
                    ? h('div', { className: 'sigyeol-poem-meta-title' }, title)
                    : null,
                  h(
                    'div',
                    { className: 'sigyeol-poem-meta-author' },
                    author || '\u00a0'
                  )
                )
              : null,
            h('div', {
              className: 'sigyeol-poem-body',
              style: { minHeight: 0, maxHeight: 'none' },
              dangerouslySetInnerHTML: {
                __html: toEditorHtml(this.props.value || ''),
              },
            })
          )
        )
      );
    },
  });

  CMS.registerWidget('poem-html', PoemHtmlControl, PoemHtmlPreview);
})();
