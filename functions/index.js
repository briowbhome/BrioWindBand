const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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
      body: '「' + eventTitle + '」出缺席調查已開放，請盡速回報',
      url: './index.html'
    }, VAPID_PRIVATE_KEY.value());
  }
);
