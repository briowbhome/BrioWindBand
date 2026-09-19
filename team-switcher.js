import { getActiveTeam } from './auth-guard.js';

var STYLE_ID = 'team-switcher-style';
var ACTIVE_TEAM_KEY = 'brio_active_team';
var TEAM_LABELS = { alumni: '校友團', school: '校內團' };

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.team-badge{cursor:pointer;font-family:"Roboto Mono",monospace;font-size:11px;font-weight:600;' +
    'letter-spacing:.04em;color:var(--ink-soft);border:1.4px solid var(--line);border-radius:999px;' +
    'padding:5px 12px;background:var(--paper-raised);white-space:nowrap;transition:transform .1s ease;}' +
    '.team-badge.hidden{display:none;}' +
    '.team-badge:active{transform:scale(.95);}';
  document.head.appendChild(style);
}

// 掛在 appbar 上的團別切換徽章。只有雙團籍成員（profile.teamIds.length > 1）才會顯示，
// 單團籍成員完全看不到，#teamBadge 元素維持 HTML 預設的 hidden class 不變。
// 見 docs/superpowers/specs/2026-09-17-events-team-partition-design.md「B. 團別切換機制」
// 9/19 簡化：團別數量固定只有兩個（見 schema.md「不會再擴增第三個」），原本「點擊跳出
// 兩選一面板」對只有兩個選項的情境是多繞一圈，改成點一下直接切到另一團，徽章文字
// 拿掉「▾」（不再有下拉可以展開）
export function initTeamSwitcher(profile) {
  var badge = document.getElementById('teamBadge');
  if (!badge) return;
  var teamIds = (profile && Array.isArray(profile.teamIds)) ? profile.teamIds : [];
  if (teamIds.length <= 1) return;

  ensureStyle();
  var active = getActiveTeam(profile);
  badge.textContent = TEAM_LABELS[active];
  badge.classList.remove('hidden');
  badge.setAttribute('aria-label', '目前顯示' + TEAM_LABELS[active] + '，點擊切換到另一團');

  badge.addEventListener('click', function () {
    var other = teamIds.filter(function (team) { return team !== active; })[0];
    if (!other) return;
    try { localStorage.setItem(ACTIVE_TEAM_KEY, other); } catch (err) {}
    location.reload();
  });
}
