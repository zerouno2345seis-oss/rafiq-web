/* ==========================================================================
   رفيق — Progressive Web App Service Worker (v1.17)
   ========================================================================== */

const CACHE_NAME = 'rafiq-pwa-v1.17';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// تثبيت عامل الخدمة وتخزين الأصول الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// تفعيل وتطهير الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية جلب البيانات الذكية
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. تجاوز أي طلب غير GET أو اتصالات Supabase API / WebSockets لضمان حداثة البيانات السحابية الحية
  if (req.method !== 'GET' || url.hostname.includes('supabase.co') || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // 2. خطوط جوجل (Google Fonts): تخزين مؤقت لسرعة التحميل بدون اتصال
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. صفحات الملاحة (HTML): شبكة أولاً (Network First) مع الرجوع إلى الكاش عند انقطاع الاتصال
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkRes;
      }).catch(() => {
        return caches.match(req).then((cached) => {
          return cached || caches.match('/index.html') || caches.match('/');
        });
      })
    );
    return;
  }

  // 4. الأصول الثابتة والصور: كاش أولاً (Cache First) مع التحديث في الخلفية
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // تحديث في الخلفية
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

// استقبال رسائل التحديث الفوري
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
