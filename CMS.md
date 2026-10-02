# 시결 Decap CMS 안내

브라우저에서 시를 쓰고 `main`에 커밋하면 Netlify가 자동으로 [sigyeol.com](https://sigyeol.com)에 반영합니다. `poems.js`를 직접 업로드할 필요가 없습니다.

공개 사이트에는 편집기와 다운로드 기능이 없으며, 글 작성·수정·발행은 `/admin/` CMS에서만 합니다.

## 관리자 열기

1. 배포 후 **https://sigyeol.com/admin/** 로 이동합니다.
2. Netlify Identity 로그인 창이 뜹니다.

## 로그인 (최초 1회 — 사이트 관리자 작업)

Decap은 **Netlify Identity + Git Gateway** 를 쓰도록 설정되어 있습니다. Netlify 사이트에서 한 번만 켜 주세요.

1. [Netlify](https://app.netlify.com/) → 시결 사이트 → **Site configuration**
2. **Identity** → Enable Identity
3. Identity **Registration** 을 Invite only(초대만)로 두는 것을 권장합니다.
4. **Services → Git Gateway** → Enable Git Gateway (GitHub 연결 확인)
5. Identity → **Invite users** 로 편집자 이메일을 초대합니다.
6. 초대 메일에서 비밀번호를 설정한 뒤 https://sigyeol.com/admin/ 에서 로그인합니다.

### (대안) GitHub 로그인

Identity 설정이 어려우면 `admin/config.yml` 의 backend를 아래로 바꾼 뒤 커밋하세요.

```yaml
backend:
  name: github
  repo: sigyeol2024/sigyeol
  branch: main
```

이 경우 편집자는 GitHub 계정으로 로그인하며, 저장소에 쓰기 권한이 있어야 합니다.

## 첫 시 수정·추가

1. `/admin/` 로그인 → **시·공지** 컬렉션
2. 기존 글을 열어 제목·본문 등을 고친 뒤 **Publish** (바로 `main`에 커밋)
3. 새 글: **New 글** → **ID**에 `Date.now()` 숫자(예: 브라우저 콘솔에서 `Date.now()` 실행) → **표시 순서** 숫자(작을수록 위) → 카테고리·제목·작가·본문 입력 → Publish
4. 1~2분 뒤 사이트에서 확인 (Netlify가 `npm run build`로 `poems.js`를 다시 만듭니다)

### 카테고리

`신작시` · `주목한 시` · `신인상` · `공지사항` · `아카이브`

메인 페이지 카드에 올리려면 **메인 페이지 노출** 을 켭니다.

### 표시 순서 바꾸기

목록에서 글이 보이는 순서는 **표시 순서(`order`)** 숫자로 정합니다.

- **숫자가 작을수록 위**에 표시됩니다. (예: `1`이 맨 위, `2`가 그 다음…)
- 같은 숫자면 **ID가 큰** 글이 위에 옵니다.
- Decap 폴더 컬렉션은 목록을 드래그해서 순서를 저장하는 UI가 없습니다. 글을 연 뒤 **표시 순서** 숫자만 바꾸고 **Publish** 하면 됩니다.
- 새 글 기본값은 `1`이라 기존 `1`번과 같으면 ID(더 큰 `Date.now()`) 때문에 맨 위에 올라갑니다. 맨 아래에 두려면 현재 가장 큰 순서보다 큰 숫자를 넣으세요.
- 목록 화면 정렬 메뉴에서 `order`를 고르면 편집할 때도 사이트와 비슷한 순서로 볼 수 있습니다.

순서만 바꿀 때:

1. `/admin/` → **시·공지**
2. 순서를 바꿀 글을 연다
3. **표시 순서** 숫자를 수정한다 (위로: 더 작은 수 / 아래로: 더 큰 수)
4. **Publish** → 1~2분 뒤 사이트 반영


### 본문 (시 편집기)

본문은 **HTML**로 저장됩니다. Decap 기본 마크다운/리치텍스트 위젯에는 **밑줄·정렬이 없어서**, 시결 전용 `poem-html` 위젯(contenteditable)을 씁니다.

편집 화면은 시결 사이트 본문 보기와 비슷하게 **Noto Serif KR**, 가운데 칼럼, 넉넉한 행간으로 보입니다. 제목·작가는 위 필드 값이 있으면 본문 위에 미리보기로 표시됩니다(저장되는 본문 HTML에는 포함되지 않음). 도구모음 오른쪽에서 밝은/어두운 배경을 전환할 수 있습니다.

도구모음(이 버튼들만):

- **굵게** · **기울임** · **밑줄** · **취소선**
- **좌 정렬** · **가운데 정렬** · **오른쪽 정렬**

줄바꿈:

- 시의 각 줄: **Enter**
- 빈 줄(연 구분 등): Enter를 한 번 더 — 여러 빈 줄도 그대로 유지됩니다

저장 후 Netlify 빌드가 `content/poems/*.json` → `poems.js`로 합칩니다. HTML 본문은 사이트 역사적 형식(`<div style="text-align: …">` + 줄마다 `<div>`)에 맞춰 그대로 쓰입니다.

## 로컬에서 데이터만 다시 만들기

```bash
npm run build
```

`content/poems/*.json` → `poems.js`

## 참고

- 소스: `content/poems/` (글당 JSON 1개)
- 사이트는 예전처럼 `index.html` + `poems.js` 를 읽습니다.
- 커스텀 위젯: `admin/poem-editor.js`
- DNS·Netlify 사이트 삭제와는 무관합니다. Identity / Git Gateway만 켜면 됩니다.
