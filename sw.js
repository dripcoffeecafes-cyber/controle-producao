// Service worker: guarda o app no aparelho para abrir rápido e funcionar sem internet.
// Ao publicar uma nova versão, aumente o número abaixo.
const VERSAO = 'producao-v32';
const ARQUIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'store.js',
  'kits.js',
  'leads.js',
  'acesso.js',
  'regras-kit.js',
  'config.js',
  'manifest.webmanifest',
  'marca/logo-blooming-club.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Banco de dados e login do Firebase: sempre direto pela rede (o próprio Firebase cuida do offline)
  if (/googleapis\.com$|firebaseapp\.com$/.test(url.hostname) && !url.hostname.startsWith('fonts.')) return;

  const mesmoSite = url.origin === self.location.origin;
  const cacheavel = mesmoSite || ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!cacheavel) return;

  // Arquivos do app: rede primeiro (pega atualizações), cache se estiver offline.
  // Bibliotecas e fontes externas: cache primeiro.
  if (mesmoSite) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copia = res.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
        return res;
      }))
    );
  }
});
