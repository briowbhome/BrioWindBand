import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

// callback(pieces) 每次 repertoire 有變動都會呼叫，pieces 是
// [{id, title, composer, parts, fullScoreUrl, fullScoreUploadedBy}]。
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
        parts: data.parts || [],
        fullScoreUrl: data.fullScoreUrl || null,
        fullScoreUploadedBy: data.fullScoreUploadedBy || null
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

// 樂譜檔案固定路徑 repertoire/{pieceId}/{partId}.pdf（只收 PDF、20MB 上限，
// storage.rules 有同樣的限制），重新上傳直接覆蓋同路徑檔案，前端不用另外清理舊檔
export function uploadPartSheetMusic(storage, pieceId, partId, file) {
  var fileRef = ref(storage, "repertoire/" + pieceId + "/" + partId + ".pdf");
  return uploadBytes(fileRef, file, { contentType: "application/pdf" }).then(function () {
    return getDownloadURL(fileRef);
  });
}

// 總譜（指揮用、全部分部合一的版本）掛在曲目層級，不屬於任何 partId，固定路徑
// repertoire/{pieceId}/full-score.pdf，跟分部譜共用同一份 storage.rules 大小/型別限制
export function uploadFullScore(storage, pieceId, file) {
  var fileRef = ref(storage, "repertoire/" + pieceId + "/full-score.pdf");
  return uploadBytes(fileRef, file, { contentType: "application/pdf" }).then(function () {
    return getDownloadURL(fileRef);
  });
}

// 總譜的 URL/上傳者存在曲目文件的頂層欄位（不是陣列元素），只更新這兩個欄位，
// 不動 title/composer/parts
export function updateFullScore(db, pieceId, url, uploadedBy) {
  return updateDoc(doc(db, "repertoire", pieceId), {
    fullScoreUrl: url,
    fullScoreUploadedBy: uploadedBy
  });
}

// sheetMusicUrl/fullScoreUrl 都是 getDownloadURL() 回傳的下載連結，Firebase SDK 的
// ref() 可以直接從這種 https 下載連結反推出 Storage 物件參照，不用另外存一份路徑欄位，
// 這個函式對分部譜、總譜通用
export function deletePartSheetMusic(storage, sheetMusicUrl) {
  return deleteObject(ref(storage, sheetMusicUrl));
}
