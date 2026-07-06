from bs4 import BeautifulSoup
import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

def set_i18n(tag, i18n_key):
    if tag:
        tag['data-i18n'] = i18n_key

# 1. Overview (Genel Bakış)
ov_view = soup.find(id='view-overview')
if ov_view:
    set_i18n(ov_view.select_one('.phase-note'), 'ov.note')
    
    cards = ov_view.select('.ov-card')
    if len(cards) >= 4:
        set_i18n(cards[0].select_one('.ov-label'), 'ov.totalAssets')
        set_i18n(cards[0].select_one('.ov-delta'), 'ov.thisWeek')
        set_i18n(cards[1].select_one('.ov-label'), 'ov.dailyPl')
        set_i18n(cards[2].select_one('.ov-label'), 'ov.weeklyRet')
        set_i18n(cards[2].select_one('.ov-delta'), 'ov.belowIdx')
        set_i18n(cards[3].select_one('.ov-label'), 'ov.activeSims')
        set_i18n(cards[3].select_one('.ov-delta'), 'ov.queued')
    
    set_i18n(ov_view.select_one('h3'), 'ov.recentSims')
    
    ths = ov_view.select('th')
    if len(ths) >= 4:
        set_i18n(ths[0], 'ov.thDate')
        set_i18n(ths[1], 'ov.thVs')
        set_i18n(ths[2], 'ov.thSharpe')
        set_i18n(ths[3], 'ov.thStatus')
    
    empty_td = ov_view.select_one('.table-empty')
    if empty_td:
        set_i18n(empty_td, 'ov.loading')

# 2. Watchlist (İzleme Listesi)
watch_view = soup.find(id='view-watchlist')
if watch_view:
    set_i18n(watch_view.select_one('.phase-note'), 'watch.note')
    set_i18n(watch_view.select_one('#watchInput'), 'watch.placeholder')
    set_i18n(watch_view.select_one('#watchAddBtn .report-btn-label'), 'watch.addBtn')
    
    ths = watch_view.select('th')
    if len(ths) >= 4:
        set_i18n(ths[0], 'watch.thSym')
        set_i18n(ths[1], 'watch.thPrice')
        set_i18n(ths[2], 'watch.thChange')
        set_i18n(ths[3], 'watch.th7d')
    
    empty_td = watch_view.select_one('.table-empty')
    if empty_td:
        set_i18n(empty_td, 'watch.loading')

# 3. Vector DB (Vektör Veri Tabanı)
vdb_view = soup.find(id='view-vectordb')
if vdb_view:
    set_i18n(vdb_view.select_one('.phase-note'), 'vdb.note')
    
    cards = vdb_view.select('.ov-card')
    if len(cards) >= 4:
        set_i18n(cards[0].select_one('.ov-label'), 'vdb.docs')
        set_i18n(cards[0].select_one('.ov-delta'), 'vdb.waitSrv')
        set_i18n(cards[1].select_one('.ov-label'), 'vdb.chunks')
        set_i18n(cards[1].select_one('.ov-delta'), 'vdb.vecParts')
        set_i18n(cards[2].select_one('.ov-label'), 'vdb.model')
        set_i18n(cards[2].select_one('.ov-delta'), 'vdb.builtIn')
        set_i18n(cards[3].select_one('.ov-label'), 'vdb.updated')
        set_i18n(cards[3].select_one('.ov-delta'), 'vdb.lastWrite')
        
    dz = vdb_view.select_one('#dropzone')
    if dz:
        ps = dz.select('p')
        if len(ps) >= 2:
            set_i18n(ps[0].find('strong'), 'vdb.dragTitle')
            # Extract ' ya da tıklayıp seç' and handle carefully
            # Actually, bs4 text manipulation can be tricky, let's just replace the whole content
            pass
            
        set_i18n(ps[1], 'vdb.dragHint')
        
    # Manual patch for dropzone title using regex later since bs4 is tricky with nested tags
    
    set_i18n(vdb_view.select_one('#fileListWrap h3'), 'vdb.queue')
    
    pnl2 = vdb_view.select('.panel')
    if len(pnl2) >= 2:
        set_i18n(pnl2[1].select_one('h3'), 'vdb.testTitle')
        set_i18n(pnl2[1].select_one('#queryInput'), 'vdb.placeholder')
        set_i18n(pnl2[1].select_one('#queryBtn .report-btn-label'), 'vdb.searchBtn')

# 4. Assets (Varlık Analizi)
asset_view = soup.find(id='view-assets')
if asset_view:
    set_i18n(asset_view.select_one('.phase-note'), 'asset.note')
    set_i18n(asset_view.select_one('#assetInput'), 'asset.placeholder')
    set_i18n(asset_view.select_one('#assetBtn .report-btn-label'), 'asset.analyzeBtn')
    
    cards = asset_view.select('.ov-card')
    if len(cards) >= 4:
        set_i18n(cards[0].select_one('.ov-label'), 'asset.lastPrice')
        set_i18n(cards[1].select_one('.ov-label'), 'asset.range52')
        set_i18n(cards[1].select_one('.ov-delta'), 'asset.lowHigh')
        set_i18n(cards[2].select_one('.ov-label'), 'asset.volatility')
        set_i18n(cards[2].select_one('.ov-delta'), 'asset.fromDaily')
        
    set_i18n(asset_view.select_one('#assetChartTitle'), 'asset.chartTitle')

# 5. Report (Risk Raporu)
rep_view = soup.find(id='view-report')
if rep_view:
    set_i18n(rep_view.select_one('.phase-note'), 'rep.note')
    set_i18n(rep_view.select_one('.empty-state h3'), 'rep.emptyTitle')
    set_i18n(rep_view.select_one('.empty-state p'), 'rep.emptyDesc')

# 6. Config (Konfigürasyon)
cfg_view = soup.find(id='view-config')
if cfg_view:
    set_i18n(cfg_view.select_one('#aiStatusLine'), 'cfg.note')
    
    pnls = cfg_view.select('.panel')
    if len(pnls) >= 2:
        set_i18n(pnls[0].select_one('h3'), 'cfg.aiRoles')
        
        lbls = pnls[0].select('label')
        if len(lbls) >= 2:
            lbls[0].contents[0].replace_with('Analist Model ') # Clean text before em
            set_i18n(lbls[0].select_one('em'), 'cfg.analystNote')
            # Add data-i18n to label but keep em? 
            # Better to just use replace logic later for complex nested tags. Let's just do em
            set_i18n(lbls[1], 'cfg.referee')
            
        set_i18n(pnls[1].select_one('h3'), 'cfg.ragParams')
        
        lbls = pnls[1].select('label')
        if len(lbls) >= 2:
            set_i18n(lbls[0].select_one('em'), 'cfg.chunkNote')
            set_i18n(lbls[1], 'cfg.topK')
            
        set_i18n(pnls[1].select_one('#cfgSaveBtn .report-btn-label'), 'cfg.saveBtn')

# Write back
html_out = str(soup)

# Some manual regex replacements for nested tag text that bs4 messes up if we just set textContent
html_out = re.sub(
    r'<p><strong>PDF veya Word dosyasını sürükle</strong> ya da tıklayıp seç</p>',
    r'<p><strong data-i18n="vdb.dragTitle">PDF veya Word dosyasını sürükle</strong><span data-i18n="vdb.dragOr"> ya da tıklayıp seç</span></p>',
    html_out
)

html_out = re.sub(
    r'<label for="cfgAnalyst">Analist Model <em class="cfg-note">',
    r'<label for="cfgAnalyst"><span data-i18n="cfg.analyst">Analist Model</span> <em class="cfg-note" data-i18n="cfg.analystNote">',
    html_out
)

html_out = re.sub(
    r'<label for="cfgChunk">Chunk Boyutu \(karakter\) <em class="cfg-note">',
    r'<label for="cfgChunk"><span data-i18n="cfg.chunkSize">Chunk Boyutu (karakter)</span> <em class="cfg-note" data-i18n="cfg.chunkNote">',
    html_out
)

# Update cache buster
html_out = html_out.replace('v=0.94', 'v=0.95')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_out)

print("index.html patched!")
