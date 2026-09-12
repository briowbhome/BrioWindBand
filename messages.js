// 共用的 confirm() 提示文字，取代原本散落在各頁面裡的字串常數。有動態內容（名稱、數字）的
// 做成函式，呼叫端傳實際值進來就好；純靜態文字的函式也統一回傳字串，介面一致方便呼叫。
export const MESSAGES = {
  logout: function () {
    return '確定要登出嗎？';
  },
  deleteNote: function () {
    return '確定要刪除這則筆記嗎？';
  },
  deleteAnnouncement: function () {
    return '確定要刪除這則公告嗎？此動作無法復原。';
  },
  deleteFeedbackReport: function () {
    return '確定要刪除這筆回報嗎？';
  },
  deleteInstrument: function (name) {
    return '確定要刪除「' + name + '」嗎？已經選這個樂器的成員資料不會被清掉，只是清單裡不會再出現這個選項。';
  },
  deleteSeatingSection: function () {
    return '確定要刪除這個分區嗎？';
  },
  deleteRosterTemplate: function (name) {
    return '確定要刪除「' + (name || '這份名單') + '」嗎？\n' +
      '已經套用過這份名單的活動不受影響（活動名單是套用當下的複製快照），只是往後那些活動會顯示「來源名單已刪除」。\n' +
      '此動作無法復原。';
  },
  deleteFinanceCategory: function (label) {
    return '確定要刪除分類「' + (label || '') + '」嗎？已經用這個分類的帳目不會被清掉，只是分類名稱之後會顯示「（分類已刪除）」。此動作無法復原。';
  },
  deleteFinanceAccount: function (label) {
    return '確定要刪除帳戶「' + (label || '') + '」嗎？已經套用過這個帳戶的應繳項目不會被清掉，只是這份帳戶庫少一個可以選的選項，套用過的項目也會查不到 QR Code。此動作無法復原。';
  },
  voidDue: function (title) {
    return '確定要作廢「' + (title || '') + '」這個應繳項目嗎？\n已經繳過的紀錄不會被清掉，只是這批不再視為應繳項目。\n此動作無法復原。';
  },
  voidPayment: function () {
    return '確定要作廢這筆繳費紀錄嗎？記帳本裡對應的收入明細也會一併作廢。此動作無法復原。';
  },
  voidLedgerEntry: function () {
    return '確定要作廢這筆帳目嗎？作廢後不會從清單消失，但不再計入結餘。此動作無法復原。';
  },
  deletePiece: function (title) {
    return '確定要刪除「' + (title || '這首曲目') + '」嗎？\n' +
      '已經在某場音樂會引用過這首曲子的資料不會被清掉，只是往後那場音樂會的曲目管理會顯示「（曲目已刪除）」。\n' +
      '此動作無法復原。';
  },
  replaceSharedSheetMusic: function (names) {
    return '這份樂譜同時用於 ' + names + '，更換後這些分部都會套用新檔案，確定要繼續嗎？';
  },
  removeSharedSheetMusic: function (names) {
    return '這份樂譜同時用於 ' + names + '，確定要移除嗎？';
  },
  removeSheetMusic: function (isFullScore) {
    return isFullScore ? '確定要移除總譜嗎？此動作無法復原。' : '確定要移除這個分部的樂譜檔案嗎？此動作無法復原。';
  },
  deleteConcert: function (title) {
    return '確定要刪除「' + (title || '這場音樂會') + '」嗎？\n' +
      '底下的曲目/分部指派/參與名單資料也會一併找不到（不會自動清除，只是沒有入口存取）。\n' +
      '此動作無法復原。';
  },
  removePieceFromConcert: function (title) {
    return '確定要把「' + (title || '這首曲子') + '」從這場音樂會移除嗎？\n' +
      '已經指派過的分部資料不會被清掉，只是沒有入口存取。';
  },
  applyConcertRosterTemplateDiff: function (templateName, added, removed) {
    var msg = '套用「' + templateName + '」將把參與名單的人員設為範本目前的內容';
    msg += (added || removed) ? ('：新增 ' + added + ' 人、移除 ' + removed + ' 人') : '（人員跟目前名單相同）';
    msg += '。每個人的樂器身分預設沿用目前已設定的值，新加入的人預設抓個人資料第一筆樂器。確定要套用嗎？';
    return msg;
  },
  applyEventRosterTemplateDiff: function (templateName, added, removed) {
    var msg = '套用「' + templateName + '」將把名單設為範本目前的內容';
    msg += (added || removed) ? ('：新增 ' + added + ' 人、移除 ' + removed + ' 人') : '（內容跟目前名單相同）';
    msg += '。確定要套用嗎？';
    return msg;
  },
  deleteEvent: function (title) {
    return '確定要刪除「' + (title || '這場活動') + '」嗎？\n' +
      '如果這場活動已經有簽到紀錄，刪除後將找不到對應的活動資料。\n' +
      '此動作無法復原。';
  },
  openCheckin: function (title) {
    return '確定要幫「' + (title || '這場活動') + '」開啟簽到嗎？';
  },
  removeCheckinRecord: function () {
    return '確定要移除這筆簽到紀錄嗎？此動作無法復原。';
  },
  deleteAttendanceReport: function (name) {
    return '確定要刪除「' + (name || '這筆') + '」的出缺席回報嗎？此動作無法復原。';
  },
  deleteEventType: function (label) {
    return '確定要刪除「' + (label || '這個類型') + '」嗎？\n' +
      '如果還有活動使用這個類型，畫面會顯示找不到對應名稱，不會自動改到別的類型。';
  }
};
