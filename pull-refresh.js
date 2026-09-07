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
  var startY = null;
  var pulling = false;
  var triggered = false;
  var indicator = null;

  function ensureIndicator() {
    if (indicator) return indicator;
    var style = document.createElement('style');
    style.textContent =
      '.pull-refresh-indicator{position:fixed;top:0;left:50%;' +
      'transform:translate(-50%,-40px);width:36px;height:36px;border-radius:50%;' +
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
    if (document.scrollingElement.scrollTop > 0 || e.touches.length !== 1) { startY = null; return; }
    startY = e.touches[0].clientY;
    pulling = false;
    triggered = false;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (startY == null) return;
    var delta = e.touches[0].clientY - startY;
    if (delta <= 0 || document.scrollingElement.scrollTop > 0) { startY = null; return; }

    pulling = true;
    e.preventDefault(); // 蓋掉原生彈跳效果，改用自己的視覺回饋
    var dist = Math.min(delta, MAX_PULL);
    ensureIndicator().style.transform = 'translate(-50%,' + (dist - 40) + 'px)';
    triggered = delta >= PULL_THRESHOLD;
  }, { passive: false });

  document.addEventListener('touchend', function () {
    if (!pulling) { startY = null; return; }
    var el = ensureIndicator();
    if (triggered) {
      el.classList.add('spin');
      el.style.transform = 'translate(-50%,30px)';
      location.reload();
    } else {
      el.style.transform = 'translate(-50%,-40px)';
    }
    startY = null;
    pulling = false;
  }, { passive: true });
})();
