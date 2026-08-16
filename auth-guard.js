import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 同分頁快取：只是讓「已經驗證過的人」切頁時畫面秒開，不是跳過驗證本身。
// onAuthStateChanged 這個真正的登入檢查每次都照跑，快取只省下重複打 Firestore 讀 profile 的等待，
// 拿到快取結果的同時背景仍會重新讀一次最新資料，真的被停權/降級會在下一步被抓到並登出或導轉。
var PROFILE_CACHE_KEY = "brio_profile_cache";
var PROFILE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function readProfileCache(uid) {
  try {
    var raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (cached.uid !== uid) return null;
    if (Date.now() - cached.at > PROFILE_CACHE_MAX_AGE_MS) return null;
    return cached.profile;
  } catch (e) {
    return null;
  }
}

function writeProfileCache(uid, profile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid: uid, profile: profile, at: Date.now() }));
  } catch (e) {}
}

function clearProfileCache() {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {}
}

// 骨架畫面用：不需要先知道 uid 就能讀，回傳的只是「上次是誰」的最佳猜測（例如拿姓名縮寫先填大頭貼），
// 不代表已驗證，也不影響真正的驗證流程——真正的驗證還是會照跑，跟這個猜測完全獨立
export function peekCachedProfile() {
  try {
    var raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (Date.now() - cached.at > PROFILE_CACHE_MAX_AGE_MS) return null;
    return cached.profile;
  } catch (e) {
    return null;
  }
}

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

// 先回快取（如果有）讓畫面秒開，背景一定會重新打一次 Firestore 確認最新狀態，
// 有落差時透過 onStale 通知呼叫端做登出/導轉處理
function resolveProfile(uid, onStale) {
  var cached = readProfileCache(uid);
  var fresh = loadProfile(uid).then(function (profile) {
    writeProfileCache(uid, profile);
    if (cached && onStale) onStale(profile);
    return profile;
  });
  return cached ? Promise.resolve(cached) : fresh;
}

function goToLogin() {
  var here = location.pathname + location.search;
  location.href = "login.html?redirect=" + encodeURIComponent(here);
}

// 一般團員頁面（index.html / checkin.html）用：必須登入且審核通過
export async function requireApprovedMember() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  var profile = await resolveProfile(user.uid, function (fresh) {
    if (!fresh || fresh.status !== "approved") {
      clearProfileCache();
      signOut(auth).then(goToLogin);
    }
  });

  if (!profile || profile.status !== "approved") {
    clearProfileCache();
    await signOut(auth);
    goToLogin();
    return null;
  }
  return { uid: user.uid, profile: profile };
}

// 後台頁面（admin.html 等）用：必須登入、審核通過，且角色是幹部或擁有者
export async function requireAdmin() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  var profile = await resolveProfile(user.uid, function (fresh) {
    if (!fresh || fresh.status !== "approved") {
      clearProfileCache();
      signOut(auth).then(goToLogin);
    } else if (fresh.role !== "admin" && fresh.role !== "owner") {
      clearProfileCache();
      location.href = "index.html";
    }
  });

  if (!profile || profile.status !== "approved") {
    clearProfileCache();
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
  clearProfileCache();
  await signOut(auth);
  location.href = "login.html";
}
