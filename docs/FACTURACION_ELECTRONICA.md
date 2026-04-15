# Facturación Electrónica - Bar La Terraza (POS)

> Documento técnico completo sobre el estado actual de la base de datos, el flujo de ventas,
> lo implementado para facturación electrónica DIAN, y lo que falta por desarrollar.

---

## 1. DIAGRAMA DE BASE DE DATOS (ER - Texto)

La base de datos tiene **18 modelos** organizados en 7 contextos funcionales.
Motor: **SQLite** (mono-tienda, despliegue local).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        IDENTIDAD Y ACCESO                                      │
│                                                                                 │
│   ┌──────────┐          1:1           ┌──────────┐                              │
│   │   User   │───────────────────────│  Store   │                              │
│   └──────────┘                       └────┬─────┘                              │
│        │                                  │                                     │
└────────┼──────────────────────────────────┼─────────────────────────────────────┘
         │                                  │
         │ 1:N                             │ 1:N (Store es padre de TODO)
         │                                  │
┌────────┼──────────────────────────────────┼─────────────────────────────────────┐
│        │       IMPUESTOS (DIAN)           │      INVENTARIO Y CATÁLOGO          │
│        │                                  │                                      │
│        │              ┌──────────┐        │  ┌──────────┐     1:N    ┌────────┐ │
│        │              │ TaxRate  │◄───────┼──│ Product  │──────────►│Category│ │
│        │              └──────────┘        │  └────┬─────┘            └────────┘ │
│        │                                  │       │                            │
│        │                                  │  1:N  │ 1:N                       │
│        │                                  │  ┌────┴─────────────┐             │
│        │                                  │  │InventoryMovement │             │
│        │                                  │  └──────────────────┘             │
│        │                                  │                                      │
│        │                                  │  ┌──────────┐  1:N  ┌────────────┐ │
│        │                                  │  │ Provider │──────►│ Purchase   │ │
│        │                                  │  └────┬─────┘       └─────┬──────┘ │
│        │                                  │       │ 1:N              │ 1:N     │
│        │                                  │       └──────►┌──────────┴──┐     │
│        │                                  │              │PurchaseItem │     │
│        │                                  │              └─────────────┘     │
└────────┼──────────────────────────────────┼─────────────────────────────────────┘
         │                                  │
         │              ┌──────────┐        │
         │              │  Invoice │        │
         │              │ (DIAN FE)│        │
         │              └────┬─────┘        │
         │                   │              │
┌────────┼──────────────────┼──────────────┼─────────────────────────────────────┐
│        │      VENTAS Y COMERCIO          │      MESAS Y COMANDAS               │
│        │                                  │                                      │
│        │    ┌──────────┐    1:1    ┌─────┴─────┐                               │
│        │    │ Customer │◄──────────│   Order   │                               │
│        │    └────┬─────┘           └────┬──────┘                               │
│        │         │                       │                                      │
│        │         │ 1:N                   │ 1:N                                  │
│        │         │              ┌────────┴──────────┐                           │
│        │         │              │    OrderItem      │                           │
│        │         │              │ (con tax snapshot)│                           │
│        │         │              └───────────────────┘                           │
│        │         │                       │                                      │
│        │         │                       │ InventoryMovement (ref)              │
│        │         │                       │                                      │
│        │         │              ┌────────┴──────────┐   ┌──────────────┐       │
│        │         │              │  CashRegister    │   │  BarTable    │       │
│        │         │              └──────────────────┘   └──────┬───────┘       │
│        │         │                                              │ 1:N          │
│        │         │                                     ┌───────┴──────────┐   │
│        │         │                                     │   TableSession   │   │
│        │         │                                     └───┬──────────┬───┘   │
│        │         │                                         │ 1:N      │ 1:N   │
│        │         │                                  ┌──────┴──┐ ┌───┴───────┐│
│        │         │                                  │  Order  │ │ComandaItem││
│        │         │                                  └─────────┘ └────────────┘│
└────────┼─────────┼────────────────────────────────────────────────────────────┘
         │         │
┌────────┼─────────┼─────────────────────────────────────────────────────────────┐
│        │ CONTABILIDAD         │           SERVICIOS DEL BAR                     │
│        │                       │                                                 │
│        │  ┌───────────────┐    │    ┌──────────┐    1:N    ┌──────────────────┐ │
│        │  │ LedgerAccount │    │    │ Service  │──────────►│ServiceTransaction│ │
│        │  └───────┬───────┘    │    └────┬─────┘           └──────────────────┘ │
│        │          │ 1:N         │         │                                        │
│        │  ┌───────┴──────────┐ │         │ 1:N (ComandaItem)                     │
│        │  │  JournalEntry    │ │         │ 1:N (OrderItem)                       │
│        │  └──────────────────┘ │         │                                        │
│        │                       │                                                  │
└────────┼───────────────────────┼──────────────────────────────────────────────────┘
         │                       │
┌────────┼───────────────────────┼──────────────────────────────────────────────────┐
│        │     GASTOS OPERATIVOS │                                                  │
│        │                       │                                                  │
│        │  ┌───────────────┐    │                                                  │
│        │  │    Expense    │    │                                                  │
│        │  └───────────────┘    │                                                  │
│        │                       │                                                  │
└────────┴───────────────────────┴──────────────────────────────────────────────────┘
```

### Resumen de Relaciones

| Relación | Cardinalidad | Notas |
|----------|-------------|-------|
| User ↔ Store | 1:1 | Un usuario es dueño de una tienda |
| Store → (Category, Product, Customer, etc.) | 1:N | Store es padre de 16 modelos hijos |
| Store → Invoice | 1:N | Facturas de la tienda |
| Product → Category | N:1 | Un producto pertenece a una categoría |
| Product → Provider | N:1 | Un producto puede tener proveedor |
| Product → TaxRate | N:1 | Clasificación tributaria DIAN |
| Product → InventoryMovement | 1:N | Movimientos de inventario del producto |
| Product → OrderItem, ComandaItem, PurchaseItem | 1:N | Producto referenciado en ventas/órdenes/compras |
| Provider → Purchase, Product | 1:N | Un proveedor puede tener muchas compras y productos |
| Customer → Order, TableSession | 1:N | Un cliente puede tener muchas órdenes y sesiones |
| Order → OrderItem | 1:N | Items de la orden |
| Order → Invoice | 1:1 | Una orden tiene máximo una factura |
| Order → InventoryMovement | 1:N | Salidas de inventario por venta |
| Order → CashRegister | N:1 | La orden se registra en una caja |
| BarTable → TableSession | 1:N | Una mesa puede tener muchas sesiones |
| TableSession → Order, ComandaItem | 1:N | Sesión puede generar múltiples órdenes y comandas |
| Service → ServiceTransaction, ComandaItem, OrderItem | 1:N | Un servicio aparece en transacciones, comandas y órdenes |
| LedgerAccount → JournalEntry | 1:N | Cuentas contables con asientos |
| Purchase → PurchaseItem | 1:N | Items de una compra a proveedor |

### 18 Modelos por Contexto

| # | Contexto | Modelo | Tabla SQL |
|---|----------|--------|-----------|
| 1 | Identidad | `User` | `users` |
| 2 | Identidad | `Store` | `stores` |
| 3 | Impuestos | `TaxRate` | `tax_rates` |
| 4 | Facturación | `Invoice` | `invoices` |
| 5 | Catálogo | `Category` | `categories` |
| 6 | Catálogo | `Product` | `products` |
| 7 | Catálogo | `InventoryMovement` | `inventory_movements` |
| 8 | Catálogo | `Provider` | `providers` |
| 9 | Catálogo | `Purchase` | `purchases` |
| 10 | Catálogo | `PurchaseItem` | `purchase_items` |
| 11 | Ventas | `Customer` | `customers` |
| 12 | Ventas | `Order` | `orders` |
| 13 | Ventas | `OrderItem` | `order_items` |
| 14 | Mesas | `BarTable` | `bar_tables` |
| 15 | Mesas | `TableSession` | `table_sessions` |
| 16 | Mesas | `ComandaItem` | `comanda_items` |
| 17 | Contabilidad | `LedgerAccount` + `JournalEntry` | `ledger_accounts` + `journal_entries` |
| 18 | Servicios | `Service` + `ServiceTransaction` | `services` + `service_transactions` |
| 19 | Caja | `CashRegister` | `cash_registers` |
| 20 | Gastos | `Expense` | `expenses` |

> **Nota:** Son técnicamente 20 modelos (LedgerAccount/JournalEntry y Service/ServiceTransaction son pares), pero el schema define 18 contextos funcionales.

---

## 2. FLUJO DE VENTAS ACTUAL

El sistema tiene dos flujos de venta: **Punto de Venta directo** y **Mesas (Restaurante/Bar)**.

### 2.1 Flujo por Punto de Venta (POS directo)

```
[1] El mesero selecciona productos/servicios en la vista POS
         │
         ▼
[2] Los items se agregan al carrito con cantidades y notas
         │
         ▼
[3] Al pagar → POST /api/orders
    - Se calculan impuestos automáticos (IVA 19%, etc.)
    - Se generan OrderItem con snapshot de impuestos
    - Se descuenta inventario (InventoryMovement SALE)
    - Se registran asientos contables (JournalEntry)
    - Se vincula a CashRegister (si hay caja abierta)
         │
         ▼
[4] Estado: COMPLETED → Se imprime ticket opcionalmente
         │
         ▼
[5] (Opcional) POST /api/invoices → Generar factura electrónica
    - Calcula CUFE, QR code, desglose tributario
    - Estado: DRAFT (test) o PENDING_VALIDATE (producción)
```

### 2.2 Flujo por Mesas (Restaurante/Bar)

```
[1] Mesero abre mesa → POST /api/tables/sessions
    - Se crea TableSession (status: OPEN)
    - Se asigna BarTable + Customer (opcional)
         │
         ▼
[2] Mesero agrega items a la comanda → POST /api/tables/sessions/[id]/comanda
    - Se crean ComandaItem (status: PENDING)
    - Se almacena productName y unitPrice como snapshot
         │
         ▼
[3] Cocina/bar marca items como servidos → PUT ComandaItem (status: SERVED)
         │
         ▼
[4] Cliente pide la cuenta → POST /api/tables/sessions/[id]/pay
    - Lee todos los ComandaItem de la sesión
    - Aplica descuento (opcional: NONE, PERCENTAGE, FIXED)
    - Crea Order con OrderItem desde la comanda
    - Descuenta inventario (InventoryMovement SALE)
    - Registra asientos contables (JournalEntry)
    - Vincula a CashRegister (si hay caja abierta)
    - Cierra TableSession (status: CLOSED)
         │
         ▼
[5] Estado: COMPLETED → Se imprime ticket
         │
         ▼
[6] (Opcional) POST /api/invoices → Generar factura electrónica
```

### 2.3 Cálculo Automático de Impuestos

En el paso de creación de Order (punto 3 del POS o paso 4 de mesas), el sistema:

1. Obtiene el TaxRate asignado a cada producto
2. Si el producto no tiene TaxRate, usa el **default de la tienda** (category=SALES_TAX)
3. Para servicios, busca un default que aplique a SERVICE o BOTH
4. Calcula por cada OrderItem:
   - **IVA Backout** (precios colombianos incluyen IVA):
     - `taxBase = totalRow / (1 + rate/100)`
     - `taxAmount = totalRow - taxBase`
   - **Exento/Excluido** (codes 03, 04): taxAmount = 0
5. Genera `taxBreakdown` JSON: `[{code:"01",name:"IVA 19%",base:50000,rate:19,amount:7983}]`

### 2.4 Caja Registradora

```
[1] Cajero abre caja → POST /api/cash-register
    - openingBalance = efectivo en caja
    - status: OPEN
         │
         ▼
[2] Todas las órdenes se vinculan a la caja abierta (cashRegisterId)
         │
         ▼
[3] Al cerrar → PUT /api/cash-register/[id]
    - Calcula expectedCash = apertura + ventas efectivo - pagos fiado
    - Registra closingBalance
    - Calcula difference = cierre - esperado
    - Almacena countBreakdown JSON por método de pago
    - status: CLOSED
```

---

## 3. FACTURACIÓN ELECTRÓNICA — LO QUE YA EXISTE EN LA DB

### 3.1 Modelo Store — Campos DIAN de Resolución

```prisma
// En el modelo Store:
invoicePrefix          String?    // Prefijo: FE, POS
resolutionNumber       String?    // Número resolución DIAN: 18764
resolutionStartDate    DateTime?  // Fecha inicio rango numeración
resolutionEndDate      DateTime?  // Fecha fin rango numeración
resolutionStartNumber  Int?       // Consecutivo inicial
resolutionEndNumber    Int?       // Consecutivo final
invoiceTestMode        Boolean    // true=habilitación, false=producción
```

Estos campos se pueden configurar desde la vista de **Configuración → Facturación**.

### 3.2 Modelo Invoice — Factura Electrónica Completa

El modelo `Invoice` tiene **todos los campos necesarios** para DIAN:

| Sección | Campos | Descripción |
|---------|--------|-------------|
| **Numeración** | `prefix`, `consecutive`, `resolutionNumber`, `resolutionDate`, `startDate`, `endDate`, `startNumber`, `endNumber` | Resolución DIAN completa |
| **Cliente** | `customerNit`, `customerName`, `customerAddress`, `customerPhone`, `customerEmail`, `customerRegime`, `customerType` | Datos fiscales del comprador |
| **Tributario** | `subtotalBase`, `taxExemptAmount`, `taxBreakdown` (JSON), `totalTaxAmount`, `totalWithTax`, `discountAmount`, `tipAmount`, `grandTotal` | Desglose completo de impuestos |
| **Pago** | `paymentMethod` (código DIAN), `paymentNotes` | Método de pago normalizado |
| **DIAN** | `cufe`, `qrCode`, `xmlContent` | CUFE hash, URL QR, XML UBL 2.1 |
| **Estado** | `status` (DRAFT/PENDING_VALIDATE/VALIDATED/DELIVERED/REJECTED/CANCELLED), `dianResponse`, `dianErrorCode` | Ciclo de vida completo |
| **Tiempos** | `sentAt`, `validatedAt`, `emailedAt` | Trazabilidad temporal |
| **Ambiente** | `testMode` | Habilitación vs Producción |

### 3.3 Modelo TaxRate — Clasificación Tributaria

```prisma
model TaxRate {
  code      String   // "01"=IVA 19%, "02"=IVA 5%, "03"=Exento, "04"=Excluido, "05"=Impoconsumo
  rateType  String   // PERCENTAGE, FIXED_AMOUNT
  rate      Int      // 19 para 19%
  applyTo   String   // PRODUCT, SERVICE, BOTH
  category  String   // SALES_TAX, CONSUMPTION_TAX, WITHHOLDING, MUNICIPAL
  isDefault Boolean  // Tasa por defecto para nuevos productos
}
```

**TaxRates creados por defecto en el seed:**
- `01` — IVA 19% (default para bar)
- `02` — IVA 5%
- `03` — IVA 0% Exento
- `04` — IVA Excluido
- `05` — Impoconsumo 8%

### 3.4 OrderItem — Snapshot de Impuestos

```prisma
model OrderItem {
  taxCode     String?  // Código DIAN al momento de la venta
  taxRate     Int      // Tasa al momento de la venta
  taxAmount   Int      // Monto del impuesto
  taxBase     Int      // Base gravable
}
```

### 3.5 Customer — Datos Fiscales

```prisma
model Customer {
  nit          String?  // NIT del cliente
  documentType String?  // CC, NIT, CE, TI, PP
  regime       String?  // RESPONSABLE, NO_RESPONSABLE, SIMPLIFICADO
}
```

### 3.6 Funciones Implementadas (invoice-utils.ts)

| Función | Descripción |
|---------|-------------|
| `generateCUFE(params)` | SHA-384 con 16 campos DIAN |
| `generateQRCodeURL(params)` | URL catálogo VPFE DIAN |
| `calculateInvoiceFromOrder(order, items)` | Calcula todos los campos tributarios |
| `getDIANPaymentCode(paymentMethod)` | Mapea métodos POS a códigos DIAN (1=Efectivo, 2=Tarjeta, 10=Transferencia, 42=Daviplata/Nequi, 99=Mixto) |
| `formatInvoiceNumber(prefix, consecutive)` | Formato "FE-00000001" |
| `padField(value, length)` | Padding con ceros |

### 3.7 APIs Implementadas

| Ruta | Método | Funcionalidad |
|------|--------|---------------|
| `/api/invoices` | GET | Listar facturas (filtros: storeId, status, fecha, búsqueda) |
| `/api/invoices` | POST | Crear factura desde orden (genera CUFE, QR, cálculo tributario) |
| `/api/invoices/[id]` | GET | Detalle de factura con orden e items |
| `/api/invoices/[id]` | PUT | Actualizar factura (transiciones de estado) |
| `/api/invoices/[id]` | DELETE | Eliminar factura (solo DRAFT) |
| `/api/taxes` | GET/POST | CRUD de tasas de impuesto |
| `/api/taxes/[id]` | GET/PUT/DELETE | Gestión individual de tasas |

---

## 4. FACTURACIÓN ELECTRÓNICA — LO QUE FALTA POR IMPLEMENTAR

### 4.1 Servicios DIAN (Habilitación vs Producción)

La DIAN requiere que los contribuyentes operen dos ambientes:

#### Ambiente de Habilitación (Pruebas)
- **Endpoint:** `https://vpfe-hab.dian.gov.co/WcfVepFactura.svc`
- **Propósito:** Enviar facturas de prueba para validar la integración
- **Requisito:** La resolución de numeración debe ser de habilitación
- **Catálogo:** `https://catalogo-vpfe-hab.dian.gov.co/documento/consultar`
- El campo `Store.invoiceTestMode = true` indica que se opera en este ambiente

#### Ambiente de Producción
- **Endpoint:** `https://vpfe.dian.gov.co/WcfVepFactura.svc`
- **Propósito:** Facturas reales con valor legal y tributario
- **Requisito:** Acreditación como proveedor de tecnología (PTE) o software propio
- **Catálogo:** `https://catalogo-vpfe.dian.gov.co/documento/consultar`
- El campo `Store.invoiceTestMode = false` indica producción

#### Proveedor de Tecnología (PTE)
Para enviar facturas electrónicas, se necesita:
1. **Software certificado** — El software POS debe estar acreditado ante la DIAN como PTE
2. **Certificado digital** — Certificado X.509 (.p12) para firmar el XML
3. **Set de Pruebas** — La DIAN proporciona un conjunto de casos de prueba que deben pasar:
   - Factura de venta estándar
   - Factura con descuento
   - Factura con impoconsumo
   - Factura con exenciones
   - Nota crédito (anulación)
   - Cada caso tiene un XML esperado de entrada y la respuesta de validación esperada
4. **Habilitación** — Una vez pasan las pruebas, la DIAN emite la habilitación (resolución 18764 para este caso)

**Estado actual del sistema:** El modelo Store tiene los campos de resolución, pero NO hay lógica para enviar/recibir XML a los servicios web de la DIAN.

### 4.2 Generación XML UBL 2.1

La DIAN requiere que las facturas electrónicas se envíen en formato **UBL 2.1** (Universal Business Language).

#### Namespaces requeridos

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sts="http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures"
         xmlns:clm54217="urn:un:unece:uncefact:codelist:specification:54217:2001"
         xmlns:clm66411="urn:un:unece:uncefact:codelist:specification:66411:2001"
         xmlns:clmIAN8801="urn:un:unece:uncefact:codelist:specification:IAN8801:2005">
```

#### Estructura principal del XML

```xml
<ext:UBLExtensions>
  <ext:UBLExtension>
    <ext:ExtensionContent>
      <sts:DianExtensions>
        <sts:InvoiceControl>
          <sts:InvoiceAuthorizationNumber>18764</sts:InvoiceAuthorizationNumber>
          <sts:AuthorizationPeriod>
            <sts:StartDate>2024-01-01</sts:StartDate>
            <sts:EndDate>2025-12-31</sts:EndDate>
          </sts:AuthorizationPeriod>
          <sts:AuthorizedInvoices>
            <sts:Prefix>FE</sts:Prefix>
            <sts:From>1</sts:From>
            <sts:To>10000</sts:To>
          </sts:AuthorizedInvoices>
        </sts:InvoiceControl>
        <sts:InvoiceSource>
          <sts:IdentificationCode>CUFE-GENERADO</sts:IdentificationCode>
        </sts:InvoiceSource>
        <sts:SoftwareProvider>
          <sts:ProviderID>NIT-DEL-PTE</sts:ProviderID>
          <sts:SoftwareID>NOMBRE-SOFTWARE</sts:SoftwareID>
        </sts:SoftwareProvider>
      </sts:DianExtensions>
    </ext:ExtensionContent>
  </ext:UBLExtension>
  <!-- Extension para representación gráfica (PDF) en Base64 -->
  <ext:UBLExtension>
    <ext:ExtensionContent>
      <sts:DianExtensions>
        <sts:RepresentacionGrafica>
          <sts:Formato>PNG</sts:Formato>
          <sts:ImagenBase64>iVBORw0KGgo...base64...</sts:ImagenBase64>
        </sts:RepresentacionGrafica>
      </sts:DianExtensions>
    </ext:ExtensionContent>
  </ext:UBLExtension>
</ext:UBLExtensions>

<cbc:ID>FE-00000001</cbc:ID>
<cbc:IssueDate>2024-06-15</cbc:IssueDate>
<cbc:IssueTime>14:30:00-05:00</cbc:IssueTime>
<cbc:InvoiceTypeCode listID="#6" listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe"
    listName="Invoice Type Code">01</cbc:InvoiceTypeCode>
<cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listAgencyID="6">COP</cbc:DocumentCurrencyCode>

<cac:AccountingSupplierParty>
  <cac:Party>
    <cbc:ID schemeID="31" schemeName="31 - NIT del emisor" schemeAgencyID="195"
            schemeAgencyName="CO, DIAN">900123456-7</cbc:ID>
    <cac:PartyName>
      <cbc:Name><![CDATA[Bar La Terraza]]></cbc:Name>
    </cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName><![CDATA[Cra 15 #82-35]]></cbc:StreetName>
      <cbc:CitySubdivisionName><![CDATA[Chapinero]]></cbc:CitySubdivisionName>
      <cbc:CityName schemeID="CO_DANE_8" schemeName="Divipola">11001</cbc:CityName>
      <cbc:PostalZone>110111</cbc:PostalZone>
      <cbc:Country>
        <cbc:IdentificationCode listID="ISO 3166-1 Alpha-2">CO</cbc:IdentificationCode>
      </cbc:Country>
    </cac:PostalAddress>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName><![CDATA[Bar La Terraza S.A.S]]></cbc:RegistrationName>
      <cbc:TaxScheme>
        <cbc:ID schemeID="4" schemeName="4 - Tributo">01</cbc:ID>
      </cbc:TaxScheme>
    </cac:PartyLegalEntity>
    <cac:Contact>
      <cbc:Telephone>+57 601 2345678</cbc:Telephone>
      <cbc:ElectronicMail>contacto@barlaterraza.com</cbc:ElectronicMail>
    </cac:Contact>
  </cac:Party>
</cac:AccountingSupplierParty>

<cac:AccountingCustomerParty>
  <cac:Party>
    <cbc:ID schemeID="31" schemeName="31 - NIT del receptor">222222222222</cbc:ID>
    <cac:PartyName>
      <cbc:Name><![CDATA[Consumidor Final]]></cbc:Name>
    </cac:PartyName>
    <!-- ... dirección, régimen fiscal ... -->
    <cac:PartyLegalEntity>
      <cbc:RegistrationName><![CDATA[Consumidor Final]]></cbc:RegistrationName>
    </cac:PartyLegalEntity>
  </cac:Party>
</cac:AccountingCustomerParty>

<cac:TaxTotal>
  <cbc:TaxAmount currencyID="COP">9500</cbc:TaxAmount>
  <cac:TaxSubtotal>
    <cbc:TaxableAmount currencyID="COP">50000</cbc:TaxableAmount>
    <cbc:TaxAmount currencyID="COP">9500</cbc:TaxAmount>
    <cac:TaxCategory>
      <cbc:ID schemeID="5" schemeName="5 - Impuesto">01</cbc:ID>
      <cbc:Percent>19.00</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID schemeID="4" schemeName="4 - Tributo">01</cbc:ID>
        <cbc:Name>IVA</cbc:Name>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:TaxSubtotal>
</cac:TaxTotal>

<cac:LegalMonetaryTotal>
  <cbc:LineExtensionAmount currencyID="COP">50000</cbc:LineExtensionAmount>
  <cbc:TaxExclusiveAmount currencyID="COP">50000</cbc:TaxExclusiveAmount>
  <cbc:TaxInclusiveAmount currencyID="COP">59500</cbc:TaxInclusiveAmount>
  <cbc:PayableAmount currencyID="COP">59500</cbc:PayableAmount>
</cac:LegalMonetaryTotal>

<!-- Una InvoiceLine por cada item vendido -->
<cac:InvoiceLine>
  <cbc:ID>1</cbc:ID>
  <cbc:InvoicedQuantity unitCode="NIU">2</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="COP">50000</cbc:LineExtensionAmount>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">9500</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">50000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">9500</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="5">01</cbc:ID>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:Item>
    <cbc:Description><![CDATA[Cerveza Club Colombia]]></cbc:Description>
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="COP">25000</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>
```

#### Lo que falta para generar el XML

- [ ] **Librería XML:** Instalar un generador de XML (ej: `fast-xml-parser`, `xmlbuilder2`) o crear templates de string
- [ ] **Certificado digital:** Función para firmar el XML con certificado .p12 (usando `node:crypto` con `sign`)
- [ ] **Campos adicionales en Store:** Divipola (código ciudad), país, departamento, nombre del software PTE, NIT del PTE
- [ ] **Función `generateUBL21XML(invoice, order, store, customer)`** que construya el XML completo
- [ ] **Función `signXML(xmlContent, certPath, certPassword)`** que firme digitalmente el XML
- [ ] **Validación XSD:** Validar el XML generado contra los esquemas XSD de la DIAN antes de enviar

### 4.3 Generación CUFE/CUDFE

#### Algoritmo Actual (implementado en `invoice-utils.ts`)

El CUFE actual se genera concatenando 16 campos separados por `|` y aplicando SHA-384:

```
NIT_Emisor|Fecha|Hora|Prefijo|Consecutivo|NIT_Receptor|Subtotal|TotalSinImpuestos|TotalImpuestos|Descuento|Total|Moneda|TipoOperacion|CUDE|NroCertificado|NIT_PTE_Software
```

El resultado se codifica en **Base64**.

#### Campos requeridos para el CUFE (estándar DIAN v2.1)

| # | Campo | Ejemplo | Nota |
|---|-------|---------|------|
| 1 | NIT del emisor (sin DV) | `900123456` | Solo dígitos, sin guion |
| 2 | Fecha de emisión | `20240615` | YYYYMMDD |
| 3 | Hora de emisión | `143000000` | HHmmssSSS |
| 4 | Prefijo | `FE` | De la resolución |
| 5 | Consecutivo | `00000000000000000001` | 20 dígitos, padding con ceros |
| 6 | NIT del receptor | `222222222222` | 13 dígitos (consumidor final) |
| 7 | Base gravable IVA | `0000000000000050000` | 20 dígitos |
| 8 | Total sin impuestos | `0000000000000050000` | 20 dígitos |
| 9 | Total impuestos | `0000000000000009500` | 20 dígitos |
| 10 | Descuento total | `0000000000000000000` | 20 dígitos |
| 11 | Total factura | `00000000000000059500` | 20 dígitos |
| 12 | Moneda | `COP` | Código ISO 4217 |
| 13 | Tipo operación | `10` | 10=estándar |
| 14 | CUDE (nota crédito) | `` | Vacío para CUFE |
| 15 | Número certificado | `` | Vacío si se usa PTE |
| 16 | NIT del PTE | `9001234567` | Proveedor tecnológico |

**Nota sobre CUFE vs CUDFE:**
- **CUFE** (Código Único de Factura Electrónica) — Para facturas de venta
- **CUDFE** (Código Único de Documento...) — Para notas crédito, débito, etc.
- El algoritmo es el mismo, solo cambian campos 13 y 14

#### Mejoras pendientes al CUFE

- [ ] **NIT sin dígito de verificación:** El estándar DIAN exige enviar el NIT del emisor **sin** el DV (solo los 9-10 primeros dígitos). Actualmente se envía completo.
- [ ] **Validación de longitud de padding:** Asegurar que cada campo numérico tenga exactamente la longitud requerida.
- [ ] **CUDE para notas crédito:** Cuando se implemente anulaciones, generar CUDFE correctamente.

### 4.4 Gestión de Prefijo y Consecutivo

#### Estado Actual

```prisma
// Store model (campos ya existentes):
invoicePrefix         String?   // "FE"
resolutionNumber      String?   // "18764"
resolutionStartNumber Int?      // 1
resolutionEndNumber   Int?      // 10000
```

```typescript
// En POST /api/invoices — Consecutivo actual (SIMPLE, NO ATÓMICO):
const lastInvoice = await db.invoice.findFirst({
  where: { storeId: store.id },
  orderBy: { consecutive: 'desc' },
})
const nextConsecutive = (lastInvoice?.consecutive ?? 0) + 1
```

**Problema:** Si dos terminales POS crean una factura exactamente al mismo tiempo, podrían obtener el mismo consecutivo (race condition).

#### Lo que falta

1. **Contador atómico:** Usar una transacción de Prisma que seleccione Y actualice en una sola operación:
   ```typescript
   const invoice = await db.$transaction(async (tx) => {
     const last = await tx.invoice.findFirst({
       where: { storeId },
       orderBy: { consecutive: 'desc' },
       lock: true, // Bloqueo pesado (no disponible en SQLite)
     })
     const next = (last?.consecutive ?? 0) + 1

     // Validar rango de resolución
     if (next > store.resolutionEndNumber) {
       throw new Error('Se agotó el rango de numeración autorizado')
     }

     return await tx.invoice.create({ data: { ...next } })
   })
   ```

2. **Validación contra resolución:** Antes de emitir, verificar:
   - `Store.resolutionStartDate <= hoy <= Store.resolutionEndDate`
   - `nextConsecutive <= Store.resolutionEndNumber`
   - `nextConsecutive >= Store.resolutionStartNumber`

3. **Alerta de agotamiento:** Cuando el consecutivo esté al 80% o 90% del rango, mostrar alerta al usuario para renovar resolución.

4. **Tabla separada de contador:** Opcionalmente, crear una tabla `InvoiceCounter` para evitar escaneos costosos de la tabla de facturas:
   ```prisma
   model InvoiceCounter {
     id          Int @id @default(1)
     storeId     Int @unique
     lastUsed    Int @default(0)
     // Solo una fila por tienda
   }
   ```

### 4.5 Sincronización de Prefijos (Multi-terminal)

#### Escenario actual
- **SQLite local** — Base de datos por archivo en disco
- **Servidor único** — Solo una instancia de Next.js sirviendo al POS
- **Un único terminal POS** (o múltiples navegadores contra el mismo servidor)

#### Enfoque recomendado para este caso

Dado que es SQLite mono-servidor, el enfoque #1 (transacciones Prisma) es suficiente:

```
┌──────────────────────────────────────────────────┐
│            Servidor Next.js (único)               │
│                                                  │
│  POST /api/invoices                              │
│  ┌─────────────────────────────────────────┐     │
│  │ db.$transaction(async (tx) => {         │     │
│  │   1. SELECT MAX(consecutive)            │     │
│  │   2. Validar rango resolución           │     │
│  │   3. INSERT Invoice (next+1)            │     │
│  │   4. COMMIT (SQLite serializa)          │     │
│  │ })                                      │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  SQLite serializa escrituras → SIN race condition│
└──────────────────────────────────────────────────┘
```

SQLite maneja escrituras de forma serializada (WRITE lock a nivel de base de datos completa), por lo que **no hay race conditions** mientras todas las conexiones vayan al mismo archivo `.db`.

#### Si se necesita multi-servidor en el futuro

**Opción A — API de reservación:**
```typescript
// POST /api/invoices/reserve-consecutive
// Reserva N consecutivos y devuelve el rango asignado
const { startNumber, endNumber } = await reserveConsecutive(storeId, count: 10)
// El terminal usa startNumber, startNumber+1, ..., endNumber
// Los no usados se liberan al cerrar la sesión
```

**Opción B — Rango por terminal:**
```
Terminal 1: FE-00000001 a FE-00000500
Terminal 2: FE-00000501 a FE-00001000
```
Cada terminal obtiene su propio rango de la DIAN (prefijos diferentes o rangos exclusivos).

**Opción C — Servicio externo (Redis/PostgreSQL):**
```
INCR invoice:store:1:consecutive → Redis devuelve número atómico
```

**Recomendación:** Para Bar La Terraza con SQLite, usar **transacciones Prisma** y no complicarse con arquitecturas distribuidas.

### 4.6 Envío/Validación con la DIAN

#### Método de comunicación

La DIAN expone servicios web (SOAP/WCF) para la facturación electrónica:

```
WSDL: https://vpfe-hab.dian.gov.co/WcfVepFactura.svc?wsdl
```

#### Operaciones principales

| Operación | Descripción | Request | Response |
|-----------|-------------|---------|----------|
| `SendBillAsync` | Enviar factura XML | XML UBL 2.1 firmado + ZIP en Base64 | `TrackId` para seguimiento |
| `GetStatus` | Consultar estado de envío | TrackId | Estado + XML validado |
| `GetStatusByDocument` | Consultar por número de factura | NIT + Prefijo + Consecutivo | Estado |
| `SendBillSync` | Envío síncrono (más lento) | XML firmado | Estado inmediato |

#### Eventos de respuesta DIAN

| Código | Significado | Acción |
|--------|-------------|--------|
| `10009` | **Recibido** — La DIAN recibió el XML | Esperar procesamiento (poll GetStatus) |
| `10010` | **Aceptado** — Factura válida, aprobada | Cambiar status a VALIDATED, generar PDF |
| `10011` | **Rechazado** — Error en el XML | Cambiar status a REJECTED, mostrar error al usuario |
| `10012` | **Aceptado con observaciones** | Revisar observaciones, puede requerir corrección |

#### Flujo de envío recomendado

```
[1] Generar XML UBL 2.1
         │
         ▼
[2] Firmar XML con certificado .p12
         │
         ▼
[3] Comprimir en ZIP
         │
         ▼
[4] Codificar en Base64
         │
         ▼
[5] POST/SOAP a SendBillAsync
         │
         ├── Éxito → Recibir TrackId
         │         │
         │         ▼
         │   [6] Guardar sentAt + TrackId en Invoice
         │         │
         │         ▼
         │   [7] Poll: GET GetStatus?TrackId=XXX (cada 5s, máx 3 min)
         │         │
         │         ├── 10010 VALIDATED → Actualizar Invoice.status + validatedAt
         │         ├── 10011 REJECTED → Actualizar Invoice.status + dianErrorCode
         │         └── Timeout → Marcar como PENDING (reintentar después)
         │
         └── Error HTTP → Reintentar con backoff exponencial (3 intentos)
                          Guardar error en Invoice.dianResponse
```

#### Lo que falta implementar

- [ ] **Librería SOAP:** Instalar `soap` (npm) o usar `fetch` con XML manual
- [ ] **Función `sendBillToDIAN(xmlContent, testMode)`** — Envío SOAP con manejo de errores
- [ ] **Función `getDIANStatus(trackId, testMode)`** — Poll de estado
- [ ] **Función `signXMLWithCertificate(xml, certPath, password)`** — Firma digital X.509
- [ ] **Función `zipAndBase64(xmlString)`** — Compresión del XML
- [ ] **Background job:** Sistema para hacer polling de TrackIds pendientes
- [ ] **Cola de reintentos:** Para facturas que fallaron el envío
- [ ] **Timeout handling:** 30s para envío, 3 min para validación

### 4.7 Generación de PDF (Representación Gráfica)

La DIAN exige que cada factura electrónica incluya una **representación gráfica** (PDF/imagen) embebida en el XML.

#### Elementos obligatorios en el PDF (Resolución 000042 de 2020)

1. **Datos del emisor:** NIT, nombre, dirección, teléfono, correo
2. **Datos del receptor:** NIT, nombre, régimen
3. **Número de factura:** Prefijo + Consecutivo
4. **Fecha y hora de emisión**
5. **Número de resolución:** Resolución, fecha, rango autorizado
6. **CUFE/CUDFE**
7. **Desglose de items:** Descripción, cantidad, precio unitario, total
8. **Desglose de impuestos:** Base, tasa, monto por tipo de impuesto
9. **Totales:** Subtotal, impuestos, descuento, total a pagar
10. **Método de pago**
11. **Código QR:** Con la URL del catálogo DIAN que contiene el CUFE
12. **Texto:** "Representación gráfica de la factura electrónica de venta"

#### Librerías recomendadas

- **`@react-pdf/renderer`** — Genera PDF desde React components
- **`pdfkit`** — Generación programática de PDF
- **`jspdf`** — Alternativa ligera

#### Lo que falta

- [ ] **Función `generateInvoicePDF(invoice, order, store, customer)`** — Genera PDF en bytes
- [ ] **Función `pdfToBase64(pdfBuffer)`** — Convierte a Base64 para embeber en XML
- [ ] **Función `generateQRCodeImage(cufeURL)`** — Genera imagen QR (usando `qrcode` npm)
- [ ] **Plantilla PDF:** Diseño con logo, datos fiscales, tabla de items, desglose tributario, QR
- [ ] **Embeber PDF en XML:** En el campo `RepresentacionGrafica/ImagenBase64`

### 4.8 Envío por Email

#### Requisitos

Cuando se genera una factura electrónica válida, se debe enviar al cliente:

1. **Email con cuerpo HTML:** Resumen de la compra, número de factura, total
2. **Adjunto XML:** El XML UBL 2.1 firmado como `.xml`
3. **Adjunto PDF:** La representación gráfica como `.pdf`

#### Lo que falta

- [ ] **Configuración SMTP en Store:** Campos para servidor de correo, puerto, usuario, contraseña
- [ ] **Función `sendInvoiceEmail(invoice, xmlContent, pdfBuffer)`** — Envío con adjuntos
- [ ] **Librería email:** `nodemailer` (para backend) o `resend` (API moderna)
- [ ] **Plantilla HTML:** Email profesional con resumen de factura
- [ ] **Botón en UI:** "Enviar por email" en el detalle de factura

---

## 5. Sincronización de Prefijos — Arquitectura Recomendada

### Enfoque 1: Contador Atómico con Transacciones Prisma ⭐ RECOMENDADO

**Ideal para:** SQLite, un solo servidor, Bar La Terraza actual

```typescript
// Implementación recomendada
async function generateInvoiceWithAtomicConsecutive(storeId: number, orderData: any) {
  return await db.$transaction(async (tx) => {
    // 1. Leer tienda con lock (SQLite serializa automáticamente)
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } })

    // 2. Obtener último consecutivo
    const lastInvoice = await tx.invoice.findFirst({
      where: { storeId },
      orderBy: { consecutive: 'desc' },
    })
    const nextConsecutive = (lastInvoice?.consecutive ?? 0) + 1

    // 3. Validar rango de resolución
    const now = new Date()
    if (store.resolutionStartDate && now < store.resolutionStartDate) {
      throw new Error('La resolución DIAN aún no está vigente')
    }
    if (store.resolutionEndDate && now > store.resolutionEndDate) {
      throw new Error('La resolución DIAN está vencida')
    }
    if (store.resolutionStartNumber && nextConsecutive < store.resolutionStartNumber) {
      throw new Error(`Consecutivo ${nextConsecutive} es menor al inicio autorizado`)
    }
    if (store.resolutionEndNumber && nextConsecutive > store.resolutionEndNumber) {
      throw new Error(`Se agotó el rango de numeración (${nextConsecutive} > ${store.resolutionEndNumber})`)
    }

    // 4. Crear factura con consecutivo garantizado
    return await tx.invoice.create({
      data: {
        storeId,
        consecutive: nextConsecutive,
        prefix: store.invoicePrefix || 'FE',
        // ... resto de campos
      }
    })
  }, {
    timeout: 10000, // 10 segundos máx
  })
}
```

**Ventajas:**
- Simple de implementar
- SQLite serializa escrituras automáticamente
- Sin dependencias externas
- Consistencia garantizada

**Desventajas:**
- Solo funciona para un servidor
- Escaneo de `findFirst + orderBy` crece con el número de facturas (aceptable para miles)

**Mejora opcional — Tabla de contador:**
```prisma
model InvoiceCounter {
  id       Int @id @default(1)
  storeId  Int @unique
  lastUsed Int @default(0)
  @@map("invoice_counters")
}
```

```typescript
// En transacción:
const counter = await tx.invoiceCounter.upsert({
  where: { storeId },
  update: { lastUsed: { increment: 1 } },
  create: { storeId, lastUsed: 1 },
})
const nextConsecutive = counter.lastUsed
```

### Enfoque 2: API de Reservación de Consecutivos

**Ideal para:** Múltiples servidores/terminales contra la misma DB

```typescript
// POST /api/invoices/reserve-consecutive
// Request: { storeId: 1, count: 10 }
// Response: { startConsecutive: 101, endConsecutive: 110 }

async function reserveConsecutive(storeId: number, count: number) {
  return await db.$transaction(async (tx) => {
    const counter = await tx.invoiceCounter.upsert({
      where: { storeId },
      update: { lastUsed: { increment: count } },
      create: { storeId, lastUsed: count },
    })
    return {
      startConsecutive: counter.lastUsed - count + 1,
      endConsecutive: counter.lastUsed,
    }
  })
}
```

**Ventajas:**
- Múltiples terminales pueden operar en paralelo
- Cada terminal reserva un lote y trabaja localmente
- Menos contención en la DB

**Desventajas:**
- Si un terminal se cae, los consecutivos reservados se "pierden" (gaps)
- Requiere lógica de gestión de lotes en cada terminal
- Más complejo de implementar

### Enfoque 3: Servicio Externo (Redis/PostgreSQL)

**Ideal para:** Infraestructura distribuida a gran escala

```
Terminal A ──► Redis INCR ──► 101
Terminal B ──► Redis INCR ──► 102
Terminal C ──► Redis INCR ──► 103
```

```typescript
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

async function getNextConsecutive(storeId: number): Promise<number> {
  return redis.incr(`invoice:consecutive:${storeId}`)
}
```

**Ventajas:**
- Extremadamente rápido
- Escala horizontalmente sin límite
- No depende de la DB principal

**Desventajas:**
- Agrega Redis como dependencia
- Requiere infraestructura adicional
- Overkill para un bar/restaurant local

### Veredicto para Bar La Terraza

```
┌────────────────────────────────────────────────────┐
│  Recomendación: ENFOQUE #1                        │
│  (Contador Atómico con Transacciones Prisma)      │
│                                                    │
│  Razones:                                          │
│  ✅ SQLite serializa escrituras                    │
│  ✅ Un solo servidor Next.js                       │
│  ✅ Sin dependencias externas                      │
│  ✅ Suficiente para ~100 facturas/día             │
│  ✅ Ya implementado parcialmente en el API         │
│                                                    │
│  Mejora sugerida:                                  │
│  → Agregar tabla InvoiceCounter                    │
│  → Validar rango de resolución                     │
│  → Agregar transacción db.$transaction             │
│  → Mostrar alerta de agotamiento en UI             │
└────────────────────────────────────────────────────┘
```

---

## 6. APIs que Faltan por Crear

### 6.1 APIs de Facturación Electrónica

| Ruta | Método | Descripción | Estado |
|------|--------|-------------|--------|
| `POST /api/invoices` | POST | Generar factura electrónica (crear desde orden) | ✅ Implementado |
| `GET /api/invoices` | GET | Listar facturas con filtros | ✅ Implementado |
| `GET /api/invoices/[id]` | GET | Detalle de factura | ✅ Implementado |
| `PUT /api/invoices/[id]` | PUT | Actualizar estado de factura | ✅ Implementado |
| `DELETE /api/invoices/[id]` | DELETE | Eliminar factura (solo DRAFT) | ✅ Implementado |
| **`POST /api/invoices/[id]/send`** | POST | Enviar factura a DIAN (XML firmado) | ❌ Falta |
| **`GET /api/invoices/[id]/status`** | GET | Consultar estado de validación en DIAN | ❌ Falta |
| **`POST /api/invoices/[id]/cancel`** | POST | Anular factura (nota crédito) | ❌ Falta |
| **`POST /api/invoices/[id]/pdf`** | POST | Generar representación gráfica (PDF) | ❌ Falta |
| **`POST /api/invoices/[id]/email`** | POST | Enviar factura por email al cliente | ❌ Falta |
| **`GET /api/dian/resolution`** | GET | Estado actual de la resolución DIAN | ❌ Falta |
| **`POST /api/dian/resolution`** | POST | Actualizar resolución DIAN (nueva resolución) | ❌ Falta |
| **`GET /api/dian/resolution/alerts`** | GET | Alertas (vencimiento, agotamiento de consecutivos) | ❌ Falta |

### 6.2 Detalle de APIs Faltantes

#### `POST /api/invoices/[id]/send` — Enviar a DIAN

```typescript
// Request: (no body, usa invoice data existente)
// Response: { trackId: string, sentAt: string }

// Lógica:
// 1. Leer Invoice con Order y Store
// 2. Generar XML UBL 2.1 completo
// 3. Firmar XML con certificado .p12
// 4. Comprimir y codificar en Base64
// 5. Enviar SOAP a SendBillAsync
// 6. Guardar TrackId en Invoice
// 7. Actualizar sentAt y status → PENDING_VALIDATE
// 8. Iniciar polling de GetStatus (background)
```

#### `GET /api/invoices/[id]/status` — Consultar Estado DIAN

```typescript
// Response: {
//   invoiceId: number,
//   status: string,            // DRAFT, PENDING_VALIDATE, VALIDATED, REJECTED
//   trackId: string | null,
//   dianResponse: object | null,
//   dianErrorCode: string | null,
//   sentAt: string | null,
//   validatedAt: string | null
// }

// Lógica:
// 1. Si tiene TrackId y está PENDING → hacer polling a GetStatus
// 2. Actualizar estado según respuesta DIAN
// 3. Retornar estado actualizado
```

#### `POST /api/invoices/[id]/cancel` — Anular Factura

```typescript
// Request: { reason: string }
// Response: { creditNoteId: number, creditNoteNumber: string }

// Lógica:
// 1. Validar que la factura esté VALIDATED (no se pueden anular DRAFT ni PENDING)
// 2. Generar Nota Crédito XML UBL 2.1
// 3. Calcular CUDFE (variante del CUFE para notas crédito)
// 4. Enviar a DIAN
// 5. Actualizar Invoice.status → CANCELLED
// 6. Revertir asiento contable
// 7. (Opcional) Revertir movimiento de inventario
```

#### `POST /api/invoices/[id]/pdf` — Generar PDF

```typescript
// Response: PDF como blob (Content-Type: application/pdf)

// Lógica:
// 1. Leer Invoice con Order, Items, Store, Customer
// 2. Generar QR code con CUFE URL
// 3. Renderizar plantilla PDF con todos los datos
// 4. Devolver PDF como stream/buffer
```

#### `POST /api/invoices/[id]/email` — Enviar por Email

```typescript
// Request: { email?: string }  // usa customerEmail si no se proporciona
// Response: { success: boolean, emailedAt: string }

// Lógica:
// 1. Leer Invoice + Customer
// 2. Generar PDF (o usar el ya generado)
// 3. Obtener XML content
// 4. Enviar email con nodemailer/resend
// 5. Adjuntar XML (.xml) y PDF (.pdf)
// 6. Actualizar Invoice.emailedAt
```

#### `GET /api/dian/resolution` — Estado de Resolución

```typescript
// Response: {
//   resolutionNumber: string,
//   prefix: string,
//   startDate: string,
//   endDate: string,
//   startNumber: number,
//   endNumber: number,
//   currentConsecutive: number,
//   remaining: number,
//   usagePercent: number,
//   daysRemaining: number,
//   status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'NEARLY_EXHAUSTED',
//   testMode: boolean,
//   alerts: string[]
// }

// Lógica:
// 1. Leer Store con campos de resolución
// 2. Consultar consecutivo actual
// 3. Calcular métricas de uso
// 4. Generar alertas si aplica
```

#### `POST /api/dian/resolution` — Actualizar Resolución

```typescript
// Request: {
//   resolutionNumber: string,
//   prefix: string,
//   startDate: string,
//   endDate: string,
//   startNumber: number,
//   endNumber: number,
//   testMode: boolean
// }

// Lógica:
// 1. Validar campos
// 2. Actualizar Store con nueva resolución
// 3. Registrar cambio en log/auditoría
```

### 6.3 APIs de Soporte (Background Jobs)

| Función | Descripción | Implementación |
|---------|-------------|----------------|
| `pollPendingInvoices()` | Revisar facturas PENDING_VALIDATE y consultar estado DIAN | Cron job cada 2 min |
| `retryFailedInvoices()` | Reintentar envío de facturas con error | Cron job cada 5 min |
| `checkResolutionExpiry()` | Verificar si la resolución está próxima a vencer | Cron job diario |
| `cleanupOldDrafts()` | Eliminar facturas DRAFT con más de 24h | Cron job diario |

---

## 7. Dependencias npm Faltantes

| Paquete | Propósito | Tamaño |
|---------|-----------|--------|
| `soap` o `strong-soap` | Cliente SOAP para servicios DIAN | ~500KB |
| `xmlbuilder2` | Generación XML UBL 2.1 | ~80KB |
| `pdfkit` o `@react-pdf/renderer` | Generación de PDF | ~300KB-1MB |
| `qrcode` | Generación de imagen QR | ~50KB |
| `nodemailer` o `resend` | Envío de emails | ~200KB |
| `archiver` | Creación de ZIP (para XML DIAN) | ~100KB |

---

## 8. Roadmap Sugerido

### Fase 1 — Estabilización (1-2 días)
- [ ] Mejorar consecutivo atómico con transacción Prisma
- [ ] Validar rango de resolución antes de generar factura
- [ ] Agregar tabla InvoiceCounter (opcional)
- [ ] Alertas de agotamiento de consecutivos

### Fase 2 — XML y Firma (2-3 días)
- [ ] Generador XML UBL 2.1 completo
- [ ] Firma digital con certificado .p12
- [ ] Validación XSD
- [ ] Compresión ZIP + Base64

### Fase 3 — Integración DIAN (2-3 días)
- [ ] Cliente SOAP para SendBillAsync
- [ ] Polling de GetStatus
- [ ] Manejo de errores y reintentos
- [ ] Background jobs para polling

### Fase 4 — PDF y Email (1-2 días)
- [ ] Plantilla PDF con todos los campos DIAN
- [ ] Código QR embebido
- [ ] Embeber PDF en XML
- [ ] Envío por email con adjuntos

### Fase 5 — Notas Crédito y Anulaciones (2-3 días)
- [ ] Generación de Nota Crédito XML
- [ ] Cálculo CUDFE
- [ ] Envío a DIAN
- [ ] Reversión contable

### Fase 6 — Tests y Certificación (3-5 días)
- [ ] Pasar Set de Pruebas DIAN (todos los casos)
- [ ] Probar en ambiente de habilitación
- [ ] Obtener acreditación como PTE
- [ ] Transición a producción

**Tiempo estimado total:** 11-18 días hábiles

---

> **Última actualización:** Generado automáticamente a partir del schema.prisma (552 líneas, 18 modelos).
> **Base de datos:** SQLite (barlaterraza)
> **Sistema:** Bar La Terraza — POS para bar/restaurante colombiano
