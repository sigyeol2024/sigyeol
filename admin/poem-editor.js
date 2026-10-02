/**
 * Decap custom widget: poem-html
 * contenteditable body with toolbar: bold, italic, underline, strikethrough,
 * left / center / right align. Stores HTML matching the live SPA shape.
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

  function preferDarkDefault() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  }

  var PoemHtmlControl = createClass({
    getInitialState: function () {
      return {
        stageTheme: preferDarkDefault() ? 'dark' : 'light',
      };
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

    toggleStageTheme: function () {
      this.setState({
        stageTheme: this.state.stageTheme === 'dark' ? 'light' : 'dark',
      });
    },

    render: function () {
      var self = this;
      var title = entryField(this.props.entry, 'title');
      var author = entryField(this.props.entry, 'author');
      var hasMeta = !!(title || author);
      var isDark = this.state.stageTheme === 'dark';

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
          toolBtn('좌', 'justifyLeft', '왼쪽 정렬'),
          toolBtn('중', 'justifyCenter', '가운데 정렬'),
          toolBtn('우', 'justifyRight', '오른쪽 정렬'),
          h('span', { className: 'sigyeol-poem-toolbar-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'sigyeol-poem-theme-btn',
              title: isDark ? '밝은 배경으로 보기' : '어두운 배경으로 보기',
              onMouseDown: function (e) {
                e.preventDefault();
                self.toggleStageTheme();
              },
            },
            isDark ? '밝은 배경' : '어두운 배경'
          )
        ),
        h(
          'div',
          {
            className:
              'sigyeol-poem-stage ' + (isDark ? 'is-dark' : 'is-light'),
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
            })
          )
        ),
        h(
          'p',
          { className: 'sigyeol-poem-hint' },
          'Enter로 줄바꿈, 빈 줄은 Enter를 한 번 더. 밑줄·취소선·정렬은 위 도구모음을 쓰세요. 편집 화면은 시결 본문 보기와 비슷한 서체·여백입니다.'
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
          { className: 'sigyeol-poem-stage is-light', style: { borderRadius: '4px' } },
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
