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

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// 現場人多時網路壅塞，Firestore 讀取偶爾會逾時/失敗，重試一次給壅塞網路一個機會，
// 避免第一次失敗就直接讓使用者卡住看不到任何畫面
async function loadProfileWithRetry(uid) {
  try {
    return await loadProfile(uid);
  } catch (e) {
    await delay(1200);
    return await loadProfile(uid);
  }
}

// 先回快取（如果有）讓畫面秒開，背景一定會重新打一次 Firestore 確認最新狀態，
// 有落差時透過 onStale 通知呼叫端做登出/導轉處理
function resolveProfile(uid, onStale) {
  var cached = readProfileCache(uid);
  var fresh = loadProfileWithRetry(uid).then(function (profile) {
    writeProfileCache(uid, profile);
    if (cached && onStale) onStale(profile);
    return profile;
  });
  if (cached) {
    // 背景確認失敗時使用者已經看得到快取內容，靜默忽略即可，不用再次重試打擾使用者
    fresh.catch(function () {});
    return Promise.resolve(cached);
  }
  return fresh;
}

function goToLogin() {
  var here = location.pathname + location.search;
  location.href = "login.html?redirect=" + encodeURIComponent(here);
}

// 沒有快取可用、重試後 Firestore 讀取仍然失敗時顯示，取代讓畫面卡在骨架屏或轉圈圈不動
function showConnectionError() {
  var overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999;background:rgba(32,36,47,.94);color:#F2EFE5;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;" +
    "padding:24px;text-align:center;font-family:'Noto Sans TC','Noto Sans',sans-serif;";
  overlay.innerHTML =
    '<div style="font-size:15px;font-weight:700;">連線不穩，讀取失敗</div>' +
    '<div style="font-size:13px;color:#C9C2A8;max-width:280px;line-height:1.6;">請確認網路連線後重新整理再試一次</div>' +
    '<button type="button" style="margin-top:6px;background:#B8863A;color:#20242F;border:none;' +
    'border-radius:10px;padding:11px 26px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">重新整理</button>';
  overlay.querySelector("button").addEventListener("click", function () { location.reload(); });
  document.body.appendChild(overlay);
}

// 一般團員頁面（index.html / checkin.html）用：必須登入且審核通過
export async function requireApprovedMember() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  var profile;
  try {
    profile = await resolveProfile(user.uid, function (fresh) {
      if (!fresh || fresh.status !== "approved") {
        clearProfileCache();
        signOut(auth).then(goToLogin);
      }
    });
  } catch (e) {
    showConnectionError();
    return null;
  }

  if (!profile || profile.status !== "approved") {
    clearProfileCache();
    await signOut(auth);
    goToLogin();
    return null;
  }
  return { uid: user.uid, profile: profile };
}

// 後台頁面（review-admin.html 等）用：必須登入、審核通過，且角色是幹部或擁有者
export async function requireAdmin() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  var profile;
  try {
    profile = await resolveProfile(user.uid, function (fresh) {
      if (!fresh || fresh.status !== "approved") {
        clearProfileCache();
        signOut(auth).then(goToLogin);
      } else if (fresh.role !== "admin" && fresh.role !== "owner") {
        clearProfileCache();
        location.href = "index.html";
      }
    });
  } catch (e) {
    showConnectionError();
    return null;
  }

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

// 指揮專用頁面（conductor-admin.html）用：必須登入、審核通過，角色是幹部/擁有者「或」指揮。
// 刻意跟 requireAdmin() 分開、不共用同一個函式改參數判斷——這個放寬只給這一個新頁面用，
// 不影響既有七個 admin-only 後台頁面的守門邏輯
export async function requireAdminOrConductor() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  var allowedRoles = ["admin", "owner", "conductor"];

  var profile;
  try {
    profile = await resolveProfile(user.uid, function (fresh) {
      if (!fresh || fresh.status !== "approved") {
        clearProfileCache();
        signOut(auth).then(goToLogin);
      } else if (allowedRoles.indexOf(fresh.role) === -1) {
        clearProfileCache();
        location.href = "index.html";
      }
    });
  } catch (e) {
    showConnectionError();
    return null;
  }

  if (!profile || profile.status !== "approved") {
    clearProfileCache();
    await signOut(auth);
    goToLogin();
    return null;
  }
  if (allowedRoles.indexOf(profile.role) === -1) {
    location.href = "index.html";
    return null;
  }
  return { uid: user.uid, profile: profile };
}

// 藏譜管理頁面（repertoire-admin.html）用：必須登入、審核通過，且「role 是 admin/owner」或
// 「被個別授予 canManageSheetMusic 權限」（例如譜務）。刻意跟 requireAdmin() 分開——這個放寬
// 只給這一個頁面用，不影響其餘 8 個 admin-only 後台頁面的守門邏輯
export async function requireAdminOrSheetMusicManager() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return !!p && (p.role === "admin" || p.role === "owner" ||
      (p.permissions && p.permissions.canManageSheetMusic === true));
  }

  var profile;
  try {
    profile = await resolveProfile(user.uid, function (fresh) {
      if (!fresh || fresh.status !== "approved") {
        clearProfileCache();
        signOut(auth).then(goToLogin);
      } else if (!isAllowed(fresh)) {
        clearProfileCache();
        location.href = "index.html";
      }
    });
  } catch (e) {
    showConnectionError();
    return null;
  }

  if (!profile || profile.status !== "approved") {
    clearProfileCache();
    await signOut(auth);
    goToLogin();
    return null;
  }
  if (!isAllowed(profile)) {
    location.href = "index.html";
    return null;
  }
  return { uid: user.uid, profile: profile };
}

// 分部長專屬頁面（section-admin.html）用：必須登入、審核通過，且「role 是 admin/owner」或
// 「sectionLeaderFor 陣列不是空的」。刻意跟 requireAdminOrConductor() 分開——這裡放行的
// 判斷依據是陣列欄位有沒有值，不是角色列舉，跟其他守門函式的角色判斷邏輯不同
export async function requireSectionLeader() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return !!p && (p.role === "admin" || p.role === "owner" ||
      (Array.isArray(p.sectionLeaderFor) && p.sectionLeaderFor.length > 0));
  }

  var profile;
  try {
    profile = await resolveProfile(user.uid, function (fresh) {
      if (!fresh || fresh.status !== "approved") {
        clearProfileCache();
        signOut(auth).then(goToLogin);
      } else if (!isAllowed(fresh)) {
        clearProfileCache();
        location.href = "index.html";
      }
    });
  } catch (e) {
    showConnectionError();
    return null;
  }

  if (!profile || profile.status !== "approved") {
    clearProfileCache();
    await signOut(auth);
    goToLogin();
    return null;
  }
  if (!isAllowed(profile)) {
    location.href = "index.html";
    return null;
  }
  return { uid: user.uid, profile: profile };
}

// index.html／profile.html 用：訪客（未登入）、審核中（pending）、已核准都算「看得到」，
// 只有真的被拒絕/停用/移除的帳號才會被踢出登入頁。刻意跟 requireApprovedMember() 分開——
// 後者維持嚴格闔門給 checkin.html 用，這裡放寬只給這兩個頁面用，不影響其他頁面的守門邏輯
export async function resolveMemberAccess() {
  var user = await waitForAuthUser();
  if (!user) {
    return { state: "guest", uid: null, profile: null };
  }

  function isVisible(p) {
    return !!p && (p.status === "approved" || p.status === "pending");
  }

  var profile;
  try {
    profile = await resolveProfile(user.uid, function (fresh) {
      if (!isVisible(fresh)) {
        clearProfileCache();
        signOut(auth).then(goToLogin);
      }
    });
  } catch (e) {
    showConnectionError();
    return null;
  }

  if (!isVisible(profile)) {
    clearProfileCache();
    await signOut(auth);
    goToLogin();
    return null;
  }
  return { state: profile.status, uid: user.uid, profile: profile };
}

// redirectTo 選填，預設是登入頁（給其他 8 個後台頁面用，登出後本來就該回登入頁）。
// profile.html 傳 'profile.html'，讓訪客登出後留在原地看到訪客版個人中心，
// 而不是被強制導去登入頁——這是這次開放訪客瀏覽後才需要的差異，其他呼叫端不受影響
export async function logout(redirectTo) {
  clearProfileCache();
  await signOut(auth);
  location.href = redirectTo || "login.html";
}
