#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador de Documento de Protocolo Clínico - PDF Profissional v4
Versão expandida com termos por tipo de procedimento, contrato financeiro,
cláusulas de desistência com jurisprudência, e RAS com datas auto-preenchidas.
Preto e branco / tons de cinza - Otimizado para impressão laser.
"""

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime, timedelta

pdfmetrics.registerFont(TTFont('NotoSans', '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSansBold', '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'))

# ============================================================
# CORES (tons de cinza para impressão laser)
# ============================================================
PRETO = HexColor('#000000')
BRANCO = HexColor('#FFFFFF')
CINZA_ESCURO = HexColor('#333333')
CINZA_MEDIO = HexColor('#666666')
CINZA_CLARO = HexColor('#CCCCCC')
CINZA_MUITO_CLARO = HexColor('#E8E8E8')
CINZA_FUNDO = HexColor('#F5F5F5')
CINZA_HEADER = HexColor('#3A3A3A')
CINZA_LINHA_ALT = HexColor('#F0F0F0')
CINZA_BORDA = HexColor('#AAAAAA')
CINZA_DESTAQUE = HexColor('#D0D0D0')
CINZA_CELULA = HexColor('#C8C8C8')

MARGEM = 1 * cm
OUTPUT_FILE = '/home/ubuntu/project/Protocolo_Fechamento_Clinico_v4.pdf'

SUBSTANCIAS = ['CoQ10', 'PQQ', 'Vit D3', 'Vit B12', 'Tirze', 'Test 25', 'Test 200', 'Test 1000', 'Glutationa', 'NAD+']

SISTEMAS = [
    'Cognição / Sist. Nervoso', 'Libido / Sist. Reprodutor', 'Tireoide / Metabolismo',
    'Sist. Osteomuscular', 'Sist. Cardiovascular', 'Sist. Respiratório',
    'Sist. Imunológico', 'Pele / Cabelo / Unhas', 'Energia / Disposição',
    'Sist. Digestivo', 'Sist. Hepático', 'Antioxidante / Anti-aging',
]

ESTRELAS = {
    'Cognição / Sist. Nervoso':  [4,5,2,4,1,2,2,2,3,5],
    'Libido / Sist. Reprodutor': [2,1,3,2,1,4,5,5,1,2],
    'Tireoide / Metabolismo':    [3,2,4,3,5,3,3,3,2,3],
    'Sist. Osteomuscular':       [2,1,5,2,2,3,4,4,1,2],
    'Sist. Cardiovascular':      [5,3,3,3,2,2,2,2,4,4],
    'Sist. Respiratório':        [3,2,3,2,1,1,1,1,3,3],
    'Sist. Imunológico':         [3,3,5,3,1,2,2,2,5,4],
    'Pele / Cabelo / Unhas':     [3,2,3,3,1,2,3,3,5,3],
    'Energia / Disposição':      [5,4,3,4,3,3,3,3,3,5],
    'Sist. Digestivo':           [2,2,2,3,3,1,1,1,3,2],
    'Sist. Hepático':            [3,2,2,3,1,1,1,1,5,4],
    'Antioxidante / Anti-aging': [5,5,3,2,1,1,2,2,5,5],
}

EFEITOS_INFO = {
    'Tempo p/ Perceber':  ['2-4 sem','2-4 sem','4-8 sem','1-2 sem','1-2 sem','2-4 sem','2-4 sem','2-4 sem','1-2 sem','1-3 sem'],
    'Efeito Principal':   ['Energia\ncardio','Neuro\nproteção','Imunidade\nóssos','Energia\nnervos','Metab.\npeso','Libido\nmúsculo','Libido\nmúsculo','Libido\nmúsculo','Detox\npele','Energia\ncelular'],
    'Via Administração':  ['EV','EV','IM','IM','SC','IM','IM','IM','EV','EV'],
    'Freq. Recomendada':  ['7 dias','15 dias','30 dias','30 dias','7 dias','7 dias','15 dias','60 dias','7 dias','7 dias'],
    'Nº Aplicações':      ['8-10','5','5','5','10','8','8','4','8','8'],
}

# Dados para RAS auto-preenchido
DATA_INICIO = datetime(2026, 4, 9)
QTDES = [8, 5, 5, 5, 10, 8, 8, 4, 8, 8]
FREQS_DIAS = [7, 15, 30, 30, 7, 7, 15, 60, 7, 7]

# Preços exemplo
PRECOS = {
    'CoQ10 (EV)': 280.00, 'PQQ (EV)': 320.00, 'Vit D3 (IM)': 150.00,
    'Vit B12 (IM)': 120.00, 'Tirze (SC)': 450.00, 'Test 25 (IM)': 180.00,
    'Test 200 (IM)': 250.00, 'Test 1000 (IM)': 380.00, 'Glutationa (EV)': 350.00,
    'NAD+ (EV)': 480.00, 'Implante Hormonal': 2500.00,
    'Fórmulas Manipuladas (mensal)': 450.00,
    'Consulta Inicial': 600.00, 'Retorno': 350.00,
}


def draw_stars(c, x_center, y_center, n_filled, total=5, radius=1.3*mm, spacing=3.2*mm):
    total_width = (total - 1) * spacing
    x_start = x_center - total_width / 2
    for i in range(total):
        cx = x_start + i * spacing
        if i < n_filled:
            c.setFillColor(CINZA_ESCURO)
            c.circle(cx, y_center, radius, fill=1, stroke=0)
        else:
            c.setStrokeColor(CINZA_CLARO)
            c.setLineWidth(0.4)
            c.circle(cx, y_center, radius, fill=0, stroke=1)


def draw_wrapped_text(c, text, x, y, max_width, font='NotoSans', size=7, leading=9, color=PRETO, align='left'):
    c.setFont(font, size)
    c.setFillColor(color)
    words = text.split()
    lines = []
    current_line = ""
    for word in words:
        test = current_line + " " + word if current_line else word
        if c.stringWidth(test, font, size) <= max_width:
            current_line = test
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)
    for line in lines:
        if align == 'center':
            c.drawCentredString(x + max_width/2, y, line)
        else:
            c.drawString(x, y, line)
        y -= leading
    return y


def draw_checkbox(c, x, y, size=3*mm, checked=False):
    c.setStrokeColor(PRETO)
    c.setLineWidth(0.5)
    c.rect(x, y, size, size)
    if checked:
        c.line(x, y, x + size, y + size)
        c.line(x + size, y, x, y + size)


def assinatura_rodape(c, w, m, y):
    """Linha de assinatura + rubrica em todas as páginas"""
    c.setStrokeColor(CINZA_CLARO)
    c.setLineWidth(0.3)
    c.line(m, y, w - m, y)
    y -= 3*mm
    c.setFont('NotoSans', 5.5)
    c.setFillColor(CINZA_MEDIO)
    c.drawString(m, y, "Rubrica Paciente: _______________")
    c.drawCentredString(w/2, y, "Rubrica Médico: _______________")
    c.drawRightString(w - m, y, "Rubrica Enfermeiro: _______________")
    return y - 2*mm


class ProtocoloPDF:
    def __init__(self, filename):
        self.filename = filename
        self.c = canvas.Canvas(filename)
        self.page_num = 0

    def nova_retrato(self):
        if self.page_num > 0:
            self.c.showPage()
        self.page_num += 1
        self.c.setPageSize(A4)
        return A4

    def nova_paisagem(self):
        if self.page_num > 0:
            self.c.showPage()
        self.page_num += 1
        self.c.setPageSize(landscape(A4))
        return landscape(A4)

    def rodape(self, w, h, extra=""):
        self.c.setFont('NotoSans', 5.5)
        self.c.setFillColor(CINZA_MEDIO)
        txt = f"PADCOM — Protocolo de Administração de Compostos — Pág. {self.page_num}"
        if extra:
            txt += f" — {extra}"
        self.c.drawCentredString(w/2, MARGEM/2, txt)

    def rodape_com_rubrica(self, w, h, extra=""):
        y = MARGEM + 6*mm
        assinatura_rodape(self.c, w, MARGEM, y)
        self.rodape(w, h, extra)

    # ============================================================
    # PÁG 1 - CAPA
    # ============================================================
    def pagina_capa(self):
        w, h = self.nova_retrato()
        m = MARGEM
        aw = w - 2*m
        self.c.setStrokeColor(CINZA_ESCURO)
        self.c.setLineWidth(2)
        self.c.rect(m, m, aw, h - 2*m)
        self.c.setLineWidth(0.5)
        self.c.rect(m + 3*mm, m + 3*mm, aw - 6*mm, h - 2*m - 6*mm)

        y = h - 5*cm
        self.c.setFont('NotoSansBold', 11)
        self.c.setFillColor(CINZA_MEDIO)
        self.c.drawCentredString(w/2, y, "PADCOM")
        y -= 7*mm
        self.c.setFont('NotoSans', 7)
        self.c.drawCentredString(w/2, y, "PROTOCOLO DE ADMINISTRAÇÃO DE COMPOSTOS NATURAIS")
        y -= 2*cm
        self.c.setStrokeColor(CINZA_ESCURO)
        self.c.setLineWidth(1.5)
        self.c.line(w/2 - 6*cm, y, w/2 + 6*cm, y)
        y -= 1.5*cm
        self.c.setFont('NotoSansBold', 24)
        self.c.setFillColor(PRETO)
        self.c.drawCentredString(w/2, y, "PROTOCOLO CLÍNICO")
        y -= 10*mm
        self.c.setFont('NotoSansBold', 18)
        self.c.drawCentredString(w/2, y, "DE FECHAMENTO")
        y -= 1.5*cm
        self.c.setFont('NotoSans', 9)
        self.c.setFillColor(CINZA_MEDIO)
        self.c.drawCentredString(w/2, y, "Registro de Administração de Substâncias / Suplementos")
        y -= 5*mm
        self.c.setFont('NotoSans', 8)
        self.c.drawCentredString(w/2, y, "Documento Confidencial — Uso Exclusivo do Paciente e Equipe Médica")
        y -= 2*cm
        self.c.setStrokeColor(CINZA_ESCURO)
        self.c.setLineWidth(1)
        self.c.line(w/2 - 6*cm, y, w/2 + 6*cm, y)
        y -= 1.5*cm

        campos = ['PACIENTE:', 'CPF:', 'CELULAR:',
                  'IDADE:                                        ALT.:                              PESO:',
                  'MÉDICO RESPONSÁVEL:', 'ENFERMEIRA:', 'UNIDADE:', 'DATA INÍCIO:']
        xl = m + 2*cm
        xv = m + 6.5*cm
        for label in campos:
            self.c.setFont('NotoSansBold', 9)
            self.c.setFillColor(PRETO)
            self.c.drawString(xl, y, label)
            self.c.setStrokeColor(CINZA_CLARO)
            self.c.setLineWidth(0.3)
            self.c.line(xv, y - 1, w - m - 2*cm, y - 1)
            y -= 8*mm

        y -= 1*cm
        self.c.setStrokeColor(CINZA_ESCURO)
        self.c.setLineWidth(1)
        self.c.line(w/2 - 6*cm, y, w/2 + 6*cm, y)
        y -= 8*mm
        self.c.setFont('NotoSans', 7)
        self.c.setFillColor(CINZA_MEDIO)
        self.c.drawCentredString(w/2, y, "Este documento contém informações confidenciais protegidas pela LGPD (Lei 13.709/2018)")
        y -= 4*mm
        self.c.drawCentredString(w/2, y, "Todos os compostos utilizados são substâncias naturais biocompatíveis com o organismo humano")
        y -= 4*mm
        self.c.drawCentredString(w/2, y, "Ao assinar este documento, o paciente declara estar de acordo com todas as páginas e termos contidos neste protocolo")

        y_ass = m + 3.5*cm
        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(0.5)
        self.c.setFillColor(PRETO)
        self.c.setFont('NotoSans', 7)
        x1 = m + 1.5*cm
        self.c.line(x1, y_ass, x1 + 5.5*cm, y_ass)
        self.c.drawCentredString(x1 + 2.75*cm, y_ass - 4*mm, "Paciente")
        x2 = w/2 - 2.75*cm
        self.c.line(x2, y_ass, x2 + 5.5*cm, y_ass)
        self.c.drawCentredString(x2 + 2.75*cm, y_ass - 4*mm, "Médico Resp.")
        x3 = w - m - 1.5*cm - 5.5*cm
        self.c.line(x3, y_ass, x3 + 5.5*cm, y_ass)
        self.c.drawCentredString(x3 + 2.75*cm, y_ass - 4*mm, "Enfermeiro Resp.")
        self.rodape(w, h)

    # ============================================================
    # PÁG 2 - TABELA ESTRELAS
    # ============================================================
    def pagina_tabela_estrelas(self):
        w, h = self.nova_paisagem()
        m = MARGEM
        aw = w - 2*m
        y = h - m - 2*mm
        self.c.setFont('NotoSansBold', 11)
        self.c.setFillColor(PRETO)
        self.c.drawString(m, y, "MATRIZ DE BENEFÍCIOS POR SISTEMA — Classificação (0-5)")
        y -= 5*mm
        self.c.setFont('NotoSans', 6.5)
        self.c.setFillColor(CINZA_MEDIO)
        lx = m
        self.c.drawString(lx, y, "Legenda:")
        lx += 15*mm
        draw_stars(self.c, lx + 8*mm, y + 1.5*mm, 5, 5, 1.2*mm, 3*mm)
        lx += 22*mm
        self.c.drawString(lx, y, "= Máximo")
        lx += 18*mm
        draw_stars(self.c, lx + 8*mm, y + 1.5*mm, 0, 5, 1.2*mm, 3*mm)
        lx += 22*mm
        self.c.drawString(lx, y, "= Nenhum")
        y -= 6*mm

        col_label = 52*mm
        ns = len(SUBSTANCIAS)
        col_sub = (aw - col_label) / ns
        row_h = 8.5*mm
        hdr_h = 9*mm

        self.c.setFillColor(CINZA_HEADER)
        self.c.rect(m, y - hdr_h, aw, hdr_h, fill=1)
        self.c.setFont('NotoSansBold', 6.5)
        self.c.setFillColor(BRANCO)
        self.c.drawCentredString(m + col_label/2, y - hdr_h/2 - 1*mm, "SISTEMA / ÓRGÃO")
        for i, sub in enumerate(SUBSTANCIAS):
            x = m + col_label + i * col_sub
            self.c.drawCentredString(x + col_sub/2, y - hdr_h/2 - 1*mm, sub)
        y -= hdr_h

        for idx, sis in enumerate(SISTEMAS):
            if idx % 2 == 0:
                self.c.setFillColor(CINZA_MUITO_CLARO)
                self.c.rect(m, y - row_h, aw, row_h, fill=1)
            self.c.setStrokeColor(CINZA_BORDA)
            self.c.setLineWidth(0.3)
            self.c.rect(m, y - row_h, col_label, row_h)
            self.c.setFont('NotoSansBold', 6.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 2*mm, y - row_h/2 - 1.5*mm, sis)
            for i in range(ns):
                x = m + col_label + i * col_sub
                self.c.setStrokeColor(CINZA_BORDA)
                self.c.setLineWidth(0.3)
                self.c.rect(x, y - row_h, col_sub, row_h)
                draw_stars(self.c, x + col_sub/2, y - row_h/2, ESTRELAS[sis][i])
            y -= row_h

        total_h = hdr_h + len(SISTEMAS) * row_h
        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(1)
        self.c.rect(m, y, aw, total_h)

        y -= 6*mm
        self.c.setFont('NotoSans', 6)
        self.c.setFillColor(CINZA_MEDIO)
        self.c.drawString(m, y, "CoQ10 = Coenzima Q10 | PQQ = Pirroloquinolina Quinona | Vit D3 = Vitamina D3 | Vit B12 = Vitamina B12 | Tirze = Tirzepatida")
        y -= 3.5*mm
        self.c.drawString(m, y, "Test 25/200/1000 = Testosterona (dosagens) | Glutationa = L-Glutationa | NAD+ = Nicotinamida Adenina Dinucleotídeo")
        y -= 3.5*mm
        self.c.drawString(m, y, "Todas as substâncias são compostos naturais biocompatíveis, produzidos pelo próprio organismo humano.")
        self.rodape_com_rubrica(w, h, "Matriz de Benefícios")

    # ============================================================
    # PÁG 3 - EFEITOS ESPERADOS
    # ============================================================
    def pagina_tabela_efeitos(self):
        w, h = self.nova_paisagem()
        m = MARGEM
        aw = w - 2*m
        y = h - m - 2*mm
        self.c.setFont('NotoSansBold', 11)
        self.c.setFillColor(PRETO)
        self.c.drawString(m, y, "EFEITOS ESPERADOS, TEMPO DE RESPOSTA E INFORMAÇÕES DE ADMINISTRAÇÃO")
        y -= 7*mm

        col_label = 45*mm
        ns = len(SUBSTANCIAS)
        col_sub = (aw - col_label) / ns
        hdr_h = 9*mm

        self.c.setFillColor(CINZA_HEADER)
        self.c.rect(m, y - hdr_h, aw, hdr_h, fill=1)
        self.c.setFont('NotoSansBold', 6.5)
        self.c.setFillColor(BRANCO)
        self.c.drawCentredString(m + col_label/2, y - hdr_h/2 - 1*mm, "INFORMAÇÃO")
        for i, sub in enumerate(SUBSTANCIAS):
            x = m + col_label + i * col_sub
            self.c.drawCentredString(x + col_sub/2, y - hdr_h/2 - 1*mm, sub)
        y -= hdr_h

        info_keys = list(EFEITOS_INFO.keys())
        row_heights = {'Tempo p/ Perceber': 8*mm, 'Efeito Principal': 12*mm, 'Via Administração': 8*mm, 'Freq. Recomendada': 8*mm, 'Nº Aplicações': 8*mm}
        row_idx = 0
        for key in info_keys:
            rh = row_heights.get(key, 8*mm)
            if row_idx % 2 == 0:
                self.c.setFillColor(CINZA_MUITO_CLARO)
                self.c.rect(m, y - rh, aw, rh, fill=1)
            self.c.setStrokeColor(CINZA_BORDA)
            self.c.setLineWidth(0.3)
            self.c.rect(m, y - rh, col_label, rh)
            self.c.setFont('NotoSansBold', 6.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 2*mm, y - rh/2 - 1.5*mm, key)
            for i in range(ns):
                x = m + col_label + i * col_sub
                self.c.setStrokeColor(CINZA_BORDA)
                self.c.rect(x, y - rh, col_sub, rh)
                val = EFEITOS_INFO[key][i]
                self.c.setFont('NotoSans', 6.5)
                self.c.setFillColor(PRETO)
                if '\n' in val:
                    lines = val.split('\n')
                    for j, line in enumerate(lines):
                        self.c.drawCentredString(x + col_sub/2, y - rh/2 + 2*mm - j*3*mm, line)
                else:
                    self.c.drawCentredString(x + col_sub/2, y - rh/2 - 1.5*mm, val)
            y -= rh
            row_idx += 1

        estrelas_rows = [
            ('Intensidade Efeito', [4,4,3,3,5,4,4,5,4,5]),
            ('Satisfação Paciente', [4,4,4,3,5,5,5,5,5,4]),
            ('Segurança / Tolerab.', [5,5,5,5,4,4,4,4,5,5]),
        ]
        rh = 8*mm
        for label, vals in estrelas_rows:
            if row_idx % 2 == 0:
                self.c.setFillColor(CINZA_FUNDO)
                self.c.rect(m, y - rh, aw, rh, fill=1)
            self.c.setStrokeColor(CINZA_BORDA)
            self.c.setLineWidth(0.3)
            self.c.rect(m, y - rh, col_label, rh)
            self.c.setFont('NotoSansBold', 6.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 2*mm, y - rh/2 - 1.5*mm, label)
            for i in range(ns):
                x = m + col_label + i * col_sub
                self.c.setStrokeColor(CINZA_BORDA)
                self.c.rect(x, y - rh, col_sub, rh)
                draw_stars(self.c, x + col_sub/2, y - rh/2, vals[i])
            y -= rh
            row_idx += 1

        total_h = hdr_h + sum(row_heights.values()) + len(estrelas_rows) * 8*mm
        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(1)
        self.c.rect(m, y, aw, total_h)

        y -= 6*mm
        self.c.setFont('NotoSans', 6)
        self.c.setFillColor(CINZA_MEDIO)
        self.c.drawString(m, y, "EV = Endovenoso | IM = Intramuscular | SC = Subcutâneo | Os tempos são estimativas e podem variar conforme o organismo.")
        y -= 3.5*mm
        self.c.drawString(m, y, "Todas as substâncias são compostos naturais biocompatíveis. Os efeitos colaterais são mínimos por se tratar de substâncias do próprio corpo humano.")
        self.rodape_com_rubrica(w, h, "Efeitos Esperados")

    # ============================================================
    # HELPER: Termo genérico
    # ============================================================
    def _pagina_termo(self, titulo, subtitulo, secoes, extra_footer="", page_label=""):
        w, h = self.nova_retrato()
        m = MARGEM
        aw = w - 2*m
        self.c.setStrokeColor(CINZA_ESCURO)
        self.c.setLineWidth(1)
        self.c.rect(m, m, aw, h - 2*m)

        y = h - m - 3*mm
        self.c.setFont('NotoSansBold', 12)
        self.c.setFillColor(PRETO)
        self.c.drawCentredString(w/2, y, titulo)
        y -= 5*mm
        if subtitulo:
            self.c.setFont('NotoSans', 7.5)
            self.c.setFillColor(CINZA_MEDIO)
            self.c.drawCentredString(w/2, y, subtitulo)
            y -= 4*mm
        self.c.setStrokeColor(CINZA_CLARO)
        self.c.setLineWidth(0.8)
        self.c.line(m + 5*mm, y, w - m - 5*mm, y)
        y -= 5*mm

        tm = m + 6*mm
        tw = aw - 12*mm
        for titulo_sec, corpo in secoes:
            if y < m + 35*mm:
                assinatura_rodape(self.c, w, m + 6*mm, m + 20*mm)
                self.rodape(w, h, page_label)
                w, h = self.nova_retrato()
                self.c.setStrokeColor(CINZA_ESCURO)
                self.c.setLineWidth(1)
                self.c.rect(m, m, aw, h - 2*m)
                y = h - m - 5*mm
                self.c.setFont('NotoSansBold', 9)
                self.c.setFillColor(CINZA_MEDIO)
                self.c.drawCentredString(w/2, y, f"(continuação)")
                y -= 6*mm

            self.c.setFont('NotoSansBold', 7.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(tm, y, titulo_sec)
            y -= 4*mm
            y = draw_wrapped_text(self.c, corpo, tm, y, tw, 'NotoSans', 6.8, 8.5, PRETO)
            y -= 3*mm

        if extra_footer:
            y -= 1*mm
            self.c.setFont('NotoSans', 6)
            self.c.setFillColor(CINZA_MEDIO)
            y = draw_wrapped_text(self.c, extra_footer, tm, y, tw, 'NotoSans', 6, 8, CINZA_MEDIO)
            y -= 2*mm

        y -= 2*mm
        self.c.setStrokeColor(CINZA_CLARO)
        self.c.setLineWidth(0.5)
        self.c.line(tm, y, w - m - 6*mm, y)
        y -= 5*mm
        self.c.setFont('NotoSans', 7.5)
        self.c.setFillColor(PRETO)

        # Checkbox de concordância
        draw_checkbox(self.c, tm, y - 0.5*mm)
        self.c.drawString(tm + 5*mm, y, "Declaro que li, compreendi e estou de acordo com todos os termos acima descritos.")
        y -= 6*mm

        self.c.drawString(tm, y, "Local e Data: _______________________________________________")
        y -= 12*mm
        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(0.5)
        x1 = tm
        self.c.line(x1, y, x1 + 6*cm, y)
        self.c.setFont('NotoSans', 6.5)
        self.c.drawString(x1, y - 3.5*mm, "Assinatura do Paciente")
        x2 = w/2 + 5*mm
        self.c.line(x2, y, x2 + 6*cm, y)
        self.c.drawString(x2, y - 3.5*mm, "Assinatura do Médico Responsável")

        self.rodape_com_rubrica(w, h, page_label)

    # ============================================================
    # PÁG 4 - TCLE IMPLANTES
    # ============================================================
    def pagina_termo_implantes(self):
        secoes = [
            ("1. DESCRIÇÃO DO PROCEDIMENTO",
             "O procedimento consiste na inserção subcutânea de implantes hormonais biocompatíveis, compostos por substâncias naturais idênticas às produzidas pelo organismo humano. A inserção é realizada sob anestesia local (lidocaína), por meio de pequena incisão na região glútea ou abdominal, utilizando técnica asséptica e material estéril. O implante é absorvível e possui validade de até 6 (seis) meses, podendo variar conforme a resposta individual do paciente."),
            ("2. SUBSTÂNCIAS E INDICAÇÕES",
             "Os implantes podem conter testosterona, gestrinona, ocitocina e/ou outros compostos biocompatíveis, prescritos de acordo com a avaliação clínica e laboratorial individualizada. A indicação terapêutica visa a reposição e otimização hormonal, sendo vedada a prescrição para fins exclusivamente estéticos, em conformidade com a Resolução CFM nº 2.333/23."),
            ("3. BENEFÍCIOS ESPERADOS",
             "Os benefícios esperados incluem: melhora da libido e função sexual, aumento de energia e disposição, otimização do metabolismo, melhora da composição corporal, fortalecimento ósseo e muscular, melhora do humor e da cognição, e regulação hormonal. Os resultados variam conforme o organismo de cada paciente e não há garantia de resultados específicos."),
            ("4. RISCOS E EFEITOS COLATERAIS",
             "Por se tratar de substâncias naturais biocompatíveis, os efeitos colaterais são mínimos e geralmente transitórios, podendo incluir: desconforto no local da inserção, hematoma ou equimose local, oleosidade da pele, acne leve, pequena alteração da voz (em mulheres), retenção hídrica temporária e sensibilidade local. Complicações raras incluem: infecção no local da inserção, extrusão do implante e reação alérgica ao anestésico local. Em caso de qualquer intercorrência, o paciente deve comunicar imediatamente a equipe médica."),
            ("5. CUIDADOS PÓS-PROCEDIMENTO",
             "O paciente compromete-se a: não molhar o local da inserção nas primeiras 24 horas; evitar atividade física intensa por 72 horas; comparecer ao retorno de avaliação em 30 dias; realizar os exames laboratoriais de controle solicitados; retornar para avaliação no 5º mês pós-implante; e comunicar qualquer alteração ou desconforto à equipe médica."),
            ("6. ACOMPANHAMENTO OBRIGATÓRIO",
             "Declaro estar ciente de que é obrigatório o acompanhamento semestral das mamas e útero durante o uso de reposição hormonal. Comprometo-me a realizar os exames solicitados e a retornar nas datas agendadas para avaliação clínica e laboratorial. A não realização do acompanhamento pode comprometer a segurança do tratamento."),
            ("7. CONSENTIMENTO E REVOGAÇÃO",
             "Declaro que fui devidamente informado(a) sobre o procedimento, seus riscos, benefícios e alternativas. Afirmo não estar grávida e que não posso engravidar durante o uso do implante hormonal. Estou ciente de que posso revogar este consentimento a qualquer momento, comunicando a equipe médica, sem qualquer penalidade."),
        ]
        self._pagina_termo(
            "TERMO DE CONSENTIMENTO — IMPLANTES HORMONAIS",
            "Procedimento de Inserção de Implantes Subcutâneos Biocompatíveis",
            secoes,
            "Ref. Legal: Resolução CFM nº 2.333/23 | Resolução CFM nº 1.999/2012 | RDC ANVISA | Código de Ética Médica Art. 22",
            "Termo — Implantes"
        )

    # ============================================================
    # PÁG 5 - TCLE INJETÁVEIS INTRAMUSCULARES
    # ============================================================
    def pagina_termo_im(self):
        secoes = [
            ("1. DESCRIÇÃO DO PROCEDIMENTO",
             "O protocolo de injetáveis intramusculares (IM) consiste na administração de substâncias naturais biocompatíveis diretamente no tecido muscular, por meio de injeção em músculo de grande porte (glúteo, deltoide ou vasto lateral da coxa). Todos os procedimentos são realizados por profissional de enfermagem habilitado, sob supervisão médica, utilizando material descartável e estéril, em ambiente adequado e seguindo normas de biossegurança."),
            ("2. SUBSTÂNCIAS ADMINISTRADAS",
             "As substâncias que podem ser administradas por via intramuscular neste protocolo incluem: Testosterona (Test 25, Test 200, Test 1000) — para otimização hormonal, melhora da libido, energia e composição corporal; Vitamina D3 — para fortalecimento ósseo, imunidade e metabolismo; Vitamina B12 — para energia, função neurológica e formação sanguínea; e outras substâncias prescritas conforme avaliação clínica individualizada. Todas são compostos naturais produzidos pelo próprio organismo humano."),
            ("3. BENEFÍCIOS ESPERADOS",
             "Os benefícios esperados variam conforme a substância e o protocolo individualizado, incluindo: aumento de energia e disposição, melhora da função muscular e óssea, otimização hormonal, melhora da cognição e humor, fortalecimento do sistema imunológico e melhora da qualidade de vida. Os resultados são individuais e não há garantia de resultados específicos."),
            ("4. RISCOS E EFEITOS COLATERAIS",
             "Por se tratar de substâncias naturais biocompatíveis com o organismo, os efeitos colaterais são mínimos e geralmente transitórios, podendo incluir: dor ou desconforto no local da aplicação, hematoma ou equimose local, rubor temporário, leve endurecimento no local (nódulo transitório) e fadiga temporária nas primeiras aplicações. Reações adversas graves são extremamente raras. O paciente deve comunicar imediatamente a equipe médica em caso de qualquer desconforto significativo."),
            ("5. CONTRAINDICAÇÕES",
             "O paciente declara ter informado à equipe médica sobre: alergias conhecidas, uso de medicamentos anticoagulantes, doenças hematológicas, gestação ou suspeita de gestação, e qualquer condição de saúde relevante. A omissão de informações pode comprometer a segurança do procedimento."),
            ("6. CONSENTIMENTO",
             "Declaro que fui devidamente informado(a) sobre o protocolo de injetáveis intramusculares, seus riscos, benefícios e alternativas. Compreendo que o sucesso do tratamento depende também da minha adesão ao protocolo e do cumprimento das orientações médicas. Estou ciente de que posso revogar este consentimento a qualquer momento."),
        ]
        self._pagina_termo(
            "TERMO DE CONSENTIMENTO — INJETÁVEIS INTRAMUSCULARES",
            "Protocolo de Administração Intramuscular de Compostos Naturais",
            secoes,
            "Ref. Legal: Código de Ética Médica Art. 22 | Resolução CFM nº 2.217/2018 | Recomendação CFM nº 1/2016",
            "Termo — Injetáveis IM"
        )

    # ============================================================
    # PÁG 6 - TCLE INJETÁVEIS ENDOVENOSOS
    # ============================================================
    def pagina_termo_ev(self):
        secoes = [
            ("1. DESCRIÇÃO DO PROCEDIMENTO",
             "O protocolo de injetáveis endovenosos (EV) consiste na administração de substâncias naturais biocompatíveis por via intravenosa, por meio de acesso venoso periférico com infusão controlada (soroterapia/terapia infusional). O procedimento é realizado por profissional de enfermagem habilitado, sob supervisão médica, em ambiente adequado, com monitoramento do paciente durante toda a infusão. A duração de cada sessão varia de 30 minutos a 2 horas, conforme o protocolo individualizado."),
            ("2. SUBSTÂNCIAS ADMINISTRADAS",
             "As substâncias que podem ser administradas por via endovenosa neste protocolo incluem: Coenzima Q10 (CoQ10) — para energia celular e proteção cardiovascular; Pirroloquinolina Quinona (PQQ) — para neuroproteção e função cognitiva; L-Glutationa — para detoxificação hepática, ação antioxidante e melhora da pele; NAD+ (Nicotinamida Adenina Dinucleotídeo) — para energia celular, reparo de DNA e anti-aging. Todas são substâncias naturais produzidas pelo próprio organismo humano."),
            ("3. BENEFÍCIOS ESPERADOS",
             "Os benefícios esperados incluem: melhora da energia e disposição, ação antioxidante e anti-aging, detoxificação celular, melhora da função cognitiva, fortalecimento do sistema imunológico, melhora da qualidade da pele e proteção cardiovascular. A soroterapia permite maior biodisponibilidade das substâncias, pois são administradas diretamente na corrente sanguínea. Os resultados são individuais."),
            ("4. RISCOS E EFEITOS COLATERAIS",
             "Os riscos inerentes ao acesso venoso periférico incluem: flebite (inflamação da veia), infiltração do líquido nos tecidos adjacentes, hematoma no local da punção, dor e inchaço local. Os efeitos colaterais específicos das substâncias são mínimos por se tratar de compostos naturais, podendo incluir: sensação de calor durante a infusão, leve cefaleia, náusea transitória, rubor facial temporário e desconforto no peito (raro, associado ao NAD+). Reações alérgicas graves são extremamente raras. O paciente será monitorado durante toda a infusão e deve comunicar imediatamente qualquer desconforto."),
            ("5. CONTRAINDICAÇÕES",
             "O procedimento é contraindicado em casos de: gestação ou amamentação, alergia conhecida a qualquer componente da fórmula, insuficiência renal ou hepática grave, infecção ativa no local da punção, e outras condições avaliadas pelo médico responsável. O paciente declara ter informado à equipe médica sobre todo o seu histórico de saúde."),
            ("6. CONSENTIMENTO",
             "Declaro que fui devidamente informado(a) sobre o protocolo de injetáveis endovenosos, seus riscos, benefícios e alternativas. Compreendo que a soroterapia é um ato médico (Resolução CFM nº 2004/2012) e que o sucesso do tratamento depende de fatores individuais. Estou ciente de que posso revogar este consentimento a qualquer momento."),
        ]
        self._pagina_termo(
            "TERMO DE CONSENTIMENTO — INJETÁVEIS ENDOVENOSOS",
            "Protocolo de Soroterapia / Terapia Infusional com Compostos Naturais",
            secoes,
            "Ref. Legal: Resolução CFM nº 2004/2012 | Parecer CRM/MS 24/2024 | Código de Ética Médica Art. 22",
            "Termo — Injetáveis EV"
        )

    # ============================================================
    # PÁG 7 - TCLE FÓRMULAS MANIPULADAS
    # ============================================================
    def pagina_termo_formulas(self):
        secoes = [
            ("1. DESCRIÇÃO DO TRATAMENTO",
             "O protocolo de fórmulas manipuladas consiste na prescrição individualizada de compostos naturais biocompatíveis, preparados em farmácia de manipulação autorizada pela ANVISA, conforme as Boas Práticas de Manipulação (RDC nº 67/2007). As fórmulas são elaboradas de acordo com a avaliação clínica e laboratorial do paciente, podendo incluir vitaminas, minerais, aminoácidos, antioxidantes e outros compostos naturais em formas farmacêuticas orais (cápsulas, comprimidos, gotas)."),
            ("2. SUBSTÂNCIAS E COMPOSIÇÃO",
             "As fórmulas podem conter compostos como: Coenzima Q10, PQQ, vitaminas do complexo B, vitamina D3, zinco, magnésio, selênio, ômega-3, melatonina, DHEA, pregnenolona e outros compostos prescritos conforme necessidade individual. A composição exata será detalhada na receita médica entregue ao paciente. Todas as substâncias são compostos naturais biocompatíveis."),
            ("3. RESPONSABILIDADE NA ADESÃO",
             "O paciente compromete-se a: seguir rigorosamente a posologia prescrita; não alterar doses sem orientação médica; armazenar as fórmulas conforme orientação da farmácia; informar ao médico sobre qualquer outro medicamento ou suplemento em uso; e comunicar imediatamente qualquer reação adversa. A não adesão ao tratamento pode comprometer os resultados esperados."),
            ("4. INTERAÇÕES E PRECAUÇÕES",
             "Declaro estar ciente de que, mesmo sendo de origem natural, os compostos presentes nas fórmulas são substâncias ativas que podem apresentar efeitos colaterais e interagir com outros medicamentos, suplementos ou alimentos. Comprometo-me a informar o profissional de saúde sobre todos os medicamentos e suplementos que utilizo. Os efeitos colaterais são mínimos por se tratar de substâncias naturais, podendo incluir: desconforto gastrointestinal leve, alteração do paladar e sonolência (quando contiver melatonina)."),
            ("5. QUALIDADE E RASTREABILIDADE",
             "As fórmulas serão manipuladas em farmácia autorizada, com controle de qualidade de matérias-primas e rastreabilidade de todos os lotes, conforme exigido pela RDC nº 67/2007 da ANVISA. O paciente receberá a receita médica e poderá escolher a farmácia de manipulação de sua preferência, desde que autorizada."),
            ("6. CONSENTIMENTO",
             "Declaro que fui devidamente informado(a) sobre o protocolo de fórmulas manipuladas, seus riscos, benefícios e alternativas. Compreendo que o sucesso do tratamento depende da minha adesão ao protocolo prescrito. Estou ciente de que posso revogar este consentimento a qualquer momento."),
        ]
        self._pagina_termo(
            "TERMO DE CONSENTIMENTO — FÓRMULAS MANIPULADAS",
            "Protocolo de Suplementação Oral com Compostos Naturais Individualizados",
            secoes,
            "Ref. Legal: RDC ANVISA nº 67/2007 | Resolução nº 466/12 CNS | CFF — TCLE para Fórmulas Magistrais",
            "Termo — Fórmulas"
        )

    # ============================================================
    # PÁG 8 - TERMO DE CONFIDENCIALIDADE (LGPD)
    # ============================================================
    def pagina_termo_confidencialidade(self):
        secoes = [
            ("1. OBJETO",
             "O presente termo tem por objeto estabelecer as condições de confidencialidade e proteção dos dados pessoais e sensíveis do paciente, coletados e tratados no âmbito do protocolo de administração de compostos naturais biocompatíveis, em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)."),
            ("2. DADOS COLETADOS",
             "Para a execução do protocolo, serão coletados e tratados os seguintes dados: dados de identificação pessoal (nome, CPF, data de nascimento, endereço, telefone), dados de saúde (histórico médico, exames laboratoriais, medidas antropométricas), dados do protocolo (substâncias administradas, dosagens, frequência, evolução clínica) e registros de atendimento (datas, profissionais envolvidos, assinaturas)."),
            ("3. FINALIDADE DO TRATAMENTO",
             "Os dados coletados serão utilizados exclusivamente para: execução e acompanhamento do protocolo clínico, registro e controle das administrações realizadas, elaboração de relatórios de evolução clínica, comunicação entre a equipe médica responsável e cumprimento de obrigações legais e regulatórias."),
            ("4. COMPARTILHAMENTO",
             "Os dados do paciente não serão compartilhados com terceiros, exceto quando: houver consentimento expresso do paciente, for necessário para cumprimento de obrigação legal ou regulatória, for requisitado por autoridade judicial competente ou for indispensável para a proteção da vida ou da incolumidade física do paciente."),
            ("5. SEGURANÇA DOS DADOS",
             "A equipe responsável compromete-se a adotar medidas técnicas e administrativas adequadas para proteger os dados pessoais contra acessos não autorizados, situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão."),
            ("6. DIREITOS DO TITULAR",
             "O paciente, na qualidade de titular dos dados, tem direito a: confirmar a existência do tratamento, acessar seus dados, solicitar correção de dados incompletos ou desatualizados, solicitar a anonimização, bloqueio ou eliminação de dados desnecessários, e revogar o consentimento a qualquer tempo."),
            ("7. PRAZO DE RETENÇÃO",
             "Os dados serão mantidos pelo período necessário ao cumprimento das finalidades descritas neste termo e, após, pelo prazo exigido pela legislação aplicável ao setor de saúde (mínimo de 20 anos para prontuários médicos, conforme Resolução CFM nº 1.821/2007), sendo eliminados de forma segura ao término do período de retenção."),
        ]
        self._pagina_termo(
            "TERMO DE CONFIDENCIALIDADE E PROTEÇÃO DE DADOS",
            "Em conformidade com a LGPD (Lei nº 13.709/2018)",
            secoes,
            "Ref. Legal: LGPD — Lei nº 13.709/2018 | Resolução CFM nº 1.821/2007 | Código de Ética Médica",
            "Termo — Confidencialidade / LGPD"
        )

    # ============================================================
    # PÁG 9 - CONTRATO FINANCEIRO
    # ============================================================
    def pagina_contrato_financeiro(self):
        w, h = self.nova_retrato()
        m = MARGEM
        aw = w - 2*m
        self.c.setStrokeColor(CINZA_ESCURO)
        self.c.setLineWidth(1)
        self.c.rect(m, m, aw, h - 2*m)

        y = h - m - 3*mm
        self.c.setFont('NotoSansBold', 12)
        self.c.setFillColor(PRETO)
        self.c.drawCentredString(w/2, y, "CONTRATO DE PRESTAÇÃO DE SERVIÇOS")
        y -= 5*mm
        self.c.setFont('NotoSans', 7.5)
        self.c.setFillColor(CINZA_MEDIO)
        self.c.drawCentredString(w/2, y, "Protocolo de Administração de Compostos Naturais Biocompatíveis")
        y -= 4*mm
        self.c.setStrokeColor(CINZA_CLARO)
        self.c.setLineWidth(0.8)
        self.c.line(m + 5*mm, y, w - m - 5*mm, y)
        y -= 5*mm

        tm = m + 6*mm
        tw = aw - 12*mm

        # Seção 1 - Partes
        self.c.setFont('NotoSansBold', 7.5)
        self.c.setFillColor(PRETO)
        self.c.drawString(tm, y, "CLÁUSULA 1ª — DAS PARTES")
        y -= 4*mm
        y = draw_wrapped_text(self.c, "CONTRATADO(A): _____________________________________________, inscrito(a) no CNPJ/CPF nº _______________, CRM nº _______________, com sede/consultório em _______________________________________________.", tm, y, tw, 'NotoSans', 6.8, 8.5)
        y -= 2*mm
        y = draw_wrapped_text(self.c, "CONTRATANTE (Paciente): _____________________________________________, inscrito(a) no CPF nº _______________, residente em _______________________________________________.", tm, y, tw, 'NotoSans', 6.8, 8.5)
        y -= 4*mm

        # Seção 2 - Objeto
        self.c.setFont('NotoSansBold', 7.5)
        self.c.drawString(tm, y, "CLÁUSULA 2ª — DO OBJETO")
        y -= 4*mm
        y = draw_wrapped_text(self.c, "O presente contrato tem por objeto a prestação de serviços de saúde relacionados ao protocolo de administração de compostos naturais biocompatíveis, conforme descrito no Protocolo Clínico de Fechamento anexo, incluindo consultas, aplicações injetáveis (IM, EV, SC), implantes e fórmulas manipuladas, conforme protocolo individualizado.", tm, y, tw, 'NotoSans', 6.8, 8.5)
        y -= 4*mm

        # Seção 3 - Tabela de Preços
        self.c.setFont('NotoSansBold', 7.5)
        self.c.drawString(tm, y, "CLÁUSULA 3ª — DOS VALORES E DISCRIMINAÇÃO DE SERVIÇOS")
        y -= 4*mm

        # Tabela
        col1 = 55*mm
        col2 = 15*mm
        col3 = 20*mm
        col4 = 25*mm
        tab_w = col1 + col2 + col3 + col4
        rh = 4.5*mm

        # Header
        self.c.setFillColor(CINZA_HEADER)
        self.c.rect(tm, y - rh, tab_w, rh, fill=1)
        self.c.setFont('NotoSansBold', 5.5)
        self.c.setFillColor(BRANCO)
        self.c.drawString(tm + 1*mm, y - rh + 1*mm, "SERVIÇO / APLICAÇÃO")
        self.c.drawCentredString(tm + col1 + col2/2, y - rh + 1*mm, "QTDE")
        self.c.drawCentredString(tm + col1 + col2 + col3/2, y - rh + 1*mm, "VLR UNIT.")
        self.c.drawCentredString(tm + col1 + col2 + col3 + col4/2, y - rh + 1*mm, "SUBTOTAL")
        y -= rh

        items = [
            ('Consulta Inicial', 1, 600.00),
            ('Retorno (2x)', 2, 350.00),
            ('CoQ10 — Endovenoso', 8, 280.00),
            ('PQQ — Endovenoso', 5, 320.00),
            ('Vit D3 — Intramuscular', 5, 150.00),
            ('Vit B12 — Intramuscular', 5, 120.00),
            ('Tirzepatida — Subcutâneo', 10, 450.00),
            ('Test 25 — Intramuscular', 8, 180.00),
            ('Test 200 — Intramuscular', 8, 250.00),
            ('Test 1000 — Intramuscular', 4, 380.00),
            ('Glutationa — Endovenoso', 8, 350.00),
            ('NAD+ — Endovenoso', 8, 480.00),
            ('Implante Hormonal', 1, 2500.00),
            ('Fórmulas Manipuladas (6 meses)', 6, 450.00),
        ]

        total_geral = 0
        for idx, (nome, qtd, vlr) in enumerate(items):
            sub = qtd * vlr
            total_geral += sub
            if idx % 2 == 0:
                self.c.setFillColor(CINZA_LINHA_ALT)
                self.c.rect(tm, y - rh, tab_w, rh, fill=1)
            self.c.setStrokeColor(CINZA_BORDA)
            self.c.setLineWidth(0.2)
            self.c.rect(tm, y - rh, col1, rh)
            self.c.rect(tm + col1, y - rh, col2, rh)
            self.c.rect(tm + col1 + col2, y - rh, col3, rh)
            self.c.rect(tm + col1 + col2 + col3, y - rh, col4, rh)
            self.c.setFont('NotoSans', 5.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(tm + 1*mm, y - rh + 1*mm, nome)
            self.c.drawCentredString(tm + col1 + col2/2, y - rh + 1*mm, str(qtd))
            self.c.drawCentredString(tm + col1 + col2 + col3/2, y - rh + 1*mm, f"R$ {vlr:,.2f}")
            self.c.drawCentredString(tm + col1 + col2 + col3 + col4/2, y - rh + 1*mm, f"R$ {sub:,.2f}")
            y -= rh

        # Total
        self.c.setFillColor(CINZA_HEADER)
        self.c.rect(tm, y - rh, tab_w, rh, fill=1)
        self.c.setFont('NotoSansBold', 6)
        self.c.setFillColor(BRANCO)
        self.c.drawString(tm + 1*mm, y - rh + 1*mm, "VALOR TOTAL DO PROTOCOLO")
        self.c.drawCentredString(tm + col1 + col2 + col3 + col4/2, y - rh + 1*mm, f"R$ {total_geral:,.2f}")
        y -= rh

        y -= 3*mm
        self.c.setFont('NotoSans', 6.5)
        self.c.setFillColor(PRETO)
        y = draw_wrapped_text(self.c, f"§1º O valor total do protocolo é de R$ {total_geral:,.2f} ({self._valor_extenso(total_geral)}), podendo ser pago nas seguintes modalidades: PIX, cartão de crédito (em até 12x), boleto bancário ou transferência bancária.", tm, y, tw, 'NotoSans', 6.5, 8.5)
        y -= 2*mm
        y = draw_wrapped_text(self.c, "§2º Os valores individuais discriminados acima servirão de base para cálculo de reembolso em caso de desistência parcial do protocolo.", tm, y, tw, 'NotoSans', 6.5, 8.5)
        y -= 4*mm

        # Seção 4 - Pagamento
        self.c.setFont('NotoSansBold', 7.5)
        self.c.drawString(tm, y, "CLÁUSULA 4ª — DA FORMA DE PAGAMENTO")
        y -= 4*mm
        y = draw_wrapped_text(self.c, "Forma escolhida: [  ] À vista com ___% de desconto  [  ] Parcelado em ___ x R$ ___________  [  ] Entrada de R$ ___________ + ___ parcelas de R$ ___________", tm, y, tw, 'NotoSans', 6.5, 8.5)
        y -= 4*mm

        # Seção 5 - Obrigações
        self.c.setFont('NotoSansBold', 7.5)
        self.c.drawString(tm, y, "CLÁUSULA 5ª — DAS OBRIGAÇÕES")
        y -= 4*mm
        y = draw_wrapped_text(self.c, "O CONTRATADO compromete-se a: prestar os serviços com qualidade técnica, utilizar materiais adequados, manter sigilo profissional e cumprir as normas de segurança. O CONTRATANTE compromete-se a: informar sobre condições de saúde, seguir orientações médicas, comparecer nas datas agendadas e cumprir os pagamentos acordados.", tm, y, tw, 'NotoSans', 6.5, 8.5)
        y -= 3*mm

        # Assinaturas
        draw_checkbox(self.c, tm, y - 0.5*mm)
        self.c.setFont('NotoSans', 6.5)
        self.c.drawString(tm + 5*mm, y, "Declaro que li, compreendi e estou de acordo com todas as cláusulas deste contrato.")
        y -= 5*mm
        self.c.drawString(tm, y, "Local e Data: _______________________________________________")
        y -= 10*mm
        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(0.5)
        x1 = tm
        self.c.line(x1, y, x1 + 6*cm, y)
        self.c.setFont('NotoSans', 6.5)
        self.c.drawString(x1, y - 3.5*mm, "CONTRATANTE (Paciente)")
        x2 = w/2 + 5*mm
        self.c.line(x2, y, x2 + 6*cm, y)
        self.c.drawString(x2, y - 3.5*mm, "CONTRATADO (Médico/Clínica)")

        self.rodape_com_rubrica(w, h, "Contrato Financeiro")

    def _valor_extenso(self, valor):
        """Retorna valor por extenso simplificado"""
        inteiro = int(valor)
        centavos = int(round((valor - inteiro) * 100))
        if centavos > 0:
            return f"{inteiro} reais e {centavos} centavos"
        return f"{inteiro} reais"

    # ============================================================
    # PÁG 10 - CLÁUSULAS DE DESISTÊNCIA
    # ============================================================
    def pagina_desistencia(self):
        secoes = [
            ("CLÁUSULA 6ª — DO DIREITO DE ARREPENDIMENTO",
             "O CONTRATANTE poderá desistir do presente contrato no prazo de 7 (sete) dias a contar da sua assinatura, sem qualquer ônus, nos termos do artigo 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990), desde que a contratação tenha ocorrido fora do estabelecimento comercial. Neste caso, os valores eventualmente pagos serão devolvidos integralmente, de imediato, monetariamente atualizados."),
            ("CLÁUSULA 7ª — DA DESISTÊNCIA APÓS O PRAZO DE ARREPENDIMENTO",
             "Após o prazo de 7 (sete) dias, em caso de desistência imotivada pelo CONTRATANTE, aplicar-se-ão as seguintes regras: (a) Serão deduzidos os valores referentes aos serviços já prestados, calculados com base nos preços individuais discriminados na Cláusula 3ª; (b) Será cobrada multa rescisória de 10% (dez por cento) sobre o valor remanescente do contrato, a título de despesas administrativas e custos operacionais; (c) Serão deduzidos os custos com insumos já adquiridos especificamente para o protocolo do paciente, mediante comprovação por notas fiscais."),
            ("CLÁUSULA 8ª — DA JUSTIFICATIVA PARA RETENÇÃO DE VALORES",
             "A retenção parcial de valores em caso de desistência justifica-se pelos seguintes fatores: (a) Reserva de agenda e tempo de equipe médica e de enfermagem dedicados ao protocolo do paciente; (b) Aquisição antecipada de insumos, substâncias e materiais específicos para o protocolo individualizado, que possuem prazo de validade e não podem ser reutilizados; (c) Custos administrativos de planejamento, preparação e logística do protocolo; (d) Perda de oportunidade de atendimento a outros pacientes no período reservado."),
            ("CLÁUSULA 9ª — DO CÁLCULO DO REEMBOLSO",
             "O valor a ser reembolsado ao CONTRATANTE será calculado pela seguinte fórmula: REEMBOLSO = Valor Total Pago - (Valor dos Serviços Prestados + Multa Rescisória de 10% + Custos Comprovados com Insumos). O reembolso será efetuado em até 30 (trinta) dias úteis após a formalização da desistência, na mesma forma de pagamento utilizada pelo CONTRATANTE."),
            ("CLÁUSULA 10ª — FUNDAMENTAÇÃO JURÍDICA",
             "As cláusulas de desistência deste contrato estão fundamentadas na seguinte legislação e jurisprudência: (a) Código de Defesa do Consumidor (Lei nº 8.078/1990), artigos 6º, 46, 47 e 49; (b) Código Civil (Lei nº 10.406/2002), artigos 421 e 422 (boa-fé e função social do contrato); (c) Jurisprudência do TJ-SP e STJ que estabelece como razoável a multa rescisória entre 10% e 20% do valor remanescente; (d) Entendimento jurisprudencial de que a retenção de valores por insumos deve ser comprovada documentalmente (TJ-PR); (e) Princípio da proporcionalidade e do equilíbrio contratual."),
            ("CLÁUSULA 11ª — DA DESISTÊNCIA POR PARTE DO CONTRATADO",
             "Em caso de impossibilidade de continuidade do protocolo por parte do CONTRATADO, os valores referentes aos serviços não prestados serão integralmente devolvidos ao CONTRATANTE, sem aplicação de qualquer multa ou penalidade, no prazo de 15 (quinze) dias úteis."),
            ("CLÁUSULA 12ª — DO FORO",
             "As partes elegem o foro da comarca de _______________ para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato, renunciando a qualquer outro, por mais privilegiado que seja."),
        ]
        self._pagina_termo(
            "CLÁUSULAS DE DESISTÊNCIA E CANCELAMENTO",
            "Termos de Rescisão Contratual — Fundamentação Legal e Jurisprudencial",
            secoes,
            "Ref. Legal: CDC Arts. 6º, 46, 47, 49, 51 | CC Arts. 421, 422 | Jurisprudência TJ-SP, TJ-RS, TJ-PR, STJ",
            "Cláusulas de Desistência"
        )

    # ============================================================
    # PÁG 11 - RAS DOCUMENTAL
    # ============================================================
    def pagina_ras_documental(self):
        w, h = self.nova_paisagem()
        m = MARGEM
        aw = w - 2*m
        y = h - m

        self.c.setFillColor(CINZA_HEADER)
        self.c.rect(m, y - 8*mm, aw, 8*mm, fill=1)
        self.c.setFont('NotoSansBold', 9)
        self.c.setFillColor(BRANCO)
        self.c.drawString(m + 3*mm, y - 6*mm, "RAS  -  REGISTRO ADMINISTRAÇÃO DE SUBSTÂNCIAS")
        self.c.setFont('NotoSans', 7)
        self.c.drawRightString(w - m - 3*mm, y - 6*mm, "RAS Documental")
        y -= 9*mm

        campos = ['NOME', 'CPF', 'CELULAR', 'MÉDICO RESPONSÁVEL', 'ENFERMEIRA', 'UNIDADE', 'DATA ATENDIMENTO']
        pac_h = len(campos) * 4*mm
        self.c.setFillColor(CINZA_MUITO_CLARO)
        self.c.rect(m, y - pac_h, aw, pac_h, fill=1)
        self.c.setStrokeColor(CINZA_BORDA)
        self.c.setLineWidth(0.3)
        self.c.rect(m, y - pac_h, aw, pac_h)
        for label in campos:
            self.c.setFont('NotoSansBold', 6.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 3*mm, y - 3*mm, label)
            if label == 'NOME':
                self.c.drawString(w - m - 40*mm, y - 3*mm, "IDADE:")
            y -= 4*mm
        y -= 2*mm

        ns = len(SUBSTANCIAS)
        proto_x = m + 65*mm
        sub_w = (aw - 65*mm) / ns

        self.c.setFillColor(CINZA_DESTAQUE)
        self.c.rect(m, y - 5*mm, aw, 5*mm, fill=1)
        self.c.setStrokeColor(CINZA_BORDA)
        self.c.rect(m, y - 5*mm, aw, 5*mm)
        self.c.setFont('NotoSansBold', 7)
        self.c.setFillColor(PRETO)
        self.c.drawString(m + 3*mm, y - 4*mm, "Protocolo Medicamento")
        for i, sub in enumerate(SUBSTANCIAS):
            self.c.setFont('NotoSansBold', 5.5)
            self.c.drawCentredString(proto_x + i*sub_w + sub_w/2, y - 4*mm, sub)
        y -= 5.5*mm

        qtdes_str = [f'Qtde {q}' for q in QTDES]
        freqs_str = [f'Dias {f}' for f in FREQS_DIAS]
        datas_str = [DATA_INICIO.strftime('%d/%m/%Y')] * ns

        for label, vals in [('Número de Aplicações', qtdes_str), ('Frequência de Aplicações', freqs_str), ('Data Início por Substância', datas_str)]:
            self.c.setFont('NotoSans', 6)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 3*mm, y - 3*mm, label)
            for i in range(ns):
                self.c.setFont('NotoSans', 5.5)
                self.c.drawCentredString(proto_x + i*sub_w + sub_w/2, y - 3*mm, vals[i])
            y -= 4*mm
        y -= 2*mm

        fixed = [('AGENDA\nMENTO', 10*mm), ('CIÊNCIA E\nASSINATURA', 25*mm), ('ENF', 8*mm), ('DATA\nPREVISTA', 16*mm), ('DATA\nEFETIVA', 16*mm)]
        fixed_w = sum(c[1] for c in fixed)
        scw = (aw - fixed_w) / ns

        hdr_h = 9*mm
        self.c.setFillColor(CINZA_HEADER)
        self.c.rect(m, y - hdr_h, aw, hdr_h, fill=1)
        xp = m
        self.c.setFont('NotoSansBold', 5)
        self.c.setFillColor(BRANCO)
        for cn, cw in fixed:
            for j, line in enumerate(cn.split('\n')):
                self.c.drawCentredString(xp + cw/2, y - 3*mm - j*2.5*mm, line)
            xp += cw
        for sub in SUBSTANCIAS:
            self.c.drawCentredString(xp + scw/2, y - 3*mm, "STATUS")
            self.c.drawCentredString(xp + scw/2, y - 5.5*mm, "SESSÃO")
            self.c.setFont('NotoSansBold', 4.5)
            self.c.drawCentredString(xp + scw/2, y - 8*mm, sub)
            self.c.setFont('NotoSansBold', 5)
            xp += scw
        y -= hdr_h

        rh = 6*mm
        for sess in range(1, 21):
            if sess % 2 == 0:
                self.c.setFillColor(CINZA_LINHA_ALT)
                self.c.rect(m, y - rh, aw, rh, fill=1)
            self.c.setFont('NotoSansBold', 6)
            self.c.setFillColor(PRETO)
            self.c.drawCentredString(m + fixed[0][1]/2, y - rh/2 - 1*mm, str(sess))
            xp = m
            for _, cw in fixed:
                self.c.setStrokeColor(CINZA_BORDA)
                self.c.setLineWidth(0.3)
                self.c.rect(xp, y - rh, cw, rh)
                xp += cw
            for i in range(ns):
                self.c.setStrokeColor(CINZA_BORDA)
                self.c.rect(xp, y - rh, scw, rh)
                xp += scw
            y -= rh

        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(0.8)
        self.c.rect(m, y, aw, hdr_h + 20*rh)

        y -= 5*mm
        self.c.setFont('NotoSansBold', 6.5)
        self.c.setFillColor(PRETO)
        self.c.setStrokeColor(PRETO)
        self.c.setLineWidth(0.5)
        self.c.drawString(m, y, "Paciente:")
        self.c.line(m + 16*mm, y - 1, m + 65*mm, y - 1)
        self.c.drawString(m + 80*mm, y, "Médico Resp.:")
        self.c.line(m + 105*mm, y - 1, m + 160*mm, y - 1)
        self.c.drawString(m + 170*mm, y, "Enfermeiro Resp.:")
        self.c.line(m + 200*mm, y - 1, w - m, y - 1)
        self.rodape(w, h, "RAS Documental")

    # ============================================================
    # PÁG 12+ - RAS OPERACIONAL COM DATAS AUTO-PREENCHIDAS
    # ============================================================
    def pagina_ras_operacional(self):
        ns = len(SUBSTANCIAS)
        freq_marc = [max(1, f // 7) for f in FREQS_DIAS]
        total_apps = sum(QTDES)

        def tem_app(si, marc):
            f = freq_marc[si]
            if (marc - 1) % f == 0:
                a = (marc - 1) // f + 1
                if a <= QTDES[si]:
                    return a
            return 0

        def pct(marc):
            t = 0
            for i in range(ns):
                f = freq_marc[i]
                for mk in range(1, marc + 1):
                    if (mk - 1) % f == 0:
                        a = (mk - 1) // f + 1
                        if a <= QTDES[i]:
                            t += 1
            return min(100, round(t / total_apps * 100))

        max_m = max((QTDES[i] - 1) * freq_marc[i] + 1 for i in range(ns))
        total_marcs = max(max_m, 20)
        mpp = 20
        npags = (total_marcs + mpp - 1) // mpp

        for pg in range(npags):
            w, h = self.nova_paisagem()
            m = MARGEM
            aw = w - 2*m
            y = h - m

            self.c.setFillColor(CINZA_HEADER)
            self.c.rect(m, y - 8*mm, aw, 8*mm, fill=1)
            self.c.setFont('NotoSansBold', 9)
            self.c.setFillColor(BRANCO)
            self.c.drawString(m + 3*mm, y - 6*mm, "RAS  -  REGISTRO ADMINISTRAÇÃO DE SUBSTÂNCIAS")
            ct = "RAS Operacional — Controle de Enfermagem"
            if pg > 0:
                ct += f" (cont. pág {pg + 1})"
            self.c.setFont('NotoSans', 7)
            self.c.drawRightString(w - m - 3*mm, y - 6*mm, ct)
            y -= 9*mm

            campos = ['NOME', 'CPF', 'CELULAR', 'MÉDICO RESPONSÁVEL', 'ENFERMEIRA', 'UNIDADE', 'DATA ATENDIMENTO']
            ph = len(campos) * 3.8*mm
            self.c.setFillColor(CINZA_MUITO_CLARO)
            self.c.rect(m, y - ph, aw, ph, fill=1)
            self.c.setStrokeColor(CINZA_BORDA)
            self.c.setLineWidth(0.3)
            self.c.rect(m, y - ph, aw, ph)
            for label in campos:
                self.c.setFont('NotoSansBold', 6)
                self.c.setFillColor(PRETO)
                self.c.drawString(m + 3*mm, y - 3*mm, label)
                if label == 'NOME':
                    self.c.drawString(w - m - 40*mm, y - 3*mm, "IDADE:")
                y -= 3.8*mm
            y -= 2*mm

            px = m + 65*mm
            sw = (aw - 65*mm) / ns

            self.c.setFillColor(CINZA_DESTAQUE)
            self.c.rect(m, y - 4.5*mm, aw, 4.5*mm, fill=1)
            self.c.setStrokeColor(CINZA_BORDA)
            self.c.rect(m, y - 4.5*mm, aw, 4.5*mm)
            self.c.setFont('NotoSansBold', 6.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 3*mm, y - 3.5*mm, "Protocolo Medicamento")
            for i, sub in enumerate(SUBSTANCIAS):
                self.c.setFont('NotoSansBold', 5.5)
                self.c.drawCentredString(px + i*sw + sw/2, y - 3.5*mm, sub)
            y -= 5*mm

            self.c.setFont('NotoSans', 5.5)
            self.c.setFillColor(PRETO)
            self.c.drawString(m + 3*mm, y - 3*mm, "Nº Aplicações")
            for i in range(ns):
                self.c.drawCentredString(px + i*sw + sw/2, y - 3*mm, f"Qtde {QTDES[i]}")
            y -= 3.5*mm
            self.c.drawString(m + 3*mm, y - 3*mm, "Frequência")
            for i in range(ns):
                self.c.drawCentredString(px + i*sw + sw/2, y - 3*mm, f"Dias {FREQS_DIAS[i]}")
            y -= 3.5*mm
            self.c.drawString(m + 3*mm, y - 3*mm, "Data Início")
            for i in range(ns):
                self.c.drawCentredString(px + i*sw + sw/2, y - 3*mm, DATA_INICIO.strftime('%d/%m/%Y'))
            y -= 4*mm

            fixed = [('AGENDA\nMENTO', 10*mm), ('RUBRICA\nPACIENTE', 22*mm), ('ENF', 8*mm), ('DATA\nPREVISTA', 15*mm), ('DATA\nEFETIVA', 15*mm)]
            fw = sum(c[1] for c in fixed)
            scw = (aw - fw) / ns

            hh = 9*mm
            self.c.setFillColor(CINZA_HEADER)
            self.c.rect(m, y - hh, aw, hh, fill=1)
            xp = m
            self.c.setFont('NotoSansBold', 5)
            self.c.setFillColor(BRANCO)
            for cn, cw in fixed:
                for j, line in enumerate(cn.split('\n')):
                    self.c.drawCentredString(xp + cw/2, y - 3*mm - j*2.5*mm, line)
                xp += cw
            for sub in SUBSTANCIAS:
                self.c.drawCentredString(xp + scw/2, y - 3*mm, "STATUS")
                self.c.drawCentredString(xp + scw/2, y - 5.5*mm, "SESSÃO")
                self.c.setFont('NotoSansBold', 4.5)
                self.c.drawCentredString(xp + scw/2, y - 8*mm, sub)
                self.c.setFont('NotoSansBold', 5)
                xp += scw
            y -= hh

            rh = 6*mm
            sm = pg * mpp + 1
            em = min(sm + mpp - 1, total_marcs)

            for marc in range(sm, em + 1):
                if marc % 2 == 0:
                    self.c.setFillColor(CINZA_LINHA_ALT)
                    self.c.rect(m, y - rh, aw, rh, fill=1)

                # Número da marcação
                self.c.setFont('NotoSansBold', 6)
                self.c.setFillColor(PRETO)
                self.c.drawCentredString(m + fixed[0][1]/2, y - rh/2 - 1*mm, str(marc))

                # Data prevista auto-preenchida
                data_prev = DATA_INICIO + timedelta(days=(marc - 1) * 7)
                xp_data = m + fixed[0][1] + fixed[1][1] + fixed[2][1]
                self.c.setFont('NotoSans', 5)
                self.c.drawCentredString(xp_data + fixed[3][1]/2, y - rh/2 - 1*mm, data_prev.strftime('%d/%m/%Y'))

                xp = m
                for _, cw in fixed:
                    self.c.setStrokeColor(CINZA_BORDA)
                    self.c.setLineWidth(0.3)
                    self.c.rect(xp, y - rh, cw, rh)
                    xp += cw

                for i in range(ns):
                    a = tem_app(i, marc)
                    if a > 0:
                        self.c.setFillColor(CINZA_CELULA)
                        self.c.rect(xp, y - rh, scw, rh, fill=1)
                        self.c.setFont('NotoSans', 5)
                        self.c.setFillColor(PRETO)
                        self.c.drawCentredString(xp + scw/2, y - rh/2 - 1*mm, f"{a} / {QTDES[i]}")
                    self.c.setStrokeColor(CINZA_BORDA)
                    self.c.setLineWidth(0.3)
                    self.c.rect(xp, y - rh, scw, rh)
                    xp += scw

                y -= rh

            nr = em - sm + 1
            self.c.setStrokeColor(PRETO)
            self.c.setLineWidth(0.8)
            self.c.rect(m, y, aw, hh + nr*rh)

            # Progresso
            y -= 4*mm
            self.c.setFont('NotoSans', 5.5)
            self.c.setFillColor(CINZA_MEDIO)
            marcos = []
            for marc in range(sm, em + 1):
                p = pct(marc)
                marcos.append(f"M{marc}:{p}%")
            pt = "  ".join(marcos[:10])
            self.c.drawString(m, y, f"Progresso: {pt}")
            if len(marcos) > 10:
                y -= 3*mm
                pt2 = "  ".join(marcos[10:])
                self.c.drawString(m + 18*mm, y, pt2)

            y -= 5*mm
            self.c.setFont('NotoSansBold', 6.5)
            self.c.setFillColor(PRETO)
            self.c.setStrokeColor(PRETO)
            self.c.setLineWidth(0.5)
            self.c.drawString(m, y, "Paciente:")
            self.c.line(m + 16*mm, y - 1, m + 65*mm, y - 1)
            self.c.drawString(m + 80*mm, y, "Médico Resp.:")
            self.c.line(m + 105*mm, y - 1, m + 160*mm, y - 1)
            self.c.drawString(m + 170*mm, y, "Enfermeiro Resp.:")
            self.c.line(m + 200*mm, y - 1, w - m, y - 1)
            self.rodape(w, h, f"RAS Operacional" + (f" — pág. {pg+1}" if pg > 0 else ""))

    # ============================================================
    # GERAR TUDO
    # ============================================================
    def gerar(self):
        print("01/13 Capa...")
        self.pagina_capa()
        print("02/13 Tabela Benefícios (Estrelas)...")
        self.pagina_tabela_estrelas()
        print("03/13 Efeitos Esperados...")
        self.pagina_tabela_efeitos()
        print("04/13 Termo — Implantes...")
        self.pagina_termo_implantes()
        print("05/13 Termo — Injetáveis IM...")
        self.pagina_termo_im()
        print("06/13 Termo — Injetáveis EV...")
        self.pagina_termo_ev()
        print("07/13 Termo — Fórmulas...")
        self.pagina_termo_formulas()
        print("08/13 Termo — Confidencialidade...")
        self.pagina_termo_confidencialidade()
        print("09/13 Contrato Financeiro...")
        self.pagina_contrato_financeiro()
        print("10/13 Cláusulas de Desistência...")
        self.pagina_desistencia()
        print("11/13 RAS Documental...")
        self.pagina_ras_documental()
        print("12/13 RAS Operacional...")
        self.pagina_ras_operacional()
        self.c.save()
        print(f"\nPDF gerado: {self.filename}")
        print(f"Total: {self.page_num} páginas")


if __name__ == '__main__':
    pdf = ProtocoloPDF(OUTPUT_FILE)
    pdf.gerar()
