# 시결 (SIGYEOL)

시 전문 문학 웹진. Netlify에서 Git으로 배포.

- `index.html` — 사이트 셸 (인덱스 먼저 로드, 본문은 열 때 `poems/{id}.json` fetch)
- `content/poems/` — 시·공지 원본 (JSON, Decap CMS로 편집)
- `poems-index.js` — 빌드 산출물: 메타데이터만 (id, category, title, author, isMain, order)
- `poems/{id}.json` — 빌드 산출물: 시 본문 HTML (`{ id, content }`)
- `poems.js` — 라이트 인덱스 별칭 (admin order-autoset 호환)
- `admin/` — Decap CMS (브라우저 편집)
- `scripts/build-poems.js` — content → index + per-poem bodies

편집 방법: [CMS.md](./CMS.md)  
공개 사이트는 읽기 전용이며, 인덱스·본문 파일은 CMS 콘텐츠에서 자동 생성됩니다.
