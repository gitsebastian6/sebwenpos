# -*- coding: utf-8 -*-
import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, 
    TableStyle, PageBreak, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Fonts (Liberation = metric-compatible with Times/Arial) ──
pdfmetrics.registerFont(TTFont('LibSans', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LibSansB', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('LibSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LibSerifB', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('LibSerif', normal='LibSerif', bold='LibSerifB')
registerFontFamily('LibSans', normal='LibSans', bold='LibSansB')

# ── Palette ──
ACCENT       = colors.HexColor('#197999')
TEXT_PRIMARY  = colors.HexColor('#1e1f21')
TEXT_MUTED    = colors.HexColor('#71767d')
BG_SURFACE   = colors.HexColor('#e1e4e8')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

PAGE_W, PAGE_H = A4
LM = RM = 1.0*inch; TM = BM = 1.0*inch; AW = PAGE_W - LM - RM

# ── Styles ──
h1s = ParagraphStyle('H1', fontName='LibSans', fontSize=20, leading=28, textColor=ACCENT, spaceBefore=18, spaceAfter=10)
h2s = ParagraphStyle('H2', fontName='LibSans', fontSize=15, leading=22, textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8)
h3s = ParagraphStyle('H3', fontName='LibSans', fontSize=12, leading=18, textColor=ACCENT, spaceBefore=10, spaceAfter=6)
body = ParagraphStyle('Body', fontName='LibSerif', fontSize=10.5, leading=17, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8)
blt = ParagraphStyle('Bullet', fontName='LibSerif', fontSize=10.5, leading=17, textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=18, bulletIndent=6, spaceAfter=4)
ths = ParagraphStyle('TH', fontName='LibSans', fontSize=9.5, leading=14, textColor=TABLE_HEADER_TEXT, alignment=TA_CENTER)
tcs = ParagraphStyle('TC', fontName='LibSerif', fontSize=9.5, leading=14, textColor=TEXT_PRIMARY, alignment=TA_LEFT)

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            self.notify('TOCEntry', (getattr(flowable,'bookmark_level',0), getattr(flowable,'bookmark_text',''), self.page, getattr(flowable,'bookmark_key','')))

def heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = text; p.bookmark_level = level; p.bookmark_text = text; p.bookmark_key = key
    return p

def h1o(text):
    return [CondPageBreak((PAGE_H-TM-BM)*0.15), heading(text, h1s, 0)]

def mt(headers, rows, ratios=None):
    n = len(headers); r = ratios or [1.0/n]*n; cw = [x*AW for x in r]
    d = [[Paragraph('<b>%s</b>'%h, ths) for h in headers]]
    for row in rows: d.append([Paragraph(str(c), tcs) for c in row])
    t = Table(d, colWidths=cw, hAlign='CENTER')
    sc = [('BACKGROUND',(0,0),(-1,0),TABLE_HEADER_COLOR),('TEXTCOLOR',(0,0),(-1,0),TABLE_HEADER_TEXT),
          ('GRID',(0,0),(-1,-1),0.5,TEXT_MUTED),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
          ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
          ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]
    for i in range(1,len(d)): sc.append(('BACKGROUND',(0,i),(-1,i), TABLE_ROW_EVEN if i%2==1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(sc)); return t

def p(t): return Paragraph(t, body)
def b(t): return Paragraph(t, blt)

# ══════════════════ BUILD ══════════════════
output = '/home/z/my-project/download/VentifyPOS_Analisis_Estrategico.pdf'
doc = TocDocTemplate(output, pagesize=A4, leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
    title='VentifyPOS - Analisis Estrategico', author='Z.ai', creator='Z.ai')
story = []

toc = TableOfContents()
toc.levelStyles = [ParagraphStyle('TOC1',fontName='LibSans',fontSize=13,leading=22,leftIndent=20,spaceBefore=6),
                   ParagraphStyle('TOC2',fontName='LibSans',fontSize=11,leading=18,leftIndent=40,spaceBefore=3)]
story.append(Paragraph('<b>Tabla de Contenidos</b>', h1s))
story.append(toc); story.append(PageBreak())

# ── 1. RESUMEN EJECUTIVO ──
story.extend(h1o('1. Resumen Ejecutivo'))
story.append(p('VentifyPOS es un sistema de punto de venta (POS) multi-tienda disenado para el mercado colombiano, construido con Next.js 16, TypeScript, Prisma ORM y Tailwind CSS. El proyecto cuenta con facturacion electronica DIAN nativa (XML UBL 2.1, CUFE/CUDFE), gestion de inventario, modulos de restaurante (mesas/comandas), suscripciones SaaS, contabilidad basica y un panel de Super Administracion. Este documento analiza la posicion competitiva de VentifyPOS frente a los principales actores del mercado colombiano (Alegra, Siigo, Treinta, Aliaddo, PirPos, Fudo, Odoo, Tiendana) e identifica las areas criticas de mejora necesarias para competir eficazmente.'))
story.append(Spacer(1,8))
story.append(p('El analisis revela que VentifyPOS tiene una base tecnica solida y diferenciadores importantes (modelo hibrido restaurante+retail, facturacion electronica nativa, soporte multi-tienda con sucursales), pero enfrenta brechas significativas en modo offline, envio de comprobantes por WhatsApp, integracion con pasarelas de pago colombianas, tipado TypeScript (313 errores), y funcionalidades criticas como la generacion de POS electronico (CUDE) que sera obligatorio a partir de junio 2025 segun la Resolucion 000202/2025 de la DIAN.'))

# ── 2. ANALISIS DEL PROYECTO ──
story.extend(h1o('2. Analisis del Proyecto VentifyPOS'))
story.append(heading('2.1 Arquitectura y Stack Tecnologico', h2s, 1))
story.append(p('VentifyPOS esta construido sobre un stack moderno y robusto: Next.js 16.1.3 con Turbopack para el frontend y API routes, TypeScript para tipado estatico, Prisma ORM como capa de acceso a datos (SQLite en desarrollo, PostgreSQL en produccion), y Tailwind CSS 4 con shadcn/ui para la interfaz. El estado del lado del cliente se gestiona con Zustand (auth-store, app-store) y React Query (TanStack) para cache y sincronizacion de datos del servidor. La arquitectura sigue un patron API-first con 97+ rutas de API REST que cubren todos los modulos del negocio.'))
story.append(Spacer(1,6))
story.append(mt(['Componente','Tecnologia','Version'],[
    ['Framework','Next.js (Turbopack)','16.1.3'],['Lenguaje','TypeScript','5.9'],
    ['ORM','Prisma','6.19'],['DB Dev','SQLite (better-sqlite3)','12.9'],
    ['DB Prod','PostgreSQL (pg)','8.20'],['UI','shadcn/ui + Radix + Tailwind CSS','4.1'],
    ['Estado','Zustand + React Query','5.0 / 5.90'],['Auth','HMAC-SHA256 (Web Crypto API)','Custom'],
    ['Facturacion','XML UBL 2.1 + SOAP DIAN','Custom'],['PDF','PDFKit','0.18'],
    ['Email','Nodemailer','8.0'],['Monitoreo','Sentry','10.50'],
],[0.35,0.40,0.25]))

story.append(heading('2.2 Modulos y Funcionalidades', h2s, 1))
story.append(p('El sistema cuenta con 38 modelos en la base de datos Prisma y mas de 97 endpoints de API organizados en los siguientes modulos funcionales. La profundidad funcional es considerable para un proyecto en etapa de desarrollo, cubriendo desde la venta hasta la facturacion electronica, pasando por contabilidad, inventario y gestion de personal.'))
story.append(Spacer(1,6))
story.append(mt(['Modulo','Endpoints','Estado'],[
    ['POS / Ventas','orders, dashboard, cash-register','Funcional'],
    ['Facturacion DIAN','invoices, credit-notes, debit-notes, contingency','Parcial (TS errors)'],
    ['Inventario','products, categories, inventory, kardex, losses','Funcional'],
    ['Compras/Proveedores','purchases, providers, xml-import','Funcional'],
    ['Restaurante','tables, sessions, comandas','Funcional'],
    ['Contabilidad','ledger, expenses, services','Funcional'],
    ['Suscripciones SaaS','subscription, plans, billing, proration','Funcional'],
    ['Super Admin','stores, statistics, plans, payment-receipts','Funcional'],
    ['Cotizaciones','quotations, convert','Funcional'],
    ['Reportes','reports, daily, export-pdf, informes','Parcial (TS errors)'],
    ['Autenticacion','login, otp, setup, refresh, rate-limit','Funcional'],
    ['Config DIAN','electronic-invoicing, certificate','Parcial (TS errors)'],
],[0.30,0.40,0.30]))

story.append(heading('2.3 Cumplimiento DIAN - Estado Actual', h2s, 1))
story.append(p('VentifyPOS implementa una capa de facturacion electronica significativa que incluye generacion de XML en formato UBL 2.1, generacion de CUFE y CUDFE segun la especificacion DIAN v2.1 (SHA-384 + Base64), cliente SOAP para transmision a los endpoints de habilitacion y produccion de la DIAN, generacion de PDF de facturas, notas credito/debito, facturas de contingencia, y envio por email. Sin embargo, existen brechas criticas de cumplimiento que deben resolverse para la Resolucion 000202/2025.'))
story.append(Spacer(1,6))
story.append(mt(['Requisito DIAN','Implementado','Observacion'],[
    ['XML UBL 2.1','Si','Generacion completa con xmlbuilder2'],
    ['CUFE (Factura Electronica)','Si','Algoritmo SHA-384 correcto 16 campos'],
    ['CUDFE (Notas)','Si','Mismo algoritmo con campo CUDE'],
    ['CUDE (POS Electronico)','No','CRITICO: Obligatorio junio 2025'],
    ['Transmision SOAP DIAN','Si','Hab + Prod endpoints'],
    ['Nota Credito/Debito','Si','XML + CUFE + transmision'],
    ['Factura Contingencia','Si','Tipo 04, retransmision'],
    ['Certificado Digital','Parcial','Upload P12, sin firma XMLDSig'],
    ['ReteFuente/ReteICA/ReteIVA','Parcial','Solo en compras, no en ventas'],
    ['Documento Soporte','No','Requerido para proveedores informales'],
    ['Nomina Electronica','No','Obligatorio para empleadores'],
    ['RADIAN (Acuse Recibo)','No','Eventos de recepcion'],
],[0.32,0.13,0.55]))

story.append(heading('2.4 Seguridad', h2s, 1))
story.append(p('El sistema implementa un modelo de seguridad multicapa con autenticacion basada en tokens HMAC-SHA256 (Web Crypto API compatible con Edge Runtime), middleware de autenticacion con comparacion timing-safe para prevenir ataques de timing, rate limiting en memoria (token bucket), cifrado AES-256-GCM para campos sensibles, CORS restringido a origenes conocidos, y RBAC con roles SUPER_ADMIN, OWNER y EMPLOYEE. Sin embargo, faltan funcionalidades criticas como autenticacion de dos factores (2FA), rotacion de tokens, y auditoria de acceso detallada.'))
story.append(mt(['Capa','Implementado','Prioridad'],[
    ['Auth HMAC-SHA256','Si','-'],['Rate Limiting','Si (in-memory)','Migrar a Redis'],
    ['CORS Restrictivo','Si','-'],['Timing-Safe Comparison','Si','-'],
    ['AES-256-GCM Encryption','Si','-'],['RBAC (3 roles)','Si','-'],
    ['2FA / MFA','No','ALTA'],['Token Rotation','No','ALTA'],
    ['Audit Trail Detallado','Parcial','ALTA'],['CSP Headers','No','MEDIA'],
],[0.35,0.25,0.40]))

# ── 3. PANORAMA COMPETITIVO ──
story.extend(h1o('3. Panorama Competitivo en Colombia'))
story.append(p('El mercado colombiano de sistemas POS esta dominado por actores locales con profundo conocimiento de la regulacion DIAN, complementados por soluciones internacionales que buscan adaptarse al mercado local. A continuacion se presenta un analisis comparativo de los 8 competidores mas relevantes.'))
story.append(Spacer(1,6))
story.append(mt(['Sistema','DIAN Nativa','Offline','Restaurante','Precio COP/mes','Target'],[
    ['Alegra','Si','No','Basico','$25,900-$139,900','PYME Retail'],
    ['Siigo','Si','No','Si','$145,000-$352,150','PYME+ Enterprise'],
    ['Treinta','Parcial','No','No','Free-$79,900','Micro-negocios'],
    ['Aliaddo','Si','No','Basico','$50,000-$150,000','PYME'],
    ['PirPos','No','No','Si (KDS)','~$358,655','HORECA'],
    ['Fudo','Add-on','No','Si (KDS)','$62,900-$245,600','HORECA'],
    ['Odoo','Partner','Si','Basico','Free-EUR25/user','Enterprise'],
    ['Tiendana','Si','Si','Basico','$58,000+','PYME Retail'],
],[0.12,0.10,0.08,0.12,0.25,0.18]))
story.append(Spacer(1,6))
story.append(p('<b>VentifyPOS vs. Competidores:</b> VentifyPOS se posiciona como una solucion hibrida (retail + restaurante) con facturacion electronica nativa, algo que solo Alegra y Siigo ofrecen parcialmente. Sin embargo, carece de modo offline (solo Odoo y Tiendana lo tienen), no tiene integracion con pasarelas de pago colombianas (Wompi, Bold, Nequi), y no envia comprobantes por WhatsApp, un canal critico en Colombia donde el 95% de la poblacion usa esta plataforma activamente.'))

# ── 4. BRECHAS CRITICAS ──
story.extend(h1o('4. Brechas Criticas Identificadas'))
story.append(p('El analisis cruzado entre las capacidades actuales de VentifyPOS, los requisitos regulatorios colombianos y las funcionalidades de la competencia revela 10 brechas criticas que deben abordarse para garantizar la viabilidad competitiva del producto.'))
gaps = [
    ['G1','POS Electronico (CUDE)','CRITICA','Sin CUDE, el sistema no cumple la Resolucion 000202/2025. Las empresas que usen VentifyPOS no podran emitir comprobantes validos ante la DIAN a partir de junio 2025. Esto es un bloqueador legal, no una mejora.'],
    ['G2','Modo Offline','ALTA','El 40%+ de negocios colombianos tienen internet intermitente. Sin offline, VentifyPOS pierde todo el mercado de zonas rurales y negocios con conectividad inestable. Solo Odoo y Tiendana ofrecen esto.'],
    ['G3','WhatsApp Receipts','ALTA','El 95% de colombianos usa WhatsApp. Enviar comprobantes por este canal es un diferenciador masivo que NINGUN competidor ofrece nativamente. Transforma la experiencia del cliente final.'],
    ['G4','Pasarelas de Pago','ALTA','Sin integracion con Wompi, Bold, Nequi o Bancolombia, cada tienda debe manejar pagos manualmente. Los competidores ya integran datafonos y QR.'],
    ['G5','313 Errores TypeScript','ALTA','189 errores TS2339 (propiedades faltantes) indican schema desincronizado. Esto causa errores en runtime, dificultad para mantener el codigo, y riesgo de regresiones.'],
    ['G6','ReteFuente/ReteICA en Ventas','MEDIA','Las retenciones solo se calculan en compras. Para transacciones B2B se requiere calculo automatico en ventas tambien.'],
    ['G7','Firma Digital XMLDSig','MEDIA','El certificado digital se sube pero no se usa para firmar el XML electronicamente. La DIAN requiere firma XMLDSig para validacion.'],
    ['G8','Documento Soporte','MEDIA','Obligatorio para compras a proveedores informales (Decreto 2157/2017). Sin esto, las empresas no pueden deducir esas compras.'],
    ['G9','Testing / QA','MEDIA','No existe ningun test automatizado. Con 97+ endpoints y 38 modelos, cada cambio es un riesgo de regresion.'],
    ['G10','2FA / MFA','MEDIA','Los competidores enterprise exigen 2FA para acceso admin. Sin esto, VentifyPOS no puede competir en el segmento corporativo.'],
]
for g in gaps:
    story.append(Paragraph('<b>%s - %s</b> [%s]' % (g[0],g[1],g[2]), h3s))
    story.append(p(g[3])); story.append(Spacer(1,4))

# ── 5. RECOMENDACIONES ──
story.extend(h1o('5. Recomendaciones Estrategicas Priorizadas'))
story.append(p('Las recomendaciones se organizan en 4 fases de implementacion, priorizadas por impacto competitivo y urgencia regulatoria. Cada fase debe completarse antes de pasar a la siguiente, aunque algunos elementos pueden avanzar en paralelo si hay recursos disponibles.'))

story.append(heading('5.1 Fase 1 - Cumplimiento Legal (Semanas 1-4)', h2s, 1))
story.append(p('<b>Objetivo:</b> Garantizar que VentifyPOS cumple con todos los requisitos de la DIAN antes del deadline de junio 2025. Sin esto, el producto no es legalmente vendible en Colombia.'))
story.append(mt(['ID','Recomendacion','Prioridad','Avance','Que Falta'],[
    ['R1.1','Implementar CUDE para POS Electronico','CRITICA','0%','Generador CUDE, flujo POS electronico, transmision en tiempo real a DIAN'],
    ['R1.2','Firma XMLDSig con certificado digital','CRITICA','20%','Integrar xml-crypto o node-signxml para firmar XML antes de transmitir'],
    ['R1.3','ReteFuente/ReteICA en ventas','ALTA','0%','Motor de retenciones configurable por ciudad, umbral UVT, tipo de regimen'],
    ['R1.4','Documento Soporte electronico','MEDIA','0%','Nuevo modelo + API + XML para compras a informales'],
],[0.07,0.28,0.10,0.08,0.47]))

story.append(heading('5.2 Fase 2 - Diferenciacion Competitiva (Semanas 5-10)', h2s, 1))
story.append(p('<b>Objetivo:</b> Crear diferenciadores que Ningun competidor ofrezca, convirtiendo a VentifyPOS en la opcion obvia para PYMEs colombianas que necesitan retail + restaurante + facturacion en un solo producto.'))
story.append(mt(['ID','Recomendacion','Prioridad','Avance','Que Falta'],[
    ['R2.1','Modo Offline con sincronizacion','ALTA','0%','Service Worker, IndexedDB para cola de transacciones, sync al reconectar'],
    ['R2.2','WhatsApp Receipts via API','ALTA','0%','WhatsApp Business API o Twilio, envio automatico post-venta'],
    ['R2.3','Pasarelas de pago colombianas','ALTA','0%','Wompi API, Bold Smart QR, Nequi, integracion en flujo POS'],
    ['R2.4','App PWA para POS movil','MEDIA','10%','Manifest.json, service worker, instalable desde navegador'],
    ['R2.5','KDS (Kitchen Display System)','MEDIA','0%','Pantalla de cocina en tiempo real via WebSocket o SSE'],
],[0.07,0.28,0.10,0.08,0.47]))

story.append(heading('5.3 Fase 3 - Calidad y Estabilidad (Semanas 11-16)', h2s, 1))
story.append(p('<b>Objetivo:</b> Eliminar los 313 errores TypeScript, implementar testing automatizado, y mejorar la seguridad para nivel enterprise. Un producto con errores de tipado y sin tests no genera confianza en compradores corporativos.'))
story.append(mt(['ID','Recomendacion','Prioridad','Avance','Que Falta'],[
    ['R3.1','Corregir 313 errores TypeScript','ALTA','5%','Sincronizar schema Prisma, agregar tipos en queries, fix rate-limiter union'],
    ['R3.2','Testing E2E con Playwright','ALTA','0%','Tests de flujos criticos: login, venta, factura, cierre caja'],
    ['R3.3','Testing unitario API routes','ALTA','0%','Vitest para 97+ endpoints, mocks de Prisma'],
    ['R3.4','2FA con OTP/TOTP','MEDIA','0%','Google Authenticator compatible, QR setup, backup codes'],
    ['R3.5','Audit Trail completo','MEDIA','15%','StoreEventLog existe, ampliar a todas las acciones criticas'],
],[0.07,0.28,0.10,0.08,0.47]))

story.append(heading('5.4 Fase 4 - Escalabilidad y Crecimiento (Semanas 17-24)', h2s, 1))
story.append(p('<b>Objetivo:</b> Preparar la plataforma para escalar a cientos de tiendas, integrar con el ecosistema colombiano completo, y habilitar funcionalidades que permitan competir en el segmento enterprise contra Siigo y Odoo.'))
story.append(mt(['ID','Recomendacion','Prioridad','Avance','Que Falta'],[
    ['R4.1','Multi-NIT / Franquicias','ALTA','0%','Consolidacion entre NITs, reportes multi-empresa'],
    ['R4.2','Nomina Electronica','ALTA','0%','Model Employee ampliado, XML nomina, transmision DIAN'],
    ['R4.3','Contabilidad completa PUC','MEDIA','20%','Ledger existe, ampliar a plan cuentas PUC Colombia'],
    ['R4.4','Integracion delivery (Rappi/iFood)','MEDIA','0%','Webhook receivers, sincronizacion ordenes + inventario'],
    ['R4.5','API publica documentada','MEDIA','0%','OpenAPI spec, rate limiting por API key, developer portal'],
    ['R4.6','Multi-moneda (COP/USD/VES)','BAJA','0%','Campos de moneda, tasas de cambio, fronteras'],
],[0.07,0.28,0.10,0.08,0.47]))

# ── 6. SEGUIMIENTO ──
story.extend(h1o('6. Seguimiento de Progreso Global'))
story.append(p('La siguiente tabla resume el estado actual de cada area critica, el porcentaje de avance estimado, y las acciones pendientes. Este seguimiento debe actualizarse semanalmente para garantizar transparencia y rendicion de cuentas con los stakeholders del proyecto.'))
story.append(mt(['Area','Avance','Logrado','Pendiente'],[
    ['Facturacion DIAN','55%','XML UBL 2.1, CUFE, SOAP, PDF, Email','CUDE, XMLDSig, Doc Soporte, Retenciones ventas'],
    ['Seguridad','50%','HMAC auth, RBAC, Rate limit, AES-256','2FA, Token rotation, CSP, Audit completo'],
    ['UX / Interfaz','70%','shadcn/ui, dark mode, responsive basico','PWA, offline, accesibilidad WCAG'],
    ['Funcionalidades POS','65%','Ventas, inventario, mesas, cotizaciones','KDS, delivery, pasarelas pago, WhatsApp'],
    ['Calidad de Codigo','30%','ESLint passing, estructura modular','313 TS errors, 0 tests, schema desincronizado'],
    ['Cumplimiento DIAN 2025','40%','FE completa, notas, contingencia','POS electronico CUDE, firma digital, doc soporte'],
    ['Escalabilidad','25%','Multi-tienda, suscripciones, proration','Multi-NIT, nomina, API publica, Redis'],
],[0.18,0.08,0.37,0.37]))

# ── 7. CONSULTA ──
story.extend(h1o('7. Consulta y Validacion con Stakeholders'))
story.append(p('Antes de implementar cualquier cambio, se requiere validacion con los siguientes grupos de stakeholders. Cada recomendacion debe ser aprobada o ajustada segun el feedback recibido, priorizando las necesidades del negocio sobre las preferencias tecnicas.'))
story.append(Spacer(1,4))
story.append(b('Equipo de Desarrollo: Validar viabilidad tecnica de cada recomendacion, estimar esfuerzo real, identificar dependencias entre tareas, y proponer alternativas si alguna no es factible en los plazos propuestos.'))
story.append(b('Equipo de Producto/Negocio: Confirmar prioridades de mercado, validar que las recomendaciones responden a necesidades reales de clientes, ajustar el roadmap segun feedback de usuarios piloto, y definir metricas de exito para cada fase.'))
story.append(b('Equipo Legal/Compliance: Verificar interpretacion de la Resolucion 000202/2025, confirmar plazos y requisitos de DIAN, revisar tratamiento de datos personales (Ley 1581/2012), y validar obligaciones tributarias del sistema.'))
story.append(b('Clientes Piloto: Probar funcionalidades existentes, reportar bugs criticos, validar UX de flujos de facturacion, y confirmar que los precios planificados son competitivos para el mercado objetivo.'))
story.append(Spacer(1,6))
story.append(Paragraph('<b>Preguntas abiertas para validacion:</b>', h3s))
story.append(b('La Fase 1 (cumplimiento DIAN) tiene un deadline fijo (junio 2025) o existe margen de negociacion con la DIAN?'))
story.append(b('El modo offline es un requisito indispensable para el lanzamiento o puede posponerse a la Fase 2?'))
story.append(b('Cual es el presupuesto disponible para integraciones de terceros (WhatsApp API, Wompi, Bold)?'))
story.append(b('Se requiere soporte para regimenes especiales (entidades sin animo de lucro, cooperativas) o solo para empresas comerciales?'))
story.append(b('El target principal son micro-negocios (competir con Treinta) o PYMEs (competir con Alegra/Siigo)? Esto define todo el pricing y feature set.'))

# ── 8. CONCLUSION ──
story.extend(h1o('8. Conclusion'))
story.append(p('VentifyPOS tiene una base tecnologica solida y diferenciadores reales en el mercado colombiano: es el unico proyecto que combina retail + restaurante con facturacion electronica nativa en un stack moderno. Sin embargo, las brechas criticas identificadas (especialmente el POS electronico CUDE y el modo offline) son bloqueadores que impiden la venta legal y competitiva del producto. La prioridad maxima debe ser completar la Fase 1 (cumplimiento DIAN) antes del deadline regulatorio, seguida de la Fase 2 (diferenciacion con WhatsApp y offline) que puede posicionar a VentifyPOS como la alternativa mas atractiva para PYMEs colombianas que necesitan un sistema completo a un precio accesible.'))
story.append(Spacer(1,8))
story.append(p('El mercado colombiano de POS esta en transicion forzada hacia la facturacion electronica total, lo que crea una ventana de oportunidad unica. Los 2 millones+ de micro-negocios que aun operan de forma informal estan siendo obligados a digitalizarse, y ningun competidor ofrece una solucion que sea simultaneamente completa, accesible, y facil de adoptar. VentifyPOS puede llenar ese espacio si ejecuta las fases propuestas dentro de los plazos establecidos.'))

# ── BUILD ──
doc.multiBuild(story)
print(f"PDF generado: {output}")
