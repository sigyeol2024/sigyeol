/**
 * 시결 "사이트 발행" — Decap custom widget `publish-request`.
 *
 * CMS saves no longer deploy the site (see scripts/should-build.js).
 * The editor publishes everything saved so far by:
 *   1) opening 사이트 발행 > 발행 요청, 2) pressing "발행 요청하기",
 *   3) pressing 저장 (top bar). That commit changes content/publish.json,
 *   which tells Netlify to build and deploy once (15 credits).
 *
 * Optional: if BUILD_HOOK_URL is filled in, a second button triggers the
 * Netlify build hook directly (no commit needed). NOTE: this file is public,
 * so anyone who reads it could trigger deploys and spend credits. Leave empty
 * unless you accept that risk.
 */
(function () {
  // Netlify > Project configuration > Build & deploy > Continuous deployment > Build hooks
  // 예: 'https://api.netlify.com/build_hooks/xxxxxxxxxxxxxxxxxxxxxxxx'
  var BUILD_HOOK_URL = '';

  function formatKST(iso) {
    if (!iso) return '없음';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'short' }) + ' (한국 시간)';
    } catch (e) {
      return d.toString();
    }
  }

  var box = { border: '1px solid #dfdfe3', borderRadius: '4px', padding: '16px 18px', background: '#fafafa', lineHeight: 1.7, fontSize: '14px' };
  var btn = { fontSize: '14px', padding: '8px 16px', border: '1px solid #2f6b4f', borderRadius: '4px', background: '#2f6b4f', color: '#fff', cursor: 'pointer', marginRight: '8px' };
  var btnGhost = Object.assign({}, btn, { background: '#fff', color: '#2f6b4f' });

  var PublishControl = createClass({
    getInitialState: function () {
      return { requested: false, hookMsg: '' };
    },
    request: function () {
      this.props.onChange(new Date().toISOString());
      this.setState({ requested: true });
    },
    hook: function () {
      var self = this;
      if (!BUILD_HOOK_URL) return;
      if (!window.confirm('지금 사이트를 발행할까요? (Netlify 배포 1회 = 15크레딧)')) return;
      self.setState({ hookMsg: '발행 요청을 보내는 중…' });
      fetch(BUILD_HOOK_URL + '?trigger_title=' + encodeURIComponent('시결 관리자 화면에서 발행'), {
        method: 'POST',
        mode: 'no-cors',
        body: '{}',
      })
        .then(function () {
          self.setState({ hookMsg: '발행 요청을 보냈습니다. 1~3분 뒤 sigyeol.com 에서 확인하세요.' });
        })
        .catch(function () {
          self.setState({ hookMsg: '요청을 보내지 못했습니다. 잠시 후 다시 시도하거나 아래 저장 방식으로 발행하세요.' });
        });
    },
    render: function () {
      var value = this.props.value;
      return h(
        'div',
        { id: this.props.forID, className: this.props.classNameWrapper, style: box },
        h('p', { style: { margin: '0 0 10px' } },
          '글을 저장(또는 삭제)해도 사이트에는 바로 나가지 않습니다. 모아 두었다가 여기서 한 번에 발행합니다.'),
        h('p', { style: { margin: '0 0 12px', color: '#555' } }, '마지막 발행 요청: ' + formatKST(value)),
        h('button', { type: 'button', style: btn, onClick: this.request }, '발행 요청하기'),
        BUILD_HOOK_URL
          ? h('button', { type: 'button', style: btnGhost, onClick: this.hook }, '바로 발행 (빌드 훅)')
          : null,
        this.state.requested
          ? h('p', { style: { margin: '12px 0 0', color: '#2f6b4f', fontWeight: 600 } },
              '이제 화면 맨 위의 "저장" 버튼을 누르세요. 저장하면 발행이 시작되고 1~3분 뒤 사이트에 반영됩니다.')
          : h('p', { style: { margin: '12px 0 0', color: '#555' } },
              '순서: ① "발행 요청하기" → ② 맨 위 "저장". 발행 1번 = Netlify 배포 1번(15크레딧)입니다.'),
        this.state.hookMsg ? h('p', { style: { margin: '8px 0 0', color: '#2f6b4f' } }, this.state.hookMsg) : null
      );
    },
  });

  var PublishPreview = createClass({
    render: function () {
      return h('div', { style: { fontSize: '14px' } }, '마지막 발행 요청: ' + formatKST(this.props.value));
    },
  });

  CMS.registerWidget('publish-request', PublishControl, PublishPreview);
})();
