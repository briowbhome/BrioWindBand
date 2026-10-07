// 表單功能的 Firestore 讀寫（10/6 新增）。純計算邏輯在 forms-core.js，畫面在各頁面／forms-admin-*.js
import { db } from './firebase-init.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch, arrayUnion, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { isFormOpen } from './forms-core.js';

function withId(snap) {
  var data = snap.data();
  data.id = snap.id;
  return data;
}

function responsesCol(formId) {
  return collection(db, 'forms', formId, 'responses');
}

function responseRef(formId, responseId) {
  return doc(db, 'forms', formId, 'responses', responseId);
}

export async function loadForm(formId) {
  var snap = await getDoc(doc(db, 'forms', formId));
  return snap.exists() ? withId(snap) : null;
}

export async function listTeamForms(team) {
  var snap = await getDocs(query(collection(db, 'forms'), where('team', '==', team)));
  return snap.docs.map(withId);
}

// 團員的查詢一定要帶 status 條件，firestore.rules 的 list 規則才能證明不會讀到草稿
export async function listOpenFormsForMember(team) {
  var snap = await getDocs(query(collection(db, 'forms'), where('team', '==', team), where('status', '==', 'open')));
  var now = Date.now();
  return snap.docs.map(withId).filter(function (f) { return !f.archived && isFormOpen(f, now); });
}

// 所有欄位一律寫入（規則讀 closesAt、allowGuest 時，欄位不存在會直接拒絕）
export async function createForm(team, uid) {
  var ref = await addDoc(collection(db, 'forms'), {
    title: '未命名表單', description: '', team: team, questions: [], linkedTo: null,
    status: 'draft', closesAt: null, allowGuest: false, archived: false,
    rosterImportedAt: null, rosterImportedBy: null,
    createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export function updateForm(formId, patch) {
  return updateDoc(doc(db, 'forms', formId), Object.assign({}, patch, { updatedAt: serverTimestamp() }));
}

export async function loadResponses(formId) {
  var snap = await getDocs(responsesCol(formId));
  return snap.docs.map(withId);
}

export async function loadPayments(formId) {
  var snap = await getDocs(collection(db, 'forms', formId, 'payments'));
  var map = {};
  snap.docs.forEach(function (d) { map[d.id] = d.data(); });
  return map;
}

export async function loadResponse(formId, responseId) {
  var snap = await getDoc(responseRef(formId, responseId));
  return snap.exists() ? withId(snap) : null;
}

export async function loadMyProxyResponses(formId, uid) {
  var snap = await getDocs(query(responsesCol(formId), where('proxyBy', '==', uid)));
  return snap.docs.map(withId);
}

// 填寫頁只用來判斷要不要鎖定，不讀收款內容
export async function hasPayment(formId, responseId) {
  var snap = await getDoc(doc(db, 'forms', formId, 'payments', responseId));
  return snap.exists();
}

// 自己的回應：文件 ID 就是自己的 uid（訪客是匿名 uid）
export function createOwnResponse(formId, uid, name, answers) {
  return setDoc(responseRef(formId, uid), {
    uid: uid, name: name, proxyBy: null, boundUid: null, answers: answers,
    submittedAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export async function createProxyResponse(formId, proxyUid, name, answers) {
  var ref = await addDoc(responsesCol(formId), {
    uid: null, name: name, proxyBy: proxyUid, boundUid: null, answers: answers,
    submittedAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export function updateResponse(formId, responseId, name, answers) {
  return updateDoc(responseRef(formId, responseId), { name: name, answers: answers, updatedAt: serverTimestamp() });
}

export function deleteResponse(formId, responseId) {
  return deleteDoc(responseRef(formId, responseId));
}

export function bindResponse(formId, responseId, uid) {
  return updateDoc(responseRef(formId, responseId), { boundUid: uid, updatedAt: serverTimestamp() });
}

// 收款：每份回應一本帳，entries 用 arrayUnion 累加；文件不存在時 set + merge 會直接建立。
// 陣列元素不能放 serverTimestamp()，所以 at 用前端時間
export function addPaymentEntries(formId, entries, byUid, byName) {
  var batch = writeBatch(db);
  var at = Timestamp.now();
  entries.forEach(function (e) {
    if (!e.amount) return;
    batch.set(doc(db, 'forms', formId, 'payments', e.responseId), {
      name: e.name,
      entries: arrayUnion({ amount: e.amount, by: byUid, byName: byName, at: at, note: e.note || '' }),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  return batch.commit();
}

// 幹部用：這一團 teamIds 包含的所有帳號（含待審核），判斷回應類型、綁定、匯入名單都靠它
export async function loadTeamUsers(team) {
  var snap = await getDocs(query(collection(db, 'users'), where('teamIds', 'array-contains', team)));
  var map = {};
  snap.docs.forEach(function (d) {
    var u = d.data();
    map[d.id] = { name: u.name || '', account: u.account || '', status: u.status };
  });
  return map;
}

function tsMs(ts) {
  return ts && ts.toMillis ? ts.toMillis() : 0;
}

// 「連結活動或音樂會」選單用
export async function listLinkTargets(team) {
  var res = await Promise.all([
    getDocs(query(collection(db, 'events'), where('team', 'array-contains', team))),
    getDocs(query(collection(db, 'concerts'), where('team', 'array-contains', team)))
  ]);
  function byDate(a, b) { return a.dateMs - b.dateMs; }
  return {
    events: res[0].docs.map(function (d) {
      var x = d.data();
      return { id: d.id, title: x.title || '（未命名活動）', dateMs: tsMs(x.date) };
    }).sort(byDate),
    concerts: res[1].docs.map(function (d) {
      var x = d.data();
      return { id: d.id, title: x.title || '（未命名音樂會）', dateMs: tsMs(x.startDate) };
    }).sort(byDate)
  };
}

// 填寫頁標頭顯示連結的活動／音樂會名稱。訪客讀不到音樂會（規則要求 hasProfile），讀不到就不顯示
export async function loadLinkedTitle(linkedTo) {
  if (!linkedTo) return '';
  try {
    var snap = await getDoc(doc(db, linkedTo.type === 'concert' ? 'concerts' : 'events', linkedTo.id));
    return snap.exists() ? (snap.data().title || '') : '';
  } catch (e) {
    return '';
  }
}

export async function loadConcertRoster(concertId) {
  var snap = await getDoc(doc(db, 'concertRosters', concertId));
  if (!snap.exists()) return { exists: false, members: [], updatedAtMs: null };
  var data = snap.data();
  return { exists: true, members: data.members || [], updatedAtMs: tsMs(data.updatedAt) || null };
}

// 名單和表單的「最近一次匯入」一起寫入。名單格式比照 event-admin.html 的 concertRosterSaveBtn
export function saveRosterImport(formId, concertId, members, isNew, adminUid) {
  var batch = writeBatch(db);
  var payload = { members: members, updatedAt: serverTimestamp() };
  if (isNew) payload.createdBy = adminUid;
  batch.set(doc(db, 'concertRosters', concertId), payload, { merge: true });
  batch.update(doc(db, 'forms', formId), {
    rosterImportedAt: serverTimestamp(), rosterImportedBy: adminUid, updatedAt: serverTimestamp()
  });
  return batch.commit();
}
