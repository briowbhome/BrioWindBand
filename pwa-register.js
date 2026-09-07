if ('serviceWorker' in navigator) {
  var hadControllerAtLoad = !!navigator.serviceWorker.controller;

  // 這次載入時如果本來就有 SW 在控制頁面，controllerchange 代表換成新版本了；
  // 如果一開始沒有 controller（第一次安裝 SW），這個事件只是初次接管，不算新版本，不用提示。
  // sw.js 的 fetch 改成快取優先後，部署新版本使用者不會馬上看到，靠這個提示讓他知道並主動更新
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadControllerAtLoad) showUpdateBanner();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

function showUpdateBanner() {
  var style = document.createElement('style');
  style.textContent =
    '.sw-update-banner{position:fixed;left:50%;bottom:calc(72px + env(safe-area-inset-bottom));' +
    'transform:translate(-50%,130%);width:min(92vw,380px);z-index:500;' +
    'background:var(--ink,#20242F);color:var(--paper,#F2EFE5);border-radius:12px;' +
    'box-shadow:0 10px 24px rgba(32,36,47,.3);padding:12px 14px;display:flex;gap:10px;' +
    'align-items:center;font-family:"Noto Sans TC","Noto Sans",sans-serif;' +
    'transition:transform .35s cubic-bezier(.16,1,.3,1);}' +
    '.sw-update-banner.show{transform:translate(-50%,0);}' +
    '.sw-update-banner .msg{flex:1;font-size:12.5px;font-weight:600;}' +
    '.sw-update-banner button{flex:none;border:none;border-radius:999px;padding:7px 14px;' +
    'font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}' +
    '.sw-update-banner .update-btn{background:var(--brass,#B8863A);color:var(--ink,#20242F);}' +
    '.sw-update-banner .dismiss-btn{background:none;color:var(--paper,#F2EFE5);opacity:.7;}';
  document.head.appendChild(style);

  var banner = document.createElement('div');
  banner.className = 'sw-update-banner';
  banner.innerHTML =
    '<div class="msg">有新版本可用</div>' +
    '<button type="button" class="update-btn">立即更新</button>' +
    '<button type="button" class="dismiss-btn" aria-label="稍後再說">✕</button>';
  document.body.appendChild(banner);
  requestAnimationFrame(function () { banner.classList.add('show'); });

  banner.querySelector('.update-btn').addEventListener('click', function () {
    location.reload();
  });
  banner.querySelector('.dismiss-btn').addEventListener('click', function () {
    banner.classList.remove('show');
    setTimeout(function () { banner.remove(); }, 350);
  });
}
