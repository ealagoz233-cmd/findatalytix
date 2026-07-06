import re

# Update config.js
with open('config.js', 'r', encoding='utf-8') as f:
    config_content = f.read()

# Add dynamic strings to TR
app_tr = '''    app: {
      errSim: "Simülasyon başarısız: ",
      btnSave: "Kaydet", btnSaving: "Kaydediliyor…",
      btnAnalyze: "Analiz Et", btnAnalyzing: "Analiz Ediliyor…",
      btnSearch: "Ara", btnSearching: "Aranıyor…",
      btnReport: "Raporu Oluştur", btnReporting: "Rapor Üretiliyor…",
      errAsset: "veri alinamadi", errConn: "baglanti hatasi",
      errAI: "AI durumu alinamadi: ",
      errGeneric: "Hata: ",
      saved: "Kaydedildi ✓ (restart gerekmez)",
      serverFail: "sunucuya ulaşılamadı",
      noDocs: "henüz doküman yok",
      idxLive: "indeks canlı",
      searching: "Dokumanlarda araniyor…",
      searchErr: "Arama hatası: ",
      noResults: "Sonuç yok — önce doküman yükle ya da soruyu değiştir.",
      errHist: "Gecmis alinamadi: ",
      tpl: "Sablon", aiErr: "AI hatasi"
    }'''

config_content = re.sub(r'(cfg: \{[^\}]+\})', r'\1,\n' + app_tr, config_content, count=1)

# Add dynamic strings to EN
app_en = '''    app: {
      errSim: "Simulation failed: ",
      btnSave: "Save", btnSaving: "Saving…",
      btnAnalyze: "Analyze", btnAnalyzing: "Analyzing…",
      btnSearch: "Search", btnSearching: "Searching…",
      btnReport: "Create Report", btnReporting: "Generating…",
      errAsset: "no data", errConn: "connection error",
      errAI: "Failed to get AI status: ",
      errGeneric: "Error: ",
      saved: "Saved ✓ (no restart needed)",
      serverFail: "server unreachable",
      noDocs: "no documents yet",
      idxLive: "index is live",
      searching: "Searching documents…",
      searchErr: "Search error: ",
      noResults: "No results — upload a document first or change the question.",
      errHist: "Failed to load history: ",
      tpl: "Template", aiErr: "AI error"
    }'''

config_content = re.sub(r'(cfg: \{[^\}]+\})(?=\s*\n  \}\n\})', r'\1,\n' + app_en, config_content, count=1)

with open('config.js', 'w', encoding='utf-8') as f:
    f.write(config_content)

# Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

# Helper macro to use Prefs.dict().app.KEY
def rpl(pattern, replacement):
    global app_content
    app_content = re.sub(pattern, replacement, app_content)

rpl(r'"Simülasyon başarısız: "', 'Prefs.dict().app.errSim')
rpl(r'\? "Kaydediliyor\u2026" : "Kaydet"', '? Prefs.dict().app.btnSaving : Prefs.dict().app.btnSave')
rpl(r'\? "Analiz Ediliyor\u2026" : "Analiz Et"', '? Prefs.dict().app.btnAnalyzing : Prefs.dict().app.btnAnalyze')
rpl(r'\? "Aranıyor\u2026" : "Ara"', '? Prefs.dict().app.btnSearching : Prefs.dict().app.btnSearch')
rpl(r'"Rapor Üretiliyor\u2026"', 'Prefs.dict().app.btnReporting')
rpl(r'"Raporu Oluştur"', 'Prefs.dict().app.btnReport')
rpl(r'"baglanti hatasi" : "veri alinamadi"', 'Prefs.dict().app.errConn : Prefs.dict().app.errAsset')
rpl(r'"AI durumu alinamadi: "', 'Prefs.dict().app.errAI')
rpl(r'"Hata: " \+', 'Prefs.dict().app.errGeneric +')
rpl(r'"Kaydedildi \u2713 \(restart gerekmez\)"', 'Prefs.dict().app.saved')
rpl(r'"sunucuya ulaşılamadı"', 'Prefs.dict().app.serverFail')
rpl(r'\? "henüz doküman yok" : "indeks canlı"', '? Prefs.dict().app.noDocs : Prefs.dict().app.idxLive')
rpl(r'"Dokumanlarda araniyor\u2026"', 'Prefs.dict().app.searching')
rpl(r'"Arama hatası: "', 'Prefs.dict().app.searchErr')
rpl(r'"Sonuç yok — önce doküman yükle ya da soruyu değiştir\."', 'Prefs.dict().app.noResults')
rpl(r'"Gecmis alinamadi: "', 'Prefs.dict().app.errHist')
rpl(r'"Sablon" : "AI hatasi"', 'Prefs.dict().app.tpl : Prefs.dict().app.aiErr')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_content)

print("config.js and app.js patched for dynamic strings!")
