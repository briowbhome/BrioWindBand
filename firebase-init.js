import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

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
