## Communication App (UI sabit, backend güçlendirilmiş)

Bu proje Next.js UI + Socket.IO backend içerir. Arayüz tasarımına dokunmadan backend tarafında:
- Modüler socket handler yapısı
- Payload doğrulama (zod)
- Token tabanlı socket auth
- CORS allow-list
- Prisma destekli DB persistence (fallback: JSON store)
- Healthcheck endpoint (`/healthz`)

eklendi.

## Kurulum

```bash
npm install
cp .env.example .env
```

## Geliştirme (tek komut)

```bash
npm run dev
```

Bu komut aynı anda:
- Next.js app (`http://localhost:3000`)
- Socket server (`http://localhost:3001`)

çalıştırır.

## Production benzeri başlatma

```bash
npm run build
npm run start
```

Sadece socket backend çalıştırmak için:

```bash
npm run start:socket:only
```

## Ortam Değişkenleri

`NEXT_PUBLIC_SOCKET_SERVER_URL`: Frontend'in bağlanacağı socket backend adresi  
`INTERNAL_SOCKET_PROXY_URL`: **Sadece** Next ve socket aynı Railway konteynerinde ve `npm start` kullanılıyorsa: `http://127.0.0.1:3001` gibi iç adres; Next `/socket.io` isteklerini buraya proxyleyen rewrite açar. Vercel’de kullanılmaz.  
`NEXT_PUBLIC_SOCKET_PATH`: Socket.IO path (`/socket.io`)  
`NEXT_PUBLIC_SOCKET_AUTH_TOKEN`: Frontend handshake auth token  
`SOCKET_AUTH_TOKEN`: Backend tarafındaki beklenen token  
`ALLOWED_ORIGINS`: CORS için izinli origin listesi (virgülle ayrılmış). Örnek: `https://communication-app-eight.vercel.app,https://*.vercel.app` — ikinci kalıp tüm `*.vercel.app` HTTPS önizleme ve prod alt alan adlarını kabul eder.  
`PERSISTENCE_FILE`: Kalıcı veri dosya yolu  
`PORT`: Tek başına socket çalıştırırken dinlenecek port (ör. Railway’de platform genelde bunu verir).  
`SOCKET_PORT`: **Next + socket aynı konteynerde** (`npm start`) iken socket’in portu; verilmezse `start:socket:stacked` varsayılan olarak `3001` kullanır ki `PORT` ile çakışmasın. Sadece `node server.js` / `start:socket:only` kullanıyorsanız `SOCKET_PORT` tanımlamayın; socket `PORT`’u dinler.  
`DATABASE_URL`: Prisma/PostgreSQL bağlantı adresi (boşsa JSON fallback)

## Backend Dosya Yapısı

- `server.js`: backend giriş noktası
- `backend/config/env.js`: env ve CORS konfigürasyonu
- `backend/http/createHttpServer.js`: health endpoint
- `backend/socket/registerSocketHandlers.js`: tüm socket event handler'ları
- `backend/state/memoryState.js`: anlık kullanıcı/oda state'i
- `backend/persistence/prismaStore.js`: Prisma tabanlı persistence
- `backend/persistence/jsonStore.js`: fallback persistence
- `backend/persistence/createStore.js`: persistence seçim katmanı
- `backend/validation/schemas.js`: event payload şemaları

## Prisma Hazırlığı

```bash
npm run prisma:generate
```

Production'da `DATABASE_URL` verirsen backend otomatik olarak Prisma store kullanır.

## Test

```bash
npm run test
```

Socket entegrasyon testleri:
- message persistence + message history
- nudge everyone akışı

## Healthcheck

Socket backend ayakta mı kontrol etmek için:

```bash
curl http://localhost:3001/healthz
```

Beklenen çıktı:

```json
{"status":"ok"}
```

## Vercel’e deploy

Vercel **yalnızca Next.js** derler ve yayınlar; `server.js` (Socket.IO) Vercel’de sürekli çalışmaz. Üretimde şunlar gerekir:

1. **Socket backend’i ayrı bir Railway (veya benzeri) serviste çalıştırın** ve o serviste **yalnızca socket** dinleyin: start komutu **`npm run start:socket:only`** veya **`node server.js`** olsun (`npm start` / `concurrently` kullanmayın). Aksi halde `PORT` Next.js’e gider; tarayıcı `https://…/socket.io` isteğini Next alır ve **404** döner (konsolda çoğu zaman “CORS” da görünür).  
   - Monolit isteyenler: aynı repoda `INTERNAL_SOCKET_PROXY_URL=http://127.0.0.1:3001` + `npm start` + `NEXT_PUBLIC_SOCKET_SERVER_URL` = sayfanın **aynı** public `https` kökü (detay `next.config.ts` yorumunda).
2. **Vercel ortam değişkenleri** (Settings → Environment Variables), build’den *önce* tanımlı olsun:
   - `NEXT_PUBLIC_SOCKET_SERVER_URL` = socket sunucunuzun genel adresi, örn. `https://socket-app.up.railway.app` (HTTPS sayfa ile **https/wss** kullanın; aksi halde tarayıcı engeller).
   - İsteğe bağlı: `NEXT_PUBLIC_SOCKET_PATH`, `NEXT_PUBLIC_SOCKET_AUTH_TOKEN` (socket tarafında aynı `SOCKET_AUTH_TOKEN`).
3. **Socket sunucusunda (Railway)** `ALLOWED_ORIGINS` örnek: `https://proje-adiniz.vercel.app,https://*.vercel.app` — tam Vercel URL’nizi ve isteğe bağlı tüm Vercel deployment’ları için `https://*.vercel.app` kullanın.  
4. **308 / “CORS yok”**: İstek önce **308 yönlendirmesi** alıyorsa (Railway canonical URL), tarayıcı bazen yönlendirme cevabında CORS başlığı görmediği için aynı hatayı gösterir. **Railway panosundaki** “Public networking” ile verilen **nihai** `https://…` adresini (yönlendirme olmadan açılan) `NEXT_PUBLIC_SOCKET_SERVER_URL` olarak kullanın; gerekirse sondaki `/` veya `www` farkını kaldırın.
5. Kalıcı veri için socket sunucusunda **`DATABASE_URL`** (PostgreSQL) kullanmanız önerilir; sadece JSON dosyası tek makinede ve bazı hostlarda disk anlamlı olmayabilir.

Deploy sonrası socket ayakta mı: `curl https://<socket-host>/healthz`

## Notlar

- UI bileşenlerinde görsel düzen değiştirilmedi.
- `Dürt! (Herkesi)` artık backend'de aynı odadaki tüm diğer kullanıcılara gönderilir.
