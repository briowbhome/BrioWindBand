import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 名單範本套用邏輯，event-admin.html（單一活動/音樂會套用）跟 roster-admin.html
// （9/22 新增的「套用到多個活動/音樂會」批次功能）共用同一份，避免同一套「整份覆蓋、
// 複製快照不是即時參照」邏輯散落在兩個檔案裡各自維護、之後改一邊忘記改另一邊。
// 完整行為說明見 schema.md「名單管理」章節。

// 套用範本到單一活動的應到名單（eventRosters）。existed 由呼叫端傳入的話可以省一次
// getDoc（例如 event-admin.html 本來就有 rostersById 快取知道存不存在）；不傳就自己查一次
export async function applyTemplateToEventRoster(db, eventId, template, createdBy, existed) {
  if (existed === undefined) {
    var snap = await getDoc(doc(db, 'eventRosters', eventId));
    existed = snap.exists();
  }
  var payload = {
    members: template.members,
    sourceTemplateId: template.id,
    templateAppliedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (!existed) payload.createdBy = createdBy;
  await setDoc(doc(db, 'eventRosters', eventId), payload, { merge: true });
  return payload.members;
}

// 套用範本到單一音樂會的參與名單（concertRosters）。membersLookup 是 {uid: {name, account,
// instruments}} 的查表物件（呼叫端已經有的已核准成員快取），fallbackInstrument 是「範本裡
// 全新加入、而且自己資料裡也沒有設定任何樂器」時的最後備援（沿用既有行為：抓樂器清單第一筆）
export async function applyTemplateToConcertRoster(db, concertId, template, membersLookup, fallbackInstrument, createdBy) {
  var existingSnap = await getDoc(doc(db, 'concertRosters', concertId));
  var isNew = !existingSnap.exists();
  var existingByUid = {};
  (existingSnap.exists() ? (existingSnap.data().members || []) : []).forEach(function (m) {
    existingByUid[m.uid] = m.instruments || [];
  });
  var newMembers = template.members.map(function (uid) {
    var member = membersLookup[uid];
    var instruments = existingByUid.hasOwnProperty(uid)
      ? existingByUid[uid]
      : ((member && member.instruments && member.instruments[0]) ? [member.instruments[0]] : (fallbackInstrument ? [fallbackInstrument] : []));
    return { uid: uid, instruments: instruments, name: member ? member.name : uid, account: member ? member.account : '' };
  });
  var payload = {
    members: newMembers,
    sourceTemplateId: template.id,
    templateAppliedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (isNew) payload.createdBy = createdBy;
  await setDoc(doc(db, 'concertRosters', concertId), payload, { merge: true });
  return newMembers;
}

// 算「套用範本後會新增/移除幾個人」，currentUids/templateUids 都是純 uid 陣列——
// concertRosters.members 是 {uid,...} 物件陣列，呼叫端要先 .map(m => m.uid) 再傳進來
export function diffTemplateMembers(currentUids, templateUids) {
  var curSet = {};
  currentUids.forEach(function (uid) { curSet[uid] = true; });
  var newSet = {};
  templateUids.forEach(function (uid) { newSet[uid] = true; });
  return {
    added: templateUids.filter(function (uid) { return !curSet[uid]; }).length,
    removed: currentUids.filter(function (uid) { return !newSet[uid]; }).length
  };
}
