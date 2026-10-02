# 시결 Decap CMS 안내

브라우저에서 시를 쓰고 `main`에 커밋하면 Netlify가 자동으로 [sigyeol.com](https://sigyeol.com)에 반영합니다. `poems.js`를 직접 업로드할 필요가 없습니다.

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
3. 새 글: **New 글** → **ID**에 `Date.now()` 숫자(예: 브라우저 콘솔에서 `Date.now()` 실행) → 카테고리·제목·작가·본문 입력 → Publish
4. 1~2분 뒤 사이트에서 확인 (Netlify가 `npm run build`로 `poems.js`를 다시 만듭니다)

### 카테고리

`신작시` · `주목한 시` · `신인상` · `공지사항` · `아카이브`

메인 페이지 카드에 올리려면 **메인 페이지 노출** 을 켭니다.

### 본문 (시 편집기)

본문은 **HTML**로 저장됩니다. Decap 기본 마크다운/리치텍스트 위젯에는 **밑줄·정렬이 없어서**, 시결 전용 `poem-html` 위젯(contenteditable)을 씁니다.

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
