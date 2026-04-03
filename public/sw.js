// 요가피안 서비스워커 — PWA 설치 + 웹 푸시 수신

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// 푸시 메시지 수신 → 알림 표시
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '요가피안';
  const body  = data.body  || '';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/icon.png',
      badge: '/icon.png',
      data:  { url: '/' },
    })
  );
});

// 알림 클릭 → 앱 포커스 또는 열기
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin)) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
