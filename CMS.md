# 시결 Decap CMS 안내

브라우저에서 시를 쓰고 `main`에 커밋하면 Netlify가 자동으로 [sigyeol.com](https://sigyeol.com)에 반영합니다. 빌드 산출물(`poems-index.js`, `poems/*.json`)을 직접 업로드할 필요가 없습니다.

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

## 사이드바 · 카테고리별 목록

`/admin/` 왼쪽 사이드바에는 카테고리마다 별도의 컬렉션이 있습니다.

| 사이드바 이름 | 내용 |
| --- | --- |
| **신작시** | `category: 신작시` |
| **주목한 시** | `category: 주목한 시` |
| **신인상** | `category: 신인상` |
| **공지사항** | `category: 공지사항` |

파일은 모두 같은 폴더 `content/poems/*.json` 에 저장됩니다. Decap의 **filtered folder collection** 으로 `category` 값만 걸러서 보여 줍니다. 목록 한 줄 요약은 `순서 · 제목 — 작가` 형식입니다(이미 카테고리 메뉴 안에 있으므로 카테고리명은 생략).

카테고리 필드는 각 컬렉션에서 숨겨져 있고, 그 메뉴에서 **New 글** 을 만들면 해당 카테고리로 자동 저장됩니다. 다른 카테고리로 옮기려면 JSON의 `category` 값을 바꾸거나, 원하는 사이드바 메뉴에서 새로 작성하세요.

## 첫 시 수정·추가

1. `/admin/` 로그인 → 원하는 **카테고리** 컬렉션(예: 신작시)
2. 기존 글을 열어 제목·본문 등을 고친 뒤 **Publish** (바로 `main`에 커밋)
3. 새 글: **New 글** → **ID**에 `Date.now()` 숫자(예: 브라우저 콘솔에서 `Date.now()` 실행) → **표시 순서**는 비워 두면 해당 카테고리 맨 위에 자동 배치(아래 규칙) → 제목·작가·본문 입력 → Publish
4. 1~2분 뒤 사이트에서 확인 (Netlify가 `npm run build`로 `poems-index.js`와 `poems/{id}.json`을 다시 만듭니다)

메인 페이지 오른쪽 목록에 올리려면 **메인 페이지 노출**(`isMain`)을 켭니다. 켠 글만(카테고리 상관없이, 공지사항 포함) 표시 순서대로 목록에 나옵니다. 끄면 목록에서 빠지고 해당 카테고리 페이지에서만 보입니다.

메인 페이지 왼쪽의 큰 시는 이 체크와 상관없이, 페이지를 열 때마다 **신작시 · 주목한 시 · 신인상** 전체에서 한 편을 무작위로 고릅니다(공지사항은 제외). PC에서는 오른쪽 목록의 글에 마우스를 올리면 왼쪽이 그 글로 바뀝니다.

### 표시 순서 바꾸기

목록에서 글이 보이는 순서는 **표시 순서(`order`)** 숫자로 정합니다. **소수(예: 55.5)도 가능**합니다.

- **숫자가 작을수록 위**에 표시됩니다. (예: `1`이 맨 위, `2`가 그 다음…)
- 같은 숫자면 **ID가 큰** 글이 위에 옵니다.
- 빌드·사이트 정렬은 `parseFloat`로 숫자를 비교합니다.
- Decap 폴더 컬렉션은 목록을 드래그해서 순서를 저장하는 UI가 없습니다. 글을 연 뒤 **표시 순서**만 바꾸고 **Publish** 하면 됩니다.
- 목록 화면 정렬 메뉴에서 `order`를 고르면 편집할 때도 사이트와 비슷한 순서로 볼 수 있습니다.

#### 새 글 자동 순서 (맨 위)

**표시 순서를 비워 두고 Publish**하면 CMS가 저장 직전에 자동으로 넣습니다.

- **규칙:** 같은 카테고리에 이미 있는 글들의 `order` **최솟값 − 1**
- 그 카테고리에 글이 없으면 **`1`**
- 예: 신작시 최솟값이 `1`이면 새 글은 `0`, 그다음 새 글은 `-1` …
- 직접 숫자를 입력하면 그 값을 그대로 씁니다(자동 덮어쓰지 않음).

이렇게 하면 새 글이 카테고리 **맨 위**에 오고, 기존 글과 `1`이 겹치지 않습니다.

#### 두 글 사이에 넣기

정수만 있을 때(예: `55`와 `56`) 그 사이에 넣으려면 **소수**를 쓰면 됩니다.

- 예: `55`와 `56` 사이 → **`55.5`**
- 더 촘촘히: `55.2`, `55.7` 등 (입력 칸 step은 `0.1`)
- 맨 아래(목록 끝)에 두려면 현재 **최댓값보다 큰** 수를 넣으세요.

순서만 바꿀 때:

1. `/admin/` → 해당 **카테고리** 메뉴
2. 순서를 바꿀 글을 연다
3. **표시 순서** 숫자를 수정한다 (위로: 더 작은 수 / 아래로: 더 큰 수 / 사이: 소수)
4. **Publish** → 1~2분 뒤 사이트 반영

### 본문 (시 편집기)

본문은 **HTML**로 저장됩니다. Decap 기본 마크다운/리치텍스트 위젯에는 **밑줄·정렬이 없어서**, 시결 전용 `poem-html` 위젯(contenteditable)을 씁니다.

편집 화면은 시결 사이트 본문 보기와 비슷하게 **Noto Serif KR**, 가운데 칼럼, 넉넉한 행간으로 보입니다. 제목·작가는 위 필드 값이 있으면 본문 위에 미리보기로 표시됩니다(저장되는 본문 HTML에는 포함되지 않음).

도구모음(이 버튼들만):

- **굵게** · **기울임** · **밑줄** · **취소선**
- **좌 정렬** · **가운데 정렬** · **오른쪽 정렬**

줄바꿈:

- 시의 각 줄: **Enter**
- 빈 줄(연 구분 등): Enter를 한 번 더 — 여러 빈 줄도 그대로 유지됩니다

저장 후 Netlify 빌드가 `content/poems/*.json` → `poems-index.js`(메타) + `poems/{id}.json`(본문)으로 나눕니다. HTML 본문은 사이트 역사적 형식(`<div style="text-align: …">` + 줄마다 `<div>`)에 맞춰 그대로 쓰입니다. 사이트가 처음에는 인덱스만 받고, 시를 열 때 본문 JSON을 가져옵니다.

## 로컬에서 데이터만 다시 만들기

```bash
npm run build
```

`content/poems/*.json` → `poems-index.js` + `poems/{id}.json`

## 참고

- 소스: `content/poems/` (글당 JSON 1개, 카테고리 공통 폴더)
- CMS: `admin/config.yml` — 카테고리별 filtered collections
- 사이트: `index.html` + `poems-index.js` (목록), 열 때 `poems/{id}.json` (본문)
- 검색: 제목·작가·카테고리는 인덱스; 본문 검색은 본문 파일을 그때 로드
- 커스텀 위젯: `admin/poem-editor.js`
- 새 글 순서 자동 할당: `admin/order-autoset.js` (preSave)
- DNS·Netlify 사이트 삭제와는 무관합니다. Identity / Git Gateway만 켜면 됩니다.
