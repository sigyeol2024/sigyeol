/**
 * Decap ko locale tweaks for 시결.
 * Decap's "게시(Publish)" only saves to the repository now; the site goes live
 * via 사이트 발행. Rename it to "저장" so editors aren't misled, and fix typos.
 */
(function () {
  if (!window.CMS || !CMS.getLocale || !CMS.registerLocale) return;
  var base = CMS.getLocale('ko');
  if (!base) return;
  var ko = JSON.parse(JSON.stringify(base));
  var overrides = {
    publish: '저장',
    publishing: '저장 중...',
    published: '저장됨',
    publishNow: '지금 저장',
    publishAndCreateNew: '저장하고 새로 만들기',
    publishAndDuplicate: '저장하고 복제',
    deletePublishedEntry: '글 삭제',
    deleteEntry: '글 삭제',
    duplicate: '복제',
    onPublishing: '저장할까요? (사이트에는 "사이트 발행"을 해야 나갑니다)',
    onPublishEntry: '저장할까요? (사이트에는 "사이트 발행"을 해야 나갑니다)',
    onDeletePublishedEntry: '이 글을 삭제할까요? (사이트에서는 다음 발행 때 사라집니다)',
    entryPublished: '저장했습니다.',
    entrySaved: '저장했습니다.',
    onFailToPublishEntry: '저장 실패: %{details}',
    onFailToUnpublishEntry: '게시 철회 실패: %{details}',
    onLoggedOut: '로그아웃되었습니다. 작성 중인 내용을 백업한 뒤 다시 로그인하세요.',
    deployButtonLabel: '사이트 보기',
    collections: '메뉴',
    allCollections: '전체',
    searchAll: '전체 검색',
    searchIn: '검색 범위',
    searchResultsInCollection: '%{collection}에서 "%{searchTerm}" 검색 결과',
    backCollection: '%{collectionLabel} 작성 중',
    newButton: '＋ 새 %{collectionLabel}',
  };
  (function walk(obj) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v && typeof v === 'object') walk(v);
      else if (typeof v === 'string' && Object.prototype.hasOwnProperty.call(overrides, k)) obj[k] = overrides[k];
    });
  })(ko);
  CMS.registerLocale('ko', ko);
})();
