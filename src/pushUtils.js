// 웹 푸시 구독 유틸리티

const VAPID_PUBLIC_KEY = 'BGd_fHvVVPgRwhbIFNwUcLaSphpFLTODLxb9f7WEXBGijTjwJCyVuLJbcFVUXbxgAWjvg44-8j2sFnwO4-b8Lno';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// 푸시 구독 생성 후 saveFn(memberId, sub) 호출
export async function subscribePush(memberId, saveFn) {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    // 기존 구독 있으면 재사용
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveFn(memberId, sub);
    return true;
  } catch (e) {
    console.warn('push subscribe:', e);
    return false;
  }
}

// 푸시 구독 해제
export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) {
    console.warn('push unsubscribe:', e);
  }
}
