import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs";

// pdf.js worker 是 module worker，瀏覽器不允許直接用跨網域網址建立（會丟 SecurityError）。
// worker 內部有些解碼路徑（WASM 相關）還會用「相對於 worker 自身位置」的路徑動態 import，
// 如果用 Blob URL 包一層繞過跨網域限制，這些相對路徑會解析失效，導致 render() 卡住不動。
// 所以直接把 worker 檔案放進專案（同網域），兩個問題一次排除。
pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.mjs";

// 掃描版樂譜常見的黑白 1-bit（CCITT 壓縮）圖片，pdf.js 需要一個 jbig2.wasm 模組才能解碼，
// 但 cdnjs 上的 pdf.js 發布包完全沒附 wasm 檔案——沒設定 wasmUrl 的話，這類掃描頁會直接
// 解碼失敗、整頁變空白（不會噴錯誤，很難察覺）。改用 jsdelivr 的 npm 鏡像，因為它有把
// pdfjs-dist 套件內的 wasm/ 資料夾一起發布出來，版本號要跟上面 pdf.min.mjs 完全對齊。
var PDFJS_WASM_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/wasm/";

// 讀取一份 PDF 檔案，回傳頁數跟每一頁的低解析度縮圖（PNG data URL），給頁碼範圍選取畫面用。
// maxWidthPx 故意用低解析度加快載入速度——縮圖畫質跟切割輸出的實際檔案畫質無關，
// extractPageRanges() 是另外用 pdf-lib 直接複製原始頁面內容，兩者互不影響。
// options.onProgress(current, total) 每渲染完一頁就呼叫一次，給進度條用；
// options.cancelToken 是呼叫端傳入的 { cancelled:false } 物件，每頁渲染前都會檢查，
// 設成 true 就會在下一頁邊界中止並丟出 isCancelled:true 的錯誤（不是真的中途打斷單頁渲染，
// 但已經是渲染迴圈唯一能安全插入檢查點的地方）
export async function renderPdfThumbnails(file, maxWidthPx, options) {
  options = options || {};
  var onProgress = options.onProgress;
  var cancelToken = options.cancelToken;
  var arrayBuffer = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: arrayBuffer, wasmUrl: PDFJS_WASM_URL }).promise;
  var thumbnails = [];
  for (var i = 1; i <= pdf.numPages; i++) {
    if (cancelToken && cancelToken.cancelled) {
      var cancelErr = new Error("使用者取消讀取");
      cancelErr.isCancelled = true;
      throw cancelErr;
    }
    var page = await pdf.getPage(i);
    var baseViewport = page.getViewport({ scale: 1 });
    var scale = maxWidthPx / baseViewport.width;
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    thumbnails.push({ pageNum: i, dataUrl: canvas.toDataURL("image/png") });
    if (onProgress) onProgress(i, pdf.numPages);
  }
  return { pageCount: pdf.numPages, thumbnails: thumbnails };
}

// 依指定的頁碼範圍，把來源 PDF 切成多份獨立檔案（Blob）。用 pdf-lib 的 copyPages() 直接
// 複製原始頁面物件，不重新繪製/壓縮，畫質跟原始合訂本完全一致。ranges 的 key 是呼叫端
// 自訂的識別字串（這個專案用 partId 或 'FULL_SCORE'），回傳結果的 key 一一對應方便呼叫端
// 比對；pdf-lib 的頁碼是 0-indexed，這裡做轉換，呼叫端一律傳 1-indexed
export async function extractPageRanges(file, ranges) {
  var PDFDocument = window.PDFLib.PDFDocument;
  var arrayBuffer = await file.arrayBuffer();
  var sourceDoc = await PDFDocument.load(arrayBuffer);
  var results = [];
  for (var i = 0; i < ranges.length; i++) {
    var range = ranges[i];
    var indices = [];
    for (var p = range.startPage; p <= range.endPage; p++) indices.push(p - 1);
    var outDoc = await PDFDocument.create();
    var copiedPages = await outDoc.copyPages(sourceDoc, indices);
    copiedPages.forEach(function (page) { outDoc.addPage(page); });
    var bytes = await outDoc.save();
    results.push({ key: range.key, blob: new Blob([bytes], { type: "application/pdf" }) });
  }
  return results;
}
