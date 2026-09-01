# 樂譜管理 — 設計文件

**日期**：2026-09-01
**狀態**：設計已與使用者確認，待寫實作計畫
**範圍**：藏譜管理（`repertoire/{pieceId}`）每個分部（`parts[].partId`）可以上傳/更換/檢視一份分部譜 PDF，團員在新頁面「譜夾」依可見性規則檢視自己能看的樂譜。

## 背景

`repertoire.parts[].partId` 從音樂會管理功能（8/25）落地時就是刻意預留的掛勾點，`canManageSheetMusic` 權限旗標／`requireAdminOrSheetMusicManager()` 也已經接上 `repertoire-admin.html`（管理曲目/分部資料），但檔案本身的上傳/檢視一直是「還在構想階段」。這輪把樂譜檔案本身的上傳、儲存、檢視權限、團員端入口一次做完。

首頁（`index.html`）bottom nav 目前有一個反灰的 `.tab-soon` 佔位按鈕「譜夾」，點擊只會跳「即將推出」的 toast——這輪把它變成真正的頁面。

**這是專案第一次用到 Firebase Storage**（`firebase.json` 目前只有 `firestore`/`functions`，沒有 `storage` 設定，也還沒有 `storage.rules` 檔案）。Firebase 專案先前已升級到 Blaze 方案，備註提到「未來樂譜上傳功能也會用到同一個方案」，這輪是那句話的兌現。

## 目標（這輪範圍）

1. 譜務/管理員在 `repertoire-admin.html` 能對每個分部上傳、更換、移除一份 PDF 樂譜
2. 團員在新頁面「譜夾」能依照自己的角色/分部指派，看到自己能看的分部樂譜並開啟/下載
3. 建立團員端「自己分部」的可見性規則，並提供管理員個別放行的機制

## 明確排除範圍（這輪不做）

- **總譜**（指揮用、全部分部合一的版本）——這是掛在整首曲子層級、不屬於任何 `partId` 的另一種檔案，跟分部譜性質不同，留到下一輪
- **同一分部多份檔案/版本歷史**——`repertoire.parts[]` 的分部定義本來就已經拆到最細（例如「長笛1st」「長笛2nd」各自是獨立的 `partId`），一個 partId 一份檔案就夠，不需要同分部多檔案
- **Storage 規則層級的精細強制存取控制**——比照現有 `concerts`/`pieces`/`sections`/`concertRosters`/`notes` 的既有慣例，「自己分部」只是前端 UI 篩選/預設顯示，不是伺服器端逐 partId 強制擋（詳見「權限」一節）
- **PDF 以外的檔案格式**——只收 `application/pdf`
- **推播通知**——新增/更換樂譜不主動通知團員

## 資料模型

### `repertoire/{pieceId}.parts[]` 新增欄位

不新增子集合——沿用「編輯分部結構就整份陣列覆寫」的既有慣例（`repertoire.js` 的 `updatePiece()`），直接在每個分部物件上加欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `sheetMusicUrl` | string \| null | Firebase Storage 下載連結，`null` 表示這個分部還沒上傳樂譜 |
| `sheetMusicUploadedBy` | uid \| null | |
| `sheetMusicUploadedAt` | timestamp \| null | |

既有的 `{partId, instrumentName, label}` 不變。

### Storage 路徑

`repertoire/{pieceId}/{partId}.pdf`——固定副檔名（只收 PDF），重新上傳直接覆蓋同路徑檔案，前端不用額外清理舊檔就能達成「更換」的效果。

**限制**：檔案大小 < 10MB，`contentType` 必須是 `application/pdf`。

**刪除清理**：移除某個分部欄位、或整首曲目被刪除時，一併呼叫 `deleteObject()` 清掉對應的 Storage 檔案——這不是業務資料的級聯清理（不影響其他 collection 的正確性判讀），純粹避免留下孤兒檔案持續占用 Storage 用量，跟現有「刪除不級聯處理其他業務資料」的慣例不衝突。

## 權限

### 新增個人權限旗標 `canViewAllSheetMusic`

比照 `canManageSheetMusic`/`canManageFinance` 同一套模式，`roles-admin.html` 新增一項可勾選的個人權限。**這只影響「譜夾」頁面預設要不要把某首曲目的全部分部顯示出來，不是 Storage/Firestore 規則層級的強制存取控制**（見下方「可見性規則只在前端」）。

### 可見性規則（決定「譜夾」頁面對某個團員要顯示哪些分部的樂譜連結）

以「樂器」（`instrumentName`）為單位判斷，不細到 `partId`——同一個樂器底下的所有分部（例如長笛 1st/2nd）互相可見，不需要各自被指派過才看得到：

1. `isAdminTier()`（管理員/擁有者）、`role == 'conductor'`（指揮老師）、或個人權限 `canViewAllSheetMusic == true` → 這首曲目全部分部都可見
2. 該樂器的分部長（`sectionLeaderFor` 對應該 `instrumentName`）→ 該樂器底下所有分部可見，**不論自己在這首曲子是否被指派過**（分部長對自己負責的樂器有整體檢視需求，不限於自己被排到的部分）
3. 一般團員：只要在**任一場**音樂會的分部指派（`concerts/{concertId}/pieces/{pieceId}/sections/{instrumentName}`）中被指派過這首曲子、這個樂器（不論具體是哪個 `partId`）→ 該樂器底下所有分部可見
4. 完全沒被任何音樂會用到的曲目（「譜夾」第二區，見下方 UI）→ 全部分部對全團開放，因為沒有任何分部指派資料可以判斷「自己的分部」
5. 以上都不符合 → 這個樂器底下的分部不顯示

### 可見性規則只在前端，不是伺服器端逐分部強制擋

跟現有 `concerts`/`pieces`/`sections`/`concertRosters`/`notes` 一致的既有慣例：這些資料的讀取權限本來就是全團開放（`hasProfile()`），「只顯示自己分部」是前端預設篩選/顯示邏輯，不是資料存取層級的強制限制。樂譜延續同一套原則：

- **Firestore**：`repertoire` 集合現有規則不用改——讀取本來就是 `hasProfile()`，寫入本來就是 `isAdminTier() || canManageSheetMusic()`；樂譜欄位掛在同一份文件裡，自動套用同一套規則
- **Firebase Storage**（新增 `storage.rules`）：
  - 讀取：`request.auth != null` 且有 `users` 文件（比照 `hasProfile()`，用 Storage 規則的 `firestore.get()`/`firestore.exists()` 查 Firestore）
  - 寫入/刪除：角色是 `admin`/`owner`，或 `permissions.canManageSheetMusic == true`（比照 `canManageSheetMusic()`）
  - 額外限制：`request.resource.contentType == 'application/pdf'` 且 `request.resource.size < 10 * 1024 * 1024`

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function hasProfile() {
      return request.auth != null &&
        firestore.exists(/databases/(default)/documents/users/$(request.auth.uid));
    }
    function canManageSheetMusic() {
      return request.auth != null &&
        firestore.exists(/databases/(default)/documents/users/$(request.auth.uid)) &&
        (firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'owner'] ||
         firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.permissions.canManageSheetMusic == true);
    }
    match /repertoire/{pieceId}/{partFile} {
      allow read: if hasProfile();
      allow write: if canManageSheetMusic()
        && request.resource.contentType == 'application/pdf'
        && request.resource.size < 10 * 1024 * 1024;
      allow delete: if canManageSheetMusic();
    }
  }
}
```

`firebase.json` 新增：

```json
"storage": {
  "rules": "storage.rules"
}
```

**需要使用者手動確認的 Firebase Console 設定**：確認 Firebase Storage 是否已在專案內啟用（Blaze 方案已升級，但 Storage bucket 是否已建立需要實際檢查）。

## 操作介面

### `repertoire-admin.html`（譜務/管理員後台）

- 唯讀摘要（`renderPieceViewParts()`）每個分部列後面加操作按鈕：
  - 還沒上傳：「上傳樂譜」
  - 已上傳：「更換」＋「檢視」（開新分頁）＋「移除」
- 上傳直接在唯讀檢視模式操作，**不用先進編輯模式**——跟編輯分部結構（新增/刪除分部欄位）是分開的兩個操作路徑
- 上傳流程：選檔 → 前端檢查型別是 PDF、大小 < 10MB → `uploadBytes()` 到 `repertoire/{pieceId}/{partId}.pdf` → `getDownloadURL()` → 讀取目前最新的 `parts` 陣列（來自 `subscribeRepertoire()` 快取）、找到對應 `partId` 更新三個欄位 → `updateDoc()` 整份 `parts` 陣列寫回
- **編輯模式裡新增的分部欄位（還沒存檔的草稿）不開放上傳**——避免使用者填了新分部、上傳了檔案、卻取消存檔，造成 Storage 裡有孤兒檔案但 Firestore 完全沒有對應紀錄的情況。上傳動作只對已經持久化（有真正 `partId` 且已存在於 Firestore 文件裡）的分部開放

### 團員端新頁面「譜夾」（暫定檔名 `sheet-music.html`）

- 沿用 `requireApprovedMember()` 守門，比照 `profile.html` 等團員頁面
- 取代 `index.html` bottom nav 現有的 `.tab-soon` 佔位按鈕，改成 `<a class="tab" href="sheet-music.html">`
- 資料來源：擴充 `index.html` 現有的 `loadMyConcerts()` 邏輯（已經在撈音樂會＋曲目＋分部指派），額外把 `instrumentName`（不只 label 字串）一併帶出，供計算可見性規則使用
- **第一區**：依自己有參與的音樂會分組（`concertRosters` 有自己），列出音樂會標題，底下列出這場音樂會用到的曲目
- **第二區**：其餘沒被任何音樂會用到的其他曲目（`repertoire` 裡有、但沒有任何 `concerts/*/pieces` 引用過），依規則 4 全部分部對全團開放
- 每首曲目點開列出（依可見性規則篩過的）分部清單，各自一顆「檢視樂譜」連結（PDF 用瀏覽器內建檢視器開新分頁），沒有樂譜檔案的分部顯示「（尚未上傳樂譜）」而不是整列隱藏
- **UI 細節待定，實作前用 Artifact 示意稿跟使用者確認版面**（比照專案既有慣例，例如 8/26 三項後台介面提案先用示意稿再落地）：使用者已提出希望在「第一區」音樂會曲目清單增加分部篩選 chip（預設篩選自己被指派的最細分部，例如「長笛1部」而非籠統的「長笛」），這個互動細節這輪先記錄需求，實際版面留到示意稿階段再定案

## 與現有功能的關係

- 不動 `concerts`/`pieces`/`sections`/`concertRosters`/`notes` 的既有資料結構或權限，樂譜的可見性規則是**讀取**這些既有資料來計算，不寫入
- `repertoire.js` 的 `subscribeRepertoire()`/`updatePiece()` 不用改介面（`parts` 陣列的形狀擴充欄位，讀寫方式不變）
- `roles-admin.html` 新增 `canViewAllSheetMusic` 旗標，跟既有 `canManageSheetMusic`/`canManageFinance` 並列，套用職位範本的機制不用改（同一套 UI）
- 這是專案第一次使用 Firebase Storage，`storage.rules`/`firebase.json` 都是新增檔案
