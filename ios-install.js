/**
 * iOS 加入主畫面提示。
 * iOS 上所有瀏覽器都是 WebKit 核心，沒有 beforeinstallprompt 這種原生安裝提示，
 * 只能自己刻一張提示卡片引導使用者手動操作。Safari／Chrome／App 內嵌瀏覽器的
 * 操作路徑不一樣，要分開給文案：
 * - Safari：分享圖示（工具列）→ 加入主畫面
 * - Chrome：iOS 16.4 起，Chrome 分享選單裡的「加入主畫面」也會裝成真正的全螢幕
 *   App（不再是舊版那種還留著網址列的陽春捷徑），所以直接照 Chrome 自己的分享
 *   圖示走即可，不用引導使用者跳去 Safari
 * - App 內嵌瀏覽器（LINE／Facebook／Messenger 等）：完全沒有分享/加入主畫面選項，
 *   要先跳出到外部瀏覽器才能繼續。這些 App 各自的 UA 特徵不同（LINE 是 `Line`，
 *   Facebook／Messenger 是 `FBAN`/`FB_IAB`），但引導文案都一樣，統一用同一個
 *   判斷式處理，之後如果還有其他 App 有一樣的回報，加關鍵字進去就好
 *
 * 使用方式：頁面 </body> 前引入 <script src="./ios-install.js" defer></script>
 */
(function () {
  var DISMISS_KEY = 'brio_ios_install_dismissed';

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isStandalone() {
    return window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
  }

  function isDismissed() {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  }

  // 完全沒有分享/加入主畫面選項的 App 內嵌瀏覽器，要先跳出到外部瀏覽器才能繼續：
  // LINE 的 UA 特徵是 `Line`，Facebook／Messenger 是 `FBAN`（Facebook App Name）或
  // `FB_IAB`（Facebook In-App Browser）。之後如果還有其他 App 有一樣的回報，
  // 在這個判斷式加關鍵字就好，不用另外複製一份文案分支
  function isEmbeddedWebview() {
    return /Line|FBAN|FB_IAB/i.test(navigator.userAgent);
  }

  function isChrome() {
    return /CriOS/.test(navigator.userAgent);
  }

  function shouldShow() {
    return isIOS() && !isStandalone() && !isDismissed();
  }

  function bannerText() {
    if (isEmbeddedWebview()) {
      return {
        headline: '請先用外部瀏覽器開啟，才能加入主畫面',
        sub: '點擊右上角「⋯」選單 → 選擇「用外部瀏覽器開啟」，開啟後再依畫面提示操作'
      };
    }
    if (isChrome()) {
      return {
        headline: '將布利歐管樂團加入主畫面，開啟更快速',
        sub: '點擊分享圖示 → 加入主畫面'
      };
    }
    return {
      headline: '將布利歐管樂團加入主畫面，開啟更快速',
      sub: '點擊下方分享圖示 → 加入主畫面'
    };
  }

  // 分享圖示（方框＋往上箭頭），跟 index.html 其他 UI 圖示同一套線條風格，
  // 直接畫出使用者要點的那個 iOS 分享圖示，比通用的手機/加號 emoji 更有指引性
  var ICON_SHARE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none">' +
      '<path d="M12 3v12" stroke="#B8863A" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M8 7l4-4 4 4" stroke="#B8863A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" stroke="#B8863A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  function ensureStyle() {
    if (document.getElementById('ios-install-style')) return;
    var style = document.createElement('style');
    style.id = 'ios-install-style';
    style.textContent =
      '.ios-install-banner{position:fixed;top:0;left:50%;transform:translate(-50%,-130%);' +
      'width:min(92vw,420px);margin-top:calc(10px + env(safe-area-inset-top));z-index:500;' +
      'background:var(--paper-raised,#FBFAF4);color:var(--ink,#20242F);border-radius:12px;' +
      'border:1px solid var(--brass,#B8863A);' +
      'box-shadow:0 6px 18px -6px rgba(32,36,47,.25);padding:12px 14px;display:flex;gap:10px;' +
      'align-items:flex-start;font-family:"Noto Sans TC","Noto Sans",sans-serif;' +
      'transition:transform .35s cubic-bezier(.16,1,.3,1);}' +
      '.ios-install-banner.show{transform:translate(-50%,0);}' +
      '.ios-install-banner .ico{flex:none;margin-top:1px;}' +
      '.ios-install-banner .body{flex:1;min-width:0;}' +
      '.ios-install-banner .headline{font-size:12.5px;font-weight:700;line-height:1.5;}' +
      '.ios-install-banner .sub{margin-top:3px;font-size:11px;color:var(--ink-soft,#4A4F5C);line-height:1.5;}' +
      '.ios-install-banner .close{flex:none;background:none;border:none;color:var(--ink-soft,#4A4F5C);' +
      'font-size:13px;line-height:1.3;cursor:pointer;padding:2px;}';
    document.head.appendChild(style);
  }

  function createBanner() {
    ensureStyle();
    var text = bannerText();
    var banner = document.createElement('div');
    banner.className = 'ios-install-banner';
    banner.innerHTML =
      '<div class="ico">' + ICON_SHARE + '</div>' +
      '<div class="body">' +
        '<div class="headline"></div>' +
        '<div class="sub"></div>' +
      '</div>' +
      '<button type="button" class="close" aria-label="關閉提示">✕</button>';
    banner.querySelector('.headline').textContent = text.headline;
    banner.querySelector('.sub').textContent = text.sub;
    document.body.appendChild(banner);
    requestAnimationFrame(function () { banner.classList.add('show'); });

    banner.querySelector('.close').addEventListener('click', function () {
      localStorage.setItem(DISMISS_KEY, 'true');
      banner.classList.remove('show');
      setTimeout(function () { banner.remove(); }, 350);
    });
  }

  if (shouldShow()) {
    // 延遲一點再顯示，避免使用者剛進頁面就被提示打擾
    window.addEventListener('load', function () {
      setTimeout(createBanner, 1500);
    });
  }
})();
