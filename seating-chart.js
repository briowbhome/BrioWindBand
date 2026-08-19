import {
  doc, onSnapshot, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { DEFAULT_INSTRUMENTS } from "./instruments.js";

// 座位圖分區清單，比照 settings/instruments 的「後台可調整清單」架構。
// row：第幾排同心弧線，1 是離指揮最近那排，數字越大越後排——真實座位是好幾排弧線疊起來，
// 不是單一排，這個欄位就是用來表達「排」這個維度，同一排內用陣列順序決定左右位置。
// 預設值沒有真實座位配置可以參考，所有非打擊樂器先全部塞在第 1 排，等後台編輯器排過
// 一次才會是真正的排法；percussion 一律獨立畫成最上方矩形，不需要 row。
// weight：同排內的寬度權重，預設 1（平均分配），數字越大這塊佔的角度越寬——
// 沒有這個欄位以前同排一律平均切角度，加上這個才能照真實座位比例微調寬度
export var DEFAULT_SECTIONS = DEFAULT_INSTRUMENTS.map(function (inst, i) {
  return {
    zoneId: "z" + i,
    instrumentName: inst.name,
    label: "",
    percussion: inst.family === "percussion",
    row: inst.family === "percussion" ? null : 1,
    weight: 1
  };
});

var seeded = false;

function seedDefaults(db) {
  if (seeded) return;
  seeded = true;
  setDoc(doc(db, "settings", "seatingSections"), {
    sections: DEFAULT_SECTIONS,
    updatedAt: serverTimestamp()
  }).catch(function () {});
}

// callback(sections) 每次異動都會呼叫，sections 是 [{zoneId, instrumentName, label, percussion}] 陣列
// seedIfMissing 傳 true 才會在文件不存在時嘗試建立內建預設清單，用法跟 subscribeInstruments 一致
export function subscribeSeatingSections(db, callback, seedIfMissing, onError) {
  return onSnapshot(doc(db, "settings", "seatingSections"), function (snap) {
    if (snap.exists()) {
      callback(snap.data().sections || []);
    } else {
      callback(DEFAULT_SECTIONS);
      if (seedIfMissing) seedDefaults(db);
    }
  }, onError);
}

// 一次性讀取版本，conductor-admin.html 是一次性查詢頁面，不需要常駐監聽
export async function getSeatingSectionsOnce(db) {
  var snap = await getDoc(doc(db, "settings", "seatingSections"));
  return snap.exists() ? (snap.data().sections || []) : DEFAULT_SECTIONS;
}

// 排序/新增/刪除都是整份覆寫，用法跟 setInstrumentsOrder 一致——分區清單很小，
// 不需要 arrayUnion/arrayRemove 那套局部更新
export function setSeatingSections(db, sections) {
  return setDoc(doc(db, "settings", "seatingSections"), {
    sections: sections,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
