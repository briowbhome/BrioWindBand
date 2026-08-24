const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { sendPushToUids } = require('./push');

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

    const usersSnap = await db.collection('users')
      .where('status', '==', 'approved')
      .where('notificationsEnabled', '==', true)
      .get();
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

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  const isOwner = !!caller && caller.role === 'owner';
  const canManageRoles = isOwner || (!!caller && !!caller.permissions && caller.permissions.canManageRoles === true);
  if (!canManageRoles) {
    throw new HttpsError('permission-denied', '沒有權限執行這個操作');
  }

  const targetUid = request.data && request.data.uid;
  const newPassword = request.data && request.data.newPassword;
  if (!targetUid || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', '請提供團員帳號跟至少 6 碼的新密碼');
  }

  // 不能重設 Owner 的密碼，跟 firestore.rules 對 Owner 敏感欄位的保護是同一個原則——
  // 避免持有 canManageRoles 但不是 Owner 本人的人連 Owner 帳號都能接管
  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', '找不到這個團員的資料');
  }
  if (targetSnap.data().role === 'owner') {
    throw new HttpsError('permission-denied', '不能重設 Owner 的密碼');
  }

  await getAuth().updateUser(targetUid, { password: newPassword });
  return { ok: true };
});
