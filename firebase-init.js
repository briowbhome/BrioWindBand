import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
// 開本地端 IndexedDB 持久化快取：多頁應用每次切頁都會重新訂閱 onSnapshot，這個快取
// 讓畫面先用上次看到的本地資料立即繪出，背景才跟伺服器對一次帳，改善「切頁像重新
// 整個載入」的體感；不影響 Firestore 讀取計次（背後還是會跟伺服器確認資料沒過期）
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});
