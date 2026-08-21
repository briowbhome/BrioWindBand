// Web Push 訂閱用的 VAPID 公鑰，讓瀏覽器的 pushManager.subscribe() 產生的訂閱綁定這個身分。
// 公鑰是公開資訊，可以放進程式碼；對應的私鑰只有使用者自己保管，不會出現在這個 repo 裡，
// 之後真的要做 Cloud Functions 送推播時才會用到私鑰簽署請求。
export var VAPID_PUBLIC_KEY = 'BJk_UZDGo3M8IK3S16WtWavAWVvpOW5j741CuMDsZ2PR_KYIERn-a3A4zy5EiaO5icN7Aa3QbVdKxi7QHt8hh6g';
