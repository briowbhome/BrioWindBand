# 財務記帳（團費/社費收支）— 設計文件

**日期**：2026-08-28
**狀態**：設計已與使用者確認，待寫實作計畫
**範圍**：記帳本（一般收支記錄）＋團員繳費狀態追蹤（團費/社費），兩者共用底層資料、前端雙寫同步。

## 背景

團/社目前沒有任何數位化的財務紀錄工具。使用者想要一個後台功能，記錄團費/社費等收支，包含記帳本、歷史帳目；資料分析為選配、這輪不做。8/18 討論通知鈴鐺構想時已經先定案一個資料模型原則：「待辦是算出來的差集、已完成是永久保留的紀錄」，直接沿用 `eventRosters`＋`attendanceReports` 已經在用的模式，團費繳交提醒屆時也要走同一種形狀（應繳名單＋繳費紀錄）。8/26 權限架構討論時也已經預留 `canManageFinance` 權限旗標的位置，等記帳功能做出來再接上。這份設計文件就是把上述兩個先前定案的原則正式落地成完整規格。

## 目標（這輪範圍）

1. 記帳本：記錄所有收入/支出（團費、社費、場地租借、樂譜採購、活動支出等），可分類、可查歷史、可看目前結餘
2. 團員繳費狀態追蹤：批次建立「應繳項目」（例如「2026上學期團費」），指定金額與適用範圍名單，追蹤誰繳了誰沒繳
3. 團費繳費登記時自動連動產生記帳本的對應收入明細，兩處畫面共用同一份底層資料，幹部只需登記一次
4. 正式接上 `canManageFinance` 權限旗標與「財務」職位範本

## 明確排除範圍（這輪不做，已跟使用者確認）

- **首頁通知中心整合**：不接上首頁待辦橫幅/通知鈴鐺數字，未繳團費的提醒這輪不會出現在 `index.html`。留到之後排入路線圖時，直接沿用 8/18 已定案的「應繳名單減已繳紀錄」差集原則接上即可，不需要改資料模型。
- **團員自助查詢**：`profile.html` 這輪不會新增查看自己繳費紀錄的區塊。
- **收據/發票附件上傳**：這輪只做文字登記（金額/分類/日期/備註），不做圖片上傳。
- **進階資料分析**：不做圖表/趨勢分析。
- **細部帳目編輯歷史（誰改了什麼）**：作廢（voided）會記錄操作者與時間，但「編輯」本身這輪不另外存欄位級的異動歷史，只保留最新版本 + `updatedAt`。

## 資料模型

### `settings/financeCategories` — 收支分類清單

跟 `settings/seatingSections` 同一種「後台可管理的小清單」存法，單一文件、`categories` 陣列欄位。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `categories` | `array<{id, label, type, order, protected}>` | `type` 是 `'income'` 或 `'expense'`，`order` 決定下拉選單顯示順序 |

**固定保留一筆「團費/社費」分類**（`id` 固定寫死，例如 `'fee'`，`protected:true`）：這是自動連動產生的 `ledgerEntries` 唯一會用到的 `categoryId`，因此**這筆分類在管理介面裡不能被刪除或改變 `type`**（避免刪掉後既有的團費收入明細失去有效分類、或誤改成支出讓結餘算錯），標籤文字仍可編輯。其餘分類（場地費、樂譜採購等）自由新增/刪除，`protected` 只作用在這一筆。頁面第一次載入若偵測不到這筆保留分類會自動補建，不需要另外走資料庫遷移腳本。

### `settings/financeSettings` — 期初餘額

| 欄位 | 型別 | 說明 |
|---|---|---|
| `openingBalance` | number | 起算基準金額，代表建立這套系統前團/社已有的現金存款 |
| `openingBalanceUpdatedAt` | timestamp | 最後調整時間 |
| `openingBalanceUpdatedBy` | uid | 最後調整者 |

### `feeDues/{dueId}` — 應繳項目批次（Firestore 自動 ID）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `title` | string | 例如「2026上學期團費」 |
| `amount` | number | 預設應繳金額 |
| `memberIds` | `array<uid>` | 應繳範圍名單快照，建立時可套用既有 `rosterTemplates`，也可手動勾選 |
| `memberOverrides` | `map<uid, number>` | 選填，個別調整應繳金額（例如減免），沒有覆寫的人用 `amount` |
| `sourceTemplateId` | string \| null | 套用範本時記錄來源，比照 `eventRosters.sourceTemplateId` 的既有做法 |
| `createdAt` / `createdBy` | timestamp / uid | |
| `voided` / `voidedAt` / `voidedBy` | boolean / timestamp / uid | 整批作廢，**不連動作廢底下已存在的 `feePayments`**——已經繳的錢是真實發生過的收入，作廢項目只代表「這批不再視為應繳」 |

### `feePayments/{dueId}_{uid}` — 繳費紀錄（複合 ID 去重，比照 `attendanceReports` 的 `eventId_uid` 模式）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `dueId` / `uid` | string | |
| `amountDue` | number | 登記當下的應繳金額快照（含 `memberOverrides`），避免事後 `feeDues.amount` 調整影響已繳紀錄 |
| `amountPaid` | number | 實際收到的金額，預設帶入 `amountDue` 但可修改 |
| `paidAt` | timestamp | |
| `method` | string \| null | 繳費方式，選填（現金/轉帳等自由文字） |
| `note` | string | 選填 |
| `recordedBy` / `createdAt` | uid / timestamp | |
| `linkedLedgerEntryId` | string | 自動產生對應的 `ledgerEntries` 文件 ID |
| `voided` / `voidedAt` / `voidedBy` | boolean / timestamp / uid | 作廢時**連動作廢** `linkedLedgerEntryId` 指向的記帳本明細 |

**待辦計算**：`feeDues.memberIds` 減去該 `dueId` 底下未作廢 `feePayments` 的 uid 集合，即為尚未繳費的人——跟 `eventRosters`/`attendanceReports` 同一套差集邏輯，不額外存欄位。

### `ledgerEntries/{entryId}` — 記帳本收支明細（Firestore 自動 ID）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `type` | string | `'income'` 或 `'expense'` |
| `categoryId` | string | 對應 `financeCategories` 裡的分類 id |
| `amount` | number | 一律存正數，正負由 `type` 決定 |
| `date` | timestamp | 帳目發生日期（幹部可自訂，不一定等於登記當下） |
| `note` | string | 選填 |
| `recordedBy` / `createdAt` / `updatedAt` | uid / timestamp / timestamp | |
| `linkedFeePaymentId` | string \| null | 非 null 代表這筆是團費繳費自動產生的，**畫面上唯讀**，只能透過原始 `feePayments` 編輯/作廢 |
| `voided` / `voidedAt` / `voidedBy` | boolean / timestamp / uid | |

**結餘計算**：`financeSettings.openingBalance` + Σ（未作廢 `ledgerEntries`，`type==='income'` 記正、`type==='expense'` 記負）。

**團費繳費登記的寫入流程**：前端用 Firestore batch 寫入操作，同一次原子性地新增一筆 `feePayments` 與一筆對應的 `ledgerEntries`（`type:'income'`、`categoryId` 固定用分類清單裡標記為團費的分類、`amount: amountPaid`、`linkedFeePaymentId` 互相關聯），沒有非同步延遲，不透過 Cloud Function trigger（跟專案現有慣例一致：只有真正需要背景處理的情境，例如推播發送，才用 Cloud Function）。

## 操作介面

新頁面 `finance-admin.html`，比照 `event-admin.html` 用分頁骨架，分兩個分頁：

### 「記帳本」分頁

- 頂部顯示目前結餘（大字），旁邊小按鈕可編輯期初餘額（開小面板輸入金額＋備註）
- 收支明細列表，可依日期範圍/分類/收入或支出篩選；預設不顯示已作廢項目，另有「顯示已作廢」開關
- 每筆明細顯示日期、分類、金額、備註、經手人；來自團費的明細有「來自團費」標籤且不可直接編輯/作廢，需去「團費管理」分頁處理來源
- 「＋ 新增帳目」按鈕開 sheet：選收入/支出、分類（下拉）、金額、日期、備註 → 存檔
- 手動建立的明細可編輯或作廢；作廢用 `confirm()` 擋一下（這是會影響金額統計的動作，比照專案「刪除」等級的確認慣例，跟單純狀態切換如「關閉調查」不用 `confirm()` 不同）

### 「團費管理」分頁

- 應繳項目清單：每筆顯示標題、應繳金額、「已繳 X／應繳 Y 人」
- 「＋ 新增應繳項目」開 sheet：標題、預設金額、套用名單範本或手動勾選範圍 → 存檔
- 點一筆項目展開繳費狀態明細，比照出缺席「唯讀摘要＋編輯」模式：名單內每人一列
  - 「已繳」：顯示金額/日期/方式，可點編輯或作廢（作廢連動作廢對應 `ledgerEntries`）
  - 「未繳」：點擊登記繳費，開小面板輸入實際金額（預設帶入應繳金額，可修改）、日期、方式 → batch 寫入 `feePayments`＋`ledgerEntries`
- 項目本身可整批作廢（例如建錯了），列表上用刪除線＋「已作廢」標示，**不連動作廢底下已存在的繳費紀錄**（見上方資料模型說明）

## 權限

- **`canManageFinance`**（`users/{uid}` 已預留但沒接上的旗標）這輪正式接上：
  - `firestore.rules` 新增 `canManageFinance()` helper（跟 `canManageSheetMusic()` 同樣寫法）
  - `feeDues`／`feePayments`／`ledgerEntries`／`settings/financeCategories`／`settings/financeSettings` 的**讀寫規則都是 `isAdminTier() || canManageFinance()`**——財務資料不像活動/公告公開，也不像藏譜全團員可讀，這輪讀取也鎖在這個門檻，一般團員（含審核中）完全看不到任何財務頁面或資料
  - `auth-guard.js` 新增 `requireAdminOrFinanceManager()`，比照 `requireAdminOrSheetMusicManager()` 骨架
  - `roles-admin.html` 的 `POSITION_PRESETS` 新增 `{ key:'finance', label:'財務', permissions:{ canManageFinance:true } }`
- **`finance-admin.html` 比照 `repertoire-admin.html` 的雙模式 appbar**：純財務身分（非 admin-tier）返回箭頭連回 `index.html`、帳號選單不顯示「後台管理」、`admin-nav.js` 漢堡圖示預設隱藏，只有 admin-tier 才顯示並掛 `initAdminNav('finance')`
- **`admin-nav.js`／`admin-index.html`**：新增第 10 張卡片＋側滑抽屜項目，接上 `finance-admin.html`
- **期初餘額編輯權限**：跟其他財務操作一樣用 `isAdminTier() || canManageFinance()`，不特別鎖 Owner（不是像座位圖分區那樣的系統視覺設定，是財務日常操作的一部分）

## 部署注意事項

`firestore.rules` 改動需要使用者自行執行：

```bash
firebase deploy --only firestore:rules --project briopwa-6b138
```

## 已知後續工作（刻意留到之後）

- 首頁通知中心整合團費待辦提醒（沿用 8/18 已定案的差集原則）
- `profile.html` 團員自助查詢自己的繳費紀錄
- 收據/發票圖片附件
- 收支資料分析圖表
