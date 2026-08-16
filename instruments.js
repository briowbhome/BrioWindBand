import {
  doc, onSnapshot, setDoc, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export var FAMILY_LABELS = { woodwind: "木管 Woodwind", brass: "銅管 Brass", percussion: "打擊 Percussion", strings: "弦樂 Strings" };
export var FAMILY_ORDER = ["woodwind", "brass", "percussion", "strings"];

export var DEFAULT_INSTRUMENTS = [
  { name: "長笛", family: "woodwind" },
  { name: "雙簧管", family: "woodwind" },
  { name: "單簧管", family: "woodwind" },
  { name: "低音管", family: "woodwind" },
  { name: "薩克斯風", family: "woodwind" },
  { name: "小號", family: "brass" },
  { name: "法國號", family: "brass" },
  { name: "長號", family: "brass" },
  { name: "上低音號", family: "brass" },
  { name: "低音號", family: "brass" },
  { name: "打擊樂", family: "percussion" }
];

var seeded = false;

function seedDefaults(db) {
  if (seeded) return;
  seeded = true;
  setDoc(doc(db, "settings", "instruments"), {
    list: DEFAULT_INSTRUMENTS,
    updatedAt: serverTimestamp()
  }).catch(function () {});
}

// callback(list) 每次異動都會呼叫，list 是 [{name, family}] 陣列
// seedIfMissing 傳 true 才會在文件不存在時嘗試建立內建初始清單（要有寫入權限才會成功，
// 一般團員在註冊頁讀取時不會傳，只會拿到下面的內建清單當畫面顯示用，不會嘗試寫入）
export function subscribeInstruments(db, callback, seedIfMissing) {
  return onSnapshot(doc(db, "settings", "instruments"), function (snap) {
    if (snap.exists()) {
      callback(snap.data().list || []);
    } else {
      callback(DEFAULT_INSTRUMENTS);
      if (seedIfMissing) seedDefaults(db);
    }
  });
}

export function addInstrument(db, name, family) {
  return setDoc(doc(db, "settings", "instruments"), {
    list: arrayUnion({ name: name, family: family }),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function removeInstrument(db, instrument) {
  return setDoc(doc(db, "settings", "instruments"), {
    list: arrayRemove(instrument)
  }, { merge: true });
}

// 調整顯示順序用，整份 list 覆寫（跟 add/remove 的 arrayUnion/arrayRemove 不同，
// 順序調整沒辦法用「加減一筆」表達，只能整份存回去）
export function setInstrumentsOrder(db, list) {
  return setDoc(doc(db, "settings", "instruments"), {
    list: list,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
