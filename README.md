# 시결 (SIGYEOL)

시 전문 문학 웹진. Netlify에서 Git으로 배포.

- `index.html` — 사이트 셸
- `content/poems/` — 시·공지 원본 (JSON, Decap CMS로 편집)
- `poems.js` — 빌드 산출물 (`npm run build`)
- `admin/` — Decap CMS (브라우저 편집)
- `scripts/build-poems.js` — content → poems.js

편집 방법: [CMS.md](./CMS.md)  
공개 사이트는 읽기 전용이며, `poems.js`는 CMS 콘텐츠에서 자동 생성됩니다.
