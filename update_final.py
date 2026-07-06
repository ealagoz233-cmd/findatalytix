import re

with open('config.js', 'r', encoding='utf-8') as f:
    config_content = f.read()

# TR injections
config_content = config_content.replace(
    'tradingDays: " islem gunu",',
    'tradingDays: " islem gunu",\n      promptText: "Varlık A (BIST-30 Endeks Fonu) vs Varlık B (Nasdaq-100 Teknoloji ETF) için dinamik Monte Carlo simülasyonu çalıştır ve karşılaştırmalı risk raporu oluştur.", aiIntro: "Simülasyon motoru hazır. Prompt\'u düzenleyip gönder butonuna bastığında FastAPI üzerinde 2.000 yollu Monte Carlo (GBM) çalışacak ve sonuçlar bu panele düşecek.", chip1: "SPK 2024 Piyasa Bülteni", chip2: "Basel III — Likidite Riski", chip3: "TCMB Enflasyon Raporu", chip4: "Bloomberg Volatilite Verisi",'
)

# EN injections
config_content = config_content.replace(
    'tradingDays: " trading days",',
    'tradingDays: " trading days",\n      promptText: "Run a dynamic Monte Carlo simulation for Asset A (BIST-30 Index Fund) vs Asset B (Nasdaq-100 Tech ETF) and generate a comparative risk report.", aiIntro: "Simulation engine ready. When you edit the prompt and press send, a 2,000-path Monte Carlo (GBM) will run on FastAPI and results will appear in this panel.", chip1: "CMA 2024 Market Bulletin", chip2: "Basel III — Liquidity Risk", chip3: "CBRT Inflation Report", chip4: "Bloomberg Volatility Data",'
)

with open('config.js', 'w', encoding='utf-8') as f:
    f.write(config_content)

# Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

app_content = app_content.replace(
    'const text = FDX.SEED.promptText;',
    'const text = Prefs.dict().app.promptText;'
)

app_content = app_content.replace(
    'typeInto(#aiText, FDX.SEED.aiIntro, FDX.CONFIG.typing.aiMs,',
    'typeInto(#aiText, Prefs.dict().app.aiIntro, FDX.CONFIG.typing.aiMs,'
)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_content)

# Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace(
    '<button class="chip active">SPK 2024 Piyasa Bülteni</button>',
    '<button class="chip active" data-i18n="app.chip1">SPK 2024 Piyasa Bülteni</button>'
)
html = html.replace(
    '<button class="chip">Basel III — Likidite Riski</button>',
    '<button class="chip" data-i18n="app.chip2">Basel III — Likidite Riski</button>'
)
html = html.replace(
    '<button class="chip">TCMB Enflasyon Raporu</button>',
    '<button class="chip" data-i18n="app.chip3">TCMB Enflasyon Raporu</button>'
)
html = html.replace(
    '<button class="chip">Bloomberg Volatilite Verisi</button>',
    '<button class="chip" data-i18n="app.chip4">Bloomberg Volatilite Verisi</button>'
)

html = html.replace('v=0.96', 'v=0.97')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Final remaining translations patched!")
