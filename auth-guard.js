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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
}

// 後台頁面用：必須登入、審核通過，且角色是幹部或擁有者。9/20 現在只剩 feedback-admin.html
// 還在用（其餘 8 個頁面都已經改用 requireAdminOrTeamAdmin()）；isAllowed() 改用共用的
// hasAnyTeamRole()（頂層 role 已經停用，之後會被清除腳本刪掉，不能再靠它判斷）
export async function requireAdmin() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return !!p && (p.role === "owner" || hasAnyTeamRole(p, "admin"));
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
}

// 指揮專用頁面（conductor-admin.html）用：必須登入、審核通過，角色是幹部/擁有者「或」指揮。
// 9/20 修正：從「任一團的團別身分是 admin/conductor 就放行」改成「目前切換中的那一團」——
// conductorNotes 是依 activeTeam 建立的私人筆記，門檻理所當然也要看現在是哪一團，不然
// 校友團 admin 切到自己只是一般團員的校內團，仍然能進這頁、以為自己有指揮/幹部身分
export async function requireAdminOrConductor() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return ownerOrActiveTeamPredicate(p, function (teamData) {
      return teamData.role === "admin" || teamData.role === "conductor";
    });
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
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

// 通用：某人在「指定那一團」（不一定是操作者目前切換中的那一團）是否有某個權限旗標。
// 跟上面 hasTeamPermission()（任一團符合就算）不同，這個要能查「特定那一團」，供
// admin-pages.js（後台入口反灰判斷）、roles-admin.html（編輯某個成員的某個團籍分頁）共用
export function hasTeamPermissionFor(profile, team, key) {
  var teamData = profile && profile.teams && profile.teams[team];
  return !!(teamData && teamData.permissions && teamData.permissions[key] === true);
}

// 通用：某人在「指定那一團」有沒有 canManageRoles（Owner 例外）。9/22 抽出來共用——原本是
// roles-admin.html 自己的本地函式，admin-pages.js 反灰「權限管理」入口卡片也需要同一份判斷
export function canManageRolesForTeam(profile, team) {
  return (!!profile && profile.role === 'owner') || hasTeamPermissionFor(profile, team, 'canManageRoles');
}

// 通用小函式：這個人在「任一團」的團別身分是不是某個角色（例如 admin/conductor）。
// 9/20 抽出來共用——原本 profile.html 的 canSeeConductorPage 等判斷式已經用同一套邏輯，
// 但 index.html/conductor-admin.html/finance-admin.html/repertoire-admin.html/
// section-admin.html/sheet-music.html 各自還在只看頂層全域 role，兩邊本來要同步的判斷式
// 跑掉了（分團後全域 role 不再代表任何身分，只有 teams.{team}.role 才是真的）。統一改用
// 這個函式，之後不會再各自維護一份容易漏改的複本
//
// ⚠️ 呼叫前務必確認要的是「任一團」還是「目前切換中的那一團」——這裡是「任一團」，
// 下面簽名一模一樣的 hasActiveTeamRole() 才是「只看目前切換中那一團」，兩者選錯不會
// 有任何錯誤訊息，只會默默放行/擋下錯的人。只有「管的資源本身兩團共用」的情境
// （canManageSheetMusic/canViewAllSheetMusic/canManageEventTypes、意見回饋、
// 「任一團 admin 都能看到審核待辦通知」這幾個既有例外）才該用這個「任一團」版本；
// 「後台頁面能不能進去、能不能編輯」這類跟「現在瀏覽的是哪一團」有關的判斷，一律用
// hasActiveTeamRole()
export function hasAnyTeamRole(profile, role) {
  return !!(profile && profile.teams && Object.keys(profile.teams).some(function (team) {
    return profile.teams[team] && profile.teams[team].role === role;
  }));
}

// 通用小函式：回傳「某個成員」（不一定是目前登入這個人，可以是清單裡任何一筆 users
// 文件資料）在「指定那一團」的角色，沒有就預設 'member'。9/20 抽出來共用——
// members-admin.html／roles-admin.html／member-stats-admin.html 三個檔案各自手刻
// `(data.teams && data.teams[team] && data.teams[team].role) || 'member'` 這段一模一樣
// 的邏輯，抽成這裡一份，三邊改叫這個函式，之後預設值或查找方式要調整只需要改一個地方
export function roleInTeam(data, team) {
  return (data && data.teams && data.teams[team] && data.teams[team].role) || 'member';
}

// 通用小函式：回傳這個人在「目前切換中的那一團」（getActiveTeam()）的 teams.{team} 物件
// （沒有就回傳 null）。9/20 新增——後台頁面的門檻本來大多用 hasAnyTeamRole()/
// hasTeamPermission() 的「任一團」聯集邏輯，但「角色身分」（admin/conductor）跟
// canManageRoles/canManageFinance 這種依團別各自獨立授權的權限，正確的門檻應該是
// 「目前作用中的那一團」有沒有這個身分/權限，不是「隨便哪一團有就放行」——不然雙團籍
// 帳號只要在其中一團是 admin，切到另一團（自己只是一般團員）仍然能進整個後台。
// canManageSheetMusic/canViewAllSheetMusic/canManageEventTypes 這三個「管的資源本身
// 兩團共用」的旗標不適用這個函式，維持原本 hasTeamPermission() 的任一團判斷（見上方註解）
export function activeTeamData(profile) {
  var team = getActiveTeam(profile);
  return (profile && profile.teams && profile.teams[team]) || null;
}

// 通用小函式：這個人在「目前切換中的那一團」的團別身分是不是某個角色。跟 hasAnyTeamRole()
// 簽名故意一樣（方便直接替換），差別是這個只看 activeTeam，不是任一團——後台入口的連結/
// 圖示是否顯示，應該跟目的頁面的門檻（已經改成只看 activeTeam）一致，不然連結點了會被彈回
// 首頁，使用者以為連結故意顯示卻按不進去，體驗上比直接不顯示更奇怪
//
// ⚠️ 這是預設該用的版本——「後台頁面能不能進去/編輯」「導覽連結/圖示要不要顯示」這類
// 判斷都用這個。只有明確屬於「兩團共用資源」的少數例外才改用上面的 hasAnyTeamRole()，
// 見它自己的註解列出的例外清單
export function hasActiveTeamRole(profile, role) {
  var teamData = activeTeamData(profile);
  return !!(teamData && teamData.role === role);
}

// 通用小函式：owner 一律放行；不是 owner 的話，看「目前切換中的那一團」的資料是否符合
// predicate（沒有該團資料就一律不放行）。9/20 抽出來共用——原本 requireAdminOrConductor/
// requireFinanceManager/requireAdminOrTeamAdmin/requireCanManageRoles/
// requireSectionLeader 這 5 個函式各自重複「owner 短路 + 沒有 teamData 就擋下來」這幾行，
// 還各自寫了兩種不同寫法（有的用 !!(teamData && ...)，有的用 if(!teamData) return false）。
// 統一走這個函式之後，只有 predicate 那一行需要各自不同，其餘骨架只有一份，以後要調整
// owner 短路或「沒有 activeTeam 資料」的規則，改這裡一個地方就好
function ownerOrActiveTeamPredicate(profile, predicate) {
  if (!profile) return false;
  if (profile.role === "owner") return true;
  var teamData = activeTeamData(profile);
  return !!(teamData && predicate(teamData));
}

// 藏譜管理頁面（repertoire-admin.html）用：必須登入、審核通過，且「role 是 owner」或「在
// 任一團被個別授予 canManageSheetMusic 權限」（例如譜務）。9/22 修正：拿掉「role 是 admin
// 就放行」這條——canManageSheetMusic 是獨立的權限旗標，跟 canManageRoles 對 roles-admin.html
// 的把關同一個原則，admin 身分本身不該自動繼承這個權限，早期還沒把權限旗標拆細的時候
// 留下的寬鬆判斷，這輪一併收緊（藏譜資料兩團共用，所以維持看「任一團」，跟 canManageRoles
// 收緊到只看目前切換中那一團不同，理由見 TEAM_PERMISSION_DEFS 的設計說明）
export async function requireSheetMusicManager() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return !!p && (p.role === "owner" || hasTeamPermission(p, 'canManageSheetMusic'));
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
}

// 財務管理頁面（finance-admin.html）用：必須登入、審核通過，且「role 是 owner」或「在目前
// 切換中的那一團被個別授予 canManageFinance 權限」（例如財務職位）。9/20 修正：從「任一團
// 有身分/權限就放行」改成「目前切換中的那一團」——財務資料本來就是兩團完全獨立結算（見
// financeSettings_alumni/school 各自獨立文件）。9/22 修正：再拿掉「該團 role 是 admin 就
// 放行」這條——canManageFinance 是獨立的權限旗標，admin 身分不該自動繼承，早期還沒把權限
// 旗標拆細時留下的寬鬆判斷，這輪收緊成跟 canManageRoles 對 roles-admin.html 同一個原則
export async function requireFinanceManager() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return ownerOrActiveTeamPredicate(p, function (teamData) {
      return teamData.permissions && teamData.permissions.canManageFinance === true;
    });
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
}

// 公告管理頁面（announce-admin.html），以及 admin-index.html/members-admin.html/
// roster-admin.html/event-admin.html/stats-admin.html/concert-stats-admin.html/
// checkin-stats-admin.html/member-stats-admin.html 這 8 個「內容依團別各自獨立」的
// 後台頁面共用：必須登入、審核通過，且「role 是 owner」或「目前切換中的那一團身分是
// admin」。9/20 修正（雙團籍帳號的重要缺口）：原本看「任一團」，導致校友團 admin
// 切到自己只是一般團員的校內團後，仍然通過這裡進到校內團的後台——這批頁面顯示/操作的
// 內容本來就是依 activeTeam 決定看哪一團的資料，門檻理所當然也要看「現在是哪一團」，
// 不是「隨便哪一團有身分就放行」。review-admin.html（跨團審核佇列，內部本來就用
// currentAdminTeams 依實際團別身分各自過濾，不受 activeTeam 影響）跟 feedback-admin.html
// （意見回饋是兩團共用的單一信箱，不分團）改用 requireAdmin()，不受這次修正影響
export async function requireAdminOrTeamAdmin() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return ownerOrActiveTeamPredicate(p, function (teamData) {
      return teamData.role === "admin";
    });
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
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

// roles-admin.html 專用頁面守門：必須登入、審核通過，且「role 是 owner」或「在目前切換中
// 的那一團有 canManageRoles 權限」。9/19 收尾計畫：取代原本 requireAdmin()（全域 role）+
// 額外的全域 canManageRoles 檢查兩層邏輯，讓「只在某團有角色管理權限、全域角色不是
// admin/owner」的人也能真正使用這個頁面管理自己團的角色。9/20 修正：從「任一團有這個
// 權限就放行」改成只看目前切換中的那一團——這頁的成員清單本來就已經依 activeTeam 篩選
// （見 roles-admin.html 的查詢），只在校友團有 canManageRoles 的人切到校內團後，看到的
// 會是完全唯讀（幫別人編輯校內團身分的權限本來就沒有），乾脆在門檻擋下來，不要讓他進
// 一個什麼都不能編輯的頁面。（頁面內部 canManageRolesForTeam() 檢查的是「正在編輯的那個
// 成員的某個團籍分頁」，用途不同、繼續保留，兩者不衝突）
export async function requireCanManageRoles() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return ownerOrActiveTeamPredicate(p, function (teamData) {
      return teamData.permissions && teamData.permissions.canManageRoles === true;
    });
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
}

// 分部長專屬頁面（section-admin.html）用：必須登入、審核通過，且「role 是 owner」或「目前
// 切換中的那一團身分是 admin」或「在那一團被指派為分部長」。9/20 修正：從「任一團有身分
// 就放行／sectionLeaderFor 任一團有值就放行」改成只看目前切換中的那一團——這頁本來就是
// 依 activeTeam 篩選音樂會清單（見 section-admin.html 自己的 viewerSectionLeaderFor
// 只取 teams[activeTeam].sectionLeaderFor），門檻理所當然要跟頁面實際瀏覽範圍一致
export async function requireSectionLeader() {
  var user = await waitForAuthUser();
  if (!user) {
    clearProfileCache();
    goToLogin();
    return null;
  }

  function isAllowed(p) {
    return ownerOrActiveTeamPredicate(p, function (teamData) {
      return teamData.role === "admin" || (Array.isArray(teamData.sectionLeaderFor) && teamData.sectionLeaderFor.length > 0);
    });
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
  return { uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
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
  return { state: profile.status, uid: user.uid, profile: profile, activeTeam: getActiveTeam(profile) };
}

// redirectTo 選填，預設是登入頁（給其他 8 個後台頁面用，登出後本來就該回登入頁）。
// profile.html 傳 'profile.html'，讓訪客登出後留在原地看到訪客版個人中心，
// 而不是被強制導去登入頁——這是這次開放訪客瀏覽後才需要的差異，其他呼叫端不受影響
export async function logout(redirectTo) {
  clearProfileCache();
  await signOut(auth);
  location.href = redirectTo || "login.html";
}
