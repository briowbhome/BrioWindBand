# 後台介面三項提案 — 設計文件

**日期**：2026-08-26
**狀態**：已用互動示意稿跟使用者確認過，待寫實作計畫
**背景**：延續同日稍早「後台巢狀功能／彈窗/電腦版排版」的討論（見對話記錄），三項提案都先用一份 Artifact 互動示意稿（自訂 toast、側邊導覽選單、藏譜管理電腦版排版）跟使用者對過，這份文件記錄確認後的技術細節，示意稿本身不重複貼版面說明。

## 目標（這輪範圍）

1. 新增共用模組 `toast.js`，取代全站 39 處單純通知用的 `alert()`（`confirm()` 17 處不動，範圍/理由見背景討論）
2. 新增共用模組 `admin-nav.js`，讓 `admin-index.html` 九張卡片對應的 9 個後台頁面都能側滑跳轉到彼此，不用先退回控制台首頁
3. `repertoire-admin.html` 新增電腦版排版（左右雙欄 master-detail），並在頁面上加一顆手動切換手機版/電腦版排版的按鈕（正式功能，不管視窗實際寬度）

## 明確排除範圍

- `confirm()`（17 處）這輪不動——同步阻塞、需要重寫呼叫端控制流程，範圍另外評估
- `section-admin.html` 不接 `admin-nav.js`——它不是 `admin-index.html` 九張卡片之一，訪客是分部長（不一定是 admin-tier），塞一份只有 admin-tier 能進的 9 頁清單沒有意義
- `event-admin.html` 音樂會分頁的電腦版排版——這輪只做藏譜管理（`repertoire-admin.html`）試點，效果確認後再考慮擴大範圍
- 其餘 8 個後台頁面的電腦版排版——同上，這輪只做試點

## 一、`toast.js`

### API

```js
export function showToast(message, tone)  // tone: undefined（一般）| 'success' | 'error'
```

自己注入樣式/DOM（比照 `account-menu.js` 的模式），第一次呼叫時在 `document.body` 建立一個常駐的 toast 元素並重複使用（不用每次呼叫都重新建立節點）。畫面樣式沿用 `index.html` 既有的 `.soon-toast`（底部置中、深色底、圓角膠囊），只是：

- 加兩個語氣變體：`success`（`var(--sage)` 底）、`error`（`var(--burgundy)` 底），預設（不傳 `tone`）維持原本的 `var(--ink)` 深色底
- 顯示時間從 1.5 秒延長到 **2.6 秒**——`alert()` 替換掉的訊息常常比「即將推出」長（例如錯誤代碼、驗證提示），需要更多閱讀時間
- 沒有點擊提早關閉、沒有堆疊多則的機制——這輪 39 處呼叫點都是「顯示一則、看完自動消失」的單一用途，不需要更複雜的佇列邏輯

### 呼叫點轉換規則（39 處，已用 Explore agent 逐一核對）

| 型態 | 數量 | 轉換方式 |
|---|---|---|
| `.catch(function(err){ alert('OOO：' + err.code); })` | 34 | `showToast('OOO：' + err.code, 'error');` |
| `section-admin.html` 的 permission-denied 三元判斷 | 1 | `showToast(err.code === 'permission-denied' ? '無權限：這個帳號目前不能儲存分部指派' : '儲存失敗：' + err.code, 'error');` |
| 驗證/guard 訊息（不在 `.catch` 裡，沒有 `err.code`） | 6 | `showToast('OOO');`（不傳 tone，維持中性語氣——這些是「還不能做這件事」的引導，不是操作失敗） |

**逐檔案清單**：`event-admin.html`(26)、`roles-admin.html`(6)、`conductor-admin.html`(2)、`section-admin.html`(1)、`repertoire-admin.html`(1)、`announce-admin.html`(1)、`roster-admin.html`(1)、`index.html`(1)。每個檔案在 `<script type="module">` 開頭補一行 `import { showToast } from './toast.js';`。

## 二、`admin-nav.js`

### API

```js
export function initAdminNav(currentKey)  // currentKey: 見下方 PAGES 清單的 key
```

比照 `account-menu.js` 的整合方式：頁面 HTML 裡要先有一顆 `id="adminNavBtn"` 的按鈕（appbar 內、放在既有返回箭頭左側），`initAdminNav()` 找到這顆按鈕掛上點擊事件，自己建立側滑抽屜 + 遮罩並附加到 `document.body`。

### 頁面清單（寫死在模組內，之後新增後台頁面只改這一份）

跟 `admin-index.html` 九張卡片同順序同文案同圖示（直接複用卡片的 SVG path，不重畫）：

| key | href | label |
|---|---|---|
| review | review-admin.html | 團員審核 |
| members | members-admin.html | 成員資料 |
| event | event-admin.html | 活動管理 |
| roster | roster-admin.html | 名單管理 |
| repertoire | repertoire-admin.html | 藏譜管理 |
| announce | announce-admin.html | 公告管理 |
| roles | roles-admin.html | 權限管理 |
| stats | stats-admin.html | 統計資料 |
| conductor | conductor-admin.html | 指揮專用 |

抽屜最上面固定一個「‹ 回控制台首頁」連結到 `admin-index.html`；清單裡 `key === currentKey` 的那一項用 `.current` 樣式標示（`var(--sage-bg)` 底、不可點，渲染成沒有 `href` 的 `<a>`）。

### 整合到 9 個頁面

- `review-admin.html`／`members-admin.html`／`event-admin.html`／`roster-admin.html`／`repertoire-admin.html`／`announce-admin.html`／`roles-admin.html`／`stats-admin.html`：appbar 的 `back-btn` 前面加一個漢堡圖示按鈕（`id="adminNavBtn"`），`<script type="module">` 裡 `import { initAdminNav } from './admin-nav.js';`，在跟 `initAccountMenu(...)` 差不多的位置呼叫 `initAdminNav('對應的 key')`——不需要等權限驗證完成才呼叫，因為這 8 頁本來就是 `requireAdmin()` 擋在最前面，能執行到這裡就已經確定是 admin-tier
- `conductor-admin.html`：這頁用的是 `requireAdminOrConductor()`，非 admin-tier 的純 `conductor` 角色也能進來，但他們沒有其他 8 頁的權限。**只在 `isAdminTier` 為真的分支才呼叫 `initAdminNav('conductor')`**，純 conductor 角色不顯示漢堡圖示（沒有東西可以跳，顯示了也沒用，維持現況）

### 互動細節

- 側滑方向：從左滑出（跟觸發按鈕在螢幕左側一致），遮罩 `z-index` 要蓋過既有 `.sheet-overlay`（各頁 `.sheet-overlay` 是 `z-index:80`，`admin-nav.js` 自己注入的遮罩/抽屜用 `z-index:90`/`91`，確保抽屜開著時疊在任何 sheet 上面）
- 點遮罩、按 Escape、點清單裡任一個可點項目都會關閉抽屜（點目前頁面那項不會，因為它沒有 `href`、渲染成不可點）

## 三、`repertoire-admin.html` 電腦版排版

### 版面

左右雙欄 master-detail：

- **左欄**（固定寬度，跟示意稿一致）：曲目清單，依標題排序（沿用既有的 `piecesList.sort(...localeCompare(...,'zh-Hant'))`，不用改排序邏輯本身）
- **右欄**：預設空狀態「請先從左側選擇曲目」；點清單裡任一首曲子，右欄才顯示該曲的唯讀分部摘要（沿用剛做完的 `renderPieceViewParts()` 那套「一個樂器一列，拆了才顯示分部標籤」呈現方式）+「✎ 編輯」/「刪除」按鈕
- **不是新蓋一套 UI**：現有的 `pieceSheetOverlay`（bottom sheet）在電腦版排版下**改成內嵌在右欄裡**，不再是浮動抽屜；手機版排版下維持現在的 bottom sheet 行為完全不變

### 手機版／電腦版手動切換（正式功能）

- 藏譜管理清單標題（「藏譜管理」文字）右側加一顆圖示按鈕，點擊在 `mobile`/`desktop` 兩種排版間切換
- 選擇結果寫進 `localStorage`（key 例如 `brio_repertoire_layout_mode`），下次開頁面沿用上次選擇；**沒有存過值時的預設值＝實際視窗寬度**（例如 `window.innerWidth >= 900` 就預設電腦版，否則手機版），不是寫死固定一種，讓大部分人第一次打開就看到符合他們裝置的版面，只有真的需要跨版面檢查時才要手動切
- 純 CSS 責任分工：`body` 或某個外層容器依目前模式加 `layout-mobile`/`layout-desktop` class，兩種版面的樣式規則都用這個 class 當前綴，不用 media query（因為這是手動開關，不是純粹依螢幕寬度自動切換）

## 影響的檔案

- 新增：`toast.js`、`admin-nav.js`
- 修改（toast）：`event-admin.html`、`roles-admin.html`、`conductor-admin.html`、`section-admin.html`、`repertoire-admin.html`、`announce-admin.html`、`roster-admin.html`、`index.html`
- 修改（admin-nav）：`review-admin.html`、`members-admin.html`、`event-admin.html`、`roster-admin.html`、`repertoire-admin.html`、`announce-admin.html`、`roles-admin.html`、`stats-admin.html`、`conductor-admin.html`
- 修改（電腦版排版）：`repertoire-admin.html`
- `firestore.rules`：不需要改，三項都是純前端
