import {
  collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 固定的十種徽章顏色主題，不開放自訂色碼，維持視覺統一
export var COLOR_THEMES = {
  sage: { bg: "var(--sage-bg)", text: "var(--sage)" },
  brass: { bg: "#EFE7D2", text: "var(--brass-deep)" },
  burgundy: { bg: "var(--burgundy)", text: "#F2EFE5" },
  slate: { bg: "#E3E1D8", text: "var(--ink-soft)" },
  navy: { bg: "#E4E9F2", text: "#33507D" },
  plum: { bg: "#F0E3EE", text: "#7C3F6C" },
  teal: { bg: "#DFEEEA", text: "#2F6D5F" },
  terracotta: { bg: "#F5E2D6", text: "#A8532E" },
  mustard: { bg: "#F7EACD", text: "#8F6D12" },
  rose: { bg: "#F6E1E6", text: "#A13F5C" }
};

var DEFAULT_TYPES = [
  { id: "rehearsal", label: "排練", colorKey: "sage", order: 1, homeHighlight: true },
  { id: "sectional", label: "分部練", colorKey: "brass", order: 2, homeHighlight: false },
  { id: "performance", label: "演出", colorKey: "burgundy", order: 3, homeHighlight: false }
];

var seeded = false;

function seedDefaults(db, uid) {
  if (seeded) return;
  seeded = true;
  DEFAULT_TYPES.forEach(function (t) {
    setDoc(doc(db, "eventTypes", t.id), {
      label: t.label,
      colorKey: t.colorKey,
      order: t.order,
      homeHighlight: t.homeHighlight,
      createdBy: uid,
      createdAt: serverTimestamp()
    }).catch(function () {});
  });
}

// callback(types) 每次 eventTypes 有變動都會呼叫，types 依 order 排序
// seedIfEmptyUid：傳目前登入者 uid 才會在清單是空的時候自動建立內建三種類型；
// 沒有寫入權限的人傳了也沒差，寫入會被 Firestore 規則擋掉、靜默失敗
export function subscribeEventTypes(db, callback, seedIfEmptyUid) {
  var firstSnapshot = true;
  return onSnapshot(query(collection(db, "eventTypes"), orderBy("order", "asc")), function (snap) {
    if (firstSnapshot) {
      firstSnapshot = false;
      if (snap.empty && seedIfEmptyUid) seedDefaults(db, seedIfEmptyUid);
    }
    callback(snap.docs.map(function (docSnap) {
      var data = docSnap.data();
      return {
        id: docSnap.id,
        label: data.label,
        colorKey: data.colorKey,
        order: data.order,
        homeHighlight: !!data.homeHighlight
      };
    }));
  });
}

export function badgeStyle(colorKey) {
  var theme = COLOR_THEMES[colorKey] || COLOR_THEMES.slate;
  return "background:" + theme.bg + ";color:" + theme.text + ";";
}
