#!/usr/bin/env python3
"""
VentifyPOS - Diagnostico de Preparacion para Produccion
Generado automaticamente con ReportLab
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm, mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, HRFlowable, Image, CondPageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font Registration ──
# Chinese fonts (available in this environment)
# Chinese fonts - use static TTF files (variable fonts not supported by ReportLab)
pdfmetrics.registerFont(TTFont('NotoSerifSC', '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSCBold', '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSCBold', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('WenQuanYi', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', subfontIndex=0))

# English fonts (Liberation Sans = metrically compatible with Arial)
pdfmetrics.registerFont(TTFont('LibSans', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LibSansBold', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('LibSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LibSerifBold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))

# Symbol font
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSCBold')
registerFontFamily('WenQuanYi', normal='WenQuanYi', bold='WenQuanYi')
registerFontFamily('SarasaMonoSC', normal='SarasaMonoSC', bold='SarasaMonoSCBold')
registerFontFamily('LibSans', normal='LibSans', bold='LibSansBold')
registerFontFamily('LibSerif', normal='LibSerif', bold='LibSerifBold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# Install font fallback for mixed CJK/Latin
import sys
sys.path.insert(0, '/home/z/my-project/skills/pdf/scripts')
from pdf import install_font_fallback
install_font_fallback()

# ━━ Cascade Palette ━━
PAGE_BG       = colors.HexColor('#f7f7f6')
SECTION_BG    = colors.HexColor('#f2f1f0')
CARD_BG       = colors.HexColor('#f0efec')
TABLE_STRIPE  = colors.HexColor('#f1f1ee')
HEADER_FILL   = colors.HexColor('#645c45')
COVER_BLOCK   = colors.HexColor('#6a5f40')
BORDER        = colors.HexColor('#ccc3ab')
ICON          = colors.HexColor('#847033')
ACCENT        = colors.HexColor('#258caf')
ACCENT_2      = colors.HexColor('#44ab44')
TEXT_PRIMARY   = colors.HexColor('#191917')
TEXT_MUTED     = colors.HexColor('#8d8a83')
SEM_SUCCESS   = colors.HexColor('#508863')
SEM_WARNING   = colors.HexColor('#b18d45')
SEM_ERROR     = colors.HexColor('#a55a53')
SEM_INFO      = colors.HexColor('#54718f')

# ── Page Setup ──
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 1.0 * inch
RIGHT_MARGIN = 1.0 * inch
TOP_MARGIN = 0.8 * inch
BOTTOM_MARGIN = 0.8 * inch
CONTENT_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN

# ── Styles ──
styles = getSampleStyleSheet()

cover_title = ParagraphStyle(
    'CoverTitle', fontName='SarasaMonoSC', fontSize=36, leading=48,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY, spaceAfter=12
)
cover_subtitle = ParagraphStyle(
    'CoverSubtitle', fontName='WenQuanYi', fontSize=16, leading=24,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceAfter=6
)
cover_meta = ParagraphStyle(
    'CoverMeta', fontName='WenQuanYi', fontSize=12, leading=18,
    alignment=TA_CENTER, textColor=TEXT_MUTED
)

h1_style = ParagraphStyle(
    'H1Custom', fontName='SarasaMonoSC', fontSize=20, leading=28,
    textColor=ACCENT, spaceBefore=18, spaceAfter=10,
    borderPadding=(0, 0, 4, 0)
)
h2_style = ParagraphStyle(
    'H2Custom', fontName='SarasaMonoSC', fontSize=15, leading=22,
    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8
)
h3_style = ParagraphStyle(
    'H3Custom', fontName='WenQuanYi', fontSize=12, leading=18,
    textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6
)

body_style = ParagraphStyle(
    'BodyCustom', fontName='WenQuanYi', fontSize=10.5, leading=18,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceAfter=6,
    wordWrap='CJK', firstLineIndent=21
)
body_no_indent = ParagraphStyle(
    'BodyNoIndent', fontName='WenQuanYi', fontSize=10.5, leading=18,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceAfter=6,
    wordWrap='CJK'
)

bullet_style = ParagraphStyle(
    'BulletCustom', fontName='WenQuanYi', fontSize=10.5, leading=18,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceAfter=4,
    leftIndent=24, bulletIndent=12, wordWrap='CJK'
)

callout_style = ParagraphStyle(
    'CalloutCustom', fontName='WenQuanYi', fontSize=11, leading=18,
    alignment=TA_LEFT, textColor=SEM_ERROR, spaceAfter=6,
    leftIndent=12, borderPadding=(6, 6, 6, 6), wordWrap='CJK',
    backColor=colors.HexColor('#fdf2f1')
)
callout_warn = ParagraphStyle(
    'CalloutWarn', fontName='WenQuanYi', fontSize=11, leading=18,
    alignment=TA_LEFT, textColor=SEM_WARNING, spaceAfter=6,
    leftIndent=12, borderPadding=(6, 6, 6, 6), wordWrap='CJK',
    backColor=colors.HexColor('#fdf8ef')
)
callout_ok = ParagraphStyle(
    'CalloutOK', fontName='WenQuanYi', fontSize=11, leading=18,
    alignment=TA_LEFT, textColor=SEM_SUCCESS, spaceAfter=6,
    leftIndent=12, borderPadding=(6, 6, 6, 6), wordWrap='CJK',
    backColor=colors.HexColor('#f0f7f3')
)

caption_style = ParagraphStyle(
    'CaptionCustom', fontName='WenQuanYi', fontSize=9, leading=14,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceAfter=6
)

# Table styles
th_style = ParagraphStyle(
    'THStyle', fontName='WenQuanYi', fontSize=10, leading=14,
    alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK'
)
td_style = ParagraphStyle(
    'TDStyle', fontName='WenQuanYi', fontSize=9.5, leading=14,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, wordWrap='CJK'
)
td_center = ParagraphStyle(
    'TDCenter', fontName='WenQuanYi', fontSize=9.5, leading=14,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY, wordWrap='CJK'
)

# ── Helper Functions ──
def make_table(data, col_widths=None, has_header=True):
    """Create a consistently styled table."""
    available = CONTENT_W
    if col_widths is None:
        col_widths = [available / len(data[0])] * len(data[0])
    else:
        # Scale to fit
        total = sum(col_widths)
        if total > available:
            col_widths = [w * available / total for w in col_widths]
        elif total < available * 0.85:
            scale = (available * 0.92) / total
            col_widths = [w * scale for w in col_widths]

    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ]
    if has_header:
        style_cmds.extend([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ])
    # Alternate row colors
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))

    t.setStyle(TableStyle(style_cmds))
    return t

def progress_bar(percent, width=200):
    """Return a simple text-based progress indicator."""
    filled = int(percent / 100 * 10)
    bar = '|' + '=' * filled + '-' * (10 - filled) + '|'
    return f"{bar} {percent}%"

def severity_cell(level, style=None):
    """Return a colored severity cell."""
    if style is None:
        style = td_center
    color_map = {
        'CRITICO': SEM_ERROR,
        'ALTO': SEM_WARNING,
        'MEDIO': SEM_INFO,
        'BAJO': SEM_SUCCESS,
        'LISTO': SEM_SUCCESS,
    }
    c = color_map.get(level, TEXT_PRIMARY)
    s = ParagraphStyle('sev', parent=style, textColor=c)
    return Paragraph(f'<b>{level}</b>', s)

# ── Build Document ──
output_path = '/home/z/my-project/download/VentifyPOS_Diagnostico_Produccion.pdf'

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=LEFT_MARGIN,
    rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN,
    bottomMargin=BOTTOM_MARGIN,
    title='VentifyPOS - Diagnostico de Produccion',
    author='Z.ai',
    creator='Z.ai',
)

story = []

# ═══════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 120))

# Decorative line
story.append(HRFlowable(width="60%", thickness=2, color=ACCENT, spaceBefore=0, spaceAfter=20))

story.append(Paragraph('<b>VentifyPOS</b>', cover_title))
story.append(Spacer(1, 8))
story.append(Paragraph('Diagnostico de Preparacion<br/>para Produccion', cover_subtitle))
story.append(Spacer(1, 12))
story.append(HRFlowable(width="60%", thickness=2, color=ACCENT, spaceBefore=0, spaceAfter=24))
story.append(Spacer(1, 24))
story.append(Paragraph('Sin migracion a PostgreSQL', ParagraphStyle(
    'CoverNote', fontName='WenQuanYi', fontSize=13, leading=20,
    alignment=TA_CENTER, textColor=SEM_WARNING
)))
story.append(Spacer(1, 60))
story.append(Paragraph('Fecha: 25 de abril de 2026', cover_meta))
story.append(Spacer(1, 6))
story.append(Paragraph('Analisis de codigo completo del repositorio', cover_meta))
story.append(Spacer(1, 6))
story.append(Paragraph('Generado por Z.ai', cover_meta))

story.append(Spacer(1, 80))

# Veredicto grande
veredicto_style = ParagraphStyle(
    'Veredicto', fontName='SarasaMonoSC', fontSize=28, leading=36,
    alignment=TA_CENTER, textColor=SEM_WARNING
)
story.append(Paragraph('<b>55% Listo</b>', veredicto_style))
story.append(Spacer(1, 6))
story.append(Paragraph('Estimacion: 4-6 semanas de trabajo enfocado', ParagraphStyle(
    'VeredictoSub', fontName='WenQuanYi', fontSize=13, leading=20,
    alignment=TA_CENTER, textColor=TEXT_MUTED
)))

# ═══════════════════════════════════════════════════════
# RESUMEN EJECUTIVO
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 36))
story.append(Paragraph('<b>Resumen Ejecutivo</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'VentifyPOS es un sistema POS SaaS para el mercado colombiano construido con Next.js 16, React 19, '
    'Prisma ORM y shadcn/ui. El proyecto cuenta con un conjunto de features excepcionalmente completo '
    'para su etapa de desarrollo: facturacion electronica DIAN completa, contabilidad de doble entrada, '
    'gestion de mesas para restaurantes, inventario, compras, CRM basico, y un modelo de suscripciones '
    'SaaS con panel de super-administrador. Sin embargo, existen brechas criticas que impiden un despliegue '
    'en produccion real, siendo las mas graves la ausencia total de tests, errores de TypeScript que '
    'rompen la integracion DIAN, fallbacks de seguridad hardcodeados, y la falta de integracion con '
    'pasarelas de pago colombianas.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Este diagnostico excluye deliberadamente la migracion de SQLite a PostgreSQL, la cual es un '
    'prerrequisito conocido para produccion. El analisis se enfoca en todas las demas areas que deben '
    'resolverse antes de que el sistema pueda atender usuarios reales en un entorno de produccion '
    'colombiano. A continuacion se presenta un desglose detallado por area, con estimaciones de tiempo '
    'y prioridad para cada item.',
    body_style
))

# ═══════════════════════════════════════════════════════
# TABLA RESUMEN POR AREA
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>Estado por Area</b>', h2_style))

summary_data = [
    [Paragraph('<b>Area</b>', th_style),
     Paragraph('<b>Progreso</b>', th_style),
     Paragraph('<b>Estado</b>', th_style),
     Paragraph('<b>Semanas Est.</b>', th_style)],
    [Paragraph('Testing / QA', td_style),
     Paragraph('5%', td_center),
     severity_cell('CRITICO'),
     Paragraph('2-3', td_center)],
    [Paragraph('Seguridad', td_style),
     Paragraph('60%', td_center),
     severity_cell('ALTO'),
     Paragraph('1-1.5', td_center)],
    [Paragraph('TypeScript / Errores', td_style),
     Paragraph('70%', td_center),
     severity_cell('CRITICO'),
     Paragraph('0.5-1', td_center)],
    [Paragraph('Integracion Pagos', td_style),
     Paragraph('0%', td_center),
     severity_cell('CRITICO'),
     Paragraph('1-2', td_center)],
    [Paragraph('DIAN Facturacion', td_style),
     Paragraph('85%', td_center),
     severity_cell('ALTO'),
     Paragraph('0.5-1', td_center)],
    [Paragraph('Auth / Sesiones', td_style),
     Paragraph('75%', td_center),
     severity_cell('ALTO'),
     Paragraph('0.5', td_center)],
    [Paragraph('Deploy / Infra', td_style),
     Paragraph('40%', td_center),
     severity_cell('ALTO'),
     Paragraph('1-1.5', td_center)],
    [Paragraph('Monitoreo / Logs', td_style),
     Paragraph('65%', td_center),
     severity_cell('MEDIO'),
     Paragraph('0.5', td_center)],
    [Paragraph('Features POS', td_style),
     Paragraph('90%', td_center),
     severity_cell('LISTO'),
     Paragraph('0', td_center)],
    [Paragraph('UI / UX', td_style),
     Paragraph('85%', td_center),
     severity_cell('BAJO'),
     Paragraph('0.5', td_center)],
    [Paragraph('Contabilidad', td_style),
     Paragraph('80%', td_center),
     severity_cell('MEDIO'),
     Paragraph('0.5', td_center)],
]

summary_table = make_table(summary_data, [140, 80, 80, 90])
story.append(summary_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 1: Resumen de preparacion por area (excluyendo migracion PostgreSQL)', caption_style))

# ═══════════════════════════════════════════════════════
# BLOQUEADORES CRITICOS
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>1. Bloqueadores Criticos</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'Los siguientes items son bloqueadores absolutos para produccion. Sin resolverlos, el sistema '
    'no puede ser desplegado de forma segura ni confiable para usuarios reales. Cada uno representa '
    'un riesgo de seguridad, estabilidad o funcionalidad que invalida cualquier despliegue productivo.',
    body_style
))

# 1.1 Testing
story.append(Spacer(1, 10))
story.append(Paragraph('<b>1.1 Cero Cobertura de Testing</b>', h2_style))

story.append(Paragraph(
    'El proyecto no contiene un solo archivo de test. No hay tests unitarios, de integracion ni E2E. '
    'No hay framework de testing configurado (ni Jest, ni Vitest, ni Playwright). No hay scripts de '
    'test en package.json. Esto significa que cualquier cambio en el codigo puede romper funcionalidad '
    'existente sin que nadie se entere hasta que un usuario lo reporte en produccion. Para un sistema '
    'que maneja transacciones financieras, facturacion electronica DIAN y datos personales de clientes, '
    'esta ausencia es inaceptable y constituye el bloqueador mas grave del proyecto.',
    body_style
))

story.append(Paragraph(
    'La situacion es particularmente peligrosa porque la logica critica del sistema incluye: '
    'calculo de impuestos IVA con tres tarifas (19%, 5%, 0%), generacion de CUFE/CUDFE para facturas '
    'DIAN, numeracion consecutiva atomica de facturas, contabilidad de doble entrada con asientos '
    'de diario, y calculo de prorrateo de suscripciones. Cualquier bug en estas areas puede generar '
    'problemas legales y financieros para los comerciantes colombianos que usen el sistema.',
    body_style
))

test_plan = [
    [Paragraph('<b>Prioridad</b>', th_style),
     Paragraph('<b>Tipo de Test</b>', th_style),
     Paragraph('<b>Cobertura Objetivo</b>', th_style),
     Paragraph('<b>Esfuerzo</b>', th_style)],
    [Paragraph('Inmediata', td_center),
     Paragraph('Unitarios: schemas Zod, calculos CUFE, impuestos, prorrateo', td_style),
     Paragraph('80% logica critica', td_center),
     Paragraph('1 semana', td_center)],
    [Paragraph('Semana 2', td_center),
     Paragraph('Integracion: API routes CRUD, auth flow, DIAN SOAP', td_style),
     Paragraph('60% endpoints', td_center),
     Paragraph('1 semana', td_center)],
    [Paragraph('Semana 3', td_center),
     Paragraph('E2E: flujo completo venta, facturacion, cierre caja', td_style),
     Paragraph('5 flujos core', td_center),
     Paragraph('1 semana', td_center)],
]
story.append(Spacer(1, 8))
story.append(make_table(test_plan, [65, 200, 95, 65]))
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 2: Plan de implementacion de testing por prioridad', caption_style))

# 1.2 TS Errors
story.append(Spacer(1, 12))
story.append(Paragraph('<b>1.2 Errores de TypeScript que Rompen DIAN</b>', h2_style))

story.append(Paragraph(
    'El proyecto tiene mas de 40 errores de TypeScript documentados que afectan areas criticas. '
    'Los mas graves se encuentran en el pipeline de facturacion electronica DIAN, que es la '
    'funcionalidad insignia del producto y un requisito legal para comerciantes colombianos. '
    'Especificamente, el generador XML usa el metodo .cdata() que no existe en XMLBuilder, '
    'el email-sender tiene tipos incorrectos de Nodemailer, y el orquestador index.ts pasa '
    'argumentos equivocados a sendBillToDIAN. Estos errores significan que la facturacion '
    'electronica probablemente falla en tiempo de ejecucion aunque el build de Next.js compile '
    'con ignoreBuildErrors.',
    body_style
))

ts_errors = [
    [Paragraph('<b>Archivo</b>', th_style),
     Paragraph('<b>Error</b>', th_style),
     Paragraph('<b>Impacto</b>', th_style)],
    [Paragraph('xml-generator.ts', td_style),
     Paragraph('.cdata() no existe en XMLBuilder (7 ocurrencias)', td_style),
     severity_cell('CRITICO')],
    [Paragraph('email-sender.ts', td_style),
     Paragraph('Tipos incorrectos de Nodemailer, string|false', td_style),
     severity_cell('CRITICO')],
    [Paragraph('index.ts (dian)', td_style),
     Paragraph('Argumentos equivocados en sendBillToDIAN', td_style),
     severity_cell('CRITICO')],
    [Paragraph('rate-limiter.ts', td_style),
     Paragraph('NextRequest no importado (3 ocurrencias)', td_style),
     severity_cell('ALTO')],
    [Paragraph('use-super-admin.ts', td_style),
     Paragraph('throwIfNotOk no definido (9 ocurrencias)', td_style),
     severity_cell('MEDIO')],
    [Paragraph('use-staff.ts, use-roles.ts', td_style),
     Paragraph('Promise<Response> vs Response (12 ocurrencias)', td_style),
     severity_cell('MEDIO')],
]
story.append(Spacer(1, 8))
story.append(make_table(ts_errors, [120, 215, 75]))
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 3: Errores de TypeScript criticos y su impacto', caption_style))

# 1.3 Auth fallback
story.append(Spacer(1, 12))
story.append(Paragraph('<b>1.3 Fallbacks de Seguridad Hardcodeados</b>', h2_style))

story.append(Paragraph(
    'El sistema de autenticacion tiene valores por defecto hardcodeados para las variables de entorno '
    'criticas AUTH_SECRET e INTERNAL_SECRET. Si el deploy se realiza sin configurar estas variables, '
    'el sistema usara los valores por defecto que estan visibles en el codigo fuente del repositorio '
    'publico. Esto significa que cualquier persona con acceso al codigo puede falsificar tokens de '
    'autenticacion y acceder como cualquier usuario, incluyendo super-administradores, o llamar '
    'endpoints internos como el cron de suscripciones o el poller de DIAN. Este es un riesgo de '
    'seguridad critico que debe resolverse antes de cualquier despliegue.',
    body_style
))

story.append(Paragraph(
    'La solucion no es simplemente configurar las variables en produccion (que tambien es necesario), '
    'sino eliminar los fallbacks por completo y hacer que la aplicacion falle al iniciar si no estan '
    'configuradas. Adicionalmente, se debe agregar validacion de fortaleza del secreto para evitar '
    'que se configuren valores debiles. El script scripts/ensure-env.sh ya existe y deberia '
    'evolucionar para fallar en lugar de agregar valores por defecto.',
    body_style
))

# 1.4 Payments
story.append(Spacer(1, 12))
story.append(Paragraph('<b>1.4 Sin Integracion con Pasarelas de Pago</b>', h2_style))

story.append(Paragraph(
    'El sistema no tiene integracion con ninguna pasarela de pago colombiana. Los metodos de pago '
    'definidos en el enum (CASH, CARD, NEQUI, DAVIPLATA, BANCOLÓDIA, etc.) son solo etiquetas '
    'sin conexion a APIs reales. Para el mercado colombiano, las integraciones esenciales son: '
    'Wompi (la pasarela mas popular para PYMES), MercadoPago (ampliamente usada), y Nequi/Daviplata '
    '(billeteras digitales con API de cobro). Sin al menos una de estas integraciones, el POS '
    'funciona como un simple registrador de ventas manuales, lo cual limita severamente su valor '
    'competitivo frente a soluciones como Aliada, PosAtiendo o MarketPOS que ya ofrecen pagos '
    'digitales integrados.',
    body_style
))

payments_plan = [
    [Paragraph('<b>Pasarela</b>', th_style),
     Paragraph('<b>Complejidad</b>', th_style),
     Paragraph('<b>Prioridad</b>', th_style),
     Paragraph('<b>Tiempo Est.</b>', th_style)],
    [Paragraph('Wompi', td_style),
     Paragraph('Media - API REST, webhook, tokenizacion', td_style),
     Paragraph('Inmediata', td_center),
     Paragraph('1-1.5 sem', td_center)],
    [Paragraph('Nequi (Bancolombia)', td_style),
     Paragraph('Alta - OAuth, QR dinamico, notificaciones', td_style),
     Paragraph('Alta', td_center),
     Paragraph('1-2 sem', td_center)],
    [Paragraph('MercadoPago', td_style),
     Paragraph('Media - SDK oficial, webhooks', td_style),
     Paragraph('Media', td_center),
     Paragraph('0.5-1 sem', td_center)],
    [Paragraph('Daviplata', td_style),
     Paragraph('Alta - API Davivienda, flujo OTP', td_style),
     Paragraph('Baja', td_center),
     Paragraph('1-2 sem', td_center)],
]
story.append(Spacer(1, 8))
story.append(make_table(payments_plan, [85, 175, 65, 70]))
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 4: Plan de integracion de pasarelas de pago colombianas', caption_style))

# ═══════════════════════════════════════════════════════
# ITEMS DE ALTA PRIORIDAD
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>2. Items de Alta Prioridad</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'Los siguientes items no son bloqueadores absolutos pero representan riesgos significativos '
    'que deben resolverse durante las primeras semanas de produccion. Su ausencia no impide '
    'un lanzamiento controlado con un grupo pequeño de usuarios beta, pero si impide escalar '
    'a cientos de comerciantes de forma segura.',
    body_style
))

# 2.1 CSRF + Headers
story.append(Spacer(1, 10))
story.append(Paragraph('<b>2.1 Proteccion CSRF y Headers de Seguridad</b>', h2_style))

story.append(Paragraph(
    'El sistema no tiene proteccion CSRF implementada. Aunque el uso de Bearer tokens en lugar '
    'de cookies mitiga parcialmente el riesgo, no es suficiente para produccion. Un atacante puede '
    'realizar peticiones cross-origin si el token es interceptado via XSS. Ademas, faltan headers '
    'de seguridad estandar como X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, '
    'y Strict-Transport-Security. La implementacion de helmet.js o un middleware personalizado que '
    'inyecte estos headers es un trabajo de medio dia que dramaticamente reduce la superficie de '
    'ataque. Tambien falta validacion de tamaño del body en las peticiones (request body size limits), '
    'lo que permite ataques de denegacion de servicio enviando payloads gigantes.',
    body_style
))

# 2.2 Rate limiter
story.append(Spacer(1, 10))
story.append(Paragraph('<b>2.2 Rate Limiter en Memoria (No Multi-Instancia)</b>', h2_style))

story.append(Paragraph(
    'El rate limiter actual usa un mapa en memoria (token bucket por IP + ruta). Esto funciona '
    'para una sola instancia pero falla completamente si se despliegan multiples instancias detras '
    'de un balanceador de carga, ya que cada instancia mantiene su propio contador independiente. '
    'Un atacante puede simplemente rotar entre instancias para evadir los limites. Para produccion '
    'se necesita migrar a Redis como almacenamiento compartido para los contadores de rate limiting. '
    'La arquitectura del rate limiter ya esta bien disenada (separacion de almacenamiento via '
    'interfaz), por lo que la migracion a Redis es directa y estimada en medio dia de trabajo.',
    body_style
))

# 2.3 Token revocation
story.append(Spacer(1, 10))
story.append(Paragraph('<b>2.3 Sin Revocacion de Tokens</b>', h2_style))

story.append(Paragraph(
    'El sistema usa tokens HMAC-SHA256 personalizados con expiracion de 24 horas, pero no tiene '
    'mecanismo de revocacion. Si un token es comprometido, sigue siendo valido hasta que expire '
    'naturalmente. No hay lista negra de tokens, no hay jti (token ID) para identificacion unica, '
    'y no hay refresh token rotation. Esto es particularmente problematico para el rol de '
    'super-administrador: si alguien obtiene ese token, tiene acceso completo a todos los '
    'comercios del sistema SaaS durante 24 horas. La solucion recomendada es implementar una '
    'lista negra en Redis (misma infraestructura que el rate limiter) que almacene tokens '
    'revocados hasta su fecha de expiracion.',
    body_style
))

# 2.4 Docker
story.append(Spacer(1, 10))
story.append(Paragraph('<b>2.4 Sin Containerizacion ni CI/CD</b>', h2_style))

story.append(Paragraph(
    'No existe Dockerfile ni docker-compose.yml. El despliegue es bare-metal via bun + Caddy, '
    'sin pipeline de CI/CD. Esto significa que cada despliegue es manual, propenso a errores, '
    'y no hay garantia de que el entorno de produccion sea identico al de desarrollo. Para '
    'produccion se necesita: (1) un Dockerfile multi-stage optimizado para Next.js standalone, '
    '(2) un docker-compose.yml con la aplicacion, Caddy como reverse proxy con SSL automatico, '
    'y Redis para rate limiting y cache de sesiones, (3) un pipeline CI/CD basico con GitHub '
    'Actions que ejecute tests, build, y deploy automatico. La existencia de multiples scripts '
    'keepalive/daemon sugiere que el proceso se cae con frecuencia, lo cual refuerza la '
    'necesidad de un proceso de despliegue robusto y automatizado.',
    body_style
))

# 2.5 Audit log
story.append(Spacer(1, 10))
story.append(Paragraph('<b>2.5 Sin Audit Log</b>', h2_style))

story.append(Paragraph(
    'No existe un modelo de AuditLog en la base de datos. Para un sistema que maneja transacciones '
    'financieras y facturacion electronica DIAN, la auditoria es un requisito legal y operativo. '
    'Se necesita registrar: quien realizo cada accion, cuando, desde que IP, que datos fueron '
    'modificados (antes y despues), y el resultado de la operacion. Esto es especialmente '
    'critico para acciones sensibles como: emision de facturas, notas credito, eliminacion de '
    'registros, cambios de precios, y modificaciones de roles de empleados. La implementacion '
    'puede hacerse via middleware de Prisma que capture automaticamente todas las operaciones '
    'de escritura, estimada en 2-3 dias de trabajo.',
    body_style
))

# ═══════════════════════════════════════════════════════
# ITEMS DE PRIORIDAD MEDIA
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>3. Items de Prioridad Media</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

# 3.1 Logging
story.append(Paragraph('<b>3.1 Logging Estructurado</b>', h2_style))
story.append(Paragraph(
    'El logger actual envuelve console.log/warn/error y suprime debug/info en produccion, '
    'pero no genera JSON estructurado para agregacion con herramientas como ELK Stack, Datadog '
    'o CloudWatch. Para produccion se necesita: formato JSON con timestamp, nivel, contexto '
    '(storeId, userId, requestId), y campos estructurados para busqueda. Tambien falta '
    'rotacion de logs y almacenamiento persistente. La ventaja es que Sentry ya esta configurado '
    'para captura de errores, asi que la base de observabilidad existe.',
    body_style
))

# 3.2 Duplicate DIAN modules
story.append(Spacer(1, 10))
story.append(Paragraph('<b>3.2 Modulos DIAN Duplicados</b>', h2_style))
story.append(Paragraph(
    'Existen dos directorios con funcionalidad DIAN: src/lib/dian/ y src/lib/invoicing/. '
    'El primero parece ser una version anterior y el segundo la version actualizada. Esto genera '
    'confusion sobre cual se usa realmente y puede causar bugs sutiles si un endpoint importa '
    'del directorio equivocado. Se debe consolidar en un solo directorio (invoicing parece '
    'el mas completo) y eliminar el otro completamente. Esta limpieza reduce complejidad y '
    'facilita el mantenimiento futuro de la integracion DIAN.',
    body_style
))

# 3.3 Base64 in DB
story.append(Spacer(1, 10))
story.append(Paragraph('<b>3.3 Archivos en Base64 dentro de la Base de Datos</b>', h2_style))
story.append(Paragraph(
    'El modelo PaymentReceipt almacena fileData como string base64 directamente en la base de datos. '
    'Para produccion esto es problematico: infla el tamaño de la base de datos, ralentiza backups, '
    'y no es escalable. La solucion es migrar a almacenamiento de objetos (S3, GCS, o incluso '
    'almacenamiento local con ruta en DB). Esto aplica tanto para SQLite como para PostgreSQL. '
    'La migracion es relativamente simple ya que solo afecta un modelo y sus endpoints asociados.',
    body_style
))

# 3.4 Seed endpoint
story.append(Spacer(1, 10))
story.append(Paragraph('<b>3.4 Endpoint de Seed y Credenciales Debiles</b>', h2_style))
story.append(Paragraph(
    'El endpoint /api/seed existe y esta protegido por la variable ALLOW_SEED, pero si esta '
    'variable se configura incorrectamente en produccion, permite sobreescribir toda la base '
    'de datos con datos de prueba. Ademas, el seed usa contrasena "1234" para el usuario admin, '
    'y la cedula 1098765432 es claramente un valor de prueba. Se debe: (1) eliminar el endpoint '
    'de seed del build de produccion via conditional export, (2) agregar validacion de fortaleza '
    'de contrasena en el registro, (3) forzar cambio de contrasena en primer login.',
    body_style
))

# 3.5 Error codes
story.append(Spacer(1, 10))
story.append(Paragraph('<b>3.5 Codigos de Error Estandarizados</b>', h2_style))
story.append(Paragraph(
    'Los errores de la API son inconsistentes: algunos endpoints retornan { error: "msg" }, otros '
    'retornan { data: null, error: "msg" }, y no hay codigos de error estandarizados mas alla '
    'del HTTP status code. Para produccion se necesita un formato unificado como '
    '{ code: "AUTH_TOKEN_EXPIRED", message: "...", details: {} } que permita al frontend '
    'manejar errores de forma predecible y mostrar mensajes contextualizados al usuario. '
    'Este es un trabajo de refactor que puede hacerse incrementalmente sin romper la API existente.',
    body_style
))

# ═══════════════════════════════════════════════════════
# LO QUE SI ESTA LISTO
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>4. Lo Que Si Esta Listo</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=SEM_SUCCESS, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'Es importante reconocer las areas donde el proyecto ya tiene una base solida. VentifyPOS '
    'tiene un conjunto de features impresionantemente completo para un proyecto en esta etapa, '
    'y varias areas ya estan a nivel de produccion o muy cerca.',
    body_style
))

ready_data = [
    [Paragraph('<b>Feature</b>', th_style),
     Paragraph('<b>Estado</b>', th_style),
     Paragraph('<b>Detalle</b>', th_style)],
    [Paragraph('Facturacion Electronica DIAN', td_style),
     Paragraph('85% - Pipeline completo (XML UBL 2.1, SOAP, CUFE, PDF, email, notas credito, contingencia)', td_style),
     severity_cell('ALTO')],
    [Paragraph('POS Ventas', td_style),
     Paragraph('90% - Grilla productos, carrito, escaner barcode, devoluciones, propinas, pagos mixtos', td_style),
     severity_cell('LISTO')],
    [Paragraph('Inventario', td_style),
     Paragraph('90% - Kardex, ajustes, perdidas, devoluciones, reset stock, importar Excel', td_style),
     severity_cell('LISTO')],
    [Paragraph('Mesas/Restaurante', td_style),
     Paragraph('90% - Zonas, sesiones, comandas, pagar desde mesa', td_style),
     severity_cell('LISTO')],
    [Paragraph('Contabilidad', td_style),
     Paragraph('80% - Doble entrada, asientos, cuentas, gastos', td_style),
     severity_cell('MEDIO')],
    [Paragraph('SaaS Suscripciones', td_style),
     Paragraph('85% - Planes, billing, prorrateo, cancelacion, reactivacion, gating por estado', td_style),
     severity_cell('ALTO')],
    [Paragraph('Super Admin', td_style),
     Paragraph('85% - Multi-tenant, CRUD tiendas, estadisticas, recibos de pago', td_style),
     severity_cell('ALTO')],
    [Paragraph('Validacion Zod', td_style),
     Paragraph('95% - Schemas colombianos (cedula, NIT+DV, phone +57), validacion en todos los endpoints', td_style),
     severity_cell('LISTO')],
    [Paragraph('Encriptacion Campos', td_style),
     Paragraph('95% - AES-256-GCM para certificados DIAN, PINs software', td_style),
     severity_cell('LISTO')],
    [Paragraph('RBAC', td_style),
     Paragraph('90% - Roles con permisos granulares por feature, super-admin, owner, employee', td_style),
     severity_cell('LISTO')],
    [Paragraph('UI/UX Colombiana', td_style),
     Paragraph('85% - Espanol colombiano, COP, IVA, formato NIT, shadcn/ui profesional', td_style),
     severity_cell('LISTO')],
]
story.append(Spacer(1, 8))
story.append(make_table(ready_data, [100, 205, 65]))
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 5: Features que ya estan listos o casi listos para produccion', caption_style))

# ═══════════════════════════════════════════════════════
# MODELOS FALTANTES
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>5. Modelos de Datos Faltantes</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'El schema de Prisma tiene 35 modelos, lo cual es extenso, pero faltan algunos modelos '
    'que son estandar en sistemas POS maduros y que serian necesarios para competir en el '
    'mercado colombiano. Estos no son bloqueadores criticos pero si diferenciadores competitivos '
    'que los competidores ya tienen implementados.',
    body_style
))

missing_models = [
    [Paragraph('<b>Modelo</b>', th_style),
     Paragraph('<b>Proposito</b>', th_style),
     Paragraph('<b>Prioridad</b>', th_style),
     Paragraph('<b>Competidores</b>', th_style)],
    [Paragraph('AuditLog', td_style),
     Paragraph('Trazabilidad de acciones (quien, que, cuando, antes/despues)', td_style),
     severity_cell('ALTO'),
     Paragraph('Todos', td_center)],
    [Paragraph('Refund/Return', td_style),
     Paragraph('Devoluciones formales con razon, aprobacion, estado', td_style),
     severity_cell('ALTO'),
     Paragraph('Aliada, PosAtiendo', td_center)],
    [Paragraph('LoyaltyProgram', td_style),
     Paragraph('Programa de puntos/fidelizacion para clientes frecuentes', td_style),
     severity_cell('MEDIO'),
     Paragraph('PosAtiendo, MarketPOS', td_center)],
    [Paragraph('Discount/Promotion', td_style),
     Paragraph('Promociones con reglas (fecha, producto, monto min)', td_style),
     severity_cell('MEDIO'),
     Paragraph('Aliada, Vend', td_center)],
    [Paragraph('PaymentTransaction', td_style),
     Paragraph('Registro detallado de transacciones con pasarela (id, estado, comprobante)', td_style),
     severity_cell('CRITICO'),
     Paragraph('Todos', td_center)],
    [Paragraph('Receipt/ThermalPrint', td_style),
     Paragraph('Historial de tickets impresos, formato termico', td_style),
     severity_cell('BAJO'),
     Paragraph('PosAtiendo', td_center)],
]
story.append(Spacer(1, 8))
story.append(make_table(missing_models, [95, 180, 65, 75]))
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 6: Modelos de datos faltantes y prioridad para el mercado colombiano', caption_style))

# ═══════════════════════════════════════════════════════
# ROADMAP PROPUESTO
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>6. Roadmap Propuesto (4-6 Semanas)</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'El siguiente roadmap organiza el trabajo de preparacion para produccion en fases semanales, '
    'priorizando los bloqueadores criticos primero y avanzando hacia los items de menor urgencia. '
    'Las estimaciones asumen un desarrollador trabajando tiempo completo. Con dos desarrolladores, '
    'el timeline se reduce aproximadamente a la mitad.',
    body_style
))

roadmap = [
    [Paragraph('<b>Semana</b>', th_style),
     Paragraph('<b>Focus</b>', th_style),
     Paragraph('<b>Entregables</b>', th_style)],
    [Paragraph('<b>1</b>', td_center),
     Paragraph('Bloqueadores criticos', td_style),
     Paragraph('Fix TS errors en DIAN, eliminar fallbacks AUTH_SECRET/INTERNAL_SECRET, agregar Vitest + tests unitarios de logica critica (CUFE, impuestos, prorrateo)', td_style)],
    [Paragraph('<b>2</b>', td_center),
     Paragraph('Testing + Seguridad', td_style),
     Paragraph('Tests de integracion API routes, CSRF + headers de seguridad, rate limiter Redis, token revocation con blacklist, audit log Prisma middleware', td_style)],
    [Paragraph('<b>3</b>', td_center),
     Paragraph('Testing E2E + Pagos', td_style),
     Paragraph('Tests E2E (5 flujos core), integracion Wompi (API REST + webhooks), modelo PaymentTransaction, cleanup modulos DIAN duplicados', td_style)],
    [Paragraph('<b>4</b>', td_center),
     Paragraph('Infraestructura', td_style),
     Paragraph('Dockerfile + docker-compose, CI/CD GitHub Actions, logging JSON estructurado, migrar base64 a S3/storage, error codes estandarizados', td_style)],
    [Paragraph('<b>5</b>', td_center),
     Paragraph('Pagos + Refinamiento', td_style),
     Paragraph('Integracion Nequi/MercadoPago, modelo Refund/Return, modelo Discount/Promotion, fuerza de contrasena, cambio forzado en primer login', td_style)],
    [Paragraph('<b>6</b>', td_center),
     Paragraph('Lanzamiento Beta', td_style),
     Paragraph('Load testing basico, documentacion de deploy, runbook de operaciones, onboarding primer comerciante beta, monitoreo en produccion', td_style)],
]
story.append(Spacer(1, 8))
story.append(make_table(roadmap, [50, 100, 290]))
story.append(Spacer(1, 6))
story.append(Paragraph('Tabla 7: Roadmap de 6 semanas hacia produccion', caption_style))

# ═══════════════════════════════════════════════════════
# CONCLUSION
# ═══════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(Paragraph('<b>7. Conclusion</b>', h1_style))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=0, spaceAfter=12))

story.append(Paragraph(
    'VentifyPOS tiene una base de features excepcionalmente fuerte para el mercado colombiano. '
    'La integracion DIAN completa (con notas credito, contingencia, y polling de estado), la '
    'contabilidad de doble entrada, el modelo SaaS con suscripciones, y la interfaz profesional '
    'con shadcn/ui representan meses de trabajo que ya estan hechos. El sistema ya resuelve el '
    'problema mas dificil del mercado colombiano: la facturacion electronica.',
    body_style
))

story.append(Paragraph(
    'Sin embargo, la distancia entre "funciona en desarrollo" y "es seguro en produccion" es '
    'significativa. Los 4 bloqueadores criticos (cero tests, errores TS en DIAN, fallbacks de '
    'seguridad, y falta de pagos) deben resolverse antes de poner el sistema frente a un solo '
    'usuario real. Con un enfoque disciplinado de 4-6 semanas, es posible alcanzar un estado '
    'donde un lanzamiento beta controlado con 5-10 comerciantes sea viable y seguro. La clave '
    'es priorizar: primero lo que puede romper el sistema o comprometer datos, despues lo que '
    'limita la adopcion comercial.',
    body_style
))

story.append(Spacer(1, 12))

# Summary callout
story.append(Paragraph(
    '<b>Distancia a produccion: 4-6 semanas de trabajo enfocado</b><br/>'
    'Bloqueadores criticos: 4 | Alta prioridad: 5 | Media prioridad: 5<br/>'
    'Features listas: 11 areas a 80-95% de completitud<br/>'
    'Prerequisito excluido: Migracion SQLite a PostgreSQL (1-2 semanas adicionales)',
    callout_warn
))

# ── Build ──
doc.build(story)
print(f"PDF generated: {output_path}")

# Get file size
import os
size_mb = os.path.getsize(output_path) / (1024 * 1024)
print(f"File size: {size_mb:.2f} MB")
