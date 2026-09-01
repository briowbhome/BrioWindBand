# 樂譜管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 譜務/管理員能在 `repertoire-admin.html` 對每個分部（`partId`）上傳/更換/移除一份 PDF 樂譜；團員能在新頁面「譜夾」（取代首頁底部導覽列現有的反灰佔位按鈕）依可見性規則看到自己能看的分部樂譜並開啟。

**Architecture:** 這是專案第一次使用 Firebase Storage，新增 `storage.rules` + `firebase.json` 註冊。樂譜檔案 metadata（`sheetMusicUrl`/`sheetMusicUploadedBy`）直接加在 `repertoire/{pieceId}.parts[]` 陣列的每個分部物件上，不新增子集合，沿用「編輯分部結構就整份陣列覆寫」的既有慣例（`repertoire.js` 的 `updatePiece()`）。可見性規則完全在前端計算（比照 `concerts`/`pieces`/`sections`/`concertRosters`/`notes` 既有的「讀取全團開放、UI 負責篩選」慣例），Firestore/Storage 規則都只檢查「是不是登入的團員」跟「寫入要有 `canManageSheetMusic`」，不做逐分部的伺服器端強制存取控制。

**Tech Stack:** Vanilla JS ES Modules（無建置工具、無框架），Firebase v10.14.1（Firestore/Storage CDN import）。**這個專案沒有自動化測試框架**：`.js`/內嵌 `<script type="module">` 用 `node --check` 做語法檢查（內嵌腳本先抽取到暫存檔）；規則檔用括號計數腳本檢查；功能面驗證用瀏覽器手動操作（`.claude/launch.json` 已設定好本機靜態伺服器 `brio-pwa`，`preview_start` 用這個 name 開起來即可，實際資料連正式環境 Firestore/Storage `briopwa-6b138`，不是本地模擬器）。

**Spec:** [docs/superpowers/specs/2026-09-01-sheet-music-design.md](../specs/2026-09-01-sheet-music-design.md)

## Global Constraints

- Firebase SDK CDN 版本固定 `10.14.1`，所有 import 都用 `https://www.gstatic.com/firebasejs/10.14.1/firebase-*.js`，不得換版本。
- 專案慣例「不共用邏輯檔」：`sheet-music.html` 的邏輯全部 inline 寫在自己的 `<script type="module">` 裡，不要抽成獨立 `.js` 檔給其他頁面 import。`repertoire.js` 是既有「藏譜資料層」模組（只有 `repertoire-admin.html` 用），樂譜上傳/刪除函式加在這裡（跟現有的 `subscribeRepertoire`/`addPiece`/`updatePiece`/`deletePiece` 同一份檔案），因為它們操作的是同一份 `repertoire/{pieceId}` 資料結構——但 `sheet-music.html` 讀取樂譜資料時直接查 `repertoire` collection（比照 `index.html` `loadMyConcerts()` 既有做法，不 import `repertoire.js`）。
- 所有 Firestore 寫入的時間欄位一律用 `serverTimestamp()`，**除了這輪新增的 `parts[]` 陣列欄位**——Firestore 不允許 `serverTimestamp()` 出現在陣列元素裡，所以 `sheetMusicUploadedBy` 只存 uid 字串，不存上傳時間。
- 新增文件一律用 `doc(collection(db, ...))` 產生自動 ID 再 `setDoc()`，不要 import `addDoc`——但這輪沒有新增任何 Firestore 文件，只更新既有 `repertoire` 文件的 `parts` 欄位，沿用既有的 `updatePiece()`（走 `updateDoc()`）。
- 刪除確認一律用瀏覽器原生 `confirm()`。
- **`storage.rules` 是這個專案第一次出現的檔案，修改後必須提醒使用者自己執行 `firebase deploy --only storage --project briopwa-6b138` 才會生效**——Task 3（上傳 UI）的瀏覽器驗證步驟需要規則先部署過，否則會收到 `storage/unauthorized`。`firestore.rules` 這輪完全不用改（`repertoire` 現有規則已經涵蓋新欄位）。
- 只收 `application/pdf`，檔案大小上限 10MB（`10 * 1024 * 1024` bytes），前端跟 Storage 規則兩層都要驗證。
- Storage 路徑固定 `repertoire/{pieceId}/{partId}.pdf`，重新上傳直接覆蓋同路徑檔案。

---

## File Structure

**新增檔案：**
- `storage.rules` — Firebase Storage 安全規則，第一次出現。
- `sheet-music.html` — 團員端「譜夾」頁面，取代首頁底部導覽列的 `.tab-soon` 佔位按鈕。

**修改檔案：**
- `firebase.json` — 註冊 `storage.rules`。
- `firebase-init.js` — 新增 `export const storage = getStorage(app);`。
- `repertoire.js` — 新增 `uploadPartSheetMusic()`/`deletePartSheetMusic()` 兩個函式。
- `repertoire-admin.html` — `renderPieceViewParts()` 從「一個樂器一行」改成「一個分部一行」，每行加樂譜操作按鈕（上傳/更換/檢視/移除）跟對應互動邏輯。
- `roles-admin.html` — `PERMISSION_DEFS`/預設權限物件新增 `canViewAllSheetMusic` 旗標。
- `index.html` — 底部導覽列「譜夾」`.tab-soon` 按鈕改成真正連結 `<a href="sheet-music.html">`。
- `profile.html` — 同上。
- `version.js` — 版號跳一版。
- `sw.js` — `CACHE_VERSION` 跳一版，`CORE_ASSETS` 加入 `./sheet-music.html`。

---

### Task 1: Firebase Storage 基礎建設

**Files:**
- Create: `storage.rules`
- Modify: `firebase.json`
- Modify: `firebase-init.js`

**Interfaces:**
- Consumes: 無。
- Produces: `export const storage` from `firebase-init.js`（`getStorage(app)` 的結果），供 Task 2（`repertoire.js`）import 使用。`storage.rules` 的 `repertoire/{pieceId}/{partId}` 路徑讀寫規則，供 Task 3 的瀏覽器驗證使用。

- [ ] **Step 1: 新增 `storage.rules`**

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

- [ ] **Step 2: 大括號配對檢查**

```bash
node -e "
var fs = require('fs');
var text = fs.readFileSync('storage.rules', 'utf8');
var open = (text.match(/\{/g) || []).length;
var close = (text.match(/\}/g) || []).length;
console.log('open:', open, 'close:', close);
if (open !== close) { console.error('大括號數量不對稱！'); process.exit(1); }
console.log('OK');
"
```

Expected: 印出 `OK`。

- [ ] **Step 3: `firebase.json` 註冊 `storage.rules`**

Read `firebase.json`（目前只有 `firestore`/`functions` 兩個 key），改成：

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20"
    }
  ]
}
```

- [ ] **Step 4: 語法檢查 `firebase.json`**

```bash
node -e "JSON.parse(require('fs').readFileSync('firebase.json', 'utf8')); console.log('OK');"
```

Expected: 印出 `OK`。

- [ ] **Step 5: `firebase-init.js` 新增 Storage export**

Read `firebase-init.js`（目前只 export `auth`/`db`/`functions`），改成：

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGT88l8VtEXBZGeRaKLiQXmDgWOdjr7rw",
  authDomain: "briopwa-6b138.firebaseapp.com",
  projectId: "briopwa-6b138",
  storageBucket: "briopwa-6b138.firebasestorage.app",
  messagingSenderId: "549136644639",
  appId: "1:549136644639:web:15d50baa7d25b5053fb32a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// 區域要跟 functions/index.js 的 REGION 一致，不然 callable 會打不到部署的函式
export const functions = getFunctions(app, "asia-east1");
export const storage = getStorage(app);
```

（`storageBucket` 已經在既有設定裡，不用改；只加了一行 import 跟一行 export。）

- [ ] **Step 6: 語法檢查**

```bash
node --check firebase-init.js
```

Expected: 沒有輸出。

- [ ] **Step 7: Commit**

```bash
git add storage.rules firebase.json firebase-init.js
git commit -m "$(cat <<'EOF'
新增 Firebase Storage 基礎建設：storage.rules + firebase.json 註冊 + storage export

這是專案第一次用到 Firebase Storage。repertoire/{pieceId}/{partId} 路徑
讀取放行給任何已登入且有 users 文件的人（比照 hasProfile()），寫入/
刪除限 admin/owner 或 canManageSheetMusic 權限旗標，並檢查 PDF 型別跟
10MB 大小上限。

⚠️ 這個檔案的改動要提醒使用者自己執行
firebase deploy --only storage --project briopwa-6b138 才會生效，
後面 Task 3 的瀏覽器驗證步驟需要規則先部署過。
EOF
)"
```

**⚠️ 完成這個任務後，請明確告知使用者：Task 3 開始瀏覽器測試上傳功能之前，一定要先執行上面那行部署指令，否則會收到 `storage/unauthorized` 錯誤。**

---

### Task 2: `repertoire.js` — 樂譜上傳/刪除函式

**Files:**
- Modify: `repertoire.js`

**Interfaces:**
- Consumes: 無。
- Produces:
  - `uploadPartSheetMusic(storage, pieceId, partId, file)` → `Promise<string>`（resolve 下載連結 URL），供 Task 3 呼叫。
  - `deletePartSheetMusic(storage, sheetMusicUrl)` → `Promise<void>`，供 Task 3 呼叫。

- [ ] **Step 1: 新增 import 跟兩個函式**

Read `repertoire.js`（目前只 import firestore 相關函式），在檔案開頭補上 Storage import，並在 `randomPartId()` 之後新增兩個函式：

```js
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
```

（只在既有 import 區塊下面加一段新的 Storage import，原本的 Firestore import 不動。）

在檔案最後（`randomPartId()` 函式之後）新增：

```js
// 樂譜檔案固定路徑 repertoire/{pieceId}/{partId}.pdf（只收 PDF、10MB 上限，
// storage.rules 有同樣的限制），重新上傳直接覆蓋同路徑檔案，前端不用另外清理舊檔
export function uploadPartSheetMusic(storage, pieceId, partId, file) {
  var fileRef = ref(storage, "repertoire/" + pieceId + "/" + partId + ".pdf");
  return uploadBytes(fileRef, file, { contentType: "application/pdf" }).then(function () {
    return getDownloadURL(fileRef);
  });
}

// sheetMusicUrl 是 getDownloadURL() 回傳的下載連結，Firebase SDK 的 ref() 可以直接
// 從這種 https 下載連結反推出 Storage 物件參照，不用另外存一份 Storage 路徑欄位
export function deletePartSheetMusic(storage, sheetMusicUrl) {
  return deleteObject(ref(storage, sheetMusicUrl));
}
```

- [ ] **Step 2: 語法檢查**

```bash
node --check repertoire.js
```

Expected: 沒有輸出。

- [ ] **Step 3: Commit**

```bash
git add repertoire.js
git commit -m "$(cat <<'EOF'
repertoire.js 新增樂譜上傳/刪除函式

uploadPartSheetMusic()/deletePartSheetMusic() 操作固定路徑
repertoire/{pieceId}/{partId}.pdf，這輪只加資料層，還沒接上任何 UI。
EOF
)"
```

---

### Task 3: `repertoire-admin.html` — 樂譜上傳/檢視/移除 UI

**Files:**
- Modify: `repertoire-admin.html`

**Interfaces:**
- Consumes: Task 1 的 `storage`（from `firebase-init.js`）；Task 2 的 `uploadPartSheetMusic`/`deletePartSheetMusic`（from `repertoire.js`）；既有的 `piecesById`、`editingPieceId`、`currentAdminUid`、`db`、`showToast`、`updatePiece`。
- Produces: 完整可操作的樂譜上傳/檢視/更換/移除功能，這是這個 Task 完成後可以端到端測試的階段。

- [ ] **Step 1: import 補上 `storage`、`uploadPartSheetMusic`、`deletePartSheetMusic`**

Read `repertoire-admin.html` 第 361-368 行附近的 import 區塊（先前研究記錄，確認實際行號），改成：

```js
  import { initAdminNav } from './admin-nav.js';
  import { showToast } from './toast.js';
  import { requireAdminOrSheetMusicManager, peekCachedProfile } from './auth-guard.js';
  import { db, storage } from './firebase-init.js';
  import { initAccountMenu } from './account-menu.js';
  import { subscribeRepertoire, addPiece, updatePiece, deletePiece, randomPartId, uploadPartSheetMusic, deletePartSheetMusic } from './repertoire.js';
  import { subscribeInstruments, FAMILY_LABELS, FAMILY_ORDER } from './instruments.js';
```

（只在 `firebase-init.js` 的 import 加 `storage`、`repertoire.js` 的 import 加 `uploadPartSheetMusic, deletePartSheetMusic`，其餘不動。）

- [ ] **Step 2: 新增 CSS——樂譜操作按鈕**

Read `repertoire-admin.html` 找到 `.part-empty{...}` 規則（先前研究記錄在第 223 行），在它之後插入：

```css
  .part-row-view{ justify-content:space-between; }
  .part-sheet-actions{ display:flex; gap:6px; flex:none; }
  .part-sheet-btn{
    border:1px solid var(--line); background:var(--paper); color:var(--brass-deep);
    border-radius:999px; padding:5px 11px; font-size:11px; font-weight:700; cursor:pointer;
    font-family:inherit; white-space:nowrap; text-decoration:none; display:inline-block;
  }
  .part-sheet-btn:active{ background:var(--sage-bg); }
  .part-sheet-btn.view{ color:var(--sage); }
  .part-sheet-btn.danger{ color:var(--burgundy-deep); }
  .part-sheet-btn.upload{ background:var(--brass); color:var(--ink); border-color:var(--brass); }
```

- [ ] **Step 3: 重寫 `renderPieceViewParts()`——從「一個樂器一行」改成「一個分部一行」，每行加樂譜操作按鈕**

Read `repertoire-admin.html` 找到目前的 `renderPieceViewParts()` 函式（先前研究記錄在第 478-498 行），整段改成：

```js
  // 8/26 原本設計是「一個樂器一行」（超過一個分部才補一行小字列標籤），這輪因為每個
  // 分部（partId）各自有獨立的樂譜檔案操作，改成「一個分部一行」才放得下操作按鈕——
  // 這是對已上線版面的必要調整，已用 Artifact 示意稿跟使用者確認過
  function renderPieceViewParts(parts){
    var container = document.getElementById('pieceViewParts');
    if (!parts || parts.length === 0){
      container.innerHTML = '<div class="part-empty">尚未設定分部欄位</div>';
      return;
    }
    var grouped = groupPartsByInstrument(parts);
    container.innerHTML = grouped.order.map(function(instrumentName){
      return (
        '<div class="part-group-label">' + escapeHtml(instrumentName) + '</div>' +
        grouped.byInstrument[instrumentName].map(function(part){
          var actionsHtml = part.sheetMusicUrl
            ? (
                '<a class="part-sheet-btn view" href="' + escapeHtml(part.sheetMusicUrl) + '" target="_blank" rel="noopener">檢視</a>' +
                '<button type="button" class="part-sheet-btn" data-sheet-upload="' + part.partId + '">更換</button>' +
                '<button type="button" class="part-sheet-btn danger" data-sheet-remove="' + part.partId + '">移除</button>'
              )
            : '<button type="button" class="part-sheet-btn upload" data-sheet-upload="' + part.partId + '">上傳樂譜</button>';
          return (
            '<div class="part-row part-row-view">' +
              '<span class="part-label">' + escapeHtml(part.label) + '</span>' +
              '<div class="part-sheet-actions">' + actionsHtml + '</div>' +
            '</div>'
          );
        }).join('')
      );
    }).join('');
  }
```

（拿掉了原本「超過一個分部才補一行小字列標籤」的 `meta` 邏輯，因為現在每個分部本來就各自一行、標籤本身就會顯示。）

- [ ] **Step 4: 新增隱藏的檔案選擇器 + 樂譜上傳/移除互動邏輯**

Read `repertoire-admin.html` 找到 `pieceDeleteBtn.addEventListener('click', ...)` 這段結尾（先前研究記錄在第 707-724 行），在它之後、`requireAdminOrSheetMusicManager().then(...)` 之前插入：

```js
  // 樂譜上傳只在「唯讀摘要」畫面操作（editingPieceId 一定有值，因為只有 openEditSheet()
  // 會顯示 pieceViewMode），跟編輯分部結構（新增/刪除分部欄位）分開流程；編輯模式裡
  // 新增、還沒存檔的草稿分部不會出現在 pieceViewParts 裡，天生就不能上傳，
  // 不會有「取消存檔但 Storage 已經有孤兒檔案」的情況
  var sheetMusicFileInput = document.getElementById('sheetMusicFileInput');
  var pendingSheetPartId = null;
  var sheetMusicUploadInFlight = {}; // partId -> true，避免同一個分部重複點擊上傳

  function validateSheetMusicFile(file){
    if (file.type !== 'application/pdf'){
      showToast('只能上傳 PDF 檔案', 'error');
      return false;
    }
    if (file.size >= 10 * 1024 * 1024){
      showToast('檔案大小不能超過 10MB', 'error');
      return false;
    }
    return true;
  }

  function uploadSheetMusic(partId, file){
    if (sheetMusicUploadInFlight[partId]) return;
    if (!validateSheetMusicFile(file)) return;
    var targetPieceId = editingPieceId;
    var p = piecesById[targetPieceId];
    if (!p) return;
    sheetMusicUploadInFlight[partId] = true;
    uploadPartSheetMusic(storage, targetPieceId, partId, file).then(function(url){
      var updatedParts = p.parts.map(function(part){
        return part.partId === partId
          ? Object.assign({}, part, { sheetMusicUrl: url, sheetMusicUploadedBy: currentAdminUid })
          : part;
      });
      return updatePiece(db, targetPieceId, p.title, p.composer, updatedParts).then(function(){
        if (editingPieceId === targetPieceId) renderPieceViewParts(updatedParts);
        showToast('樂譜已上傳', 'success');
      });
    }).catch(function(err){
      showToast('上傳失敗：' + err.code, 'error');
    }).finally(function(){
      delete sheetMusicUploadInFlight[partId];
    });
  }

  function removeSheetMusic(partId){
    if (sheetMusicUploadInFlight[partId]) return;
    var targetPieceId = editingPieceId;
    var p = piecesById[targetPieceId];
    if (!p) return;
    var part = p.parts.filter(function(x){ return x.partId === partId; })[0];
    if (!part || !part.sheetMusicUrl) return;
    sheetMusicUploadInFlight[partId] = true;
    deletePartSheetMusic(storage, part.sheetMusicUrl).catch(function(err){
      // Storage 物件可能已經不存在（例如手動在 Firebase Console 刪過），
      // 不擋住後續的 Firestore 欄位清理
      console.error('刪除 Storage 檔案失敗', err);
    }).then(function(){
      var updatedParts = p.parts.map(function(x){
        return x.partId === partId
          ? Object.assign({}, x, { sheetMusicUrl: null, sheetMusicUploadedBy: null })
          : x;
      });
      return updatePiece(db, targetPieceId, p.title, p.composer, updatedParts);
    }).then(function(){
      if (editingPieceId === targetPieceId) renderPieceViewParts(p.parts.map(function(x){
        return x.partId === partId ? Object.assign({}, x, { sheetMusicUrl: null, sheetMusicUploadedBy: null }) : x;
      }));
      showToast('樂譜已移除', 'success');
    }).catch(function(err){
      showToast('移除失敗：' + err.code, 'error');
    }).finally(function(){
      delete sheetMusicUploadInFlight[partId];
    });
  }

  document.getElementById('pieceViewParts').addEventListener('click', function(e){
    var uploadBtn = e.target.closest('[data-sheet-upload]');
    if (uploadBtn){
      pendingSheetPartId = uploadBtn.getAttribute('data-sheet-upload');
      sheetMusicFileInput.click();
      return;
    }
    var removeBtn = e.target.closest('[data-sheet-remove]');
    if (removeBtn){
      var ok = confirm('確定要移除這個分部的樂譜檔案嗎？此動作無法復原。');
      if (ok) removeSheetMusic(removeBtn.getAttribute('data-sheet-remove'));
    }
  });

  sheetMusicFileInput.addEventListener('change', function(e){
    var file = e.target.files[0];
    e.target.value = ''; // 清空，允許連續選同一個檔案也能再次觸發 change
    if (file && pendingSheetPartId) uploadSheetMusic(pendingSheetPartId, file);
    pendingSheetPartId = null;
  });

```

- [ ] **Step 5: 編輯模式刪除分部欄位、刪除整首曲目時，一併清掉對應的 Storage 檔案**

Spec 明確要求：移除某個分部欄位、或整首曲目被刪除時，要一併清掉 Storage 檔案，避免留下孤兒檔案（見設計文件「刪除清理」一節）。這兩個操作既有的 handler 都要補上這段邏輯。

Read `repertoire-admin.html` 找到 `document.getElementById('partGroups').addEventListener('click', ...)`（先前研究記錄在第 548-554 行，編輯表單裡「移除分部欄位」的既有邏輯），改成：

```js
  document.getElementById('partGroups').addEventListener('click', function(e){
    var btn = e.target.closest('[data-remove-part]');
    if (!btn) return;
    var partId = btn.getAttribute('data-remove-part');
    var removedPart = draftParts.filter(function(p){ return p.partId === partId; })[0];
    draftParts = draftParts.filter(function(p){ return p.partId !== partId; });
    renderPartGroups();
    // 分部欄位本身刪掉了，底下掛的樂譜檔案也一併清掉，不留孤兒檔案；不擋 UI、也不等它
    // 完成——刪除 Storage 檔案失敗不影響「這個分部欄位已經從草稿移除」這件事，使用者按
    // 「儲存變更」後 Firestore 的 parts 陣列本來就不會再有這個 partId
    if (removedPart && removedPart.sheetMusicUrl){
      deletePartSheetMusic(storage, removedPart.sheetMusicUrl).catch(function(err){
        console.error('刪除分部樂譜檔案失敗', err);
      });
    }
  });
```

Read `repertoire-admin.html` 找到 `pieceDeleteBtn.addEventListener('click', ...)`（先前研究記錄在第 707-724 行），改成：

```js
  pieceDeleteBtn.addEventListener('click', function(){
    if (!editingPieceId) return;
    var p = piecesById[editingPieceId];
    var ok = confirm(
      '確定要刪除「' + (p ? p.title : '這首曲目') + '」嗎？\n' +
      '已經在某場音樂會引用過這首曲子的資料不會被清掉，只是往後那場音樂會的曲目管理會顯示「（曲目已刪除）」。\n' +
      '此動作無法復原。'
    );
    if (!ok) return;
    pieceDeleteBtn.disabled = true;
    var sheetMusicUrls = ((p && p.parts) || []).map(function(part){ return part.sheetMusicUrl; }).filter(function(url){ return url; });
    deletePiece(db, editingPieceId).then(function(){
      pieceDeleteBtn.disabled = false;
      closePieceSheet();
      // 曲目文件刪掉之後才清 Storage 檔案：如果曲目本身刪除失敗（例如權限問題），
      // 樂譜檔案不會被誤刪
      sheetMusicUrls.forEach(function(url){
        deletePartSheetMusic(storage, url).catch(function(err){
          console.error('刪除分部樂譜檔案失敗', err);
        });
      });
    }).catch(function(err){
      pieceDeleteBtn.disabled = false;
      showToast('刪除失敗：' + err.code, 'error');
    });
  });
```

（只在既有邏輯裡插入清理 Storage 檔案的部分，`confirm()` 文案、`deletePiece()` 呼叫時機都不變。）

- [ ] **Step 6: 新增隱藏的 `<input type="file">` markup**

Read `repertoire-admin.html` 找到 `</div>\n</div>\n\n<script type="module">` 這段收尾（先前研究記錄在第 358-361 行，`.app` 容器結束、`<script>` 開始之前），在 `<script type="module">` 之前插入：

```html
<input type="file" id="sheetMusicFileInput" accept="application/pdf" class="hidden">
```

- [ ] **Step 7: 語法檢查（提取內嵌 script 到暫存檔）**

```bash
node -e "
var fs = require('fs');
var html = fs.readFileSync('repertoire-admin.html', 'utf8');
var m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到 module script'); process.exit(1); }
fs.writeFileSync('/tmp/rp-admin-check.mjs', m[1]);
console.log('extracted', m[1].length, 'chars');
"
node --check /tmp/rp-admin-check.mjs
rm /tmp/rp-admin-check.mjs
```

Expected: `node --check` 沒有輸出。

- [ ] **Step 8: Commit**

```bash
git add repertoire-admin.html
git commit -m "$(cat <<'EOF'
repertoire-admin.html 接上樂譜上傳/檢視/更換/移除

唯讀摘要從「一個樂器一行」改成「一個分部一行」，每行加樂譜操作按鈕。
上傳前端驗證只收 PDF、10MB 上限，成功後樂觀更新畫面（不用等
subscribeRepertoire 的 onSnapshot 回來才刷新）。刪除分部欄位/整首曲目
時一併清掉對應的 Storage 檔案，避免孤兒檔案。這輪需要 storage.rules
先部署過才能實際測試（見 Task 1 的提醒）。
EOF
)"
```

**⚠️ 這個 Task 完成後，如果 storage.rules 還沒部署，先不要急著瀏覽器測試上傳——會收到 `storage/unauthorized`。確認使用者已經跑過 `firebase deploy --only storage --project briopwa-6b138` 再進行下一步驗證。**

---

### Task 4: `roles-admin.html` — 新增 `canViewAllSheetMusic` 個人權限旗標

**Files:**
- Modify: `roles-admin.html`

**Interfaces:**
- Consumes: 既有的 `PERMISSION_DEFS`/`draftPermissions`/`permissionsKey()` 機制（不用改邏輯，只加一個 key）。
- Produces: `permissions.canViewAllSheetMusic` 欄位可以在這個頁面被勾選/儲存，供 Task 6（`sheet-music.html`）讀取判斷可見性規則。

- [ ] **Step 1: `PERMISSION_DEFS` 新增一項**

Read `roles-admin.html` 找到 `PERMISSION_DEFS` 陣列（先前研究記錄在第 500-506 行），改成：

```js
  var PERMISSION_DEFS = [
    { key: 'canManageRoles', label: '可調整他人角色/權限' },
    { key: 'canDeleteAccounts', label: '可軟刪除現役帳號' },
    { key: 'canManageSheetMusic', label: '可管理樂譜資料夾' },
    { key: 'canViewAllSheetMusic', label: '可檢視全部分部樂譜' },
    { key: 'canManageEventTypes', label: '可管理活動類型' },
    { key: 'canManageFinance', label: '可管理財務記帳' }
  ];
```

（緊接在 `canManageSheetMusic` 後面插入一項，其餘不動。）

- [ ] **Step 2: 儲存 payload 的預設值物件補上新旗標**

Read `roles-admin.html` 找到 `saveMemberBtn` 點擊事件裡的 `payload` 組裝（先前研究記錄在第 853-862 行），把預設值物件：

```js
{ canManageRoles: false, canDeleteAccounts: false, canManageSheetMusic: false, canManageEventTypes: false, canManageFinance: false },
```

改成：

```js
{ canManageRoles: false, canDeleteAccounts: false, canManageSheetMusic: false, canViewAllSheetMusic: false, canManageEventTypes: false, canManageFinance: false },
```

（這個物件是「沒勾選的旗標要明確寫 false，不能讓 `Object.assign` 遺漏掉」的既有寫法，新旗標要比照加進去，不然沒打勾過的人這個欄位會是 `undefined` 而不是 `false`。）

- [ ] **Step 3: 語法檢查（提取內嵌 script 到暫存檔）**

```bash
node -e "
var fs = require('fs');
var html = fs.readFileSync('roles-admin.html', 'utf8');
var m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到 module script'); process.exit(1); }
fs.writeFileSync('/tmp/roles-admin-check.mjs', m[1]);
console.log('extracted', m[1].length, 'chars');
"
node --check /tmp/roles-admin-check.mjs
rm /tmp/roles-admin-check.mjs
```

Expected: 沒有輸出。

- [ ] **Step 4: Commit**

```bash
git add roles-admin.html
git commit -m "$(cat <<'EOF'
roles-admin.html 新增個人權限旗標 canViewAllSheetMusic

跟既有 canManageSheetMusic/canManageFinance 同一套模式，這個旗標只影響
「譜夾」頁面前端要不要把全部分部顯示出來，不是 Storage/Firestore 規則
層級的強制存取控制（沒有對應的規則改動）。
EOF
)"
```

---

### Task 5: `sheet-music.html` — 頁面骨架 + CSS + 資料層

**Files:**
- Create: `sheet-music.html`

**Interfaces:**
- Consumes: `requireApprovedMember()`（`auth-guard.js`，已存在）、`db`（`firebase-init.js`）。
- Produces:
  - DOM 骨架：appbar、bottom tabbar（含 `<a class="tab active" href="sheet-music.html">`）、`#myConcertsSlot`、`#otherPiecesSlot`。
  - `loadSheetMusicFolder(uid, profile)` → `Promise<{ myConcerts: Array<{concertId, title, pieces: Array<{pieceId, title, instrumentGroups}>}>, otherPieces: Array<{id, title, parts}> }>`，供 Task 6 的渲染邏輯呼叫。`instrumentGroups` 每項是 `{instrumentName, parts: Array<{partId, label, sheetMusicUrl}>, myPartId: string|null}`。

- [ ] **Step 1: 建立檔案骨架（head/CSS/appbar/tabbar，比照 `profile.html`/`index.html` 既有頁面樣板）**

Write `sheet-music.html`：

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>布利歐管樂團｜譜夾</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=Roboto+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="manifest" href="./manifest.json">
<meta name="theme-color" content="#F2EFE5">
<link rel="apple-touch-icon" href="assets/icons/icon-180.png">
<script src="./pwa-register.js" defer></script>
<style>
  :root{
    --ink:#20242F;
    --ink-soft:#4A4F5C;
    --paper:#F2EFE5;
    --paper-raised:#FBFAF4;
    --line:#DAD3BE;
    --brass:#B8863A;
    --brass-deep:#8F6A2C;
    --burgundy:#7A2331;
    --burgundy-deep:#5C1A26;
    --sage:#5F6E58;
    --sage-bg:#E7EBDF;
    --radius-lg:20px;
    --radius-md:14px;
    --radius-sm:9px;
    --shadow-card: 0 1px 2px rgba(32,36,47,.06), 0 8px 24px -12px rgba(32,36,47,.18);
  }

  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    background:
      radial-gradient(circle at 15% -10%, #EFE9D6 0%, transparent 45%),
      var(--paper);
    color:var(--ink);
    font-family:'Noto Sans TC','Noto Sans',sans-serif;
    -webkit-font-smoothing:antialiased;
    min-height:100vh;
    min-height:100dvh;
    display:flex;
    justify-content:center;
  }

  button, a{ -webkit-tap-highlight-color: transparent; font-family:inherit; }
  :focus-visible{ outline:2.5px solid var(--brass-deep); outline-offset:2px; border-radius:6px; }

  .app{
    width:100%;
    max-width:460px;
    min-height:100vh;
    min-height:100dvh;
    background:var(--paper);
    position:relative;
    display:flex;
    flex-direction:column;
    padding-top: env(safe-area-inset-top);
  }

  .hidden{ display:none !important; }

  @keyframes skel-pulse{ 0%,100%{ opacity:.55; } 50%{ opacity:1; } }
  .skel{ background:var(--line); animation:skel-pulse 1.4s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce){ .skel{ animation:none; opacity:.75; } }

  .appbar{ display:flex; align-items:center; gap:12px; padding:18px 20px 14px; }
  .mark{ width:38px; height:38px; flex:none; object-fit:cover; border-radius:50%; }
  .brandtext{ display:flex; flex-direction:column; line-height:1.1; }
  .brandtext .name{ font-family:'Noto Serif TC',serif; font-weight:900; font-size:19px; letter-spacing:.02em; }
  .brandtext .sub{ font-family:'Roboto Mono',monospace; font-size:10.5px; letter-spacing:.14em; color:var(--ink-soft); margin-top:3px; text-transform:uppercase; }

  .staff{
    height:16px; margin:0 20px 6px;
    background-image: repeating-linear-gradient(var(--line), var(--line) 1px, transparent 1px, transparent 4px);
    opacity:.9;
  }

  .section-label{ display:flex; align-items:baseline; gap:8px; margin:20px 20px 4px; }
  .section-label .tw{ font-family:'Noto Serif TC',serif; font-weight:700; font-size:15.5px; }
  .section-label .en{ font-family:'Roboto Mono',monospace; font-size:10px; letter-spacing:.12em; color:var(--ink-soft); text-transform:uppercase; }
  .empty{ margin:0 20px 20px; padding:24px; text-align:center; font-size:13px; color:var(--ink-soft); background:var(--paper-raised); border:1px solid var(--line); border-radius:var(--radius-lg); }

  .concert-card{
    margin:0 20px 16px;
    background:var(--paper-raised);
    border:1px solid var(--line);
    border-radius:var(--radius-lg);
    box-shadow:var(--shadow-card);
    padding:14px 16px;
  }
  .concert-title{ font-family:'Noto Serif TC',serif; font-weight:700; font-size:14.5px; }
  .piece-block{ padding:11px 0; border-top:1px solid var(--line); }
  .piece-block:first-of-type{ border-top:none; margin-top:8px; }
  .piece-name{ font-size:13px; font-weight:500; }
  .instrument-block{ margin-top:8px; }
  .instrument-block-label{ font-size:11px; color:var(--ink-soft); margin-bottom:4px; }
  .chip-row{ display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; }
  .chip-row::-webkit-scrollbar{ display:none; }
  .part-chip{
    flex:none; border:1px solid var(--line); background:var(--paper); color:var(--ink-soft);
    border-radius:999px; padding:5px 12px; font-size:11px; font-weight:600; cursor:pointer;
    font-family:'Noto Sans TC',sans-serif; white-space:nowrap;
  }
  .part-chip.active{ background:var(--brass); border-color:var(--brass); color:var(--ink); }
  .view-link{
    display:inline-flex; align-items:center; gap:5px; margin-top:9px;
    font-size:12px; font-weight:700; color:var(--brass-deep); text-decoration:none; cursor:pointer;
  }
  .view-link svg{ flex:none; }
  .view-link.disabled{ color:var(--ink-soft); cursor:default; }

  .list{
    margin:0 20px 24px;
    background:var(--paper-raised);
    border:1px solid var(--line);
    border-radius:var(--radius-lg);
    box-shadow:var(--shadow-card);
    overflow:hidden;
  }
  .other-piece-row{
    display:flex; justify-content:space-between; align-items:center; gap:10px;
    padding:12px 16px; border-bottom:1px solid var(--line);
  }
  .other-piece-row:last-child{ border-bottom:none; }
  .other-piece-name{ font-size:12.5px; font-weight:500; }
  .other-piece-count{ font-size:10.5px; color:var(--ink-soft); flex:none; }

  .tabbar{
    position:sticky; bottom:0; margin-top:auto;
    background:var(--paper-raised);
    border-top:1px solid var(--line);
    display:flex; justify-content:space-around; align-items:center;
    padding:8px 6px calc(8px + env(safe-area-inset-bottom));
  }
  .tab{
    display:flex; flex-direction:column; align-items:center; gap:3px;
    background:none; border:none; cursor:pointer;
    color:var(--ink-soft); text-decoration:none;
    font-family:'Noto Sans TC',sans-serif; font-size:10.5px;
    padding:4px 10px;
  }
  .tab.active{ color:var(--burgundy); }
  .tab .ico{ width:20px; height:20px; }
  .tab.tab-soon{ opacity:.42; }
</style>
</head>
<body>
<div class="app" id="appRoot">

  <div class="appbar">
    <img class="mark" src="assets/BrioLogo.jpg" alt="布利歐管樂團 Logo">
    <div class="brandtext">
      <div class="name">布利歐管樂團</div>
      <div class="sub">Brio Wind Band</div>
    </div>
  </div>

  <div class="staff"></div>

  <div id="folderContent">
    <div class="section-label"><span class="tw">我的音樂會</span><span class="en">By Concert</span></div>
    <div id="myConcertsSlot"></div>
    <div class="section-label"><span class="tw">其他曲目</span><span class="en">Not In Any Concert</span></div>
    <div id="otherPiecesSlot"></div>
  </div>

  <!-- Bottom tab bar -->
  <div class="tabbar">
    <a class="tab" href="index.html">
      <svg class="ico" viewBox="0 0 24 24" fill="none"><path d="M4 11 12 4l8 7" stroke="#4A4F5C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9h12v-9" stroke="#4A4F5C" stroke-width="1.6" stroke-linejoin="round"/></svg>
      首頁
    </a>
    <button class="tab tab-soon">
      <svg class="ico" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="16" rx="2" stroke="#4A4F5C" stroke-width="1.6"/><path d="M4 10h16M9 3v4M15 3v4" stroke="#4A4F5C" stroke-width="1.6" stroke-linecap="round"/></svg>
      行事曆
    </button>
    <a class="tab active" href="sheet-music.html">
      <svg class="ico" viewBox="0 0 24 24" fill="none"><path d="M6 4h9l3 3v13H6z" stroke="#7A2331" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 14h6M9 17h4" stroke="#7A2331" stroke-width="1.6" stroke-linecap="round"/></svg>
      譜夾
    </a>
    <a class="tab" href="profile.html">
      <span class="avatar" style="width:20px;height:20px;border-radius:50%;background:var(--burgundy);"></span>
      我的
    </a>
  </div>

</div>

<script type="module">
  import { requireApprovedMember } from './auth-guard.js';
  import { db } from './firebase-init.js';
  import {
    collection, collectionGroup, query, doc, getDoc, getDocs
  } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
</script>
</body>
</html>
```

- [ ] **Step 2: 語法檢查（提取內嵌 script 到暫存檔）**

```bash
node -e "
var fs = require('fs');
var html = fs.readFileSync('sheet-music.html', 'utf8');
var m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到 module script'); process.exit(1); }
fs.writeFileSync('/tmp/sheet-music-check.mjs', m[1]);
console.log('extracted', m[1].length, 'chars');
"
node --check /tmp/sheet-music-check.mjs
rm /tmp/sheet-music-check.mjs
```

Expected: 沒有輸出。

- [ ] **Step 3: 分部依樂器分組小函式 + 可見性判斷小函式 + `loadSheetMusicFolder()`**

Read `sheet-music.html`，在 `escapeHtml()` 函式之後新增：

```js
  // 分部依樂器分組（跟 repertoire-admin.html 的 groupPartsByInstrument() 同一套邏輯，
  // 這個專案不共用邏輯檔，各頁面各自維護一份）
  function groupPartsByInstrument(parts){
    var byInstrument = {};
    var order = [];
    parts.forEach(function(part){
      if (!byInstrument[part.instrumentName]){
        byInstrument[part.instrumentName] = [];
        order.push(part.instrumentName);
      }
      byInstrument[part.instrumentName].push(part);
    });
    return { byInstrument: byInstrument, order: order };
  }

  // 可見性規則（設計文件「權限」一節）：以樂器為單位，不細到 partId。
  // assignedInstrumentNames 是這個人在「這場音樂會、這首曲子」實際被指派過的樂器集合，
  // 呼叫端只查目前這張卡片所屬的那場音樂會，不跨音樂會合併判斷
  function canViewInstrument(profile, instrumentName, assignedInstrumentNames){
    if (profile.role === 'admin' || profile.role === 'owner' || profile.role === 'conductor') return true;
    if (profile.permissions && profile.permissions.canViewAllSheetMusic === true) return true;
    if ((profile.sectionLeaderFor || []).indexOf(instrumentName) !== -1) return true;
    return !!assignedInstrumentNames[instrumentName];
  }

  // 依「音樂會分組」+「其他曲目」兩區組出「譜夾」要顯示的完整資料。第一區只列出
  // 自己有參與的音樂會（concertRosters 有自己），第二區是 repertoire 裡有、但沒有任何
  // concerts/*/pieces 引用過的曲目（用 collectionGroup 查全部音樂會的 pieces，不限自己
  // 有沒有參與，因為第二區的定義是「完全沒被任何音樂會用到」）
  async function loadSheetMusicFolder(uid, profile){
    var repertoireSnap = await getDocs(collection(db, 'repertoire'));
    var repertoireById = {};
    var repertoireList = [];
    repertoireSnap.forEach(function(d){
      var data = Object.assign({ id: d.id }, d.data());
      repertoireById[d.id] = data;
      repertoireList.push(data);
    });

    var allPiecesSnap = await getDocs(collectionGroup(db, 'pieces'));
    var usedPieceIds = {};
    allPiecesSnap.forEach(function(d){ usedPieceIds[d.id] = true; });

    var rosterSnap = await getDocs(collection(db, 'concertRosters'));
    var myEntries = [];
    rosterSnap.forEach(function(docSnap){
      var members = docSnap.data().members || [];
      var mine = members.filter(function(m){ return m.uid === uid; })[0];
      if (mine) myEntries.push({ concertId: docSnap.id });
    });

    var myConcerts = await Promise.all(myEntries.map(async function(entry){
      var concertSnap = await getDoc(doc(db, 'concerts', entry.concertId));
      if (!concertSnap.exists()) return null;

      var piecesSnap = await getDocs(collection(db, 'concerts', entry.concertId, 'pieces'));
      var pieceRefs = piecesSnap.docs.map(function(d){ return { id: d.id, order: d.data().order || 0 }; });
      pieceRefs.sort(function(a, b){ return a.order - b.order; });

      var pieces = await Promise.all(pieceRefs.map(async function(ref){
        var piece = repertoireById[ref.id];
        if (!piece) return null; // （曲目已刪除）不列進譜夾，跟其他讀取端不同——這裡沒有樂譜可看，列出來沒有意義

        var sectionsSnap = await getDocs(collection(db, 'concerts', entry.concertId, 'pieces', ref.id, 'sections'));
        var assignedInstrumentNames = {};
        var myPartIdByInstrument = {};
        sectionsSnap.forEach(function(secDoc){
          var instrumentName = secDoc.id;
          (secDoc.data().parts || []).forEach(function(part){
            if ((part.members || []).indexOf(uid) !== -1){
              assignedInstrumentNames[instrumentName] = true;
              myPartIdByInstrument[instrumentName] = part.partId;
            }
          });
        });

        var grouped = groupPartsByInstrument(piece.parts || []);
        var instrumentGroups = grouped.order.filter(function(instrumentName){
          return canViewInstrument(profile, instrumentName, assignedInstrumentNames);
        }).map(function(instrumentName){
          return {
            instrumentName: instrumentName,
            parts: grouped.byInstrument[instrumentName],
            myPartId: myPartIdByInstrument[instrumentName] || null
          };
        });
        if (instrumentGroups.length === 0) return null; // 這個人在這首曲子完全看不到任何分部，不列出來

        return { pieceId: ref.id, title: piece.title, instrumentGroups: instrumentGroups };
      }));

      return { concertId: entry.concertId, title: concertSnap.data().title, pieces: pieces.filter(function(p){ return p; }) };
    }));

    var otherPieces = repertoireList
      .filter(function(p){ return !usedPieceIds[p.id]; })
      .sort(function(a, b){ return (a.title || '').localeCompare(b.title || '', 'zh-Hant'); });

    return {
      myConcerts: myConcerts.filter(function(c){ return c && c.pieces.length > 0; }),
      otherPieces: otherPieces
    };
  }
```

- [ ] **Step 4: 語法檢查（同 Step 2 的抽取方式）**

Expected: 沒有輸出。

- [ ] **Step 5: 呼叫 `requireApprovedMember()` + `loadSheetMusicFolder()`，先確認資料抓得到（畫面渲染留到 Task 6）**

在檔案最後新增：

```js
  requireApprovedMember().then(function(result){
    if (!result) return;
    loadSheetMusicFolder(result.uid, result.profile).then(function(data){
      console.log('sheet music folder loaded', data); // Task 6 會換成真正的渲染邏輯
    }).catch(function(err){
      console.error('譜夾資料載入失敗', err);
    });
  });
```

- [ ] **Step 6: 語法檢查（同 Step 2 的抽取方式）**

Expected: 沒有輸出。

- [ ] **Step 7: Commit**

```bash
git add sheet-music.html
git commit -m "$(cat <<'EOF'
新增 sheet-music.html 頁面骨架 + 資料層

requireApprovedMember() 守門，loadSheetMusicFolder() 依「參與的音樂會」
+「其他曲目」兩區組資料，可見性規則以樂器為單位（admin/owner/conductor/
canViewAllSheetMusic 全部可見；分部長對自己負責的樂器全部可見；一般
團員只看目前這場音樂會自己被指派過的樂器，同樂器底下的分部互相可見）。
這輪只是資料層，畫面還沒接上，用 console.log 確認抓到的資料結構正確。
EOF
)"
```

---

### Task 6: `sheet-music.html` — 渲染 + chip 互動

**Files:**
- Modify: `sheet-music.html`

**Interfaces:**
- Consumes: Task 5 的 `loadSheetMusicFolder()`、DOM 元素 `#myConcertsSlot`/`#otherPiecesSlot`。
- Produces: 完整可瀏覽的「譜夾」頁面，這是這個 Task 完成後可以端到端測試的階段。

- [ ] **Step 1: 渲染函式——第一區（依音樂會分組）+ 第二區（其他曲目）+ chip 互動**

Read `sheet-music.html`，把 Step 5 加的 `requireApprovedMember().then(...)` 區塊，連同它上面新增的渲染函式，改成：

```js
  // chip 選中狀態：key 是 "pieceId|instrumentName"，value 是目前選中的 partId。
  // 開啟頁面時用 myPartId（這場音樂會自己實際被指派到的分部）預設選中，
  // 沒有指派紀錄的人（分部長/admin 純檢視）fallback 選該樂器第一個分部
  var selectedPartByGroup = {};

  function groupKey(pieceId, instrumentName){ return pieceId + '|' + instrumentName; }

  function renderInstrumentGroup(pieceId, group){
    var key = groupKey(pieceId, group.instrumentName);
    if (!(key in selectedPartByGroup)){
      selectedPartByGroup[key] = group.myPartId || group.parts[0].partId;
    }
    var selectedPartId = selectedPartByGroup[key];
    var selectedPart = group.parts.filter(function(p){ return p.partId === selectedPartId; })[0] || group.parts[0];

    var chipsHtml = group.parts.length > 1
      ? '<div class="chip-row" data-chip-group="' + escapeHtml(key) + '">' +
          group.parts.map(function(p){
            return '<button type="button" class="part-chip' + (p.partId === selectedPartId ? ' active' : '') + '" data-part-chip="' + escapeHtml(p.partId) + '">' + escapeHtml(p.label) + '</button>';
          }).join('') +
        '</div>'
      : '';

    var linkHtml = selectedPart.sheetMusicUrl
      ? '<a class="view-link" href="' + escapeHtml(selectedPart.sheetMusicUrl) + '" target="_blank" rel="noopener">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 4h9l3 3v13H6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
          '檢視「' + escapeHtml(selectedPart.label) + '」樂譜' +
        '</a>'
      : '<span class="view-link disabled">（尚未上傳樂譜）</span>';

    return (
      '<div class="instrument-block">' +
        (group.parts.length > 1 ? '<div class="instrument-block-label">' + escapeHtml(group.instrumentName) + '</div>' : '') +
        chipsHtml +
        linkHtml +
      '</div>'
    );
  }

  function renderMyConcerts(myConcerts){
    var wrap = document.getElementById('myConcertsSlot');
    if (myConcerts.length === 0){
      wrap.innerHTML = '<div class="empty">目前沒有找到你有參與、且能看到樂譜的音樂會曲目</div>';
      return;
    }
    wrap.innerHTML = myConcerts.map(function(c){
      return (
        '<div class="concert-card">' +
          '<div class="concert-title">' + escapeHtml(c.title) + '</div>' +
          c.pieces.map(function(p){
            return (
              '<div class="piece-block">' +
                '<div class="piece-name">' + escapeHtml(p.title) + '</div>' +
                p.instrumentGroups.map(function(g){ return renderInstrumentGroup(p.pieceId, g); }).join('') +
              '</div>'
            );
          }).join('') +
        '</div>'
      );
    }).join('');
  }

  function renderOtherPieces(otherPieces){
    var wrap = document.getElementById('otherPiecesSlot');
    if (otherPieces.length === 0){
      wrap.innerHTML = '<div class="empty">沒有其他曲目</div>';
      return;
    }
    wrap.innerHTML = '<div class="list">' + otherPieces.map(function(p){
      return (
        '<div class="other-piece-row">' +
          '<span class="other-piece-name">' + escapeHtml(p.title) + '</span>' +
          '<span class="other-piece-count">' + (p.parts || []).length + ' 個分部</span>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  // chip 點擊事件委派在整個內容容器上，因為第一區的音樂會/曲目/分部組合是動態算出來的，
  // 每次點擊只重繪被點到的那個分部群組，不重繪整頁（避免捲動位置跳動）
  document.getElementById('folderContent').addEventListener('click', function(e){
    var chip = e.target.closest('[data-part-chip]');
    if (!chip) return;
    var chipRow = chip.closest('[data-chip-group]');
    var key = chipRow.getAttribute('data-chip-group');
    selectedPartByGroup[key] = chip.getAttribute('data-part-chip');
    var pieceId = key.split('|')[0];
    var instrumentName = key.slice(pieceId.length + 1);
    var group = lastLoadedGroups[key];
    if (!group) return;
    var block = chipRow.parentElement;
    block.outerHTML = renderInstrumentGroup(pieceId, group);
  });

  var lastLoadedGroups = {}; // key（pieceId|instrumentName）-> group 物件，chip 重繪時要用

  function indexGroups(myConcerts){
    myConcerts.forEach(function(c){
      c.pieces.forEach(function(p){
        p.instrumentGroups.forEach(function(g){
          lastLoadedGroups[groupKey(p.pieceId, g.instrumentName)] = g;
        });
      });
    });
  }

  requireApprovedMember().then(function(result){
    if (!result) return;
    document.getElementById('myConcertsSlot').innerHTML = '<div class="empty">載入中…</div>';
    document.getElementById('otherPiecesSlot').innerHTML = '';
    loadSheetMusicFolder(result.uid, result.profile).then(function(data){
      indexGroups(data.myConcerts);
      renderMyConcerts(data.myConcerts);
      renderOtherPieces(data.otherPieces);
    }).catch(function(err){
      console.error('譜夾資料載入失敗', err);
      document.getElementById('myConcertsSlot').innerHTML = '<div class="empty">讀取失敗，請重新整理再試一次</div>';
    });
  });

  document.querySelectorAll('.tab-soon').forEach(function(btn){
    btn.setAttribute('disabled', 'true');
  });
```

（`chip.closest('[data-chip-group]')` 拿到的是 chip 列本身，`.parentElement` 才是外層 `.instrument-block`，用 `outerHTML` 整塊換掉，確保換掉後的 DOM 還是同一個 `.instrument-block` 結構，事件委派不需要重新綁定。）

- [ ] **Step 2: 語法檢查（同 Task 5 的抽取方式）**

```bash
node -e "
var fs = require('fs');
var html = fs.readFileSync('sheet-music.html', 'utf8');
var m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到 module script'); process.exit(1); }
fs.writeFileSync('/tmp/sheet-music-check.mjs', m[1]);
console.log('extracted', m[1].length, 'chars');
"
node --check /tmp/sheet-music-check.mjs
rm /tmp/sheet-music-check.mjs
```

Expected: 沒有輸出。

- [ ] **Step 3: Commit**

```bash
git add sheet-music.html
git commit -m "$(cat <<'EOF'
sheet-music.html 接上完整渲染 + chip 分部切換

第一區依音樂會分組列出曲目跟可見分部，chip 預設選中自己在這場音樂會
實際被指派到的分部，切換 chip 只重繪被點到的那個分部區塊。第二區列出
沒被任何音樂會用到的其他曲目（扁平清單，不用 chip）。
EOF
)"
```

---

### Task 7: `index.html` + `profile.html` — 底部導覽列「譜夾」改真正連結

**Files:**
- Modify: `index.html`
- Modify: `profile.html`

**Interfaces:**
- Consumes: Task 5-6 完成的 `sheet-music.html`。
- Produces: 兩個頁面的底部導覽列都能點「譜夾」進到新頁面，不再顯示「即將推出」提示。

- [ ] **Step 1: `index.html` 底部導覽列「譜夾」按鈕改連結**

Read `index.html` 找到底部導覽列的「譜夾」`.tab-soon` 按鈕（先前研究記錄在第 1014-1017 行），把：

```html
    <button class="tab tab-soon">
      <svg class="ico" viewBox="0 0 24 24" fill="none"><path d="M6 4h9l3 3v13H6z" stroke="#4A4F5C" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 14h6M9 17h4" stroke="#4A4F5C" stroke-width="1.6" stroke-linecap="round"/></svg>
      譜夾
    </button>
```

改成：

```html
    <a class="tab" href="sheet-music.html">
      <svg class="ico" viewBox="0 0 24 24" fill="none"><path d="M6 4h9l3 3v13H6z" stroke="#4A4F5C" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 14h6M9 17h4" stroke="#4A4F5C" stroke-width="1.6" stroke-linecap="round"/></svg>
      譜夾
    </a>
```

（只換了外層標籤跟 class，圖示 SVG 完全不動。）

- [ ] **Step 2: `profile.html` 底部導覽列「譜夾」按鈕改連結**

Read `profile.html` 找到底部導覽列的「譜夾」`.tab-soon` 按鈕（先前研究記錄在第 507-510 行），比照 Step 1 同樣的改法（`<button class="tab tab-soon">...</button>` 改成 `<a class="tab" href="sheet-music.html">...</a>`，SVG 不動）。

- [ ] **Step 3: 語法檢查兩個檔案（提取內嵌 script 到暫存檔）**

```bash
node -e "
var fs = require('fs');
['index.html', 'profile.html'].forEach(function(file){
  var html = fs.readFileSync(file, 'utf8');
  var m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
  if (!m) { console.error(file + ': 找不到 module script'); process.exit(1); }
  fs.writeFileSync('/tmp/' + file + '.mjs', m[1]);
  console.log(file, 'extracted', m[1].length, 'chars');
});
"
node --check "/tmp/index.html.mjs"
node --check "/tmp/profile.html.mjs"
rm "/tmp/index.html.mjs" "/tmp/profile.html.mjs"
```

Expected: 沒有輸出（這個 Task 只動了 HTML markup，語法檢查主要是確認沒有不小心破壞 `<script>` 區塊本身）。

- [ ] **Step 4: Commit**

```bash
git add index.html profile.html
git commit -m "$(cat <<'EOF'
index.html/profile.html 底部導覽列「譜夾」改連結 sheet-music.html

原本反灰的 .tab-soon 佔位按鈕（點擊只跳「即將推出」）改成真正連結，
樂譜管理功能上線後這個入口正式啟用。
EOF
)"
```

---

### Task 8: 版本號 + Service Worker 快取版本

**Files:**
- Modify: `version.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: 無。
- Produces: 無（純版本標記，讓 PWA 使用者端在下次開啟時抓到最新檔案）。

- [ ] **Step 1: `version.js` 版號跳到 `0.16.0`（新增功能，跳 minor）**

Read `version.js`，把 `export var APP_VERSION = '0.15.0';` 改成 `export var APP_VERSION = '0.16.0';`。

- [ ] **Step 2: `sw.js` 的 `CACHE_VERSION` 跳一版，`CORE_ASSETS` 加入 `sheet-music.html`**

Read `sw.js`，把 `const CACHE_VERSION = 'brio-v22';` 改成 `const CACHE_VERSION = 'brio-v23';`，並在 `CORE_ASSETS` 陣列裡 `'./profile.html'` 那一行之後加入：

```js
  './sheet-music.html',
```

- [ ] **Step 3: 語法檢查**

```bash
node --check version.js
node --check sw.js
```

Expected: 兩個指令都沒有輸出。

- [ ] **Step 4: Commit**

```bash
git add version.js sw.js
git commit -m "$(cat <<'EOF'
版號跳到 0.16.0，sw.js CACHE_VERSION 跳到 brio-v23（新增樂譜管理功能）

CORE_ASSETS 加入 sheet-music.html，讓這個新頁面也被 PWA 預先快取。
EOF
)"
```

---

### Task 9: 部署 Storage 規則 + 端到端瀏覽器驗證

**Files:**
- 無程式碼修改，純驗證。

**Interfaces:**
- Consumes: Task 1-8 的全部成果。
- Produces: 確認樂譜管理功能在真實 Firestore/Storage 環境下端到端可用的驗證紀錄。

- [ ] **Step 1: 提醒使用者部署 Storage 規則（如果 Task 1 之後還沒部署過）**

明確告知使用者：接下來的驗證步驟需要 `storage.rules` 先部署到正式環境，請使用者自己在終端機執行：

```bash
firebase deploy --only storage --project briopwa-6b138
```

等使用者確認部署完成後才繼續下一步。

- [ ] **Step 2: 開啟預覽伺服器**

用 `preview_start` 開啟 `brio-pwa`（`.claude/launch.json` 已設定好），導覽到 `repertoire-admin.html`，用一個有 `canManageSheetMusic` 權限（或 admin/owner 角色）的帳號登入。

- [ ] **Step 3: 驗證後台上傳/檢視/更換/移除**

1. 點開任一首已經有分部欄位的曲目，確認唯讀摘要變成「一個分部一行」，每行有對應的樂譜操作按鈕
2. 點「上傳樂譜」，選一個真正的 PDF 檔案（10MB 以內），確認上傳後畫面自動變成「檢視／更換／移除」三顆按鈕，不用重新整理頁面
3. 點「檢視」，確認開新分頁能正常顯示/下載這個 PDF
4. 點「更換」，選另一個 PDF，確認畫面上的樂譜連結有換成新檔案（可以用 `read_network_requests` 或直接點檢視確認內容不同）
5. 點「移除」，`confirm()` 對話框跳出後確認，畫面變回「上傳樂譜」按鈕
6. 選一個超過 10MB 或不是 PDF 的檔案，確認出現對應的錯誤 toast、不會真的送出上傳

- [ ] **Step 4: 驗證 `roles-admin.html` 新權限旗標**

切到 `roles-admin.html`，點開任一團員，確認權限清單裡看得到「可檢視全部分部樂譜」選項，勾選後儲存，確認 Firestore 裡該團員的 `permissions.canViewAllSheetMusic` 變成 `true`。

- [ ] **Step 5: 驗證「譜夾」頁面——一般團員視角**

用一個**已核准、且在至少一場音樂會的 `concertRosters` 名單內、有實際分部指派紀錄**的一般團員帳號登入，導覽到 `index.html`，點底部導覽列「譜夾」，確認：

1. 正常進入 `sheet-music.html`，不再是「即將推出」提示
2. 「我的音樂會」區塊列出這場音樂會，底下的曲目卡片只顯示這個人實際被指派過（或同樂器）的分部
3. 有樂譜檔案的分部顯示「檢視「XX」樂譜」連結，點了能開新分頁看到 PDF；沒有檔案的分部顯示「（尚未上傳樂譜）」
4. 如果被指派到的樂器同時有其他分部（例如長笛 1st/2nd 都有），確認 chip 列出現，預設選中的是自己實際被指派的那個分部，點另一個 chip 能切換
5. 「其他曲目」區塊列出沒被任何音樂會用到的曲目，是扁平清單、不需要 chip

- [ ] **Step 6: 驗證可見性規則的邊界情況**

1. 用一個完全沒有任何音樂會參與紀錄的帳號登入，確認「我的音樂會」顯示空狀態文字，不會報錯
2. 用剛剛在 Step 4 打勾 `canViewAllSheetMusic` 的帳號登入，確認這個人在自己有參與的音樂會裡，所有曲目的所有分部都看得到（不受限於自己實際的分部指派）
3. 用一個 `sectionLeaderFor` 有設定值的分部長帳號登入，確認自己負責的樂器底下全部分部都看得到，即使自己在某首曲子沒有被實際指派

- [ ] **Step 7: `read_console_messages` 確認整個過程沒有跳出未預期的錯誤**

如果發現任何 `storage/unauthorized` 或 `permission-denied`，先確認 Task 1 的 `storage.rules` 是否真的部署成功，而不是直接改規則邏輯。

- [ ] **Step 8: 跟使用者回報驗證結果**

如果所有步驟都通過，明確告知使用者這輪功能已經可以在正式環境使用；如果有任何步驟沒通過，記錄下具體是哪一步、什麼錯誤訊息，回到對應的 Task 修正。
