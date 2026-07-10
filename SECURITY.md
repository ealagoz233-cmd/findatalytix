# Güvenlik Politikası ve Tehdit Modeli

> Bu belge FinDatalytix'in güvenlik duruşunu **dürüstçe** tanımlar: neyin
> korunduğunu, neyin bilinçli olarak kapsam dışı olduğunu ve platform büyüdükçe
> hangi kontrollerin devreye gireceğini. Amaç "güvenli görünmek" değil, riski
> gerçekçi ölçüp doğru katmanda önlem almaktır.

## 1. Güvenlik Duruşu (Ne olduğu, ne olmadığı)

FinDatalytix şu an bir **finansal analiz ve araştırma aracıdır** — bir bankacılık
veya custodial (varlık saklayan) platform **değildir**. Bu ayrım, tehdit modelinin
temelidir:

| Sistemde **YOK** | Dolayısıyla kapsam dışı |
|---|---|
| Kullanıcı hesabı / parola | Argon2id hash, oturum çalma, MFA |
| Sunucu tarafı bakiye / PII veritabanı | AES-256 at-rest şifreleme, IDOR |
| Para transferi / işlem | Race-condition kilitleri, çift-çekim |
| Kredi kartı / CVV | PCI-DSS, tokenization |

Kullanıcının portföyü **yalnızca kendi tarayıcısında** (localStorage) tutulur;
sunucuya hiç gönderilmez. Bu, bilinçli bir gizlilik kararıdır — saklamadığımız
veriyi sızdıramayız.

## 2. Saldırı Yüzeyi ve Tehdit Modeli

Gerçek risk yüzeyi, backend **halka açıldığında** (deploy) ortaya çıkar. Öncelikli
tehditler ve karşılıkları:

| Tehdit | Etki | Kontrol |
|---|---|---|
| Endpoint kötüye kullanımı (bot/flood) | Groq kotasının yakılması, Yahoo Finance ban'ı, DoS | **Rate limiting** (IP başına, `/simulate` & `/report` için sıkı) |
| Kötü/zararlı girdi (injection) | Bozuk davranış, çökme | **Katı şema doğrulaması** (Pydantic) + sınır kontrolleri |
| Path traversal (dosya endpoint'leri) | Sunucu dosyalarına erişim | Dosya adı `Path(...).name` ile temizlenir |
| Zararlı yükleme | Depolama/işlem istismarı | Tür (.pdf/.docx) + boyut (20 MB) beyaz listesi |
| Bilgi sızıntısı (hata mesajları) | Şema/stack trace ifşası | Genel hata yakalayıcı → istemciye sızıntısız `{"detail":"..."}` |
| Anahtar sızıntısı | API kötüye kullanımı, maliyet | `.env` git-ignore'da; geçmiş anahtar-deseni için tarandı |
| Clickjacking (arayüz) | — | Statik barındırıcı seviyesinde ele alınır (deploy) |

## 3. Uygulanan Kontroller

- ✅ **Rate limiting** — bellek-içi, IP başına kayan pencere; pahalı uçlar
  (`/simulate`, `/report`, belge yükleme) için daha sıkı. `429 + Retry-After`.
  IP tespiti `X-Forwarded-For`'un **son** durağından (ilk durak istemci
  tarafından sahtelenebilir — limit atlatma vektörü, 10 Tem denetiminde
  kapatıldı). Kova sözlüğü eşik aşımında süpürülür (bellek hijyeni).
- ✅ **Gövde freni** — `Content-Length > 25 MB` iddiası gövde okunmadan `413`
  ile reddedilir (RAM koruması).
- ✅ **Zero-trust girdi doğrulama** — tüm gövdeler Pydantic ile; `topK` 1–20,
  `chunkTarget` 300–1200, `prompt` ≤ 2000, rapor `aiText` ≤ 40000 gibi katı sınırlar.
- ✅ **Güvenli hata yönetimi** — beklenmeyen hatada gerçek sebep yalnızca sunucu
  logunda; istemciye genel, bilgi vermeyen JSON.
- ✅ **Güvenlik başlıkları** — `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (kamera/mikrofon/konum kapalı).
  `X-Frame-Options: SAMEORIGIN` yalnız deploy kipinde (`CORS_ORIGINS`
  ayarlıyken) eklenir: canlıda site + PDF iframe'i aynı origin'de olduğundan
  clickjacking freni hiçbir şeyi kırmaz; geliştirmede origin'ler farklı
  olduğundan koşulsuz eklemek kaynak önizlemesini kırardı.
- ✅ **Dosya güvenliği** — yükleme tür/boyut beyaz listesi, servis eden uçlarda
  path-traversal koruması.
- ✅ **Zarif düşüş (zero-crash)** — dış servis (piyasa verisi, AI) kesilse bile
  sistem çökmez; durumu arayüzde dürüstçe bildirir.
- ✅ **Anahtar hijyeni** — sırlar yalnızca `.env`'den (kodda gömülü değil),
  `.env` repoya girmez.
- ✅ **CORS** — geliştirmede açık, deploy'da `CORS_ORIGINS` ortam değişkeni ile
  daraltılır.

## 4. Yol Haritası (Custodial/çok-kullanıcılı sürümde devreye girer)

Platform gerçek kullanıcı hesapları veya varlık saklama içerirse, aşağıdaki
kurumsal kontroller **o katman eklenirken** devreye alınacaktır — erken değil,
doğru zamanda:

- Kimlik doğrulama: `Argon2id` parola hash + `HttpOnly` / `Secure` /
  `SameSite=Strict` çerez tabanlı oturum (token'lar `localStorage`'da tutulmaz).
- Kritik işlemlerde MFA/TOTP.
- Hassas verilerde AES-256 (at-rest) ve mutlak yetki denetimi
  (`WHERE id = :id AND user_id = :current_user`) ile IDOR koruması.
- Değiştirilemez denetim logu (audit / WORM): UTC saat, IP, kullanıcı, işlem.
- TLS 1.3 + HSTS (barındırma katmanında).

## 5. Sorumlu Açıklama (Responsible Disclosure)

Bir güvenlik açığı bulursanız lütfen **herkese açık issue açmadan** doğrudan
iletişime geçin: **ealagoz233@gmail.com**. Makul bir süre içinde yanıt verip
düzeltme planı paylaşmayı taahhüt ederiz.

---

*Bu belge yaşayan bir dokümandır; mimari değiştikçe güncellenir. Son güncelleme:
9 Temmuz 2026.*
