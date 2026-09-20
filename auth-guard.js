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

// 團別切換機制（9/17 新增）：見 docs/superpowers/specs/2026-09-17-events-team-partition-design.md
// 「B. 團別切換機制」。單團籍成員一律用他唯一的團，不理會 localStorage；雙團籍成員讀
// localStorage 記住的偏好，沒有偏好或偏好已經不在自己的 teamIds 裡時預設校友團。
var ACTIVE_TEAM_KEY = "brio_active_team";

export function getActiveTeam(profile) {
  var teamIds = (profile && Array.isArray(profile.teamIds)) ? profile.teamIds : [];
  if (teamIds.length <= 1) return teamIds[0] || "alumni";
  var stored = null;
  try { stored = localStorage.getItem(ACTIVE_TEAM_KEY); } catch (e) {}
  return teamIds.indexOf(stored) !== -1 ? stored : "alumni";
}

// 校友團／校內團的 <meta name="theme-color"> 值，要跟 theme.css 的 --paper 對應——
// 這個 meta 標籤本身不是 CSS，沒辦法用 :root[data-team] 覆寫，只能用 JS 同步更新
var TEAM_THEME_COLOR = { alumni: "#F2EFE5", school: "#F0EEE6" };

// 設定 <html data-team> 讓 theme.css 的 :root[data-team="school"] 覆寫生效，
// 同時更新 PWA 外框顏色。所有已登入頁面共用同一份 auth-guard.js，這裡是唯一需要
// 呼叫這個函式的地方，頁面本身不需要各自處理配色
export function applyTeamTheme(profile) {
  var team = getActiveTeam(profile);
  document.documentElement.setAttribute("data-team", team);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", TEAM_THEME_COLOR[team] || TEAM_THEME_COLOR.alumni);
}

// 模組一 import 就立刻嘗試用快取套用一次配色（如果有的話），讓骨架畫面盡量不要用錯的
// 顏色渲染；沒有快取時維持預設校友團配色，不影響任何邏輯。resolveProfile() 拿到權威
// 資料後一定還會再套用一次覆蓋，這裡只是「盡量不要閃爍」的優化，不是正確性的唯一來源
applyTeamTheme(peekCachedProfile());

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
    applyTeamTheme(profile);
    if (cached && onStale) onStale(profile);
    return profile;
  });
  if (cached) {
    applyTeamTheme(cached);
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

// 指揮專用頁面（conductor-admin.html）用：必須登入、審核通過，角色是幹部/擁有者「或」指揮，
// 這次（9/19 conductorNotes 分團）放寬成也認得「任一團的團別身分是 admin/conductor」——
// 跟 requireAdminOrTeamAdmin()/requireAdminOrFinanceManager() 同一類缺口修正，差別是這個
// 函式只有這一個頁面在用，直接改寫原函式，不另外新增平行函式
export async function requireAdminOrConductor() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  var allowedRoles = ["admin", "owner", "conductor"];

  function isAllowed(p) {
    var isTeamAllowed = !!(p && p.teams && Object.keys(p.teams).some(function (team) {
      var role = p.teams[team] && p.teams[team].role;
      return role === "admin" || role === "conductor";
    }));
    return !!p && (allowedRoles.indexOf(p.role) !== -1 || isTeamAllowed);
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

// 通用小函式：這個人在「任一團」有沒有某個共用資源職能旗標（canManageSheetMusic／
// canViewAllSheetMusic／canManageEventTypes 這類搬進團別版、但管的資源本身兩團共用的旗標）。
// 跟 getSectionLeaderInstruments() 一樣的「聯集」精神，但這裡只需要布林值，不用收集清單
export function hasTeamPermission(profile, key) {
  return !!(profile && profile.teams && Object.keys(profile.teams).some(function (team) {
    var teamData = profile.teams[team];
    return teamData && teamData.permissions && teamData.permissions[key] === true;
  }));
}

// 通用小函式：這個人在「任一團」的團別身分是不是某個角色（例如 admin/conductor）。
// 9/20 抽出來共用——原本 profile.html 的 canSeeConductorPage 等判斷式已經用同一套邏輯，
// 但 index.html/conductor-admin.html/finance-admin.html/repertoire-admin.html/
// section-admin.html/sheet-music.html 各自還在只看頂層全域 role，兩邊本來要同步的判斷式
// 跑掉了（分團後全域 role 不再代表任何身分，只有 teams.{team}.role 才是真的）。統一改用
// 這個函式，之後不會再各自維護一份容易漏改的複本
export function hasAnyTeamRole(profile, role) {
  return !!(profile && profile.teams && Object.keys(profile.teams).some(function (team) {
    return profile.teams[team] && profile.teams[team].role === role;
  }));
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
      (p.permissions && p.permissions.canManageSheetMusic === true) ||
      hasTeamPermission(p, 'canManageSheetMusic'));
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

// 財務管理頁面（finance-admin.html）用：必須登入、審核通過，且「role 是 admin/owner」或
// 「被個別授予 canManageFinance 權限」（例如財務職位）。跟 requireAdminOrSheetMusicManager()
// 完全同一種骨架，只是換成 canManageFinance 這個旗標
export async function requireAdminOrFinanceManager() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  // 9/18 修正：地基階段已經把 canManageFinance 搬到 teams.{team}.permissions.canManageFinance，
  // 但這個守門函式原本只認全域 permissions.canManageFinance，導致「只在某一團有財務權限」的
  // 人完全進不了這個頁面。這裡補上判斷：只要在任一團有這個權限就放行，進頁後看到的資料
  // 仍然依 activeTeam 過濾，只會看到自己有權限的那團
  function isAllowed(p) {
    return !!p && (p.role === "admin" || p.role === "owner" || hasTeamPermission(p, 'canManageFinance'));
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

// 公告管理頁面（announce-admin.html）用：必須登入、審核通過，且「role 是 admin/owner」或
// 「在任一團的團別身分是 admin」。9/19 公告分團後，寫入權限改成 isAdminTierFor(team)，
// 但公告本來就是團別版全新的頁面守門情境（不像財務那樣有「全域 canManageFinance 旗標」
// 這種額外情境要相容），只要任一團是團別 admin 就放行，進頁後用 activeTeam 決定編輯哪一團
export async function requireAdminOrTeamAdmin() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    var isTeamAdmin = !!(p && p.teams && Object.keys(p.teams).some(function (team) {
      return p.teams[team] && p.teams[team].role === "admin";
    }));
    return !!p && (p.role === "admin" || p.role === "owner" || isTeamAdmin);
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

// 分部長身分可能同時存在於全域 sectionLeaderFor 跟團別版 teams.{team}.sectionLeaderFor
// 兩個位置（過渡期並存，見團別分割專案說明），這個函式統一回傳「這個人不管在哪裡被
// 指派過的樂器」聯集，供「這個人算不算分部長」這類跟目前作用中團別無關的判斷式共用。
// section-admin.html 的實際瀏覽/編輯範圍不用這個函式，因為那裡要依 activeTeam 篩選，
// 不能把其他團的樂器也算進來
export function getSectionLeaderInstruments(profile) {
  var result = Array.isArray(profile && profile.sectionLeaderFor) ? profile.sectionLeaderFor.slice() : [];
  if (profile && profile.teams) {
    Object.keys(profile.teams).forEach(function (team) {
      var teamData = profile.teams[team];
      if (teamData && Array.isArray(teamData.sectionLeaderFor)) {
        teamData.sectionLeaderFor.forEach(function (name) {
          if (result.indexOf(name) === -1) result.push(name);
        });
      }
    });
  }
  return result;
}

// roles-admin.html 專用頁面守門：必須登入、審核通過，且「role 是 owner」或「在任一團有
// canManageRoles 權限」。9/19 收尾計畫：取代原本 requireAdmin()（全域 role）+ 額外的全域
// canManageRoles 檢查兩層邏輯——這是團別分割專案最後也最關鍵的一塊，讓「只在某團有角色
// 管理權限、全域角色不是 admin/owner」的人也能真正使用這個頁面管理自己團的角色
export async function requireCanManageRoles() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return !!p && (p.role === "owner" || hasTeamPermission(p, 'canManageRoles'));
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
    return !!p && (p.role === "admin" || p.role === "owner" || getSectionLeaderInstruments(p).length > 0);
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
