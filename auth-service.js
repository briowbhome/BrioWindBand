import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const EMAIL_DOMAIN = "briowindband.local";

function usernameToEmail(account) {
  return account.trim().toLowerCase() + "@" + EMAIL_DOMAIN;
}

function mapAuthError(error) {
  var code = error && error.code;
  if (code === "auth/email-already-in-use") return "此帳號已被使用，請換一個帳號";
  if (code === "auth/weak-password") return "密碼強度不足";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "帳號或密碼錯誤";
  if (code === "auth/too-many-requests") return "嘗試次數過多，請稍後再試";
  if (code === "auth/network-request-failed") return "網路連線異常，請檢查網路後再試";
  return "發生錯誤，請稍後再試（" + (code || "unknown") + "）";
}

export async function registerAccount({ account, password, name, birthday, phone, licensePlate, instruments, team }) {
  var email = usernameToEmail(account);
  var credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(mapAuthError(error));
  }

  var uid = credential.user.uid;
  try {
    await setDoc(doc(db, "users", uid), {
      account: account.trim(),
      accountLower: account.trim().toLowerCase(),
      name: name,
      birthday: birthday,
      phone: phone,
      licensePlate: licensePlate ? licensePlate.trim() : null,
      instruments: instruments,
      status: "pending",
      createdAt: serverTimestamp(),
      approvedAt: null,
      approvedBy: null,
      // 9/17 校友團/校內團分割新增：teamIds 純粹給查詢用（跟 teams 保持同步），
      // teams.{team} 才是實際的團籍資料，見 firestore.rules 的團別版 create 規則。
      // 9/20 收尾：不再寫入頂層 role——Owner 以外不應該有這個欄位，firestore.rules 的
      // create 規則也已經改成禁止頂層帶 role（比照 permissions 的做法）
      teamIds: [team],
      teams: { [team]: { role: "member" } }
    });
  } catch (error) {
    throw new Error("帳號已建立，但寫入團員資料失敗，請洽幹部協助（" + error.code + "）");
  }

  return { uid: uid };
}

export async function loginAccount({ account, password }) {
  var email = usernameToEmail(account);
  var credential;
  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(mapAuthError(error));
  }

  var uid = credential.user.uid;
  var snap = await getDoc(doc(db, "users", uid));

  if (!snap.exists()) {
    await signOut(auth);
    throw new Error("找不到團員資料，請洽幹部確認帳號狀態");
  }

  var profile = snap.data();

  // pending 直接放行——審核中的帳號可以正常登入使用首頁的受限功能，
  // 不再像以前那樣被登出+擋在登入頁外，只有真的被拒絕/停用才擋
  if (profile.status === "rejected") {
    await signOut(auth);
    throw new Error("此帳號申請未通過審核，請洽幹部");
  }
  if (profile.status === "suspended") {
    await signOut(auth);
    throw new Error("此帳號已被停用，請洽幹部");
  }

  return { uid: uid, profile: profile };
}
