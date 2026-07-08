"""
FinDatalytix — report.py (Ay 5: gerçek .docx risk raporu)
=========================================================
Frontend, son simülasyonun tüm durumunu (metrikler, AI yorumu,
hakem skoru, kaynaklar) POST /api/report gövdesinde gönderir;
bu modül profesyonel bir Word raporu üretip bayt olarak döner.
Sunucu durumsuz (stateless) kalır — rapor, o an ekranda görünen
verinin birebir resmi belgesidir.
"""

from __future__ import annotations

import io
from datetime import datetime

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

# Kurumsal renkler (arayüz paletiyle uyumlu)
NAVY = RGBColor(0x11, 0x1C, 0x31)
GOLD = RGBColor(0x8A, 0x6D, 0x2F)
GREY = RGBColor(0x5A, 0x64, 0x72)
RED = RGBColor(0xB0, 0x3A, 0x3A)

METRIC_ROWS = [
    ("Model", "model", None),
    ("Yıllık Getiri (CAGR)", "cagr", "%"),
    ("Volatilite (σ)", "vol", "%"),
    ("Sharpe Oranı", "sharpe", ""),
    ("Maksimum Düşüş (MDD)", "mdd", "%"),
]

SOURCE_LABELS = {
    "live": "Canlı Yahoo Finance verisi",
    "cache": "Önbellekteki piyasa verisi (≤1 saat)",
    "fallback": "Varsayılan parametreler (canlı veri alınamadı)",
}


def _fmt(value, suffix):
    if suffix is None:            # metin alanı (model adı)
        return str(value)
    if isinstance(value, (int, float)):
        # Türkçe ondalık: 33.22 -> "33,22"
        text = f"{value:.2f}".replace(".", ",")
        return f"%{text}" if suffix == "%" else text
    return str(value)


def _heading(doc: Document, text: str, level: int = 1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = NAVY
    return h


def _para(doc: Document, text: str, size=11, color=None, bold=False, italic=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = color
    return p


def build_report(payload: dict) -> tuple[bytes, str]:
    """(docx_baytları, dosya_adı) döner."""

    metrics = payload.get("metrics") or {}
    asset_keys = list(metrics.keys())          # dinamik: 1..N varlık
    ai_text = (payload.get("aiText") or "").strip()
    meta = payload.get("aiMeta") or {}
    prompt = (payload.get("prompt") or "").strip()
    data_sources = payload.get("dataSources") or {}

    now = datetime.now()
    filename = f"risk-raporu-{now:%Y-%m-%d-%H%M}.docx"

    doc = Document()

    # Sayfa kenar boşlukları
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)

    # ---- Kapak başlığı ----
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("FinDatalytix — Karşılaştırmalı Risk Raporu")
    run.font.size = Pt(22)
    run.bold = True
    run.font.color.rgb = NAVY

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(f"Oluşturulma: {now:%d.%m.%Y %H:%M}  ·  Motor: Monte Carlo (GBM, 2.000 yol)")
    run.font.size = Pt(10)
    run.font.color.rgb = GREY

    if prompt:
        _para(doc, f"Analiz sorusu: “{prompt}”", size=10, color=GREY, italic=True)

    # ---- 1. Yönetici Özeti ----
    _heading(doc, "1. Yönetici Özeti")
    if ai_text:
        _para(doc, ai_text)
    else:
        _para(doc, "Bu rapor oluşturulduğunda AI yorumu mevcut değildi; "
                   "aşağıdaki sayısal bulgular esas alınmalıdır.", color=GREY, italic=True)

    # ---- 2. Metrik Karşılaştırması (dinamik sütun) ----
    _heading(doc, "2. Metrik Karşılaştırması")
    table = doc.add_table(rows=1, cols=1 + max(len(asset_keys), 1))
    table.style = "Light Grid Accent 1"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = table.rows[0].cells
    for i, text in enumerate(["Metrik"] + (asset_keys or ["—"])):
        hdr[i].text = ""
        run = hdr[i].paragraphs[0].add_run(text)
        run.bold = True

    for label, key, suffix in METRIC_ROWS:
        if key == "model":
            continue   # sütun başlığı zaten sembolün kendisi
        row = table.add_row().cells
        row[0].text = label
        for i, sym in enumerate(asset_keys):
            value = metrics[sym].get(key, "—")
            cell = row[i + 1]
            cell.text = ""
            run = cell.paragraphs[0].add_run(_fmt(value, suffix))
            if key == "mdd" and isinstance(value, (int, float)) and value < 0:
                run.font.color.rgb = RED

    # Risk-ayarlı kazanan
    try:
        if asset_keys:
            winner = max(asset_keys, key=lambda k: float(metrics[k].get("sharpe", 0)))
            _para(doc, f"Risk-ayarlı getiri (Sharpe) bazında öne çıkan: {winner}.",
                  bold=True, color=GOLD)
    except (TypeError, ValueError):
        pass

    # ---- 3. Veri Kaynakları ----
    _heading(doc, "3. Veri Kaynakları")
    if data_sources:
        for asset_key, src in data_sources.items():
            doc.add_paragraph(
                f"Varlık {asset_key}: {SOURCE_LABELS.get(src, src)}",
                style="List Bullet",
            )
    else:
        _para(doc, "Veri kaynağı bilgisi iletilmedi.", color=GREY, italic=True)

    # ---- 4. Yapay Zeka Değerlendirmesi ----
    _heading(doc, "4. Yapay Zeka Değerlendirmesi")
    mode = meta.get("mode")
    if mode == "live-ai":
        doc.add_paragraph(f"Analist model: {meta.get('analyst', '—')}", style="List Bullet")
        conf = meta.get("confidence")
        referee = meta.get("referee", "—")
        if conf is not None:
            doc.add_paragraph(f"Hakem ({referee}) güven skoru: {conf}/100", style="List Bullet")
        if meta.get("refereeNote"):
            doc.add_paragraph(f"Hakem notu: {meta['refereeNote']}", style="List Bullet")
        doc.add_paragraph(
            f"Token kullanımı: {meta.get('tokensIn', 0)} giriş / {meta.get('tokensOut', 0)} çıkış",
            style="List Bullet",
        )
    elif mode == "error-fallback":
        # Dürüstlük: anahtar VARDI ama çağrı başarısız oldu — "anahtar yok"
        # demek yanlış teşhis koydurur (kullanıcı boşuna .env kurcalar).
        _para(doc, "AI servisine bu çalıştırmada ulaşılamadı (kota/ağ hatası); "
                   "yorum ham sayısal sonuçlarla sınırlıdır. Sayısal bulgular geçerlidir.",
              color=GREY, italic=True)
    else:
        _para(doc, "Bu raporun yorumu şablon modunda üretildi (AI anahtarı tanımlı değildi). "
                   "Gerçek analist + hakem değerlendirmesi için .env dosyasına API anahtarı ekleyin.",
              color=GREY, italic=True)

    # ---- 5. RAG Kaynakları ----
    rag_sources = meta.get("ragSources") or []
    _heading(doc, "5. Kullanılan Doküman Kaynakları (RAG)")
    if rag_sources:
        for src in rag_sources:
            doc.add_paragraph(src, style="List Bullet")
    else:
        _para(doc, "Bu analizde indeksli doküman kullanılmadı.", color=GREY, italic=True)

    # ---- Yasal uyarı ----
    doc.add_paragraph()
    _para(doc,
          "Bu rapor FinDatalytix tarafından otomatik üretilmiştir; simülasyon sonuçları "
          "istatistiksel modellere dayanır, geleceği garanti etmez ve yatırım tavsiyesi değildir.",
          size=8.5, color=GREY, italic=True)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue(), filename
