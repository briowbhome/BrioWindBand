const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { sendPushToUids } = require('./push');
const membership = require('./membership');

initializeApp();
const db = getFirestore();

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const REGION = 'asia-east1';

// 公告發布時推播（announce-admin.html 建立公告勾選「發送推播通知」才會有 sendPush:true，
// 編輯公告走 updateDoc 不會補這個欄位，天生不會觸發）
exports.onAnnouncementCreated = onDocumentCreated(
  { document: 'announcements/{id}', region: REGION, secrets: [VAPID_PRIVATE_KEY] },
  async (event) => {
    const data = event.data.data();
    if (!data || !data.sendPush) return;

    // 9/19 分團：只推播給公告所屬團別的成員，不再對所有已核准用戶廣播。
    // 9/20 修正：「更新」分類公告是 App 軟體版本異動，跟團別無關，firestore.rules 跟
    // announce-admin.html 自己的讀取查詢都特別排除這個分類不受團別限制（見兩邊對
    // category==='update' 的處理），推播對象要跟著一致，不然只有發布當下 activeTeam
    // 那一團收得到通知，另一團完全收不到
    var usersQuery = db.collection('users')
      .where('status', '==', 'approved')
      .where('notificationsEnabled', '==', true);
    if (data.category !== 'update') {
      usersQuery = usersQuery.where('teamIds', 'array-contains', data.team);
    }
    const usersSnap = await usersQuery.get();
    const uids = usersSnap.docs.map((d) => d.id);
    if (uids.length === 0) return;

    await sendPushToUids(uids, {
      title: '布利歐管樂團公告',
      body: (data.content || '').slice(0, 60),
      url: './index.html'
    }, VAPID_PRIVATE_KEY.value());
  }
);

// 出缺席調查發起時推播（event-admin.html「發起調查」把 eventRosters.surveyOpenedAt 從
// null 寫成有值；「關閉調查」寫的是 null，不符合這裡 before 無/after 有的轉換條件，
// 天生不會觸發）。只推播給名單內尚未回報的人，跟 index.html 首頁橫幅「待回報清單」
// 同一套「應到減已回報」概念，搬到伺服器端算一次
exports.onSurveyOpened = onDocumentUpdated(
  { document: 'eventRosters/{eventId}', region: REGION, secrets: [VAPID_PRIVATE_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.surveyOpenedAt || !after.surveyOpenedAt) return;

    const members = after.members || [];
    if (members.length === 0) return;

    const eventId = event.params.eventId;

    const reportsSnap = await db.collection('attendanceReports')
      .where('eventId', '==', eventId)
      .get();
    const reportedUids = new Set(reportsSnap.docs.map((d) => d.data().uid));
    const pendingUids = members.filter((uid) => !reportedUids.has(uid));
    if (pendingUids.length === 0) return;

    const eventSnap = await db.collection('events').doc(eventId).get();
    const eventTitle = eventSnap.exists ? (eventSnap.data().title || '活動') : '活動';

    await sendPushToUids(pendingUids, {
      title: '出缺席調查',
      body: '「' + eventTitle + '」出缺席調查已開放，請儘速回報',
      url: './index.html'
    }, VAPID_PRIVATE_KEY.value());
  }
);

// 幹部協助重設團員密碼——這個專案第一個 callable function（前兩個都是背景 Firestore
// trigger）。前端只在 role==='admin'/'owner' 且沒有 canManageRoles 時就不會顯示重設按鈕，
// 但那只是 UI 層面的方便，權限的真正防線在這裡：伺服器端重新查一次 caller 的 users/{uid}
// 文件，不相信任何前端傳來的角色資訊，避免有人繞過前端直接呼叫這個 function
exports.resetMemberPassword = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }

  const targetUid = request.data && request.data.uid;
  const newPassword = request.data && request.data.newPassword;
  if (!targetUid || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', '請提供團員帳號跟至少 6 碼的新密碼');
  }

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  const isOwner = !!caller && caller.role === 'owner';

  // 9/20 修正：先做一次「粗檢查」——只看呼叫者自己的資料，判斷這個人是不是在任一團有
  // canManageRoles，完全不需要讀 target。這一步先擋掉「隨便一個已登入帳號（甚至還在
  // 審核中）」的呼叫，避免這種完全沒有角色管理權限的人能藉由後面 not-found／不能改
  // Owner 密碼的錯誤訊息差異，探測出某個帳號存不存在、是不是 Owner——這兩則訊息本身
  // 不機密，但只該讓「至少在某一團有角色管理權限」的人看到
  const callerHasAnyCanManageRoles = isOwner || !!(caller && caller.teams && Object.keys(caller.teams).some(function (team) {
    var teamData = caller.teams[team];
    return teamData && teamData.permissions && teamData.permissions.canManageRoles === true;
  }));
  if (!callerHasAnyCanManageRoles) {
    throw new HttpsError('permission-denied', '沒有權限執行這個操作');
  }

  // 不能重設 Owner 的密碼，跟 firestore.rules 對 Owner 敏感欄位的保護是同一個原則——
  // 避免持有 canManageRoles 但不是 Owner 本人的人連 Owner 帳號都能接管
  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', '找不到這個團員的資料');
  }
  const target = targetSnap.data();
  if (target.role === 'owner') {
    throw new HttpsError('permission-denied', '不能重設 Owner 的密碼');
  }

  // 9/19 分團：除了全域 canManageRoles，也認得「呼叫者在目標帳號所屬的某一團有 canManageRoles」
  // ——這是比上面粗檢查更嚴格的第二層：光是在某一團有角色管理權限還不夠，那一團還得
  // 剛好是目標帳號所屬的團
  const targetTeams = Array.isArray(target.teamIds) ? target.teamIds : [];
  const hasTeamCanManageRoles = !!(caller && caller.teams && targetTeams.some(function (team) {
    var teamData = caller.teams[team];
    return teamData && teamData.permissions && teamData.permissions.canManageRoles === true;
  }));
  const canManageRoles = isOwner || hasTeamCanManageRoles;
  if (!canManageRoles) {
    throw new HttpsError('permission-denied', '沒有權限執行這個操作');
  }

  await getAuth().updateUser(targetUid, { password: newPassword });
  return { ok: true };
});

// 10/1：移出團籍（軟刪除現役帳號），見 docs/superpowers/specs/2026-10-01-team-membership-removal-design.md。
// 把 teams.{team} 原封不動搬進 removedTeams.{team}，teamIds 變空才把 status 改成 removed。
// 權限判斷與欄位計算都在 membership.js（純函式、有單元測試），這裡只負責讀資料、開
// transaction、寫回。粗檢查在讀目標之前做，理由同 resetMemberPassword 的 9/20 修正
async function loadProfile(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

exports.removeTeamMembership = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }
  const args = membership.validateArgs(request.data);
  const callerUid = request.auth.uid;
  const caller = await loadProfile(callerUid);
  membership.assertCoarsePermission(caller);

  const ref = db.collection('users').doc(args.uid);
  let accountRemoved = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const update = membership.planRemoval({
      callerUid: callerUid,
      caller: caller,
      targetUid: args.uid,
      target: snap.exists ? snap.data() : null,
      team: args.team,
      removedAt: FieldValue.serverTimestamp()
    });
    accountRemoved = update.status === 'removed';
    tx.update(ref, update);
  });
  return { ok: true, accountRemoved: accountRemoved };
});

exports.restoreTeamMembership = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }
  const args = membership.validateArgs(request.data);
  const caller = await loadProfile(request.auth.uid);
  membership.assertCoarsePermission(caller);

  const ref = db.collection('users').doc(args.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const update = membership.planRestore({
      caller: caller,
      target: snap.exists ? snap.data() : null,
      team: args.team
    });
    tx.update(ref, update);
  });
  return { ok: true };
});

// ---------- 10/9 同分部互看出缺席：維護 sectionAttendance 摘要 ----------
// 團員不能讀 users（個資）也不能讀 attendanceReports（請假原因），由這裡整理一份只有
// 姓名＋狀態的摘要給同分部的人讀。四個觸發點都是「整場重算」，見 sectionAttendanceSync.js
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const sectionAttendance = require('./sectionAttendance');
const sectionAttendanceSync = require('./sectionAttendanceSync');

// 團員回報、幹部代改、刪除回報。文件 ID 是 {eventId}_{uid}
exports.onAttendanceReportWrittenSection = onDocumentWritten(
  { document: 'attendanceReports/{reportId}', region: REGION },
  async (event) => {
    const eventId = event.params.reportId.split('_')[0];
    await sectionAttendanceSync.recomputeEventSections(db, eventId, FieldValue.serverTimestamp());
  }
);

// 名單增減、發起／關閉調查、刪除名單
exports.onEventRosterWrittenSection = onDocumentWritten(
  { document: 'eventRosters/{eventId}', region: REGION },
  async (event) => {
    await sectionAttendanceSync.recomputeEventSections(db, event.params.eventId, FieldValue.serverTimestamp());
  }
);

// 活動改了連結的音樂會／標題／日期／團別，或被刪除
exports.onEventWrittenSection = onDocumentWritten(
  { document: 'events/{eventId}', region: REGION },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!sectionAttendance.isSectionRelevantEventChange(before, after)) return;
    await sectionAttendanceSync.recomputeEventSections(db, event.params.eventId, FieldValue.serverTimestamp());
  }
);

// 音樂會參與名單改了樂器或成員
exports.onConcertRosterWrittenSection = onDocumentWritten(
  { document: 'concertRosters/{concertId}', region: REGION },
  async (event) => {
    await sectionAttendanceSync.recomputeConcertEvents(db, event.params.concertId, FieldValue.serverTimestamp());
  }
);
