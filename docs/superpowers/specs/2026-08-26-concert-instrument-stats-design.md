# 音樂會樂器身分接上簽到／出缺席統計 — 設計文件

**日期**：2026-08-26
**狀態**：設計已與使用者確認，待寫實作計畫
**前情提要**：延續 [2026-08-24-concert-management-design.md](2026-08-24-concert-management-design.md)（音樂會管理與分部指派）。該輪做出 `concertRosters.members[].instrument`（單一字串，代表這場音樂會參與者負責的樂器）後，`schema.md` 原本就記著一條待辦：`checkin-stats-admin.html`／`conductor-admin.html` 依樂器分組時，一直是用 `users.instruments`（個人資料、可複選）簡化處理，等「可指派單一樂器」的機制做出來後要一併更新。這輪就是把這個待辦做掉，同時處理討論中發現的新狀況：有人這場音樂會真的同時負責 2 種樂器（例如黑管兼吹薩克斯風），單一字串放不下。

## 背景

現況（8/25 做完音樂會管理後）：

- `concertRosters.members[].instrument` 是單一字串，一人一場音樂會只能登記一個樂器身分
- `checkin-stats-admin.html`（簽到統計＋出缺席回報整合）跟 `conductor-admin.html`（聲部編制即時檢視＋座位圖）依樂器分組時，各自複製一份 `groupCheckinsByInstrument`/`groupUidsByInstrument`，資料來源都是 `users.instruments`（個人資料樂器能力，可複選）——這是刻意的簡化，因為當時還沒有「這場活動/音樂會實際負責哪個樂器」這種更精準的資料可用
- `event-admin.html`／`section-admin.html` 的分部指派畫面，篩選「參與名單中這個樂器可選的人」目前寫死 `m.instrument === instrumentName`

## 目標（這輪範圍）

1. `concertRosters.members[].instrument`（字串）改成 `instruments`（陣列），支援一人同場音樂會身兼 2 種以上樂器
2. 音樂會參與名單編輯畫面支援「主要樂器 + 手動加簽第二個樂器」
3. 分部指派（`event-admin.html`／`section-admin.html`）跟「依樂器分組」的唯讀摘要，篩選/分組邏輯改用陣列判斷
4. `checkin-stats-admin.html`／`conductor-admin.html` 依樂器分組時：這場活動如果有掛 `concertId`，優先用該音樂會參與名單裡登記的樂器身分分組；名單裡查不到的人（沒同步、臨時代簽等），退回個人資料樂器分組，不讓人從統計裡消失；沒掛 `concertId` 的一般團練活動完全不受影響

## 明確排除範圍（這輪不做）

- **`concertRosters` 舊資料遷移**：目前只有測試資料，直接改欄位形狀（`instrument` → `instruments`），不寫向下相容的讀取轉換，也不寫遷移腳本
- **座位圖視覺重疊**：一人若真的同時負責 2 種樂器，`conductor-admin.html` 座位圖上會同時出現在兩個樂器的扇區裡——這是原本「一人可能同時列在多個樂器分區」就已經接受的簡化延伸，這輪不特別處理視覺上的位置衝突
- **`section-admin.html`／`repertoire-admin.html` 的權限細節**：不在這份文件範圍內，維持 8/25 那輪的既有規則現況
- **團員自助報名表單**：`concertRosters.members[].instruments` 改陣列後一樣預留給之後的報名表單用，這輪不做報名 UI

## 資料模型變更

### `concertRosters/{concertId}.members[]`

| 欄位 | 型別（改前） | 型別（改後） | 說明 |
|---|---|---|---|
| `instrument` → `instruments` | `string` | `array<string>` | 這場音樂會負責的樂器身分，改成陣列以支援同時負責多種樂器（跟 `users.instruments` 同一種形狀，但語意不同——這裡是特意勾選的窄範圍身分，不是能力清單） |

套用名單範本／新加入成員時的預設值：**維持只帶入第一筆樂器**（`member.instruments.length ? [member.instruments[0]] : []`），不整份複製個人資料的樂器清單——「音樂會負責的樂器」是幹部特意挑選的結果，多樂器的情況留給編輯畫面手動加簽，不是自動推導。已在名單中的人重新套用範本時，`instruments` 沿用既有值不被覆蓋（跟改陣列前的邏輯一致，只是型別變了）。

## UI 變更

### 1. 音樂會參與名單編輯畫面（`event-admin.html` `renderConcertRosterChecklist()`）

每個勾選中的團員：

- 主要 `<select>` 維持不變的操作方式，寫入 `concertRosterDraftMap[uid][0]`
- 第 2 筆以後的樂器顯示成小 tag（樂器名稱 + `×` 移除按鈕）
- tag 右側一顆「＋ 新增樂器」的 `<select>`：選項是這個人「目前還沒選過的樂器」，選了就變成新 tag、選單重置回「＋ 新增樂器」這個 placeholder。如果這個人已經把所有樂器都加過了，這顆選單顯示為 disabled（沒有更多可加）

`concertRosterDraftMap` 型別從 `{uid: instrumentName}` 改成 `{uid: array<instrumentName>}`。

### 2. 分部指派篩選（`event-admin.html` `reRenderCurrentAssignment()`/`openAssignmentPanel()`，`section-admin.html` 對應邏輯）

```js
// 改前
var eligibleMembers = members.filter(function(m){ return m.instrument === instrumentName; });
// 改後
var eligibleMembers = members.filter(function(m){ return (m.instruments || []).indexOf(instrumentName) !== -1; });
```

同時負責 2 種樂器的人，兩邊的指派畫面都會出現他（他在兩個樂器的「可選名單」裡都合格）。

### 3. 參與名單依樂器分組的唯讀摘要（`event-admin.html` `groupRosterMembersByInstrument()`，8/26 剛做的功能）

從「查這個人的 `instrument` 屬於哪一組」改成「這個人的 `instruments` 陣列裡每一個樂器都各自把他排進對應分組」——同時負責 2 種樂器的人會同時出現在 2 個分組底下，跟 `users.instruments` 原本多選時「同時列在多個樂器分區」是同一種可接受的行為。

## 統計接軌設計（`checkin-stats-admin.html`／`conductor-admin.html`）

### 解析順序（每個 uid 各自判斷，不是整場活動二選一）

1. 這場活動（`events/{eventId}`）有沒有 `concertId`？沒有 → 全部人都用個人資料樂器（現狀不變，到此結束
2. 有 `concertId` → 查一次 `concertRosters/{concertId}`（每個音樂會查一次就快取，同一次瀏覽不重複查）
3. 對每個要分組的人：這個音樂會的參與名單裡找不找得到他、`instruments` 是否非空？
   - 找得到且非空 → 用音樂會參與名單裡的 `instruments`
   - 找不到，或 `instruments` 是空陣列 → 退回個人資料 `users.instruments`（現狀的 fallback，不讓人從統計裡消失）

### `checkin-stats-admin.html`

- `loadStats()` 撈 `events` 時一併記下 `concertId`（新增 `eventConcertIdById` 對照表）
- 新增 `concertRosterInstrumentsCache`（`concertId → {uid: instruments[]}`）跟 `ensureConcertRosterInstruments(concertId)`（`getDoc` 一次、有快取就不重查）
- `openDetailSheet(eventId)` 改成 async：先 `await ensureConcertRosterInstruments(eventConcertIdById[eventId])`，把結果傳給 `renderDetailSheet(eventId, overrideByUid)`
- `groupCheckinsByInstrument(checkins, overrideByUid)` 新增第二參數：查某個人的樂器時，先看 `overrideByUid[uid]`（非空才採用），否則退回原本的 `membersInstrumentsByUid[uid]`（個人資料）
- `attendingCountsByInstrument(eventId, overrideByUid)` 同步調整，供「各分部出缺席回報」摘要使用

### `conductor-admin.html`

- 「下一場團練」／切換中的活動已經有 `concertId` 欄位可讀（`events` 文件本來就有這個欄位，這輪只是第一次真正用到）
- `groupUidsByInstrument(uids, overrideByUid)` 比照上面同樣加第二參數與 fallback 邏輯
- 「聲部編制即時檢視」（`attendanceReports`）跟座位圖（`seating-chart.js` 的資料來源）共用同一份分組結果，都會反映音樂會樂器身分

## 影響的檔案

- `event-admin.html`：`concertRosterDraftMap` 型別、`renderConcertRosterChecklist()`、`applyTemplateToConcertRoster()`、`reRenderCurrentAssignment()`/`openAssignmentPanel()`、`groupRosterMembersByInstrument()`
- `section-admin.html`：分部指派可選名單的篩選邏輯
- `index.html`：**寫計畫時才發現漏掉的一處**——「團務總覽」的「我的音樂會」（`loadMyConcerts()`/`renderMyConcerts()`）也讀 `concertRosters.members[].instrument`，同人多樂器時要逐一查每個樂器的分部文件、把找到的分部標籤都列出來
- `checkin-stats-admin.html`：`loadStats()`、`groupCheckinsByInstrument()`、`attendingCountsByInstrument()`、`openDetailSheet()`/`renderDetailSheet()`
- `conductor-admin.html`：`groupUidsByInstrument()` 與呼叫端
- `firestore.rules`：不需要改——`concertRosters` 的讀寫權限維持現況，只是欄位形狀變了
