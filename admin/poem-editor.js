/**
 * Decap custom widget: poem-html
 * contenteditable body with toolbar: bold, italic, underline, strikethrough,
 * left / center / right align. Stores HTML matching the live SPA shape.
 *
 * Built-in markdown/richtext cannot do underline or text-align.
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

  var btnStyle = {
    fontFamily: 'inherit',
    fontSize: '13px',
    padding: '6px 10px',
    margin: '0 2px 0 0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    background: '#fff',
    cursor: 'pointer',
    lineHeight: '1.2',
  };

  var PoemHtmlControl = createClass({
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

      function toolBtn(label, cmd, title) {
        return h(
          'button',
          {
            type: 'button',
            title: title || cmd,
            style: btnStyle,
            onMouseDown: function (e) {
              // Keep selection in the editor
              e.preventDefault();
              self.exec(cmd);
            },
          },
          label
        );
      }

      return h(
        'div',
        { id: this.props.forID },
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '2px',
              padding: '8px 10px',
              border: '1px solid #dfdfe3',
              borderBottom: 'none',
              borderRadius: '4px 4px 0 0',
              background: '#f5f5f7',
            },
          },
          toolBtn(h('b', {}, 'B'), 'bold', '굵게'),
          toolBtn(h('i', {}, 'I'), 'italic', '기울임'),
          toolBtn(h('u', {}, 'U'), 'underline', '밑줄'),
          toolBtn(h('s', {}, 'S'), 'strikeThrough', '취소선'),
          h('span', {
            style: {
              width: '1px',
              height: '18px',
              background: '#ccc',
              margin: '0 6px',
            },
          }),
          toolBtn('좌', 'justifyLeft', '왼쪽 정렬'),
          toolBtn('중', 'justifyCenter', '가운데 정렬'),
          toolBtn('우', 'justifyRight', '오른쪽 정렬')
        ),
        h('div', {
          className: this.props.classNameWrapper,
          contentEditable: true,
          suppressContentEditableWarning: true,
          ref: function (el) {
            self.editorEl = el;
          },
          style: {
            minHeight: '260px',
            padding: '14px 16px',
            border: '1px solid #dfdfe3',
            borderRadius: '0 0 4px 4px',
            background: '#fff',
            lineHeight: '2',
            fontSize: '15px',
            outline: 'none',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          },
          onInput: function () {
            self.emitChange();
          },
          onBlur: function () {
            self.emitChange();
          },
        }),
        h(
          'p',
          {
            style: {
              margin: '8px 0 0',
              fontSize: '12px',
              color: '#666',
              lineHeight: '1.5',
            },
          },
          'Enter로 줄바꿈, 빈 줄은 Enter를 한 번 더. 밑줄·취소선·정렬은 위 도구모음을 쓰세요. (Decap 기본 마크다운에는 밑줄·정렬이 없습니다.)'
        )
      );
    },
  });

  var PoemHtmlPreview = createClass({
    render: function () {
      return h('div', {
        style: {
          lineHeight: '2.2',
          fontSize: '15px',
          padding: '8px 0',
        },
        dangerouslySetInnerHTML: {
          __html: toEditorHtml(this.props.value || ''),
        },
      });
    },
  });

  CMS.registerWidget('poem-html', PoemHtmlControl, PoemHtmlPreview);
})();
