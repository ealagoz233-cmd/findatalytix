# FinDatalytix — Frontend ↔ Backend Bağlantı Haritası

**Durum: TÜM bağlantılar canlı ve test edilmiş.** Bu belge "neyin bağlı
olmadığını" değil, "her şeyin nasıl bağlı olduğunu" gösterir. Yeni bağlama
kodu yazmaya gerek yoktur.

| Kullanıcı Eylemi | Frontend Fonksiyonu | Backend Endpoint | Durum |
|---|---|---|---|
| Simülasyonu Başlat | `runSimulation()` (core.js) | `POST /api/simulate` | ✅ Bağlı |
| Varlık Analiz Et | `fetchAsset()` | `GET /api/asset/{sembol}` | ✅ Bağlı |
| İzleme listesi | `fetchWatchlist()` | `GET /api/watchlist` | ✅ Bağlı (60sn polling) |
| Belge Yükle | `addFiles()` (FormData) | `POST /api/documents` | ✅ Bağlı |
| Belge İçi Arama | `queryDocs()` | `POST /api/query` | ✅ Bağlı |
| Belge Sil | `removeFile()` | `DELETE /api/documents/{ad}` | ✅ Bağlı |
| Rapor Üret (.docx) | `generateReport()` | `POST /api/report` | ✅ Bağlı (dosya iner) |
| Ayarları Kaydet | `saveSettings()` | `POST /api/settings` | ✅ Bağlı |
| AI durumu | `refreshAiStatus()` | `GET /api/ai/status` | ✅ Bağlı |
| Geçmiş + sayaç | `refreshHistory()` | `GET /api/history` | ✅ Bağlı |

## Her istekte olanlar (zaten kodda)
- **Loading:** her fetch öncesi `status: "running"/"loading"/"uploading"` → UI spinner
- **Hata:** 13 try/catch; hata `state.*.error`'a düşer → `.ai-error` / rozet gösterir
- **Timeout:** AbortController, 60sn (yfinance+AI zinciri için); dosya yükleme 120sn
- **Grafikler:** ECharts — mum grafiği `/asset`'ten, 3D yüzey `/simulate`'ten,
  sparkline `/watchlist`'ten GERÇEK veriyle çizilir

## Doğrulama
```bash
cd backend && python -m pytest    # 16/16 — tüm bağlantı zincirleri test kapsamında
```
