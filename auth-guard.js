import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

function waitForAuthUser() {
  return new Promise(function (resolve) {
    var unsubscribe = onAuthStateChanged(auth, function (user) {
      unsubscribe();
      resolve(user);
    });
  });
}

async function loadProfile(uid) {
  var snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

function goToLogin() {
  var here = location.pathname + location.search;
  location.href = "login.html?redirect=" + encodeURIComponent(here);
}

// 一般團員頁面（index.html / checkin.html）用：必須登入且審核通過
export async function requireApprovedMember() {
  var user = await waitForAuthUser();
  if (!user) {
    goToLogin();
    return null;
  }
  var profile = await loadProfile(user.uid);
  if (!profile || profile.status !== "approved") {
    await signOut(auth);
    goToLogin();
    return null;
  }
  return { uid: user.uid, profile: profile };
}

// 後台頁面（admin.html）用：必須登入、審核通過，且角色是幹部或擁有者
export async function requireAdmin() {
  var user = await waitForAuthUser();
  if (!user) {
    goToLogin();
    return null;
  }
  var profile = await loadProfile(user.uid);
  if (!profile || profile.status !== "approved") {
    await signOut(auth);
    goToLogin();
    return null;
  }
  if (profile.role !== "admin" && profile.role !== "owner") {
    location.href = "index.html";
    return null;
  }
  return { uid: user.uid, profile: profile };
}

export async function logout() {
  await signOut(auth);
  location.href = "login.html";
}
