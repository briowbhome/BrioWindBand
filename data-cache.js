/**
 * 給「不需要即時監聽、下拉重整＝整頁 reload 就能拿到最新資料」的唯讀清單類資料用的
 * 通用快取模式：跟 auth-guard.js 的 profile 快取同一套精神——先讀本地快取讓畫面秒開，
 * 同時一定會背景重新打一次 Firestore 換上最新結果。
 *
 * 刻意用 localStorage 不用 sessionStorage：sessionStorage 只在同一個分頁沒關掉之前
 * 有效，PWA 被系統整個關掉重開（冷啟動）快取就沒了，還是要整個重新等一輪；改用
 * localStorage 可以讓冷啟動也秒開，且完全不碰 Firestore 自己的 IndexedDB 持久化引擎
 * （initializeFirestore 的 persistentLocalCache），不會踩到那個已知在 iOS standalone
 * PWA 上會卡死連線的風險（見 schema.md／memory 的 IndexedDB 事件記錄）——9/15 討論定案，
 * 這是先於「重新開啟 Firestore 持久化快取」的低風險替代方案
 *
 * 不用 TTL：這類資料本來就每次都會重新 fetch 一次確認最新狀態，快取只是拿來墊畫面，
 * 不是拿來跳過查詢，舊多久都無所謂。
 *
 * key：localStorage 的 key，個人化資料（例如自己的出缺席回報）要自己把 uid 併進 key
 *      裡，避免同一台裝置换人登入時看到上一位使用者的殘留資料
 * fetcher：() => Promise<T>，實際去 Firestore 查、回傳「已經處理成可以直接 render」的結果
 * render：(data: T) => void，快取命中會先呼叫一次，抓到最新資料後一定會再呼叫一次
 * reviveCache：選填，(cached: T) => T，只套用在「從快取讀回來」這條路徑——
 *      JSON.stringify 會把 Date 物件變成 ISO 字串，資料裡如果有 Date 欄位（例如活動時間），
 *      要靠這個把字串轉回 Date，不然畫面呼叫 .getMonth() 之類的方法會出錯
 */
export function cachedThenFresh(key, fetcher, render, reviveCache) {
  var hadCache = false;
  try {
    var raw = localStorage.getItem(key);
    if (raw) {
      var cached = JSON.parse(raw);
      render(reviveCache ? reviveCache(cached) : cached);
      hadCache = true;
    }
  } catch (e) {}

  return fetcher().then(function (fresh) {
    try { localStorage.setItem(key, JSON.stringify(fresh)); } catch (e) {}
    render(fresh);
    return fresh;
  }).catch(function (err) {
    // 已經有快取畫面可看時，背景重新整理失敗就安靜略過，不要用錯誤畫面蓋掉還能看的舊資料
    if (hadCache) return;
    throw err;
  });
}
