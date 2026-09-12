// 後台頁面清單，admin-index.html（首頁分區卡片）跟 admin-nav.js（側滑分區抽屜）共用同一份，
// 只是各自渲染成不同的視覺（卡片 vs 文字列表）。之後要調整分組、順序或新增頁面，只要改這裡，
// 兩邊會自動跟著變，不用再手動同步兩份清單。
export const GROUPS = [
  { key: 'members', label: '成員管理', en: 'Members' },
  { key: 'operations', label: '團務相關', en: 'Operations' },
  { key: 'more', label: '其他', en: 'More' }
];

export const PAGES = [
  {
    key: 'review', group: 'members', href: 'review-admin.html', color: 'sage',
    label: '團員審核', sub: '核准/拒絕新申請帳號',
    icon: '<circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19c1-3.4 3.3-5 5.5-5s4.5 1.6 5.5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M15.5 5.5c1.4.3 2.5 1.6 2.5 3.1s-1.1 2.8-2.5 3.1M18 14c1.8.5 3 1.9 3.5 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  },
  {
    key: 'members', group: 'members', href: 'members-admin.html', color: 'teal',
    label: '成員資料', sub: '檢視全部成員資料',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="2" stroke="currentColor" stroke-width="1.6"/><path d="M6 16c.5-1.6 1.8-2.5 3-2.5s2.5.9 3 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10h4M14 13h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  },
  {
    key: 'roles', group: 'members', href: 'roles-admin.html', color: 'plum',
    label: '權限管理', sub: '調整成員角色、權限、樂器清單',
    icon: '<path d="M12 2l7 3v6c0 4.8-3 8.6-7 11-4-2.4-7-6.2-7-11V5l7-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  {
    key: 'event', group: 'operations', href: 'event-admin.html', color: 'brass',
    label: '活動管理', sub: '建立/編輯活動、音樂會、出缺席、簽到',
    icon: '<rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  },
  {
    key: 'roster', group: 'operations', href: 'roster-admin.html', color: 'burgundy',
    label: '名單管理', sub: '建立參與名單範本',
    icon: '<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  },
  {
    key: 'repertoire', group: 'operations', href: 'repertoire-admin.html', color: 'teal',
    label: '藏譜管理', sub: '建立與編輯曲目資料',
    icon: '<path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="16" r="3" stroke="currentColor" stroke-width="1.6"/>'
  },
  {
    key: 'finance', group: 'operations', href: 'finance-admin.html', color: 'brass',
    label: '財務管理', sub: '記帳本與團費繳費追蹤',
    icon: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v10M15 9h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3h-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  {
    key: 'announce', group: 'more', href: 'announce-admin.html', color: 'navy',
    label: '公告管理', sub: '發布/編輯/刪除首頁公告',
    icon: '<path d="M3 10v4a1 1 0 0 0 1 1h2l6 4V5L6 9H4a1 1 0 0 0-1 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  },
  {
    key: 'stats', group: 'more', href: 'stats-admin.html', color: 'mustard',
    label: '統計資料', sub: '簽到、活動、表單等統計資料',
    icon: '<path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  {
    key: 'conductor', group: 'more', href: 'conductor-admin.html', color: 'rose',
    label: '指揮專用', sub: '下一場團練的出缺席狀況、排練筆記',
    icon: '<path d="m5 19 12-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="6" r="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M5 19c-1 0-1.6-.9-1.2-1.8l1.7-3.7 3.7 3.7-1.8 1.7c-.4.4-1 .1-2.4.1Z" fill="currentColor"/>'
  },
  {
    key: 'feedback', group: 'more', href: 'feedback-admin.html', color: 'sage',
    label: '意見回饋', sub: '查看 Bug 回報／功能建議',
    icon: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.2 3.4a.6.6 0 0 1-.98-.47V16A2.5 2.5 0 0 1 4 13.5v-8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.7v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12.6" r="0.95" fill="currentColor"/>'
  }
];
