const { getFirestore } = require('firebase-admin/firestore');
const webpush = require('web-push');

// 公鑰跟 push-config.js 是同一把，這裡另外複製一份——專案慣例是各檔案各自複製、不共用
// 邏輯檔，這把公鑰是公開資訊、寫死在程式碼裡沒有風險。如果之後在 push-config.js 換了新
// 的 VAPID 金鑰對，這裡要記得同步更新，不然瀏覽器訂閱用的公鑰跟這裡簽署用的私鑰會對不上。
const VAPID_PUBLIC_KEY = 'BJk_UZDGo3M8IK3S16WtWavAWVvpOW5j741CuMDsZ2PR_KYIERn-a3A4zy5EiaO5icN7Aa3QbVdKxi7QHt8hh6g';
const VAPID_SUBJECT = 'mailto:harry94014@gmail.com';

/**
 * 對一批 uid 送推播，忽略沒開通知/沒有訂閱憑證的人；
 * 送出失敗且訂閱已失效（404/410）時自動清空該使用者的 pushSubscription，避免一直重試。
 */
async function sendPushToUids(uids, payload, vapidPrivateKey) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

  const db = getFirestore();
  const body = JSON.stringify(payload);

  await Promise.all(uids.map(async (uid) => {
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return;

    const data = snap.data();
    if (!data.notificationsEnabled || !data.pushSubscription) return;

    try {
      await webpush.sendNotification(data.pushSubscription, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await userRef.set({
          pushSubscription: null,
          notificationsEnabled: false
        }, { merge: true });
      } else {
        console.error('推播失敗 uid=' + uid, err);
      }
    }
  }));
}

module.exports = { sendPushToUids };
