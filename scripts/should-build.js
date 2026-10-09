#!/usr/bin/env node
/**
 * Netlify `[build] ignore` command — 시결 일괄 발행(batch publishing).
 *
 * Exit code 1 = build and deploy, exit code 0 = skip (no production deploy, no credits).
 * https://docs.netlify.com/build/configure-builds/ignore-builds/
 *
 * Builds ONLY when one of these is true:
 *   1. Triggered by a Netlify build hook (Netlify never cancels hook builds anyway).
 *   2. Re-deploy of the same commit that was last built (dashboard "Trigger deploy"
 *      / "Clear cache and deploy" when there is nothing new).
 *   3. A commit since the last build has "[배포]" or "[deploy]" in its message.
 *   4. A commit since the last build changed content/publish.json
 *      (the "사이트 발행" entry in /admin — the normal way to publish).
 * Everything else (ordinary CMS saves/deletes of poems, media uploads) is skipped;
 * those changes go live together with the next publish.
 *
 * Non-production contexts (deploy previews, branch deploys) are skipped too.
 * Runs on Netlify's Node 18 with no dependencies.
 */
const { execSync } = require('child_process');

const PUBLISH_FILE = 'content/publish.json';
const MARKER = /\[(배포|deploy)\]/i;
const env = process.env;

function build(reason) {
  console.log('[시결] 빌드·배포 진행: ' + reason);
  process.exit(1);
}
function skip(reason) {
  console.log('[시결] 빌드 건너뜀 (크레딧 절약): ' + reason);
  console.log('[시결] 사이트에 반영하려면 /admin 의 "사이트 발행"에서 발행 요청 후 저장하세요.');
  process.exit(0);
}
function git(args) {
  return execSync('git ' + args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
function commitExists(ref) {
  if (!ref || !/^[0-9a-f]{7,40}$/i.test(ref)) return false;
  try { git('cat-file -e ' + ref + '^{commit}'); return true; } catch (e) { return false; }
}

if (env.INCOMING_HOOK_URL || env.INCOMING_HOOK_TITLE || env.INCOMING_HOOK_BODY) {
  build('빌드 훅으로 요청됨');
}

if (env.CONTEXT && env.CONTEXT !== 'production') {
  skip('운영(production)이 아닌 배포: ' + env.CONTEXT);
}

const head = env.COMMIT_REF || 'HEAD';
const cached = env.CACHED_COMMIT_REF;

if (cached && cached === env.COMMIT_REF) {
  build('같은 커밋 재배포 (대시보드 수동 배포)');
}

let messages = '';
let files = [];
try {
  if (commitExists(cached) && commitExists(head)) {
    messages = git('log --format=%B ' + cached + '..' + head);
    files = git('diff --name-only ' + cached + ' ' + head).split('\n');
  } else {
    // No usable previous build ref: judge by the newest commit only.
    messages = git('log -1 --format=%B ' + head);
    files = git('show --name-only --format= ' + head).split('\n');
  }
} catch (e) {
  skip('git 정보를 읽지 못함 (' + (e && e.message ? e.message.split('\n')[0] : e) + ')');
}

if (MARKER.test(messages)) build('커밋 메시지에 [배포]/[deploy] 표시');
if (files.map(f => f.trim()).includes(PUBLISH_FILE)) build('/admin "사이트 발행" 요청 (' + PUBLISH_FILE + ')');

skip('발행 요청 없음 — 일반 저장/삭제 커밋');
