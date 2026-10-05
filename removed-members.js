import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 名單裡的「已移除成員」（10/1，見 docs/superpowers/specs/2026-10-01-roster-removed-members-design.md）：
// 名單上有、但已經不在該團現役成員裡的 uid（被移出團籍，或帳號已在本機管理台硬刪除）。
// event-admin.html／roster-admin.html 共用：查姓名、標籤/分隔列 HTML、共用樣式（比照
// toast.js/dialog.js 第一次 import 時注入一次 <style>）

var STYLE_ID = 'removed-members-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  // .removed-tag 外觀跟 event-admin.html 既有的 .survey-tag（「已不在名單內」）相同
  style.textContent =
    '.removed-tag{font-size:9.5px;font-weight:700;color:var(--burgundy-deep);background:#FBF3F3;' +
      'border:1px solid #EFD4D8;border-radius:999px;padding:1px 6px;margin-left:4px;white-space:nowrap;}' +
    '.removed-divider{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;padding:10px 2px 4px;' +
      'margin-top:4px;border-top:1px dashed var(--line);}' +
    '.removed-divider-label{font-family:"Roboto Mono",monospace;font-size:10.5px;font-weight:700;' +
      'letter-spacing:.08em;color:var(--burgundy-deep);}' +
    '.removed-divider-note{font-size:10.5px;color:var(--ink-soft);}' +
    '.removed-hint{font-size:11px;font-weight:700;color:var(--burgundy-deep);white-space:nowrap;}' +
    '.removed-name{color:var(--ink-soft);}' +
    '.removed-inst{font-family:"Roboto Mono",monospace;font-size:10.5px;color:var(--ink-soft);white-space:nowrap;}';
  document.head.appendChild(style);
}

ensureStyle();

// 查一次該團所有已移除成員，回傳 { uid: name }。規則只放行該團 admin／有 canDeleteAccounts
// 的人，查詢失敗時回傳空物件、不擋住頁面——最差情況就是全部顯示「已刪除的帳號」
export async function loadRemovedMemberNames(db, team) {
  try {
    var snap = await getDocs(query(collection(db, 'users'), where('removedTeamIds', 'array-contains', team)));
    var map = {};
    snap.forEach(function (docSnap) {
      var data = docSnap.data();
      map[docSnap.id] = data.name || data.account || '';
    });
    return map;
  } catch (err) {
    console.error('讀取已移除成員姓名失敗', err);
    return {};
  }
}

// 有名字回傳名字，沒有（帳號已硬刪除，或查詢失敗）回傳「已刪除的帳號」
export function removedMemberLabel(uid, removedNames) {
  return (removedNames && removedNames[uid]) || '已刪除的帳號';
}

// 呼叫端負責把它接在已經 escape 過的名字後面
export var REMOVED_TAG_HTML = '<span class="removed-tag">已移除</span>';

// 編輯勾選清單裡「已不在團內」區塊的分隔列，放在 .check-list 裡、現役成員列之後
export function removedDividerHtml() {
  return '<div class="removed-divider"><span class="removed-divider-label">已不在團內</span>' +
    '<span class="removed-divider-note">取消勾選後儲存即可移出名單</span></div>';
}

export function removedHintText(count) {
  return count > 0 ? '另有 ' + count + ' 位已移除成員' : '';
}
