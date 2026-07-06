import re

with open('app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

def rpl(pattern, replacement):
    global app_content
    app_content = re.sub(pattern, replacement, app_content)

rpl(r'fb\.textContent = st\.warning \|\| "Kaydedildi \u2713 \(restart gerekmez\)";', 'fb.textContent = st.warning || Prefs.dict().app.saved;')
rpl(r'p\.textContent = "Dokumanlarda araniyor\u2026";', 'p.textContent = Prefs.dict().app.searching;')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_content)

print("Remaining dynamic strings patched!")
