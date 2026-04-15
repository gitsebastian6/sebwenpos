/**
 * SOAP Client for communicating with the Colombian DIAN (tax authority)
 * web services for electronic invoicing.
 *
 * Services:
 * - SendBillAsync:  Submit a signed invoice XML to DIAN
 * - GetStatus:      Poll validation status by TrackId
 * - GetStatusByDocumentNumber: Query by NIT + prefix + consecutive
 *
 * Uses native `fetch` with raw XML, `node:zlib` for gzip compression,
 * and `fast-xml-parser` for response parsing.
 */

import { XMLParser } from 'fast-xml-parser'
import { gzipSync } from 'node:zlib'

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DIANConfig {
  testMode: boolean
  certPath?: string
  keyPath?: string
  certPassword?: string
  softwareProviderNIT?: string
  softwarePIN?: string
  timeout?: number // milliseconds, default 30000
}

export interface SendBillResult {
  success: boolean
  trackId?: string
  errorMessage?: string
  errorCode?: string
  statusCode: number
  rawResponse?: string
  timestamp: string
}

export interface GetStatusResult {
  success: boolean
  statusCode?: string // DIAN status code (10009, 10010, 10011, 10012)
  statusMessage?: string // Human-readable message
  xmlResponse?: string // Validated XML returned by DIAN (for status 10010)
  errorMessage?: string
  errorCode?: string
  httpStatus: number
  rawResponse?: string
  timestamp: string
}

export interface CancelInvoiceResult {
  success: boolean
  errorMessage?: string
  errorCode?: string
  rawResponse?: string
  timestamp: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DIAN_ENDPOINTS = {
  test: {
    sendBill: 'https://vpfe-hab.dian.gov.co/WcfVepFactura.svc',
    getStatus: 'https://vpfe-hab.dian.gov.co/WcfVepFactura.svc',
    queryByNumber: 'https://vpfe-hab.dian.gov.co/WcfVepFactura.svc',
  },
  production: {
    sendBill: 'https://vpfe.dian.gov.co/WcfVepFactura.svc',
    getStatus: 'https://vpfe.dian.gov.co/WcfVepFactura.svc',
    queryByNumber: 'https://vpfe.dian.gov.co/WcfVepFactura.svc',
  },
} as const

const SOAP_ACTION_SEND =
  'http://www.dian.gov.co/contratos/facturaelectronica/v1/WcfVepFactura/SendBillAsync'
const SOAP_ACTION_STATUS =
  'http://www.dian.gov.co/contratos/facturaelectronica/v1/WcfVepFactura/GetStatus'
const SOAP_ACTION_QUERY =
  'http://www.dian.gov.co/contratos/facturaelectronica/v1/WcfVepFactura/GetStatusByDocumentNumber'

// ─── XML Parser Setup ────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  allowBooleanAttributes: false,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts a text value from a parsed XML node.
 * Handles both plain strings and `#text` objects from fast-xml-parser.
 */
function extractText(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    const txt = String((value as Record<string, unknown>)['#text']).trim()
    return txt || undefined
  }
  return String(value).trim() || undefined
}

/**
 * Gzip-compresses a string and returns a Base64-encoded string.
 */
function gzipAndBase64(content: string): string {
  const compressed = gzipSync(Buffer.from(content, 'utf-8'))
  return compressed.toString('base64')
}

/**
 * Returns the current ISO 8601 timestamp.
 */
function now(): string {
  return new Date().toISOString()
}

/**
 * Selects the appropriate DIAN endpoint based on test mode.
 */
function getEndpoints(config: DIANConfig): {
  sendBill: string
  getStatus: string
  queryByNumber: string
} {
  return config.testMode ? DIAN_ENDPOINTS.test : DIAN_ENDPOINTS.production
}

/**
 * Sends a raw SOAP POST request to the given endpoint.
 * Handles timeouts via AbortController and provides descriptive Spanish error messages.
 */
async function sendSoapRequest(
  url: string,
  soapEnvelope: string,
  soapAction: string,
  timeout: number,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: soapAction,
      },
      body: soapEnvelope,
      signal: controller.signal,
    })

    const body = await response.text()
    return { status: response.status, body }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        `La petición a la DIAN excedió el tiempo de espera (${timeout / 1000} segundos)`,
      )
    }
    const message =
      error instanceof Error ? error.message : 'Error de conexión desconocido'
    throw new Error(`Error de conexión con la DIAN: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parses a SOAP fault from the response body and returns an error message.
 */
function parseSoapFault(xml: string): string | undefined {
  try {
    const parsed = parser.parse(xml) as Record<string, unknown>

    // Try SOAP 1.1 fault: <soapenv:Fault><faultstring>...</faultstring>
    const envelope =
      (parsed['soapenv:Envelope'] as Record<string, unknown>) ??
      (parsed['soap:Envelope'] as Record<string, unknown>)
    const body = (envelope?.['soapenv:Body'] ?? envelope?.['soap:Body']) as Record<string, unknown> | undefined
    const fault = (body?.['soapenv:Fault'] ?? body?.['soap:Fault']) as Record<string, unknown> | undefined

    if (fault) {
      return (
        extractText(fault['faultstring']) ??
        extractText(fault['faultcode']
          ? `${String(fault['faultcode'])}: ${String(fault['faultstring'] ?? 'Error SOAP desconocido')}`
          : 'Error SOAP desconocido')
      )
    }
  } catch {
    // If we can't parse as a fault, fall through
  }
  return undefined
}

// ─── SOAP Envelope Builders ──────────────────────────────────────────────────

function buildSendBillEnvelope(base64GzipXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:SendBillAsync>
      <ns:xmlBase64Bytes>${base64GzipXml}</ns:xmlBase64Bytes>
    </ns:SendBillAsync>
  </soapenv:Body>
</soapenv:Envelope>`
}

function buildGetStatusEnvelope(trackId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:GetStatus>
      <ns:trackId>${trackId}</ns:trackId>
    </ns:GetStatus>
  </soapenv:Body>
</soapenv:Envelope>`
}

function buildGetStatusByDocumentNumberEnvelope(
  nit: string,
  prefix: string,
  consecutive: string,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://www.dian.gov.co/contratos/facturaelectronica/v1/Structures">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:GetStatusByDocumentNumber>
      <ns:nit>${nit.replace(/[^0-9]/g, '')}</ns:nit>
      <ns:prefijo>${prefix}</ns:prefijo>
      <ns:consecutivo>${consecutive}</ns:consecutivo>
    </ns:GetStatusByDocumentNumber>
  </soapenv:Body>
</soapenv:Envelope>`
}

// ─── Response Parsers ────────────────────────────────────────────────────────

/**
 * Parses the SOAP response from SendBillAsync and extracts the TrackId.
 */
function parseSendBillResponse(
  xml: string,
  httpStatus: number,
): SendBillResult {
  const base: SendBillResult = {
    success: false,
    statusCode: httpStatus,
    rawResponse: xml,
    timestamp: now(),
  }

  try {
    // Check for SOAP fault first
    const faultMessage = parseSoapFault(xml)
    if (faultMessage) {
      return {
        ...base,
        errorMessage: faultMessage,
        errorCode: 'SOAP_FAULT',
      }
    }

    const parsed = parser.parse(xml) as Record<string, unknown>
    const envelope = parsed['soapenv:Envelope'] as Record<string, unknown>
    const body = envelope?.['soapenv:Body'] as Record<string, unknown>
    const sendBillResponse = body?.['ns:SendBillAsyncResponse'] as
      | Record<string, unknown>
      | undefined
    const result = sendBillResponse?.['ns:SendBillAsyncResult'] as
      | Record<string, unknown>
      | undefined

    if (!result) {
      // Check for other response structures
      const altResponse = body?.['SendBillAsyncResponse'] as
        | Record<string, unknown>
        | undefined
      const altResult = altResponse?.['SendBillAsyncResult'] as
        | Record<string, unknown>
        | undefined

      if (altResult) {
        const trackId = extractText(altResult['TrackId'] ?? altResult['trackId'])
        const errCode = extractText(altResult['ErrorCode'] ?? altResult['errorCode'])
        const errMsg = extractText(
          altResult['ErrorMessage'] ?? altResult['errorMessage'],
        )

        if (errMsg) {
          return { ...base, errorMessage: errMsg, errorCode: errCode ?? 'DIAN_ERROR' }
        }

        if (trackId) {
          return { ...base, success: true, trackId }
        }
      }

      return {
        ...base,
        errorMessage: 'No se pudo extraer TrackId de la respuesta de la DIAN',
        errorCode: 'PARSE_ERROR',
      }
    }

    // Extract error fields
    const errCode = extractText(result['ns:ErrorCode'] ?? result['ErrorCode'])
    const errMsg = extractText(result['ns:ErrorMessage'] ?? result['ErrorMessage'])
    if (errMsg) {
      return {
        ...base,
        errorMessage: errMsg,
        errorCode: errCode ?? 'DIAN_ERROR',
      }
    }

    // Extract TrackId
    const trackId = extractText(result['ns:TrackId'] ?? result['TrackId'])
    if (trackId) {
      return { ...base, success: true, trackId }
    }

    return {
      ...base,
      errorMessage: 'La DIAN no devolvió TrackId en la respuesta',
      errorCode: 'NO_TRACK_ID',
    }
  } catch (error: unknown) {
    console.error('[DIAN SOAP] Error parsing SendBill response:', error)
    return {
      ...base,
      errorMessage: `Error parseando respuesta SOAP: ${error instanceof Error ? error.message : 'Desconocido'}`,
      errorCode: 'PARSE_ERROR',
    }
  }
}

/**
 * Parses the SOAP response from GetStatus / GetStatusByDocumentNumber
 * and extracts the DIAN status information.
 */
function parseGetStatusResponse(
  xml: string,
  httpStatus: number,
): GetStatusResult {
  const base: GetStatusResult = {
    success: false,
    httpStatus,
    rawResponse: xml,
    timestamp: now(),
  }

  try {
    // Check for SOAP fault first
    const faultMessage = parseSoapFault(xml)
    if (faultMessage) {
      return {
        ...base,
        errorMessage: faultMessage,
        errorCode: 'SOAP_FAULT',
      }
    }

    const parsed = parser.parse(xml) as Record<string, unknown>
    const envelope = parsed['soapenv:Envelope'] as Record<string, unknown>
    const body = envelope?.['soapenv:Body'] as Record<string, unknown>

    // Try GetStatusResponse
    const statusResponse = body?.['ns:GetStatusResponse'] as
      | Record<string, unknown>
      | undefined
    const statusResult = statusResponse?.['ns:GetStatusResult'] as
      | Record<string, unknown>
      | undefined

    // Try GetStatusByDocumentNumberResponse
    const docResponse = body?.['ns:GetStatusByDocumentNumberResponse'] as
      | Record<string, unknown>
      | undefined
    const docResult = docResponse?.['ns:GetStatusByDocumentNumberResult'] as
      | Record<string, unknown>
      | undefined

    // Fallback: try without ns: prefix
    const altStatusResult = (body?.['GetStatusResponse'] as Record<string, unknown>)
      ?.['GetStatusResult'] as Record<string, unknown> | undefined
    const altDocResult = (body?.['GetStatusByDocumentNumberResponse'] as Record<string, unknown>)
      ?.['GetStatusByDocumentNumberResult'] as Record<string, unknown> | undefined

    const dianResult =
      statusResult ?? docResult ?? altStatusResult ?? altDocResult

    if (!dianResult) {
      return {
        ...base,
        errorMessage: 'No se pudo extraer el estado de la respuesta de la DIAN',
        errorCode: 'PARSE_ERROR',
      }
    }

    // Extract fields, checking both namespaced and non-namespaced keys
    const statusCode = extractText(
      dianResult['ns:StatusCode'] ??
        dianResult['StatusCode'] ??
        dianResult['statusCode'],
    )
    const statusMessage = extractText(
      dianResult['ns:StatusMessage'] ??
        dianResult['StatusMessage'] ??
        dianResult['statusMessage'],
    )
    const errorMessage = extractText(
      dianResult['ns:ErrorMessage'] ??
        dianResult['ErrorMessage'] ??
        dianResult['errorMessage'],
    )
    const xmlBase64 = extractText(
      dianResult['ns:XmlBase64Bytes'] ??
        dianResult['XmlBase64Bytes'] ??
        dianResult['xmlBase64Bytes'],
    )

    // Determine if the status represents a successful outcome
    const isValid =
      statusCode === '10010' || statusCode === '10012'
    const isRejected = statusCode === '10011'

    return {
      ...base,
      success: true,
      statusCode,
      statusMessage,
      xmlResponse: xmlBase64,
      errorMessage: isRejected
        ? statusMessage ?? errorMessage ?? 'Factura rechazada por la DIAN'
        : errorMessage,
      errorCode: isRejected ? statusCode ?? 'REJECTED' : undefined,
    }
  } catch (error: unknown) {
    console.error('[DIAN SOAP] Error parsing GetStatus response:', error)
    return {
      ...base,
      errorMessage: `Error parseando respuesta de estado: ${error instanceof Error ? error.message : 'Desconocido'}`,
      errorCode: 'PARSE_ERROR',
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sends an electronic invoice XML to the DIAN via SendBillAsync.
 *
 * The XML content is gzip-compressed and Base64-encoded before being
 * wrapped in a SOAP envelope and sent to the DIAN endpoint.
 *
 * @param xmlContent - The UBL 2.1 XML string (signed invoice)
 * @param config     - DIAN configuration (test mode, timeout, certificates)
 * @returns Result with TrackId on success, or error details
 */
export async function sendBillAsync(
  xmlContent: string,
  config: DIANConfig,
): Promise<SendBillResult> {
  const endpoints = getEndpoints(config)
  const timeout = config.timeout ?? 30_000

  try {
    // 1. Gzip compress and Base64 encode
    const base64GzipXml = gzipAndBase64(xmlContent)

    // 2. Build SOAP envelope
    const envelope = buildSendBillEnvelope(base64GzipXml)

    console.log(
      `[DIAN SOAP] Enviando factura a ${config.testMode ? 'habilitación' : 'producción'}...`,
    )

    // 3. Send SOAP request
    const { status, body } = await sendSoapRequest(
      endpoints.sendBill,
      envelope,
      SOAP_ACTION_SEND,
      timeout,
    )

    // 4. Parse response
    const result = parseSendBillResponse(body, status)

    if (result.success) {
      console.log(`[DIAN SOAP] Factura enviada. TrackId: ${result.trackId}`)
    } else {
      console.error(
        `[DIAN SOAP] Error al enviar factura: ${result.errorMessage} (código: ${result.errorCode})`,
      )
    }

    return result
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido al enviar a la DIAN'
    console.error(`[DIAN SOAP] ${message}`)
    return {
      success: false,
      statusCode: 0,
      errorMessage: message,
      errorCode: 'CONNECTION_ERROR',
      timestamp: now(),
    }
  }
}

/**
 * Polls the DIAN for the validation status of a previously sent invoice
 * using the TrackId returned by SendBillAsync.
 *
 * DIAN status codes:
 * - 10009: Processing pending (received, not yet validated)
 * - 10010: Accepted and validated
 * - 10011: Rejected
 * - 10012: Accepted with observations
 *
 * @param trackId - The TrackId from SendBillAsync
 * @param config  - DIAN configuration
 * @returns Structured status result with code, message, and optionally validated XML
 */
export async function getStatus(
  trackId: string,
  config: DIANConfig,
): Promise<GetStatusResult> {
  const endpoints = getEndpoints(config)
  const timeout = config.timeout ?? 30_000

  try {
    const envelope = buildGetStatusEnvelope(trackId)

    console.log(`[DIAN SOAP] Consultando estado para TrackId: ${trackId}`)

    const { status, body } = await sendSoapRequest(
      endpoints.getStatus,
      envelope,
      SOAP_ACTION_STATUS,
      timeout,
    )

    const result = parseGetStatusResponse(body, status)

    if (result.statusCode) {
      console.log(
        `[DIAN SOAP] Estado: ${result.statusCode} — ${result.statusMessage}`,
      )
    }

    return result
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error desconocido al consultar estado en la DIAN'
    console.error(`[DIAN SOAP] ${message}`)
    return {
      success: false,
      httpStatus: 0,
      errorMessage: message,
      errorCode: 'CONNECTION_ERROR',
      timestamp: now(),
    }
  }
}

/**
 * Queries the DIAN for invoice status by document number
 * (NIT + prefix + consecutive) instead of TrackId.
 *
 * @param nit         - Sender NIT (digits only, non-digit chars are stripped)
 * @param prefix      - Invoice prefix (e.g., "FE", "SETP")
 * @param consecutive - Invoice consecutive number as a string
 * @param config      - DIAN configuration
 * @returns Structured status result
 */
export async function queryByDocumentNumber(
  nit: string,
  prefix: string,
  consecutive: string,
  config: DIANConfig,
): Promise<GetStatusResult> {
  const endpoints = getEndpoints(config)
  const timeout = config.timeout ?? 30_000

  try {
    const envelope = buildGetStatusByDocumentNumberEnvelope(nit, prefix, consecutive)

    console.log(
      `[DIAN SOAP] Consultando documento: ${prefix}-${consecutive} (NIT: ${nit})`,
    )

    const { status, body } = await sendSoapRequest(
      endpoints.queryByNumber,
      envelope,
      SOAP_ACTION_QUERY,
      timeout,
    )

    const result = parseGetStatusResponse(body, status)

    if (result.statusCode) {
      console.log(
        `[DIAN SOAP] Estado documento: ${result.statusCode} — ${result.statusMessage}`,
      )
    }

    return result
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error desconocido al consultar documento en la DIAN'
    console.error(`[DIAN SOAP] ${message}`)
    return {
      success: false,
      httpStatus: 0,
      errorMessage: message,
      errorCode: 'CONNECTION_ERROR',
      timestamp: now(),
    }
  }
}

/**
 * Polls `getStatus` at regular intervals until a final result is obtained
 * or the maximum number of attempts is reached.
 *
 * Stops early when the DIAN returns a definitive status:
 * - 10010 (Accepted)
 * - 10011 (Rejected)
 * - 10012 (Accepted with observations)
 *
 * @param trackId    - The TrackId from SendBillAsync
 * @param config     - DIAN configuration
 * @param options    - Polling options
 * @param options.maxAttempts - Maximum polling attempts (default: 36 ≈ 3 min)
 * @param options.intervalMs  - Delay between attempts in ms (default: 5000)
 * @returns The final status result
 */
export async function pollForStatus(
  trackId: string,
  config: DIANConfig,
  options?: { maxAttempts?: number; intervalMs?: number },
): Promise<GetStatusResult> {
  const maxAttempts = options?.maxAttempts ?? 36 // 36 × 5s = 3 minutes
  const intervalMs = options?.intervalMs ?? 5000

  console.log(
    `[DIAN SOAP] Iniciando sondeo de estado para TrackId: ${trackId} (máx ${maxAttempts} intentos, cada ${intervalMs / 1000}s)`,
  )

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getStatus(trackId, config)

    // Definitive statuses — return immediately
    if (
      result.statusCode === '10010' ||
      result.statusCode === '10011' ||
      result.statusCode === '10012'
    ) {
      return result
    }

    // If there was a connection/parse error (not "still processing"), bail out
    if (!result.success) {
      return result
    }

    // 10009 = still processing — wait and retry (unless this is the last attempt)
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  console.warn(
    `[DIAN SOAP] Sondeo agotado para TrackId: ${trackId}. La DIAN no respondió con estado definitivo.`,
  )

  return {
    success: false,
    httpStatus: 0,
    errorMessage:
      'Tiempo de espera agotado. La DIAN no respondió con estado definitivo. Intente consultar más tarde.',
    errorCode: 'TIMEOUT',
    timestamp: now(),
  }
}

/**
 * Maps a DIAN status code to a human-friendly message with severity level.
 *
 * Useful for UI rendering — the `level` field indicates the appropriate
 * visual treatment (success = green, warning = yellow, error = red).
 *
 * @param statusCode - The DIAN status code string
 * @returns An object with severity level and Spanish message
 */
export function parseDIANStatusMessage(statusCode: string): {
  level: 'success' | 'warning' | 'error'
  message: string
} {
  switch (statusCode) {
    case '10009':
      return {
        level: 'warning',
        message: 'Factura recibida por la DIAN. Pendiente de procesamiento...',
      }
    case '10010':
      return {
        level: 'success',
        message: 'Factura aceptada y validada exitosamente',
      }
    case '10011':
      return {
        level: 'error',
        message: 'Factura rechazada por la DIAN',
      }
    case '10012':
      return {
        level: 'warning',
        message: 'Factura aceptada con observaciones',
      }
    default:
      return {
        level: 'warning',
        message: `Estado desconocido: ${statusCode}`,
      }
  }
}
