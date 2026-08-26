# 音樂會樂器身分接上簽到／出缺席統計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `concertRosters.members[].instrument`（字串）改成 `instruments`（陣列，支援同人多樂器），並讓簽到統計／出缺席回報／聲部編制/座位圖依樂器分組時，優先用音樂會參與名單的樂器身分，查無資料才退回個人資料樂器。

**Architecture:** 純前端（無後端/雲端函式變動）。逐檔案修改，每個檔案改完即可獨立驗證。所有「依樂器分組」的判斷都遵循同一個 fallback 順序：音樂會參與名單（`instruments` 非空）優先 → 個人資料 `users.instruments` 其次。

**Tech Stack:** Vanilla JS + Firebase (Firestore modular SDK)，無建置工具、無測試框架。

**Spec:** `docs/superpowers/specs/2026-08-26-concert-instrument-stats-design.md`

## Global Constraints

- `concertRosters` 目前只有測試資料，不寫遷移腳本，直接改欄位形狀
- 套用範本/新加入名單成員的預設樂器**只帶入第一筆**（不整份複製個人資料樂器清單）
- 沒有掛 `concertId` 的活動，分組行為完全不變（現狀）
- 座位圖同人多樂器造成的視覺重疊不處理（維持現狀的既有簡化）
- **本專案沒有自動化測試框架**（無 `package.json`、無 test runner）。每個任務的驗證方式：(1) `node --check` 驗證抽出的 inline `<script type="module">` 語法、(2) 手動瀏覽器驗證腳本（需要真人登入對應身分帳號執行，見各任務「Step 3」）
- `firestore.rules` 不需要改動

---

### Task 1: `event-admin.html` — 參與名單資料模型 + 編輯 UI + 範本套用 + 分部指派篩選 + 分組摘要

**Files:**
- Modify: `event-admin.html`

**Interfaces:**
- Produces：`concertRosterDraftMap` 型別從 `{uid: string}` 改成 `{uid: string[]}`；`concertRosters/{concertId}.members[]` 文件欄位從 `instrument` 改成 `instruments: string[]`
- 下游 Task 2/3/4/5 都讀取這個新的 `instruments` 陣列欄位

- [ ] **Step 1: 依下列 diff 修改 `event-admin.html`**

CSS（加在既有 `.concert-roster-instrument{...}` 規則後面）：

```css
.concert-roster-tags{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; width:100%; margin-top:6px; }
.concert-roster-tag{
  display:inline-flex; align-items:center; gap:4px; background:var(--sage-bg); color:var(--sage);
  border-radius:999px; padding:3px 4px 3px 10px; font-size:11px; font-weight:600;
}
.concert-roster-tag-remove{
  flex:none; width:16px; height:16px; border-radius:50%; border:none; background:none;
  color:inherit; cursor:pointer; font-size:12px; line-height:1; padding:0;
}
.concert-roster-add-instrument{
  flex:none; border:1px solid var(--line); background:var(--paper);
  border-radius:6px; padding:3px 6px; font-size:11px; color:var(--ink-soft);
}
```

`groupRosterMembersByInstrument()`——改前：

```js
function groupRosterMembersByInstrument(members){
  var byInstrument = {};
  members.forEach(function(m){
    var key = m.instrument || '（未設定樂器）';
    if (!byInstrument[key]) byInstrument[key] = [];
    byInstrument[key].push(m);
  });
```

改後（其餘 order 計算不變）：

```js
function groupRosterMembersByInstrument(members){
  var byInstrument = {};
  members.forEach(function(m){
    var instruments = (m.instruments && m.instruments.length) ? m.instruments : ['（未設定樂器）'];
    instruments.forEach(function(key){
      if (!byInstrument[key]) byInstrument[key] = [];
      byInstrument[key].push(m);
    });
  });
```

`reRenderCurrentAssignment()` 跟 `openAssignmentPanel()` 各自的篩選改前：

```js
var eligibleMembers = members.filter(function(m){ return m.instrument === openInstrumentName; });
```
```js
var eligibleMembers = members.filter(function(m){ return m.instrument === instrumentName; });
```

改後（兩處分別對應各自的變數名）：

```js
var eligibleMembers = members.filter(function(m){ return (m.instruments || []).indexOf(openInstrumentName) !== -1; });
```
```js
var eligibleMembers = members.filter(function(m){ return (m.instruments || []).indexOf(instrumentName) !== -1; });
```

`concertRosterDraftMap` 宣告改前：

```js
var concertRosterDraftMap = {}; // {uid: instrumentName}，編輯中的草稿
```

改後：

```js
var concertRosterDraftMap = {}; // {uid: instrumentName[]}，編輯中的草稿，第一筆是主要樂器
```

`renderConcertRosterChecklist()` 整個函式改前：

```js
function renderConcertRosterChecklist(){
  var checklist = document.getElementById('concertRosterChecklist');
  checklist.innerHTML = (approvedMembers || []).map(function(m){
    var on = concertRosterDraftMap.hasOwnProperty(m.uid);
    var instrument = on ? concertRosterDraftMap[m.uid] : '';
    var optionsHtml = instrumentsList.map(function(inst){
      return '<option value="' + escapeHtml(inst.name) + '"' + (inst.name === instrument ? ' selected' : '') + '>' + escapeHtml(inst.name) + '</option>';
    }).join('');
    if (instrument && !instrumentsList.some(function(inst){ return inst.name === instrument; })){
      optionsHtml += '<option value="' + escapeHtml(instrument) + '" selected>' + escapeHtml(instrument) + '</option>';
    }
    return (
      '<div class="check-row">' +
        '<button type="button" class="checkbox' + (on ? ' on' : '') + '" data-concert-roster-toggle="' + m.uid + '">' + (on ? '✓' : '') + '</button>' +
        '<span class="assign-name">' + escapeHtml(m.name) + '（' + escapeHtml(m.account) + '）</span>' +
        (on ? '<select class="concert-roster-instrument" data-concert-roster-instrument="' + m.uid + '">' + optionsHtml + '</select>' : '') +
      '</div>'
    );
  }).join('');
}
```

改後：

```js
function renderConcertRosterChecklist(){
  var checklist = document.getElementById('concertRosterChecklist');
  checklist.innerHTML = (approvedMembers || []).map(function(m){
    var on = concertRosterDraftMap.hasOwnProperty(m.uid);
    var selected = on ? concertRosterDraftMap[m.uid] : [];
    var primary = selected[0] || '';

    var primaryOptionsHtml = instrumentsList.map(function(inst){
      return '<option value="' + escapeHtml(inst.name) + '"' + (inst.name === primary ? ' selected' : '') + '>' + escapeHtml(inst.name) + '</option>';
    }).join('');
    if (primary && !instrumentsList.some(function(inst){ return inst.name === primary; })){
      primaryOptionsHtml += '<option value="' + escapeHtml(primary) + '" selected>' + escapeHtml(primary) + '</option>';
    }

    var tagsHtml = selected.slice(1).map(function(name){
      return (
        '<span class="concert-roster-tag">' + escapeHtml(name) +
          '<button type="button" class="concert-roster-tag-remove" data-concert-roster-remove="' + m.uid + '|' + escapeHtml(name) + '" aria-label="移除樂器">×</button>' +
        '</span>'
      );
    }).join('');

    var remainingInstruments = instrumentsList.filter(function(inst){ return selected.indexOf(inst.name) === -1; });
    var addSelectHtml = (on && remainingInstruments.length > 0)
      ? '<select class="concert-roster-add-instrument" data-concert-roster-add="' + m.uid + '">' +
          '<option value="">＋ 新增樂器</option>' +
          remainingInstruments.map(function(inst){ return '<option value="' + escapeHtml(inst.name) + '">' + escapeHtml(inst.name) + '</option>'; }).join('') +
        '</select>'
      : '';

    return (
      '<div class="check-row' + (on ? ' assign-row-wrap' : '') + '">' +
        '<button type="button" class="checkbox' + (on ? ' on' : '') + '" data-concert-roster-toggle="' + m.uid + '">' + (on ? '✓' : '') + '</button>' +
        '<span class="assign-name">' + escapeHtml(m.name) + '（' + escapeHtml(m.account) + '）</span>' +
        (on ? '<select class="concert-roster-instrument" data-concert-roster-instrument="' + m.uid + '">' + primaryOptionsHtml + '</select>' : '') +
        (on ? '<div class="concert-roster-tags">' + tagsHtml + addSelectHtml + '</div>' : '') +
      '</div>'
    );
  }).join('');
}
```

`concertRosterEditBtn` click handler改前：

```js
members.forEach(function(m){ concertRosterDraftMap[m.uid] = m.instrument; });
```

改後：

```js
members.forEach(function(m){ concertRosterDraftMap[m.uid] = (m.instruments || []).slice(); });
```

toggle click handler（`concertRosterChecklist` 的 `click` 監聽）裡的 else 分支改前：

```js
var member = (approvedMembers || []).filter(function(m){ return m.uid === uid; })[0];
concertRosterDraftMap[uid] = (member && member.instruments && member.instruments[0]) || (instrumentsList[0] ? instrumentsList[0].name : '');
```

改後：

```js
var member = (approvedMembers || []).filter(function(m){ return m.uid === uid; })[0];
concertRosterDraftMap[uid] = (member && member.instruments && member.instruments[0])
  ? [member.instruments[0]]
  : (instrumentsList[0] ? [instrumentsList[0].name] : []);
```

在同一個 toggle click handler（結尾的 `renderConcertRosterChecklist(); updateConcertRosterCounter();` 之後）新增一個處理移除 tag 的獨立監聽：

```js
document.getElementById('concertRosterChecklist').addEventListener('click', function(e){
  var removeBtn = e.target.closest('[data-concert-roster-remove]');
  if (!removeBtn) return;
  var parts = removeBtn.getAttribute('data-concert-roster-remove').split('|');
  concertRosterDraftMap[parts[0]] = concertRosterDraftMap[parts[0]].filter(function(name){ return name !== parts[1]; });
  renderConcertRosterChecklist();
});
```

`concertRosterChecklist` 的 `change` 監聽整個改前：

```js
document.getElementById('concertRosterChecklist').addEventListener('change', function(e){
  var select = e.target.closest('[data-concert-roster-instrument]');
  if (!select) return;
  concertRosterDraftMap[select.getAttribute('data-concert-roster-instrument')] = select.value;
});
```

改後：

```js
document.getElementById('concertRosterChecklist').addEventListener('change', function(e){
  var primarySelect = e.target.closest('[data-concert-roster-instrument]');
  if (primarySelect){
    var uid = primarySelect.getAttribute('data-concert-roster-instrument');
    var rest = concertRosterDraftMap[uid].slice(1).filter(function(name){ return name !== primarySelect.value; });
    concertRosterDraftMap[uid] = [primarySelect.value].concat(rest);
    renderConcertRosterChecklist();
    return;
  }
  var addSelect = e.target.closest('[data-concert-roster-add]');
  if (addSelect && addSelect.value){
    var addUid = addSelect.getAttribute('data-concert-roster-add');
    concertRosterDraftMap[addUid].push(addSelect.value);
    renderConcertRosterChecklist();
  }
});
```

`concertRosterSelectAllBtn` click handler裡改前：

```js
concertRosterDraftMap[m.uid] = (m.instruments && m.instruments[0]) || (instrumentsList[0] ? instrumentsList[0].name : '');
```

改後：

```js
concertRosterDraftMap[m.uid] = (m.instruments && m.instruments[0])
  ? [m.instruments[0]]
  : (instrumentsList[0] ? [instrumentsList[0].name] : []);
```

`concertRosterSaveBtn` click handler裡改前：

```js
var members = Object.keys(concertRosterDraftMap).map(function(uid){
  var m = (approvedMembers || []).filter(function(x){ return x.uid === uid; })[0];
  return { uid: uid, instrument: concertRosterDraftMap[uid], name: m ? m.name : uid, account: m ? m.account : '' };
});
```

改後：

```js
var members = Object.keys(concertRosterDraftMap).map(function(uid){
  var m = (approvedMembers || []).filter(function(x){ return x.uid === uid; })[0];
  return { uid: uid, instruments: concertRosterDraftMap[uid], name: m ? m.name : uid, account: m ? m.account : '' };
});
```

`applyTemplateToConcertRoster()` 整個函式改前：

```js
async function applyTemplateToConcertRoster(concertId, templateId){
  var template = rosterTemplatesById[templateId];
  if (!template) return;
  await ensureApprovedMembers();
  var existingSnap = await getDoc(doc(db, 'concertRosters', concertId));
  var isNew = !existingSnap.exists();
  var existingMembers = existingSnap.exists() ? (existingSnap.data().members || []) : [];
  var existingByUid = {};
  existingMembers.forEach(function(m){ existingByUid[m.uid] = m.instrument; });
  var newMembers = template.members.map(function(uid){
    var member = (approvedMembers || []).filter(function(m){ return m.uid === uid; })[0];
    var instrument = existingByUid.hasOwnProperty(uid)
      ? existingByUid[uid]
      : ((member && member.instruments && member.instruments[0]) || (instrumentsList[0] ? instrumentsList[0].name : ''));
    return { uid: uid, instrument: instrument, name: member ? member.name : uid, account: member ? member.account : '' };
  });
  var payload = {
    members: newMembers,
    sourceTemplateId: templateId,
    templateAppliedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (isNew) payload.createdBy = currentAdminUid;
  await setDoc(doc(db, 'concertRosters', concertId), payload, { merge: true });
  concertRosterMembersCache[concertId] = newMembers;
  concertRosterSourceTemplateCache[concertId] = templateId;
}
```

改後：

```js
async function applyTemplateToConcertRoster(concertId, templateId){
  var template = rosterTemplatesById[templateId];
  if (!template) return;
  await ensureApprovedMembers();
  var existingSnap = await getDoc(doc(db, 'concertRosters', concertId));
  var isNew = !existingSnap.exists();
  var existingMembers = existingSnap.exists() ? (existingSnap.data().members || []) : [];
  var existingByUid = {};
  existingMembers.forEach(function(m){ existingByUid[m.uid] = m.instruments || []; });
  var newMembers = template.members.map(function(uid){
    var member = (approvedMembers || []).filter(function(m){ return m.uid === uid; })[0];
    var instruments = existingByUid.hasOwnProperty(uid)
      ? existingByUid[uid]
      : ((member && member.instruments && member.instruments[0]) ? [member.instruments[0]] : (instrumentsList[0] ? [instrumentsList[0].name] : []));
    return { uid: uid, instruments: instruments, name: member ? member.name : uid, account: member ? member.account : '' };
  });
  var payload = {
    members: newMembers,
    sourceTemplateId: templateId,
    templateAppliedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (isNew) payload.createdBy = currentAdminUid;
  await setDoc(doc(db, 'concertRosters', concertId), payload, { merge: true });
  concertRosterMembersCache[concertId] = newMembers;
  concertRosterSourceTemplateCache[concertId] = templateId;
}
```

- [ ] **Step 2: 語法檢查**

抽出 `event-admin.html` 的 `<script type="module">` 內容存成 `.mjs`，執行：

```bash
node --check event_admin_html_0.mjs
```

Expected: 無輸出（通過）

- [ ] **Step 3: 手動驗證（需要 admin 帳號登入）**

1. 開一場已建立的音樂會 → 「參與名單」分頁 →「✎ 編輯名單」
2. 勾選一位團員，確認出現主要樂器下拉選單
3. 點旁邊「＋ 新增樂器」選單選第二個樂器 → 確認出現可移除的 tag，且「＋ 新增樂器」選項不再包含已選的兩個樂器
4. 點 tag 的 × → 確認 tag 消失、「＋ 新增樂器」重新可選該樂器
5. 重新勾一次第二個樂器，「儲存名單」，重新整理頁面，再進「✎ 編輯名單」確認兩個樂器都還在
6. 回到唯讀摘要，確認這位團員同時列在兩個樂器的分組底下
7. 切到「曲目管理」分頁，任一首曲子，分別進這兩個樂器的指派畫面，確認這位團員在兩邊「尚未指派」清單都出現

- [ ] **Step 4: Commit**

```bash
git add event-admin.html
git commit -m "event-admin.html: concertRosters 樂器身分改陣列，支援同人多樂器"
```

---

### Task 2: `section-admin.html` — 分部指派可選名單篩選同步改陣列判斷

**Files:**
- Modify: `section-admin.html:465`

**Interfaces:**
- Consumes：Task 1 產出的 `concertRosters/{concertId}.members[].instruments: string[]`

- [ ] **Step 1: 修改篩選邏輯**

改前：

```js
currentEligibleMembers = members.filter(function(m){ return m.instrument === instrumentName; });
```

改後：

```js
currentEligibleMembers = members.filter(function(m){ return (m.instruments || []).indexOf(instrumentName) !== -1; });
```

- [ ] **Step 2: 語法檢查**

```bash
node --check section_admin_html_0.mjs
```

Expected: 無輸出（通過）

- [ ] **Step 3: 手動驗證**

用 admin 帳號（分部長這輪還不能存檔，見 `schema.md`「已知限制」，用 admin 驗證畫面邏輯即可）開一個 Task 1 測試過、同時負責 2 種樂器的音樂會參與名單，分別開這兩個樂器的指派畫面，確認這位團員在兩邊的「可選名單」都出現。

- [ ] **Step 4: Commit**

```bash
git add section-admin.html
git commit -m "section-admin.html: 分部指派可選名單改用 instruments 陣列判斷"
```

---

### Task 3: `index.html` — 「我的音樂會」讀取端改用 `instruments` 陣列

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes：Task 1 產出的 `concertRosters/{concertId}.members[].instruments: string[]`

- [ ] **Step 1: 修改 `loadMyConcerts()` 跟 `renderMyConcerts()`**

`loadMyConcerts()` 整個函式改前：

```js
async function loadMyConcerts(uid){
  var rosterSnap = await getDocs(collection(db, 'concertRosters'));
  var repertoireSnap = await getDocs(collection(db, 'repertoire'));

  var repertoireById = {};
  repertoireSnap.forEach(function(d){ repertoireById[d.id] = Object.assign({ id: d.id }, d.data()); });

  var myEntries = [];
  rosterSnap.forEach(function(docSnap){
    var members = docSnap.data().members || [];
    var mine = members.filter(function(m){ return m.uid === uid; })[0];
    if (mine) myEntries.push({ concertId: docSnap.id, instrument: mine.instrument });
  });
  if (myEntries.length === 0) return [];

  var concerts = await Promise.all(myEntries.map(async function(entry){
    var concertSnap = await getDoc(doc(db, 'concerts', entry.concertId));
    if (!concertSnap.exists()) return null;

    var piecesSnap = await getDocs(collection(db, 'concerts', entry.concertId, 'pieces'));
    var pieceRefs = piecesSnap.docs.map(function(d){ return { id: d.id, order: d.data().order || 0 }; });
    pieceRefs.sort(function(a, b){ return a.order - b.order; });

    var pieces = await Promise.all(pieceRefs.map(async function(ref){
      var piece = repertoireById[ref.id];
      if (!piece) return { title: '（曲目已刪除）', assignedLabel: null };
      var sectionSnap = await getDoc(doc(db, 'concerts', entry.concertId, 'pieces', ref.id, 'sections', entry.instrument));
      var assignedLabel = null;
      if (sectionSnap.exists()){
        (sectionSnap.data().parts || []).some(function(part){
          if ((part.members || []).indexOf(uid) !== -1){
            var def = (piece.parts || []).filter(function(p){ return p.partId === part.partId; })[0];
            assignedLabel = def ? def.label : part.partId;
            return true;
          }
          return false;
        });
      }
      return { title: piece.title, assignedLabel: assignedLabel };
    }));

    return { concertId: entry.concertId, title: concertSnap.data().title, instrument: entry.instrument, pieces: pieces };
  }));

  return concerts.filter(function(c){ return c; });
}
```

改後：

```js
async function loadMyConcerts(uid){
  var rosterSnap = await getDocs(collection(db, 'concertRosters'));
  var repertoireSnap = await getDocs(collection(db, 'repertoire'));

  var repertoireById = {};
  repertoireSnap.forEach(function(d){ repertoireById[d.id] = Object.assign({ id: d.id }, d.data()); });

  var myEntries = [];
  rosterSnap.forEach(function(docSnap){
    var members = docSnap.data().members || [];
    var mine = members.filter(function(m){ return m.uid === uid; })[0];
    if (mine) myEntries.push({ concertId: docSnap.id, instruments: mine.instruments || [] });
  });
  if (myEntries.length === 0) return [];

  var concerts = await Promise.all(myEntries.map(async function(entry){
    var concertSnap = await getDoc(doc(db, 'concerts', entry.concertId));
    if (!concertSnap.exists()) return null;

    var piecesSnap = await getDocs(collection(db, 'concerts', entry.concertId, 'pieces'));
    var pieceRefs = piecesSnap.docs.map(function(d){ return { id: d.id, order: d.data().order || 0 }; });
    pieceRefs.sort(function(a, b){ return a.order - b.order; });

    var pieces = await Promise.all(pieceRefs.map(async function(ref){
      var piece = repertoireById[ref.id];
      if (!piece) return { title: '（曲目已刪除）', assignedLabel: null };
      // 同時負責多種樂器時，這首曲子可能只在其中某個樂器的分部文件裡有指派到這個人，
      // 逐一查每個樂器的分部文件，把找到的分部標籤都收集起來
      var labels = [];
      await Promise.all(entry.instruments.map(async function(instrumentName){
        var sectionSnap = await getDoc(doc(db, 'concerts', entry.concertId, 'pieces', ref.id, 'sections', instrumentName));
        if (!sectionSnap.exists()) return;
        (sectionSnap.data().parts || []).forEach(function(part){
          if ((part.members || []).indexOf(uid) !== -1){
            var def = (piece.parts || []).filter(function(p){ return p.partId === part.partId; })[0];
            labels.push(def ? def.label : part.partId);
          }
        });
      }));
      return { title: piece.title, assignedLabel: labels.length ? labels.join('、') : null };
    }));

    return { concertId: entry.concertId, title: concertSnap.data().title, instruments: entry.instruments, pieces: pieces };
  }));

  return concerts.filter(function(c){ return c; });
}
```

`renderMyConcerts()` 裡改前：

```js
'<div class="my-concert-instrument">你的分部：' + escapeHtmlForOverview(c.instrument) + '</div>' +
```

改後：

```js
'<div class="my-concert-instrument">你負責的樂器：' + escapeHtmlForOverview(c.instruments.join('、') || '未設定') + '</div>' +
```

- [ ] **Step 2: 語法檢查**

```bash
node --check index_html_0.mjs
```

Expected: 無輸出（通過）

- [ ] **Step 3: 手動驗證**

用 Task 1 測試過、同時負責 2 種樂器的那位團員帳號登入 → 首頁「團務總覽」分頁，確認「我的音樂會」卡片顯示「你負責的樂器：A、B」；如果這兩個樂器在同一首曲子都有指派到這個人，確認分部標籤用「、」把兩個都列出來。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "index.html: 我的音樂會讀取端改用 instruments 陣列"
```

---

### Task 4: `checkin-stats-admin.html` — 簽到統計/出缺席回報接上音樂會樂器

**Files:**
- Modify: `checkin-stats-admin.html`

**Interfaces:**
- Consumes：Task 1 產出的 `concertRosters/{concertId}.members[].instruments: string[]`；`events/{eventId}.concertId`（既有欄位）
- Produces：`groupCheckinsByInstrument(checkins)` 分組時的樂器來源判斷供 `attendingCountsByInstrument()`/`renderDetailSheet()` 沿用（簽名不變）

- [ ] **Step 1: 新增模組變數（加在既有 `var instrumentsList = null;` 後面）**

```js
var eventConcertIdById = {}; // eventId -> concertId|null
var concertRosterInstrumentsCache = {}; // concertId -> {uid: instruments[]}
var currentDetailOverrideByUid = {}; // 目前開啟中的分區明細 sheet 適用的樂器身分覆蓋表
```

- [ ] **Step 2: `loadStats()` 裡的 `eventsSnap.forEach` 補上 concertId 記錄**

改前：

```js
eventsSnap.forEach(function(docSnap){
  var data = docSnap.data();
  var d = data.date && data.date.toDate ? data.date.toDate() : null;
  if (!d) return;
  var t = d.getTime();
  if (t > now || t < cutoffMs) return; // 只看範圍內、已經發生的活動
  eventTitleById[docSnap.id] = data.title;
  rows.push({
```

改後：

```js
eventsSnap.forEach(function(docSnap){
  var data = docSnap.data();
  var d = data.date && data.date.toDate ? data.date.toDate() : null;
  if (!d) return;
  var t = d.getTime();
  if (t > now || t < cutoffMs) return; // 只看範圍內、已經發生的活動
  eventTitleById[docSnap.id] = data.title;
  eventConcertIdById[docSnap.id] = data.concertId || null;
  rows.push({
```

- [ ] **Step 3: 新增 `ensureConcertRosterInstruments()`（加在 `ensureInstrumentsData()` 後面）**

```js
async function ensureConcertRosterInstruments(concertId){
  if (!concertId) return {};
  if (concertRosterInstrumentsCache[concertId]) return concertRosterInstrumentsCache[concertId];
  var snap = await getDoc(doc(db, 'concertRosters', concertId));
  var map = {};
  if (snap.exists()){
    (snap.data().members || []).forEach(function(m){ map[m.uid] = m.instruments || []; });
  }
  concertRosterInstrumentsCache[concertId] = map;
  return map;
}
```

- [ ] **Step 4: `groupCheckinsByInstrument()` 改樂器來源判斷**

改前：

```js
checkins.forEach(function(c){
  var instruments = membersInstrumentsByUid[c.uid] || [];
```

改後：

```js
checkins.forEach(function(c){
  var instruments = (currentDetailOverrideByUid[c.uid] && currentDetailOverrideByUid[c.uid].length > 0)
    ? currentDetailOverrideByUid[c.uid]
    : (membersInstrumentsByUid[c.uid] || []);
```

- [ ] **Step 5: `openDetailSheet()` 改成先抓音樂會樂器覆蓋表**

改前：

```js
function openDetailSheet(eventId){
  detailSheetOverlay.classList.add('active');
  ensureInstrumentsData().then(function(){
    renderDetailSheet(eventId);
  }).catch(function(){
    document.getElementById('detailSheetBody').innerHTML = '<div class="empty">讀取失敗，請重新整理再試一次</div>';
  });
}
```

改後：

```js
function openDetailSheet(eventId){
  detailSheetOverlay.classList.add('active');
  ensureInstrumentsData().then(function(){
    return ensureConcertRosterInstruments(eventConcertIdById[eventId]);
  }).then(function(overrideByUid){
    currentDetailOverrideByUid = overrideByUid;
    renderDetailSheet(eventId);
  }).catch(function(){
    document.getElementById('detailSheetBody').innerHTML = '<div class="empty">讀取失敗，請重新整理再試一次</div>';
  });
}
```

- [ ] **Step 6: 語法檢查**

```bash
node --check checkin_stats_admin_html_0.mjs
```

Expected: 無輸出（通過）

- [ ] **Step 7: 手動驗證**

1. 挑一場**有掛音樂會**的活動，讓 Task 1 測試過的多樂器團員簽到，開「簽到統計」該活動分區明細，確認他同時出現在兩個樂器的分組人數與名單裡
2. 挑一場**沒有掛音樂會**的一般團練，確認分組行為不變（沿用個人資料樂器，跟改動前一致）
3. 「各分部出缺席回報」小字副標（`attendingByName`）也一併確認數字合理（不用另外改程式碼，這裡是驗證 Step 4 的改動有正確被共用）

- [ ] **Step 8: Commit**

```bash
git add checkin-stats-admin.html
git commit -m "checkin-stats-admin.html: 依樂器分組優先採用音樂會參與名單的樂器身分"
```

---

### Task 5: `conductor-admin.html` — 聲部編制即時檢視 + 座位圖接上音樂會樂器

**Files:**
- Modify: `conductor-admin.html`

**Interfaces:**
- Consumes：Task 1 產出的 `concertRosters/{concertId}.members[].instruments: string[]`；`events/{eventId}.concertId`（既有欄位）
- Produces：`groupUidsByInstrument(uids)` 簽名不變，內部樂器來源判斷供 `renderInstrumentGrid()`/`renderSeatChart()`/`openZoneSheet()` 沿用

- [ ] **Step 1: `loadUpcomingHighlightEvents()` 補上 concertId**

改前：

```js
list.push({
  id: docSnap.id,
  title: data.title,
  type: data.type,
  date: data.date && data.date.toDate ? data.date.toDate() : null,
  location: data.location
});
```

改後：

```js
list.push({
  id: docSnap.id,
  title: data.title,
  type: data.type,
  date: data.date && data.date.toDate ? data.date.toDate() : null,
  location: data.location,
  concertId: data.concertId || null
});
```

- [ ] **Step 2: 新增模組變數（加在既有 `var membersInstrumentsByUid = {};` 後面）**

```js
var concertRosterInstrumentsCache = {}; // concertId -> {uid: instruments[]}
var concertInstrumentsByUid = {}; // 目前這場活動適用的音樂會樂器覆蓋表，沒有掛 concertId 時是空物件

async function ensureConcertRosterInstruments(concertId){
  if (!concertId) return {};
  if (concertRosterInstrumentsCache[concertId]) return concertRosterInstrumentsCache[concertId];
  var snap = await getDoc(doc(db, 'concertRosters', concertId));
  var map = {};
  if (snap.exists()){
    (snap.data().members || []).forEach(function(m){ map[m.uid] = m.instruments || []; });
  }
  concertRosterInstrumentsCache[concertId] = map;
  return map;
}
```

- [ ] **Step 3: `loadEventData()` 改成接受 `concertId` 參數**

改前：

```js
async function loadEventData(eventId){
  var rosterAndReports = await Promise.all([
    getDoc(doc(db, 'eventRosters', eventId)),
    getDocs(query(collection(db, 'attendanceReports'), where('eventId', '==', eventId)))
  ]);
  var rosterSnap = rosterAndReports[0];
  var reportsSnap = rosterAndReports[1];
  rosterMembers = rosterSnap.exists() ? (rosterSnap.data().members || []) : null;

  reports = [];
  reportsSnap.forEach(function(docSnap){
    var data = docSnap.data();
    reports.push({ uid: data.uid, name: data.name, account: data.account, status: data.status });
  });

  if (rosterMembers && rosterMembers.length > 0){
```

改後：

```js
async function loadEventData(eventId, concertId){
  var rosterAndReports = await Promise.all([
    getDoc(doc(db, 'eventRosters', eventId)),
    getDocs(query(collection(db, 'attendanceReports'), where('eventId', '==', eventId)))
  ]);
  var rosterSnap = rosterAndReports[0];
  var reportsSnap = rosterAndReports[1];
  rosterMembers = rosterSnap.exists() ? (rosterSnap.data().members || []) : null;

  reports = [];
  reportsSnap.forEach(function(docSnap){
    var data = docSnap.data();
    reports.push({ uid: data.uid, name: data.name, account: data.account, status: data.status });
  });

  concertInstrumentsByUid = await ensureConcertRosterInstruments(concertId);

  if (rosterMembers && rosterMembers.length > 0){
```

- [ ] **Step 4: `groupUidsByInstrument()` 改樂器來源判斷**

改前：

```js
uids.forEach(function(uid){
  var insts = membersInstrumentsByUid[uid] || [];
```

改後：

```js
uids.forEach(function(uid){
  var insts = (concertInstrumentsByUid[uid] && concertInstrumentsByUid[uid].length > 0)
    ? concertInstrumentsByUid[uid]
    : (membersInstrumentsByUid[uid] || []);
```

- [ ] **Step 5: `renderSelectedEvent()` 呼叫端傳入 `concertId`**

改前：

```js
await withRetry(function(){ return loadEventData(nextEvent.id); });
```

改後：

```js
await withRetry(function(){ return loadEventData(nextEvent.id, nextEvent.concertId); });
```

- [ ] **Step 6: 語法檢查**

```bash
node --check conductor_admin_html_0.mjs
```

Expected: 無輸出（通過）

- [ ] **Step 7: 手動驗證**

1. 用 admin/owner/conductor 帳號登入 `conductor-admin.html`，用上一箭頭/下一箭頭切到一場**有掛音樂會**的活動，確認「聲部編制即時檢視」條狀圖跟座位圖都反映音樂會樂器身分——Task 1 測試過的多樂器團員應該同時貢獻到兩個樂器的人數/扇區
2. 切到一場**沒有掛音樂會**的活動，確認分組行為不變（退回個人資料樂器）

- [ ] **Step 8: Commit**

```bash
git add conductor-admin.html
git commit -m "conductor-admin.html: 聲部編制/座位圖依樂器分組優先採用音樂會參與名單"
```
