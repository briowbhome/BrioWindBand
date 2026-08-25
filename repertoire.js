import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// callback(pieces) 每次 repertoire 有變動都會呼叫，pieces 是 [{id, title, composer, parts}]。
// 沒有 order 欄位（曲目資料庫本身不需要排序，排序是「音樂會裡的曲目」才有的概念，見
// concerts/{concertId}/pieces 的 order 欄位），讀取端自行依 title 排序顯示
export function subscribeRepertoire(db, callback, onError) {
  return onSnapshot(collection(db, "repertoire"), function (snap) {
    callback(snap.docs.map(function (docSnap) {
      var data = docSnap.data();
      return {
        id: docSnap.id,
        title: data.title,
        composer: data.composer || null,
        parts: data.parts || []
      };
    }));
  }, onError);
}

export function addPiece(db, uid, title, composer, parts) {
  return addDoc(collection(db, "repertoire"), {
    title: title,
    composer: composer || null,
    parts: parts,
    createdBy: uid,
    createdAt: serverTimestamp()
  });
}

export function updatePiece(db, pieceId, title, composer, parts) {
  return updateDoc(doc(db, "repertoire", pieceId), {
    title: title,
    composer: composer || null,
    parts: parts
  });
}

export function deletePiece(db, pieceId) {
  return deleteDoc(doc(db, "repertoire", pieceId));
}

// 分部欄位的 partId：比照 checkinSessions 隨機碼（randomCheckinCode，event-admin.html）
// 同樣用 crypto.getRandomValues 產生，長度縮短到 6 bytes（12 hex 字元）足夠避免同一首曲子
// 內碰撞，不需要跟簽到碼一樣長
export function randomPartId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6))).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
