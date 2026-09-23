/**
 * PWA standalone 模式沒有原生下拉重整手勢，自己刻一個。
 * 一般瀏覽器分頁本來就有原生下拉重整，這裡只在「加到主畫面」的 standalone 模式生效，
 * 避免跟原生手勢重複。
 *
 * 使用方式：頁面 </body> 前引入 <script src="./pull-refresh.js" defer></script>
 */
(function () {
  function isStandalone() {
    return window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
  }
  if (!isStandalone()) return;

  var PULL_THRESHOLD = 70; // 拉超過這個距離放開才觸發重整
  var MAX_PULL = 110;
  // 9/23 追加修正：指示器收合時原本位移 -40px，圓形本體 36px 高 + box-shadow（4px 位移
  // +12px 模糊，實際暈開範圍粗抓「位移+模糊」約 16px）合計要位移超過 52px 才能讓陰影
  // 完全移出視窗上緣，-40px 不夠深，陰影的模糊尾端會一直露在頂部邊界，不是只有取消
  // 手勢那個瞬間才這樣——只要指示器 DOM 建立過（拉過一次），平常收合狀態就一直存在這個
  // 殘留陰影。改成 -64px，留一點安全餘裕
  var HIDDEN_Y = -64;
  var startY = null;
  var pulling = false;
  var triggered = false;
  var indicator = null;
  var scrollParent = null;

  // 判斷某元素本身是否為「可獨立捲動」的容器（例如 Bottom Sheet / Modal 內層清單），
  // 而不只是頁面本身的捲動位置——避免手指其實在 sheet 內容裡捲動，卻被誤判成在頁面頂端下拉。
  function isScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    var overflowY = window.getComputedStyle(el).overflowY;
    return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
  }

  function findScrollParent(el) {
    var node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (isScrollable(node)) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function ensureIndicator() {
    if (indicator) return indicator;
    var style = document.createElement('style');
    style.textContent =
      '.pull-refresh-indicator{position:fixed;top:0;left:50%;' +
      'transform:translate(-50%,' + HIDDEN_Y + 'px);width:36px;height:36px;border-radius:50%;' +
      'background:var(--paper-raised,#FBFAF4);box-shadow:0 4px 12px rgba(32,36,47,.2);' +
      'display:flex;align-items:center;justify-content:center;z-index:600;' +
      'transition:transform .15s ease;}' +
      '.pull-refresh-indicator.spin svg{animation:pull-refresh-spin .8s linear infinite;}' +
      '@keyframes pull-refresh-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(style);
    indicator = document.createElement('div');
    indicator.className = 'pull-refresh-indicator';
    // 圓弧箭頭圖示，跟 ios-install.js 的 ICON_SHARE 同一套線條風格與色號
    indicator.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66" stroke="#B8863A" stroke-width="1.8" stroke-linecap="round"/>' +
        '<path d="M18 3v4h-4M6 21v-4h4" stroke="#B8863A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    document.body.appendChild(indicator);
    return indicator;
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { startY = null; return; }
    scrollParent = findScrollParent(e.target);
    if (scrollParent.scrollTop > 0) { startY = null; return; }
    startY = e.touches[0].clientY;
    pulling = false;
    triggered = false;
  }, { passive: true });

  // 收回指示器：拉到一半沒放開就放棄，或整個手勢被取消時都要呼叫——不能只是靜默不管，
  // 指示器會停在上一次還是正 delta 時的位置卡住不動
  function resetIndicator() {
    if (indicator) indicator.style.transform = 'translate(-50%,' + HIDDEN_Y + 'px)';
  }

  document.addEventListener('touchmove', function (e) {
    if (startY == null) return;
    var delta = e.touches[0].clientY - startY;
    if (delta <= 0 || (scrollParent && scrollParent.scrollTop > 0)) {
      // 9/23 修正：手指往回滑（delta 由正轉負/回到 0）時，原本只是把 startY 設回 null、
      // 靜默 return，沒有把指示器收回去。同一次觸控後續的 touchmove 都會被上面
      // 「startY == null」那行擋掉，不會再有機會收回；如果瀏覽器接手變成原生捲動、
      // 這次觸控收尾時觸發的是 touchcancel 不是 touchend（方向反轉時常見），
      // 下面 touchend 那段收回邏輯完全不會執行，指示器（含它的陰影）就真的卡在畫面上，
      // 要等下一次成功觸發或放棄的下拉手勢才會被蓋掉
      if (pulling) resetIndicator();
      startY = null;
      pulling = false;
      return;
    }

    pulling = true;
    e.preventDefault(); // 蓋掉原生彈跳效果，改用自己的視覺回饋
    var dist = Math.min(delta, MAX_PULL);
    ensureIndicator().style.transform = 'translate(-50%,' + (dist + HIDDEN_Y) + 'px)';
    triggered = delta >= PULL_THRESHOLD;
  }, { passive: false });

  document.addEventListener('touchend', function () {
    if (!pulling) { startY = null; return; }
    if (triggered) {
      var el = ensureIndicator();
      el.classList.add('spin');
      el.style.transform = 'translate(-50%,30px)';
      location.reload();
    } else {
      resetIndicator();
    }
    startY = null;
    pulling = false;
  }, { passive: true });

  // 9/23 新增：手勢被瀏覽器取消時（例如上面提到的方向反轉、交還捲動控制權給原生行為）
  // 觸發的是這個事件，不是 touchend，原本完全沒有處理，是指示器卡住的另一個成因
  document.addEventListener('touchcancel', function () {
    if (pulling) resetIndicator();
    startY = null;
    pulling = false;
  }, { passive: true });
})();
