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

export async function registerAccount({ account, password, name, birthday, phone, licensePlate, instruments }) {
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
      role: "member",
      createdAt: serverTimestamp(),
      approvedAt: null,
      approvedBy: null
    });
  } catch (error) {
    throw new Error("帳號已建立，但寫入團員資料失敗，請洽幹部協助（" + error.code + "）");
  }

  await signOut(auth);
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

  if (profile.status === "pending") {
    await signOut(auth);
    throw new Error("你的帳號申請仍在審核中，請耐心等候");
  }
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
