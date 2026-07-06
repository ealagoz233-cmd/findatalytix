import re

with open('config.js', 'r', encoding='utf-8') as f:
    config_content = f.read()

# TR injections
config_content = config_content.replace(
    'errSim: "Simülasyon başarısız: ",',
    'errSim: "Simülasyon başarısız: ",\n      daily: "% gunluk", overbought: "asiri alim bolgesi", oversold: "asiri satim bolgesi", neutral: "notr bolge", last1y: " \u00b7 son 1 yil \u00b7 ", tradingDays: " islem gunu",'
)

# EN injections
config_content = config_content.replace(
    'errSim: "Simulation failed: ",',
    'errSim: "Simulation failed: ",\n      daily: "% daily", overbought: "overbought zone", oversold: "oversold zone", neutral: "neutral zone", last1y: " \u00b7 last 1 year \u00b7 ", tradingDays: " trading days",'
)

with open('config.js', 'w', encoding='utf-8') as f:
    f.write(config_content)

# Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

app_content = app_content.replace(
    'ch.textContent = (s.changePct >= 0 ? "+" : "") + trNumber(s.changePct) + "% gunluk";',
    'ch.textContent = (s.changePct >= 0 ? "+" : "") + trNumber(s.changePct) + Prefs.dict().app.daily;'
)
app_content = app_content.replace(
    'rsiNote.textContent = s.rsiNow >= 70 ? "asiri alim bolgesi"\n                          : s.rsiNow <= 30 ? "asiri satim bolgesi" : "notr bolge";',
    'rsiNote.textContent = s.rsiNow >= 70 ? Prefs.dict().app.overbought\n                          : s.rsiNow <= 30 ? Prefs.dict().app.oversold : Prefs.dict().app.neutral;'
)
app_content = app_content.replace(
    'd.resolved + " \u00b7 son 1 yil \u00b7 " + s.observations + " islem gunu";',
    'd.resolved + Prefs.dict().app.last1y + s.observations + Prefs.dict().app.tradingDays;'
)

# Cache buster to 0.96
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
html = html.replace('v=0.95', 'v=0.96')
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Remaining dynamic strings patched part 3!")
