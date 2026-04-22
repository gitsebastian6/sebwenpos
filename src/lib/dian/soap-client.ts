/**
 * SOAP Client for DIAN electronic invoicing web services.
 *
 * Handles:
 * - SendBillAsync: Send signed XML invoice to DIAN
 * - GetStatus: Poll for validation status by TrackId
 * - GetStatusByDocument: Query by NIT + prefix + consecutive
 *
 * Uses native fetch for HTTP, zlib for gzip, fast-xml-parser for responses.
 */

import { XMLParser } from 'fast-xml-parser'
import zlib from 'zlib'

// ─── DIAN Endpoints ─────────────────────────────────────────────────────────

const HAB_ENDPOINT = 'https://vpfe-hab.dian.gov.co/WcfVepFactura.svc'
const PROD_ENDPOINT = 'https://vpfe.dian.gov.co/WcfVepFactura.svc'

const HAB_CATALOG = 'https://catalogo-vpfe-hab.dian.gov.co/documento/consultar'
const PROD_CATALOG = 'https://catalogo-vpfe.dian.gov.co/documento/consultar'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DIANConfig {
  testMode: boolean
  certPath?: string
  certPassword?: string
  timeout?: number  // ms, default 30000
}

export interface SendBillResult {
  success: boolean
  trackId?: string
  errorMessage?: string
  errorCode?: string
  xmlResponse?: string
}

export interface StatusResult {
  success: boolean
  statusCode?: string    // "10009", "10010", "10011", "10012"
  statusMessage?: string
  xmlResponse?: string
  isValid?: boolean
  errorMessage?: string
  processedXml?: string  // Base64 XML validated by DIAN
}

// ─── SOAP Envelope Builders ──────────────────────────────────────────────────

function buildSendBillEnvelope(contentBase64: string, testSetId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsdl="http://www.dian.gov.co/contratos/facturaelectronica/v1">
  <soap:Header/>
  <soap:Body>
    <wsdl:SendBillAsync>
      <wsdl:contentFile>${contentBase64}</wsdl:contentFile>
      <wsdl:testSetId>${testSetId}</wsdl:testSetId>
      <wsdl:signature></wsdl:signature>
    </wsdl:SendBillAsync>
  </soap:Body>
</soap:Envelope>`
}

function buildGetStatusEnvelope(trackId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsdl="http://www.dian.gov.co/contratos/facturaelectronica/v1">
  <soap:Header/>
  <soap:Body>
    <wsdl:GetStatus>
      <wsdl:trackId>${trackId}</wsdl:trackId>
    </wsdl:GetStatus>
  </soap:Body>
</soap:Envelope>`
}

function buildGetStatusByDocumentEnvelope(nit: string, prefix: string, consecutive: number): string {
  const paddedConsecutive = String(consecutive).padStart(20, '0')
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsdl="http://www.dian.gov.co/contratos/facturaelectronica/v1">
  <soap:Header/>
  <soap:Body>
    <wsdl:GetStatusByDocument>
      <wsdl:nit>${nit.replace(/[^0-9]/g, '')}</wsdl:nit>
      <wsdl:numero>${paddedConsecutive}</wsdl:numero>
      <wsdl:prefijo>${prefix}</wsdl:prefijo>
    </wsdl:GetStatusByDocument>
  </soap:Body>
</soap:Envelope>`
}

// ─── Response Parser ─────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => name === 'DianResponse',
})

function parseSendBillResponse(xml: string): SendBillResult {
  try {
    const parsed = parser.parse(xml)

    // Navigate the SOAP response structure
    const body = parsed['soap:Envelope']?.['soap:Body']
    const response = body?.['SendBillAsyncResponse']?.['SendBillAsyncResult']

    if (response?.ErrorMessage) {
      return {
        success: false,
        errorMessage: extractText(response.ErrorMessage),
        errorCode: extractText(response.ErrorCode) || extractText(response.SuccessIndicator) === 'false'
          ? 'DIAN_ERROR'
          : undefined,
        xmlResponse: xml,
      }
    }

    const trackId = extractText(response?.TrackId)

    if (trackId) {
      return {
        success: true,
        trackId,
        xmlResponse: xml,
      }
    }

    // Check for SOAP fault
    const fault = body?.['soap:Fault']
    if (fault) {
      return {
        success: false,
        errorMessage: extractText(fault.Reason?.Text) || 'Error SOAP desconocido',
        errorCode: 'SOAP_FAULT',
        xmlResponse: xml,
      }
    }

    return {
      success: false,
      errorMessage: 'No se pudo extraer TrackId de la respuesta DIAN',
      xmlResponse: xml,
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: `Error parseando respuesta SOAP: ${error instanceof Error ? error.message : 'Desconocido'}`,
      xmlResponse: xml,
    }
  }
}

function parseGetStatusResponse(xml: string): StatusResult {
  try {
    const parsed = parser.parse(xml)
    const body = parsed['soap:Envelope']?.['soap:Body']
    const response = body?.['GetStatusResponse']?.['GetStatusResult']
    const responseByDoc = body?.['GetStatusByDocumentResponse']?.['GetStatusByDocumentResult']

    const dianResponse = response || responseByDoc

    if (!dianResponse) {
      // Check for SOAP fault
      const fault = body?.['soap:Fault']
      if (fault) {
        return {
          success: false,
          errorMessage: extractText(fault.Reason?.Text) || 'Error SOAP desconocido',
        }
      }
      return {
        success: false,
        errorMessage: 'No se pudo extraer estado de la respuesta DIAN',
        xmlResponse: xml,
      }
    }

    const statusCode = extractText(dianResponse.StatusCode)
      || extractText(dianResponse.DianResponse?.StatusCode)
    const statusMessage = extractText(dianResponse.StatusMessage)
      || extractText(dianResponse.DianResponse?.StatusMessage)
    const errorMessage = extractText(dianResponse.ErrorMessage)
      || extractText(dianResponse.DianResponse?.ErrorMessage)
    const processedXml = extractText(dianResponse.XmlBase64Bytes)
      || extractText(dianResponse.DianResponse?.XmlBase64Bytes)

    // Map DIAN status codes
    const isValid = statusCode === '10010' || statusCode === '10012'
    const isRejected = statusCode === '10011'

    return {
      success: true,
      statusCode,
      statusMessage,
      isValid,
      errorMessage: isRejected ? (statusMessage || errorMessage || 'Factura rechazada por la DIAN') : undefined,
      processedXml,
      xmlResponse: xml,
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: `Error parseando respuesta de estado: ${error instanceof Error ? error.message : 'Desconocido'}`,
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractText(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'object' && value !== null && '#text' in value) {
    const txt = String((value as Record<string, unknown>)['#text']).trim()
    return txt || undefined
  }
  return String(value).trim() || undefined
}

/**
 * Gzip compresses a string and returns Base64.
 */
function gzipAndBase64(content: string): string {
  const compressed = zlib.gzipSync(Buffer.from(content, 'utf-8'))
  return compressed.toString('base64')
}

/**
 * Gets the correct DIAN endpoint based on test mode.
 */
function getEndpoint(testMode: boolean): string {
  return testMode ? HAB_ENDPOINT : PROD_ENDPOINT
}

/**
 * Sends a SOAP request to DIAN.
 */
async function soapRequest(
  endpoint: string,
  soapEnvelope: string,
  timeout: number,
): Promise<{ ok: boolean; status: number; xml: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': '""',
      },
      body: soapEnvelope,
      signal: controller.signal,
    })

    const xml = await response.text()
    return { ok: response.ok, status: response.status, xml }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`La petición a la DIAN excedió el tiempo de espera (${timeout}ms)`)
    }
    throw new Error(`Error de conexión con la DIAN: ${error instanceof Error ? error.message : 'Desconocido'}`)
  } finally {
    clearTimeout(timer)
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sends an electronic invoice XML to the DIAN via SendBillAsync.
 *
 * Flow:
 * 1. Gzip the XML content
 * 2. Base64 encode the compressed content
 * 3. Build SOAP envelope for SendBillAsync
 * 4. Send POST request to DIAN endpoint
 * 5. Parse response and extract TrackId
 *
 * @param xmlContent - The UBL 2.1 XML string (can be signed or unsigned)
 * @param config - DIAN configuration (test mode, timeout, certificates)
 * @returns Result with TrackId on success, or error details
 */
export async function sendBillToDIAN(
  xmlContent: string,
  config: DIANConfig,
): Promise<SendBillResult> {
  const endpoint = getEndpoint(config.testMode)
  const timeout = config.timeout ?? 30000

  try {
    // 1. Compress and encode
    const contentBase64 = gzipAndBase64(xmlContent)

    // 2. Build SOAP envelope
    const testSetId = config.testMode ? 'false' : 'false'
    const soapEnvelope = buildSendBillEnvelope(contentBase64, testSetId)

    console.log(`[DIAN] Sending invoice to ${config.testMode ? 'HABILITACIÓN' : 'PRODUCCIÓN'} endpoint...`)

    // 3. Send request
    const result = await soapRequest(endpoint, soapEnvelope, timeout)

    if (!result.ok) {
      return {
        success: false,
        errorMessage: `DIAN respondió con status HTTP ${result.status}`,
        errorCode: `HTTP_${result.status}`,
        xmlResponse: result.xml,
      }
    }

    // 4. Parse response
    const parsed = parseSendBillResponse(result.xml)

    if (parsed.success) {
      console.log(`[DIAN] Invoice sent successfully. TrackId: ${parsed.trackId}`)
    } else {
      console.error(`[DIAN] Send failed: ${parsed.errorMessage}`)
    }

    return parsed
  } catch (error: unknown) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Error desconocido al enviar a la DIAN',
      errorCode: 'CONNECTION_ERROR',
    }
  }
}

/**
 * Polls the DIAN for the validation status of a previously sent invoice.
 *
 * Status codes:
 * - 10009: Received (processing)
 * - 10010: Accepted/Validated
 * - 10011: Rejected
 * - 10012: Accepted with observations
 *
 * @param trackId - The TrackId returned by SendBillAsync
 * @param config - DIAN configuration
 * @returns Status result with code, message, and optionally the validated XML
 */
export async function getDIANStatus(
  trackId: string,
  config: DIANConfig,
): Promise<StatusResult> {
  const endpoint = getEndpoint(config.testMode)
  const timeout = config.timeout ?? 30000

  try {
    const soapEnvelope = buildGetStatusEnvelope(trackId)

    console.log(`[DIAN] Checking status for TrackId: ${trackId}`)

    const result = await soapRequest(endpoint, soapEnvelope, timeout)

    if (!result.ok) {
      return {
        success: false,
        errorMessage: `DIAN respondió con status HTTP ${result.status} al consultar estado`,
      }
    }

    const parsed = parseGetStatusResponse(result.xml)

    if (parsed.statusCode) {
      console.log(`[DIAN] Status: ${parsed.statusCode} - ${parsed.statusMessage}`)
    }

    return parsed
  } catch (error: unknown) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Error al consultar estado en la DIAN',
    }
  }
}

/**
 * Queries the DIAN for invoice status by document number (NIT + prefix + consecutive).
 *
 * @param nit - Store NIT (digits only)
 * @param prefix - Invoice prefix (e.g., "FE")
 * @param consecutive - Invoice consecutive number
 * @param config - DIAN configuration
 * @returns Status result
 */
export async function getStatusByDocument(
  nit: string,
  prefix: string,
  consecutive: number,
  config: DIANConfig,
): Promise<StatusResult> {
  const endpoint = getEndpoint(config.testMode)
  const timeout = config.timeout ?? 30000

  try {
    const soapEnvelope = buildGetStatusByDocumentEnvelope(nit, prefix, consecutive)

    console.log(`[DIAN] Checking status for document: ${prefix}-${String(consecutive).padStart(8, '0')}`)

    const result = await soapRequest(endpoint, soapEnvelope, timeout)

    if (!result.ok) {
      return {
        success: false,
        errorMessage: `DIAN respondió con status HTTP ${result.status} al consultar documento`,
      }
    }

    return parseGetStatusResponse(result.xml)
  } catch (error: unknown) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Error al consultar documento en la DIAN',
    }
  }
}

/**
 * Polls the DIAN status until a final result is obtained (accepted or rejected).
 * Maximum polling duration: 3 minutes, interval: 5 seconds.
 *
 * @param trackId - The TrackId from SendBillAsync
 * @param config - DIAN configuration
 * @param onProgress - Optional callback for each poll iteration
 * @returns Final status result
 */
export async function pollDIANStatus(
  trackId: string,
  config: DIANConfig,
  onProgress?: (status: StatusResult, attempt: number) => void,
): Promise<StatusResult> {
  const MAX_ATTEMPTS = 36    // 36 * 5s = 3 minutes
  const INTERVAL_MS = 5000   // 5 seconds

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const status = await getDIANStatus(trackId, config)

    if (onProgress) {
      onProgress(status, attempt)
    }

    // Final statuses — return immediately
    if (status.statusCode === '10010' || status.statusCode === '10011' || status.statusCode === '10012') {
      return status
    }

    // If there's an error that isn't "still processing", return
    if (!status.success) {
      return status
    }

    // 10009 = still processing, wait and retry
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
    }
  }

  return {
    success: false,
    errorMessage: 'Tiempo de espera agotado. La DIAN no respondió en 3 minutos. Intente consultar más tarde.',
    statusCode: 'TIMEOUT',
  }
}

/**
 * Gets the DIAN catalog URL for QR code verification.
 */
export function getDIANCatalogURL(testMode: boolean): string {
  return testMode ? HAB_CATALOG : PROD_CATALOG
}
