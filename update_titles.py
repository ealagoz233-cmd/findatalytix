import re

# Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add data-i18n-title
html = html.replace(
    '<div class="brand" id="brandHome" role="button" tabindex="0" title="Ana sayfaya don (Genel Bakis)" aria-label="Ana sayfaya don">',
    '<div class="brand" id="brandHome" role="button" tabindex="0" title="Ana sayfaya don (Genel Bakis)" data-i18n-title="app.titleHome" aria-label="Ana sayfaya don">'
)
html = html.replace(
    '<button class="icon-btn" id="shareBtn" title="Bu sayfanin baglantisini kopyala">',
    '<button class="icon-btn" id="shareBtn" title="Bu sayfanin baglantisini kopyala" data-i18n-title="app.titleShare">'
)
html = html.replace(
    '<button class="icon-btn has-dot" title="Canli bildirimler Ay 5 hedefinde (orn: indeksleme bitti uyarisi)">',
    '<button class="icon-btn has-dot" title="Canli bildirimler Ay 5 hedefinde (orn: indeksleme bitti uyarisi)" data-i18n-title="app.titleNotif">'
)
html = html.replace(
    '<label class="pro-toggle" title="Simülasyon bağlamında yüklü dokümanları (RAG) kullan — kapalıyken daha hızlı ve ucuz">',
    '<label class="pro-toggle" title="Simülasyon bağlamında yüklü dokümanları (RAG) kullan — kapalıyken daha hızlı ve ucuz" data-i18n-title="app.titleRag">'
)
html = html.replace(
    '<div class="user" title="Uyelik ve yetkilendirme (Auth) Ay 6 sonrasi yol haritasinda">',
    '<div class="user" title="Uyelik ve yetkilendirme (Auth) Ay 6 sonrasi yol haritasinda" data-i18n-title="app.titleUser">'
)
html = html.replace(
    '<button id="sendBtn" class="send-btn" title="Simülasyonu çalıştır">',
    '<button id="sendBtn" class="send-btn" title="Simülasyonu çalıştır" data-i18n-title="app.titleRun">'
)
html = html.replace(
    '<select id="cfgReferee" disabled title="Analist seçimine göre otomatik belirlenir">',
    '<select id="cfgReferee" disabled title="Analist seçimine göre otomatik belirlenir" data-i18n-title="app.titleRef">'
)

html = html.replace('v=0.97', 'v=0.98')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# Update config.js
with open('config.js', 'r', encoding='utf-8') as f:
    config_content = f.read()

config_content = config_content.replace(
    'chip4: "Bloomberg Volatilite Verisi",',
    'chip4: "Bloomberg Volatilite Verisi",\n      titleHome: "Ana sayfaya dön (Genel Bakış)", titleShare: "Bu sayfanın bağlantısını kopyala", titleNotif: "Canlı bildirimler Ay 5 hedefinde (örn: indeksleme bitti uyarısı)", titleRag: "Simülasyon bağlamında yüklü dokümanları (RAG) kullan — kapalıyken daha hızlı ve ucuz", titleUser: "Üyelik ve yetkilendirme (Auth) Ay 6 sonrası yol haritasında", titleRun: "Simülasyonu çalıştır", titleRef: "Analist seçimine göre otomatik belirlenir",'
)
config_content = config_content.replace(
    'chip4: "Bloomberg Volatility Data",',
    'chip4: "Bloomberg Volatility Data",\n      titleHome: "Return to home (Overview)", titleShare: "Copy link to this page", titleNotif: "Live notifications targeted for Month 5 (e.g. indexing done alert)", titleRag: "Use uploaded documents (RAG) in simulation context — faster and cheaper when disabled", titleUser: "Membership and authorization (Auth) on the roadmap after Month 6", titleRun: "Run simulation", titleRef: "Determined automatically based on analyst selection",'
)

with open('config.js', 'w', encoding='utf-8') as f:
    f.write(config_content)

# Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

injection = '''        }
      });
      document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const path = el.dataset.i18nTitle.split(".");
        let val = d;
        for (const k of path) val = val && val[k];
        if (val) el.title = val;
      });'''

app_content = app_content.replace(
    '        }\n      });',
    injection
)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_content)

print("Title attributes translations patched!")
