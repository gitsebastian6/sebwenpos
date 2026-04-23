// ─── XML Canonicalization & Encoding Utilities ─────────────────────────────────
// XML processing utilities for DIAN electronic invoicing

/**
 * Implementación simplificada de Exclusive XML Canonicalization (C14N).
 *
 * Normaliza un fragmento XML para producir una representación canónica
 * determinista que se usa para calcular el digest y firmar.
 *
 * Soporta los requisitos principales de DIAN:
 * - Eliminación de declaraciones XML
 * - Normalización de espacios en blanco
 * - Codificación UTF-8
 *
 * NOTA: Para producción con validación estricta de la DIAN se recomienda
 * usar la librería `xml-crypto` que implementa C14N completo.
 */
export function exclusiveCanonicalize(xml: string): string {
  let canon = xml

  // 1. Eliminar declaración XML si está presente
  canon = canon.replace(/^<\?xml[^?]*\?>\s*/i, '')

  // 2. Eliminar comentarios XML
  canon = canon.replace(/<!--[\s\S]*?-->/g, '')

  // 3. Eliminar instrucciones de procesamiento
  canon = canon.replace(/<\?[^?]*\?>/g, '')

  // 4. Normalizar espacios en blanco en atributos
  //    - Reemplazar secuencias de espacios/tabs/newlines por un solo espacio
  //    - Eliminar espacios al inicio y final de valores de atributos
  canon = canon.replace(/="([^"]*?)"/g, (_match, value: string) => {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return `="${normalized}"`
  })

  // 5. Eliminar espacios sobrantes entre atributos
  canon = canon.replace(/\s{2,}/g, ' ')

  // 6. Normalizar espacios en blanco entre etiquetas
  //    (eliminar para firma enveloped)
  canon = canon.replace(/>\s+</g, '><')

  // 7. Eliminar CDATA wrappers y escapar contenido
  canon = canon.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, content: string) => {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  })

  // 8. Eliminar espacios alrededor del signo = en atributos
  canon = canon.replace(/\s*=\s*/g, '=')

  return canon.trim()
}

/**
 * Normaliza las entidades XML para canonicalización.
 * Convierte entidades numéricas y nombradas a su forma canónica.
 */
export function normalizeEntities(xml: string): string {
  return xml
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&copy;/g, '&#169;')
    .replace(/&reg;/g, '&#174;')
    .replace(/&trade;/g, '&#8482;')
}

/**
 * Convierte un Buffer a Base64 sin saltos de línea.
 */
export function toBase64(data: Buffer | Uint8Array): string {
  return Buffer.from(data).toString('base64').replace(/\r?\n/g, '')
}
