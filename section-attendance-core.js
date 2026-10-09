// 同分部互看出缺席（10/9 新增）：首頁分部摘要的純計算邏輯（計數、卡片摘要文字、名單排序、
// 標題、註明），不碰 Firestore 和 DOM，用 node:test 測試（tests/unit/section-attendance-core.test.mjs）

export function countStatuses(members){
  var c = { attending: 0, leave: 0, none: 0 };
  (members || []).forEach(function(mem){
    if (mem.status === 'attending') c.attending++;
    else if (mem.status === 'leave') c.leave++;
    else c.none++;
  });
  return c;
}

// 活動卡片底下那一行小字。一個分部：出席／請假為 0 的省略，兩者都是 0 才講未回報人數；
// 多個分部：只列各分部出席人數，避免卡片寬度不夠
export function chipSummary(docs){
  if (docs.length === 1){
    var c = countStatuses(docs[0].members);
    var parts = [];
    if (c.attending > 0) parts.push(c.attending + ' 出席');
    if (c.leave > 0) parts.push(c.leave + ' 請假');
    if (parts.length === 0) return '分部 ' + c.none + ' 人未回報';
    return '分部 ' + parts.join('・');
  }
  return docs.map(function(d){
    return d.instrument + ' ' + countStatuses(d.members).attending;
  }).join('・') + ' 出席';
}

var STATUS_ORDER = { attending: 0, leave: 1 };

function statusRank(status){
  return STATUS_ORDER.hasOwnProperty(status) ? STATUS_ORDER[status] : 2;
}

// 依出席、請假、未回報分組；同一組內自己排第一，其餘維持伺服器給的姓名順序
export function sortSheetMembers(members, myUid){
  return members.map(function(mem, i){ return { mem: mem, i: i }; }).sort(function(a, b){
    var r = statusRank(a.mem.status) - statusRank(b.mem.status);
    if (r !== 0) return r;
    var am = a.mem.uid === myUid ? 0 : 1;
    var bm = b.mem.uid === myUid ? 0 : 1;
    if (am !== bm) return am - bm;
    return a.i - b.i;
  }).map(function(x){ return x.mem; });
}

export function sheetTitle(doc, date){
  return doc.instrument + '分部' + (date ? '・' + (date.getMonth() + 1) + '/' + date.getDate() : '');
}

export function footnoteText(doc){
  if (doc.source === 'concert') return '分部依「' + doc.concertTitle + '」登記的樂器判斷。';
  return '無關聯的音樂會，分部依「個人資料」登記的樂器判斷。';
}
