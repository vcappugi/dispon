/**
 * @file js/services/pdfParserService.js
 * @description Servicio puro de lectura y análisis de estados de cuenta bancarios en PDF mediante PDF.js.
 */

import { SUPPORTED_CURRENCIES } from '../utils/formatters.js';

export const PDFJS_WORKER_CDN =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const KNOWN_BANK_NAMES = [
    'Banesco Banco Universal',
    'Banesco Panamá',
    'Banesco',
    'Banco Mercantil',
    'Mercantil Banco Universal',
    'Mercantil Panamá',
    'Mercantil',
    'BBVA Provincial',
    'Banco Provincial',
    'Provincial',
    'Banco de Venezuela',
    'BDV',
    'Banco Nacional de Crédito',
    'BNC',
    'Bancamiga Banco Universal',
    'Bancamiga',
    'Banplus Banco Universal',
    'Banplus',
    'Bancaribe',
    'Banco del Caribe',
    'Banco Exterior',
    'Exterior',
    'Venezolano de Crédito',
    'Banco Fondo Común',
    'BFC',
    'Banco Plaza',
    'Banco Activo',
    'Banco Caroní',
    'Banco Sofitasa',
    'Banco del Tesoro',
    'Banco Del Sur',
    'Banfanb',
    '100% Banco',
    'Mi Banco',
    'Bangente',
    'Bank of America',
    'Wells Fargo',
    'JPMorgan Chase',
    'Chase Bank',
    'Citibank',
    'Facebank',
    'Towerbank',
    'Binance'
];

export const SPANISH_MONTHS_MAP = {
    ENE: '01', ENERO: '01', JAN: '01',
    FEB: '02', FEBRERO: '02',
    MAR: '03', MARZO: '03',
    ABR: '04', ABRIL: '04', APR: '04',
    MAY: '05', MAYO: '05',
    JUN: '06', JUNIO: '06',
    JUL: '07', JULIO: '07',
    AGO: '08', AGOSTO: '08', AUG: '08',
    SEP: '09', SET: '09', SEPT: '09', SEPTIEMBRE: '09',
    OCT: '10', OCTUBRE: '10',
    NOV: '11', NOVIEMBRE: '11',
    DIC: '12', DICIEMBRE: '12', DEC: '12'
};

/**
 * Normaliza signos menos Unicode y espacios especiales provenientes de fuentes PDF.
 * @param {string} str
 * @returns {string}
 */
export function normalizePdfTextFragment(str) {
    return String(str || '')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2212\u2013\u2014\uFE63\uFF0D]/g, '-');
}

/**
 * Normaliza múltiples formatos de fecha bancarios a `YYYY-MM-DD`.
 * @param {string} rawDateStr
 * @param {number} [fallbackYear]
 * @returns {{ valid: boolean, isoDate?: string }}
 */
export function normalizePdfDateToIso(rawDateStr, fallbackYear = new Date().getFullYear()) {
    const clean = String(rawDateStr || '').trim();
    if (!clean) return { valid: false };

    let m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.exec(clean);
    if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const d = parseInt(m[3], 10);
        if (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            return {
                valid: true,
                isoDate: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            };
        }
    }

    m = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/.exec(clean);
    if (m) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        let y = parseInt(m[3], 10);
        if (y < 100) {
            y += y >= 70 ? 1900 : 2000;
        }
        if (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            return {
                valid: true,
                isoDate: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            };
        }
    }

    m = /^(\d{1,2})[\s\-\/]([A-Za-zÁÉÍÓÚáéíóú]{3,10})[\s\-\/](\d{2,4})$/.exec(clean);
    if (m) {
        const d = parseInt(m[1], 10);
        const monKey = m[2].toUpperCase();
        const moStr = SPANISH_MONTHS_MAP[monKey] || SPANISH_MONTHS_MAP[monKey.slice(0, 3)];
        let y = parseInt(m[3], 10);
        if (y < 100) y += 2000;
        if (moStr && d >= 1 && d <= 31 && y >= 1990 && y <= 2100) {
            return {
                valid: true,
                isoDate: `${y}-${moStr}-${String(d).padStart(2, '0')}`
            };
        }
    }

    m = /^(\d{1,2})[\/\-\.](\d{1,2})$/.exec(clean);
    if (m) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            return {
                valid: true,
                isoDate: `${fallbackYear}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            };
        }
    }

    return { valid: false };
}

/**
 * Extrae las líneas espacialmente agrupadas por coordenada Y/X de un archivo PDF mediante PDF.js.
 * @param {ArrayBuffer} arrayBuffer
 */
export async function extractStructuredLinesFromPdf(arrayBuffer) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
        throw new Error(
            'La librería PDF.js no está disponible. Verifique su conexión a internet y recargue la página.'
        );
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;

    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 8));
    const headerSignature = String.fromCharCode(...headerBytes);
    if (!headerSignature.includes('%PDF-')) {
        throw new Error(
            'El archivo seleccionado está corrupto o no posee una cabecera válida de documento PDF (%PDF-).'
        );
    }

    let pdfDoc;
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
    } catch (err) {
        if (err?.name === 'PasswordException') {
            throw new Error(
                'El archivo PDF está protegido con contraseña. Desbloquee el estado de cuenta antes de importarlo.'
            );
        }
        throw new Error(`No se pudo decodificar el archivo PDF (documento dañado o ilegible): ${err.message}`);
    }

    const structuredLines = [];
    const Y_TOLERANCE = 4.2;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageBuckets = [];

        for (const item of textContent.items) {
            const rawStr = normalizePdfTextFragment(item.str).trim();
            if (!rawStr) continue;

            const x = Number(item.transform?.[4] || 0);
            const y = Number(item.transform?.[5] || 0);
            const width = Math.max(Number(item.width || 0), rawStr.length * 4.2);

            let targetLine = pageBuckets.find((b) => Math.abs(b.y - y) <= Y_TOLERANCE);
            if (!targetLine) {
                targetLine = { page: pageNum, y, tokens: [] };
                pageBuckets.push(targetLine);
            }
            targetLine.tokens.push({
                text: rawStr,
                x,
                y,
                width,
                xEnd: x + width
            });
        }

        pageBuckets.sort((a, b) => b.y - a.y);

        for (const bucket of pageBuckets) {
            bucket.tokens.sort((a, b) => a.x - b.x);

            const mergedTokens = [];
            for (const tok of bucket.tokens) {
                if (mergedTokens.length === 0) {
                    mergedTokens.push({ ...tok });
                    continue;
                }
                const prev = mergedTokens[mergedTokens.length - 1];
                const gap = tok.x - prev.xEnd;

                const isSplitNumberOrDate =
                    gap >= -3.5 &&
                    gap <= 3.8 &&
                    ((/[\d.,\/\-+($]$/.test(prev.text) && /^[\d.,\/\-+)%]$/.test(tok.text[0])) ||
                        (/^[+\-(]$/.test(prev.text) && /^\d/.test(tok.text)) ||
                        (/\d$/.test(prev.text) && /^(?:[.,]\d+|\)|-|DB|DR|CR)$/i.test(tok.text)) ||
                        (/^\d+[.,]$/.test(prev.text) && /^\d+$/.test(tok.text)));

                if (isSplitNumberOrDate) {
                    prev.text = `${prev.text}${tok.text}`;
                    prev.xEnd = Math.max(prev.xEnd, tok.xEnd);
                    prev.width = prev.xEnd - prev.x;
                } else {
                    mergedTokens.push({ ...tok });
                }
            }

            const normalizedTokens = [];
            for (const tok of mergedTokens) {
                if (/\s/.test(tok.text) && /\d[.,]\d/.test(tok.text)) {
                    const totalLen = Math.max(tok.text.length, 1);
                    const partRegex = /\S+/g;
                    let partMatch;
                    while ((partMatch = partRegex.exec(tok.text)) !== null) {
                        const partStr = partMatch[0];
                        const startRatio = partMatch.index / totalLen;
                        const lenRatio = partStr.length / totalLen;
                        const subX = tok.x + startRatio * tok.width;
                        const subW = Math.max(lenRatio * tok.width, partStr.length * 4.0);
                        normalizedTokens.push({
                            text: partStr,
                            x: subX,
                            y: tok.y,
                            width: subW,
                            xEnd: subX + subW
                        });
                    }
                } else {
                    normalizedTokens.push(tok);
                }
            }

            const joinedText = normalizedTokens.map((t) => t.text).join(' ').replace(/\s+/g, ' ').trim();
            if (joinedText) {
                structuredLines.push({
                    page: pageNum,
                    y: bucket.y,
                    text: joinedText,
                    tokens: normalizedTokens
                });
            }
        }
    }

    return { lines: structuredLines, numPages: pdfDoc.numPages };
}

/**
 * Analiza las primeras líneas del PDF para inferir banco, número de cuenta, empresa, año y moneda.
 * @param {Array<{ text: string }>} lines
 * @param {Array<{ nombre_legible: string }>} [knownBancos=[]]
 * @param {Array<{ cuenta_legible: string }>} [knownCuentas=[]]
 */
export function extractPdfHeaderMetadata(lines, knownBancos = [], knownCuentas = []) {
    const headerLines = lines.slice(0, 45);
    const fullHeaderText = headerLines.map((l) => l.text).join('\n');

    let detectedBanco = '';
    for (const b of knownBancos) {
        const bName = (b.nombre_legible || '').trim();
        if (bName.length >= 3 && new RegExp(`\\b${bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(fullHeaderText)) {
            detectedBanco = bName;
            break;
        }
    }
    if (!detectedBanco) {
        for (const candidate of KNOWN_BANK_NAMES) {
            if (new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(fullHeaderText)) {
                detectedBanco = candidate;
                break;
            }
        }
    }
    if (!detectedBanco) {
        const bankLabelMatch = /(?:banco|bank|instituci[oó]n\s*financiera|entidad\s*bancaria)[:\s]+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s.,&-]{3,50})/i.exec(
            fullHeaderText
        );
        if (bankLabelMatch) {
            detectedBanco = bankLabelMatch[1].trim();
        }
    }
    if (!detectedBanco && headerLines.length > 0) {
        const firstClean = headerLines.find(
            (l) =>
                l.text.length >= 4 &&
                l.text.length <= 55 &&
                !/estado\s+de\s+cuenta|p[aá]gina|fecha|desde|hasta|rif|nit/i.test(l.text)
        );
        detectedBanco = firstClean ? firstClean.text : knownBancos[0]?.nombre_legible || 'Banco Detectado PDF';
    }

    let detectedCuenta = '';
    const digitsOnlyHeader = fullHeaderText.replace(/[-\s]/g, '');
    for (const c of knownCuentas) {
        const cNum = (c.cuenta_legible || '').trim();
        const cDigits = cNum.replace(/[-\s]/g, '');
        if (cDigits.length >= 8 && digitsOnlyHeader.includes(cDigits)) {
            detectedCuenta = cNum;
            break;
        }
    }
    if (!detectedCuenta) {
        const vzlaAccMatch = /\b(\d{4}[-\s]?\d{4}[-\s]?\d{2}[-\s]?\d{10}|\d{20})\b/.exec(fullHeaderText);
        if (vzlaAccMatch) {
            detectedCuenta = vzlaAccMatch[1].replace(/\s+/g, '');
        }
    }
    if (!detectedCuenta) {
        const ibanMatch = /\b([A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16})\b/.exec(fullHeaderText);
        if (ibanMatch) {
            detectedCuenta = ibanMatch[1];
        }
    }
    if (!detectedCuenta) {
        const accLabelMatch = /(?:nro\.?\s*de\s*cuenta|n[uú]mero\s*de\s*cuenta|cuenta\s*(?:corriente|ahorro|nro|n[uú]mero|#)?|cta\.?\s*(?:nro|#)?|account\s*(?:number|no|#)?|iban)[:\s#]*([0-9A-Z][0-9A-Z\-*]{5,28}[0-9])/i.exec(
            fullHeaderText
        );
        if (accLabelMatch) {
            detectedCuenta = accLabelMatch[1].trim();
        }
    }

    let detectedEmpresa = '';
    const holderLabelMatch = /(?:titular|cliente|nombre\s*del\s*cliente|empresa|raz[oó]n\s*social|nombre\s*o\s*raz[oó]n\s*social|beneficiario|account\s*holder)[:\s]+([^\n\r|]{3,75})/i.exec(
        fullHeaderText
    );
    if (holderLabelMatch) {
        detectedEmpresa = holderLabelMatch[1]
            .replace(/\b(?:rif|nit|ci|c\.i\.|cuenta|cta|fecha|moneda)\b.*$/i, '')
            .trim();
    }
    if (!detectedEmpresa) {
        for (const l of headerLines) {
            const corpMatch = /\b([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.,&-]{2,60}\s+(?:C\.?A\.?|S\.?A\.?|S\.?R\.?L\.?|R\.?L\.?|LLC|INC\.?|CORP\.?|GMBH))\b/i.exec(
                l.text
            );
            if (corpMatch && !/banco\s+universal/i.test(corpMatch[1])) {
                detectedEmpresa = corpMatch[1].trim();
                break;
            }
        }
    }
    if (!detectedEmpresa) {
        detectedEmpresa = 'Titular Estado de Cuenta';
    }

    let detectedYear = new Date().getFullYear();
    const yearMatch = /\b(20\d{2})\b/.exec(fullHeaderText);
    if (yearMatch) {
        detectedYear = parseInt(yearMatch[1], 10);
    }

    let detectedMoneda = '';
    for (const mon of SUPPORTED_CURRENCIES) {
        if (new RegExp(`\\b${mon}\\b`, 'i').test(fullHeaderText)) {
            detectedMoneda = mon;
            break;
        }
    }
    if (!detectedMoneda && /\b(?:bol[ií]vares|bs\.?s?|bs\.?d?)\b/i.test(fullHeaderText)) {
        detectedMoneda = 'VES';
    }

    return {
        banco: detectedBanco,
        cuenta: detectedCuenta || 'SIN-CUENTA-DETECTADA',
        empresa: detectedEmpresa,
        year: detectedYear,
        moneda: detectedMoneda
    };
}

/**
 * Parsea un token monetario respetando el separador decimal indicado (`,` o `.`)
 * con respaldo automático para importes inequívocos de 2 decimales (como `1.05`).
 * @param {string} rawToken
 * @param {string} [decimalSeparator=',']
 */
export function parsePdfMonetaryToken(rawToken, decimalSeparator = ',') {
    const str = normalizePdfTextFragment(rawToken).trim();
    if (!str) {
        return { isAmount: false, signedValue: 0, absValue: 0, hasExplicitNegative: false, hasExplicitPositive: false };
    }

    if (
        /%$/.test(str) ||
        /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(str) ||
        /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(str)
    ) {
        return { isAmount: false, signedValue: 0, absValue: 0, hasExplicitNegative: false, hasExplicitPositive: false };
    }

    const primaryDec = decimalSeparator === '.' ? '.' : ',';
    const primaryThou = primaryDec === ',' ? '.' : ',';

    const tryParseWithSep = (decChar, thouChar, strictTwoDecimalsOnly = false) => {
        const escDec = decChar === '.' ? '\\.' : ',';
        const escThou = thouChar === '.' ? '\\.' : ',';
        const decDigitsQuantifier = strictTwoDecimalsOnly ? '{2}' : '{1,4}';

        const pattern = new RegExp(
            `^([+\\-(]?\\s*)(?:(?:Bs\\.?S?|Bs\\.?D?|USD|EUR|VES|USDT|BNB|BTC|YEN|US\\$|\\$|€)\\s*)?([+\\-]?\\s*)(\\d{1,3}(?:${escThou}\\d{3})+|\\d+)${escDec}(\\d${decDigitsQuantifier})(\\s*[)\\-*]?\\s*(?:DB|DR|CR|D|C|CARGO|ABONO|DEBITO|DÉBITO|CREDITO|CRÉDITO|ND|NC)?)$`,
            'i'
        );

        const match = pattern.exec(str);
        if (!match) return null;

        const prefix1 = match[1] || '';
        const prefix2 = match[2] || '';
        const intPart = match[3] || '0';
        const decPart = match[4] || '00';
        const suffix = (match[5] || '').toUpperCase();

        const cleanInt = intPart.split(thouChar).join('');
        const absValue = parseFloat(`${cleanInt}.${decPart}`);
        if (Number.isNaN(absValue)) return null;

        const combinedPrefix = `${prefix1}${prefix2}`;
        const hasExplicitNegative =
            combinedPrefix.includes('-') ||
            (combinedPrefix.includes('(') && suffix.includes(')')) ||
            suffix.includes('-') ||
            /\b(?:DB|DR|D|CARGO|DEBITO|DÉBITO|ND)\b/.test(suffix);

        const hasExplicitPositive =
            combinedPrefix.includes('+') ||
            /\b(?:CR|C|ABONO|CREDITO|CRÉDITO|NC)\b/.test(suffix);

        const signedValue = hasExplicitNegative ? -absValue : absValue;

        return {
            isAmount: true,
            signedValue,
            absValue,
            hasExplicitNegative,
            hasExplicitPositive
        };
    };

    const primaryResult = tryParseWithSep(primaryDec, primaryThou, false);
    if (primaryResult) return primaryResult;

    const fallbackResult = tryParseWithSep(primaryThou, primaryDec, true);
    if (fallbackResult) return fallbackResult;

    return { isAmount: false, signedValue: 0, absValue: 0, hasExplicitNegative: false, hasExplicitPositive: false };
}

/**
 * Extrae todos los importes monetarios de una línea preservando coordenadas `x`, `xCenter` y `xEnd`.
 */
export function extractAmountsFromPdfLine(line, decimalSeparator = ',', minXAfterDate = -Infinity) {
    const results = [];
    const decChar = decimalSeparator === '.' ? '.' : ',';
    const tokens = Array.isArray(line?.tokens) ? line.tokens : [];

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.x < minXAfterDate) continue;

        let candidateText = normalizePdfTextFragment(tok.text).trim();
        let startX = tok.x;
        let endX = tok.xEnd ?? tok.x + Math.max(Number(tok.width || 0), candidateText.length * 4.5);

        if (
            (/^[+\-(]$/.test(candidateText) || /^(?:Bs\.?S?|USD|EUR|VES|\$|€)$/i.test(candidateText)) &&
            i + 1 < tokens.length
        ) {
            const nextTok = tokens[i + 1];
            if (nextTok.x - endX <= 18) {
                candidateText = `${candidateText} ${normalizePdfTextFragment(nextTok.text).trim()}`;
                endX = nextTok.xEnd ?? nextTok.x + Math.max(Number(nextTok.width || 0), nextTok.text.length * 4.5);
                i++;
            }
        }

        if (
            i + 1 < tokens.length &&
            /^(?:-|DB|DR|CR|D|C|CARGO|ABONO|ND|NC|\))$/i.test(normalizePdfTextFragment(tokens[i + 1].text).trim())
        ) {
            const nextTok = tokens[i + 1];
            if (nextTok.x - endX <= 18) {
                candidateText = `${candidateText} ${normalizePdfTextFragment(nextTok.text).trim()}`;
                endX = nextTok.xEnd ?? nextTok.x + Math.max(Number(nextTok.width || 0), nextTok.text.length * 4.5);
                i++;
            }
        }

        const parsed = parsePdfMonetaryToken(candidateText, decChar);
        if (parsed.isAmount) {
            const width = Math.max(endX - startX, candidateText.length * 4.2);
            results.push({
                ...parsed,
                x: startX,
                width,
                xCenter: startX + width / 2,
                xEnd: startX + width,
                raw: candidateText
            });
        }
    }

    if (results.length > 0) return results;

    const inlineAmountRegex =
        /(?:^|\s)([+\-(]?\s*(?:(?:Bs\.?S?|USD|EUR|VES|\$|€)\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2,4}(?:\s*[)\-]?\s*(?:DB|DR|CR|CARGO|ABONO)?)?)(?=\s|$)/gi;
    let m;
    let approxIdx = 0;
    const lineText = normalizePdfTextFragment(line?.text || '');
    while ((m = inlineAmountRegex.exec(lineText)) !== null) {
        const rawCandidate = m[1].trim();
        const parsed = parsePdfMonetaryToken(rawCandidate, decChar);
        if (parsed.isAmount) {
            const estX = m.index * 5.2 + approxIdx * 55;
            const estW = Math.max(rawCandidate.length * 4.5, 18);
            results.push({
                ...parsed,
                x: estX,
                width: estW,
                xCenter: estX + estW / 2,
                xEnd: estX + estW,
                raw: rawCandidate
            });
            approxIdx++;
        }
    }

    return results;
}

/**
 * Extrae del campo descripción un código alfanumérico equivalente a una referencia bancaria
 * cuando el PDF no contiene una columna dedicada de Referencia.
 */
export function extractEquivalentReferenceFromDescription(descripcionText, fallbackYear) {
    const clean = String(descripcionText || '').trim();
    if (!clean) return '';

    const labeledMatch = /\b(?:ref(?:erencia)?\.?|doc(?:umento)?\.?|nro\.?|n[uú]m\.?|comp(?:robante)?\.?|oper(?:aci[oó]n)?\.?|serial|sec(?:uencia)?\.?|id|cod(?:igo)?\.?|lote|aut(?:orizaci[oó]n)?\.?|conf(?:irmaci[oó]n)?\.?|liq(?:uidaci[oó]n)?\.?)[:\s#\-]*([A-Z0-9][A-Z0-9\-\/._]{2,29})\b/i.exec(
        clean
    );
    if (labeledMatch && /\d/.test(labeledMatch[1])) {
        return labeledMatch[1].trim();
    }

    const tokens = clean.split(/\s+/).filter(Boolean);
    const candidates = [];

    for (const rawTok of tokens) {
        const tok = rawTok.replace(/^[(:;#,\-]+|[):;.,\-]+$/g, '');
        if (tok.length < 3 || tok.length > 30) continue;
        if (normalizePdfDateToIso(tok, fallbackYear).valid) continue;

        if (/^[A-Z0-9][A-Z0-9\-\/._]*[A-Z0-9]$/i.test(tok) && /\d/.test(tok)) {
            const digitCount = (tok.match(/\d/g) || []).length;
            const hasLetters = /[A-Z]/i.test(tok);
            if (digitCount >= 2 || (digitCount >= 1 && tok.length >= 4)) {
                candidates.push({
                    code: tok,
                    score: digitCount * 2 + (hasLetters ? 3 : 0) + Math.min(tok.length, 15)
                });
            }
        }
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].code;
    }

    return '';
}

/**
 * Analiza las líneas estructuradas del PDF y extrae los movimientos bancarios con los 8 campos requeridos.
 */
export function parseBankStatementTransactionsFromLines(
    lines,
    headerMeta,
    forcedMode = 'auto',
    decimalSeparator = ','
) {
    let dateHeaderX = null;
    let refHeaderX = null;
    let descHeaderX = null;
    let debitHeaderX = null;
    let debitHeaderXEnd = null;
    let creditHeaderX = null;
    let creditHeaderXEnd = null;
    let singleAmountHeaderX = null;
    let balanceHeaderX = null;
    let balanceHeaderXEnd = null;

    const decChar = decimalSeparator === '.' ? '.' : ',';

    for (const line of lines) {
        const lower = line.text.toLowerCase();
        const hasDateHeader = /\b(?:fecha|date|d[ií]a|f\.\s*oper|f\.?\s*mov)\b/.test(lower);
        const hasFinanceHeader =
            /\b(?:debe|d[eé]bito|debitos|d[eé]bitos|cargo|cargos|retiro|retiros|egreso|egresos|salidas|haber|cr[eé]dito|creditos|cr[eé]ditos|abono|abonos|dep[oó]sito|depositos|dep[oó]sitos|ingreso|ingresos|entradas|monto|importe|amount|saldo|balance)\b/.test(
                lower
            );
        const hasDualColumnWords =
            /\b(?:debe|d[eé]bito|debitos|d[eé]bitos|cargo|cargos|retiro|retiros|egreso|egresos)\b/.test(lower) &&
            /\b(?:haber|cr[eé]dito|creditos|cr[eé]ditos|abono|abonos|dep[oó]sito|depositos|dep[oó]sitos|ingreso|ingresos)\b/.test(
                lower
            );

        if ((hasDateHeader && hasFinanceHeader) || hasDualColumnWords) {
            if (extractAmountsFromPdfLine(line, decChar).length >= 2) continue;

            for (const tok of line.tokens) {
                const tLow = tok.text.toLowerCase();
                const tokEnd = tok.xEnd ?? tok.x + Math.max(Number(tok.width || 0), tok.text.length * 4.5);

                if (/\b(?:fecha|date|d[ií]a)\b/.test(tLow) && dateHeaderX === null) {
                    dateHeaderX = tok.x;
                }
                if (
                    /\b(?:referencia|ref\.?|nro\.?\s*ref|documento|doc\.?|comprobante|serial|operaci[oó]n|c[oó]digo|nro\.?|n[uú]mero|cheque|secuencia)\b/.test(
                        tLow
                    ) &&
                    refHeaderX === null
                ) {
                    refHeaderX = tok.x;
                }
                if (
                    /\b(?:descripci[oó]n|concepto|detalle|motivo|narrativa|observaci[oó]n|transacci[oó]n|movimiento)\b/.test(
                        tLow
                    ) &&
                    descHeaderX === null
                ) {
                    descHeaderX = tok.x;
                }
                if (
                    /\b(?:debe|d[eé]bito|debitos|d[eé]bitos|cargo|cargos|retiro|retiros|egreso|egresos|salidas|deudor)\b/.test(
                        tLow
                    ) &&
                    debitHeaderX === null
                ) {
                    debitHeaderX = tok.x;
                    debitHeaderXEnd = tokEnd;
                }
                if (
                    /\b(?:haber|cr[eé]dito|creditos|cr[eé]ditos|abono|abonos|dep[oó]sito|depositos|dep[oó]sitos|ingreso|ingresos|entradas|acreedor)\b/.test(
                        tLow
                    ) &&
                    creditHeaderX === null
                ) {
                    creditHeaderX = tok.x;
                    creditHeaderXEnd = tokEnd;
                }
                if (/\b(?:monto|importe|valor|amount)\b/.test(tLow) && singleAmountHeaderX === null) {
                    singleAmountHeaderX = tok.x;
                }
                if (/\b(?:saldo|balance|disponible)\b/.test(tLow) && balanceHeaderX === null) {
                    balanceHeaderX = tok.x;
                    balanceHeaderXEnd = tokEnd;
                }
            }
        }
    }

    let columnMode = forcedMode;
    if (columnMode === 'auto') {
        if (debitHeaderX !== null && creditHeaderX !== null) {
            columnMode = 'dual';
        } else if (singleAmountHeaderX !== null && debitHeaderX === null && creditHeaderX === null) {
            columnMode = 'single';
        }
    }

    const dateLineRegex =
        /^(?:(?:\d{1,4}|[A-Z]{1,4})\s+)?(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}[\s\-\/][A-Za-zÁÉÍÓÚáéíóú]{3,10}[\s\-\/]\d{2,4})\b\s*(.*)$/i;
    const summaryFooterRegex =
        /^(?:saldo\s+final|saldo\s+actual|total\s+movimientos|total\s+general|totales|resumen\s+de|promedio)/i;
    const initialBalanceRegex = /\b(?:saldo\s+anterior|saldo\s+inicial|balance\s+anterior|balance\s+inicial)\b/i;

    const rawCandidateRows = [];
    let initialStatementBalance = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cleanLineText = line.text.trim();

        if (initialBalanceRegex.test(cleanLineText)) {
            const initAmounts = extractAmountsFromPdfLine(line, decChar);
            if (initAmounts.length > 0) {
                initialStatementBalance = initAmounts[initAmounts.length - 1].absValue;
            }
            continue;
        }

        if (summaryFooterRegex.test(cleanLineText)) continue;

        const dateMatch = dateLineRegex.exec(cleanLineText);
        if (!dateMatch) continue;

        const rawDateToken = dateMatch[1];
        let restOfLine = dateMatch[2] || '';
        const normDate = normalizePdfDateToIso(rawDateToken, headerMeta.year);
        if (!normDate.valid) continue;

        const dateTokObj = line.tokens.find((t) => t.text.includes(rawDateToken)) || line.tokens[0];
        const minXAfterDate = dateTokObj ? dateTokObj.x + 8 : -Infinity;

        let amounts = extractAmountsFromPdfLine(line, decChar, minXAfterDate);
        let combinedLine = line;

        if (amounts.length === 0 && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const nextText = nextLine.text.trim();
            const isSamePageAndClose =
                nextLine.page === line.page && Math.abs(line.y - nextLine.y) <= 28;
            const nextHasDate = dateLineRegex.test(nextText);
            const nextIsSummary = summaryFooterRegex.test(nextText) || initialBalanceRegex.test(nextText);

            if (isSamePageAndClose && !nextHasDate && !nextIsSummary) {
                const nextAmounts = extractAmountsFromPdfLine(nextLine, decChar, minXAfterDate);
                if (nextAmounts.length > 0) {
                    amounts = nextAmounts;
                    restOfLine = `${restOfLine} ${nextText}`.replace(/\s+/g, ' ').trim();
                    combinedLine = {
                        ...line,
                        text: `${line.text} ${nextLine.text}`.replace(/\s+/g, ' ').trim(),
                        tokens: [...line.tokens, ...nextLine.tokens].sort((a, b) => a.x - b.x)
                    };
                    i++;
                }
            }
        }

        if (amounts.length === 0) continue;

        rawCandidateRows.push({
            line: combinedLine,
            isoDate: normDate.isoDate,
            restOfLine,
            amounts
        });
    }

    let inferredDebitXEnd = debitHeaderXEnd ?? (debitHeaderX !== null ? debitHeaderX + 42 : null);
    let inferredCreditXEnd = creditHeaderXEnd ?? (creditHeaderX !== null ? creditHeaderX + 42 : null);

    if (rawCandidateRows.length > 0) {
        const movAmountXEnds = rawCandidateRows
            .map((r) => r.amounts[0].xEnd ?? r.amounts[0].x + 25)
            .sort((a, b) => a - b);
        const minXEnd = movAmountXEnds[0] || 0;
        const maxXEnd = movAmountXEnds[movAmountXEnds.length - 1] || 0;

        if (columnMode === 'auto') {
            const hasThreeAmounts = rawCandidateRows.some((r) => r.amounts.length >= 3);
            const hasNegativeSigns = rawCandidateRows.some((r) =>
                r.amounts.some((a) => a.hasExplicitNegative)
            );

            if (hasThreeAmounts) {
                columnMode = 'dual';
            } else if (hasNegativeSigns && debitHeaderX === null && creditHeaderX === null) {
                columnMode = 'single';
            } else if (maxXEnd - minXEnd > 38) {
                columnMode = 'dual';
            } else {
                columnMode = 'single';
            }
        }

        if (columnMode === 'dual' && maxXEnd - minXEnd > 38) {
            if (inferredDebitXEnd === null) inferredDebitXEnd = minXEnd;
            if (inferredCreditXEnd === null) inferredCreditXEnd = maxXEnd;
        }
    }

    const amountStripRegex =
        /(?:^|\s)[+\-(]?\s*(?:(?:Bs\.?S?|USD|EUR|VES|\$|€)\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{1,4}(?:\s*[)\-*]?\s*(?:DB|DR|CR|CARGO|ABONO)?)?(?=\s|$)/gi;

    const extractedTransactions = [];
    let runningBalance = initialStatementBalance;

    for (let idx = 0; idx < rawCandidateRows.length; idx++) {
        const item = rawCandidateRows[idx];
        const { line, isoDate, restOfLine, amounts } = item;
        const firstAmountX = amounts[0]?.x ?? Infinity;

        const textWithoutAmounts = restOfLine
            .replace(amountStripRegex, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        let referencia = '';
        let descripcion = textWithoutAmounts;

        if (refHeaderX !== null && line.tokens && line.tokens.length > 1) {
            let refMinX;
            let refMaxX;

            if (descHeaderX !== null && refHeaderX < descHeaderX) {
                refMinX = refHeaderX - 28;
                refMaxX = descHeaderX - 8;
            } else if (descHeaderX !== null && refHeaderX > descHeaderX) {
                refMinX = refHeaderX - 25;
                refMaxX = firstAmountX - 8;
            } else {
                refMinX = refHeaderX - 25;
                refMaxX = Math.min(refHeaderX + 95, firstAmountX - 8);
            }

            const refTokens = [];
            const descTokens = [];

            for (let tIdx = 1; tIdx < line.tokens.length; tIdx++) {
                const tok = line.tokens[tIdx];
                if (tok.x >= firstAmountX - 4) continue;
                if (parsePdfMonetaryToken(tok.text, decChar).isAmount) continue;
                if (tIdx === 1 && tok.x < refMinX && normalizePdfDateToIso(tok.text, headerMeta.year).valid) {
                    continue;
                }

                if (tok.x >= refMinX && tok.x <= refMaxX) {
                    refTokens.push(tok.text);
                } else {
                    descTokens.push(tok.text);
                }
            }

            const joinedRefColumn = refTokens.join(' ').replace(/\s+/g, ' ').trim();
            if (joinedRefColumn) {
                referencia = joinedRefColumn;
                if (descTokens.length > 0) {
                    descripcion = descTokens.join(' ').replace(/\s+/g, ' ').trim();
                }
            }
        }

        if (!referencia) {
            const tokensAfterDate = textWithoutAmounts.split(' ').filter(Boolean);
            let startTokenIdx = 0;
            if (tokensAfterDate[0] && normalizePdfDateToIso(tokensAfterDate[0], headerMeta.year).valid) {
                startTokenIdx = 1;
            }

            const firstCandidate = tokensAfterDate[startTokenIdx] || '';
            if (
                /^[A-Z0-9][A-Z0-9\-\/._]{2,29}$/i.test(firstCandidate) &&
                /\d/.test(firstCandidate) &&
                tokensAfterDate.length > startTokenIdx + 1
            ) {
                referencia = firstCandidate;
                descripcion = tokensAfterDate.slice(startTokenIdx + 1).join(' ').trim() || textWithoutAmounts;
            } else {
                const fromDesc = extractEquivalentReferenceFromDescription(
                    textWithoutAmounts,
                    headerMeta.year
                );
                referencia = fromDesc || `REF-${idx + 1}`;
            }
        }

        let debe = 0.0;
        let haber = 0.0;

        const isDebitKeywordInLine =
            /\b(?:cargo|d[eé]bito|debitos|retiro|comisi[oó]n|comis\.?|igtf|itf|iva|impuesto|timbre|tasa|pago|compra|pos|tdd|nota\s*de\s*d[eé]bito|n\/d|nd|transf\.?\s*enviada|transferencia\s*enviada|transf\.?\s*terceros|cheque|mantenimiento|mensualidad|tarifa|afiliaci[oó]n|domiciliaci[oó]n|retenci[oó]n|cajero|atm|egreso)\b/i.test(
                textWithoutAmounts
            );
        const isCreditKeywordInLine =
            /\b(?:abono|cr[eé]dito|creditos|dep[oó]sito|deposito|nota\s*de\s*cr[eé]dito|n\/c|nc|transf\.?\s*recibida|transferencia\s*recibida|intereses|rendimiento|reverso|devoluci[oó]n|ingreso)\b/i.test(
                textWithoutAmounts
            );

        const classifySingleMovementAmount = (movObj, currentRowBalance = null) => {
            if (movObj.hasExplicitNegative) return 'debit';
            if (movObj.hasExplicitPositive) return 'credit';

            if (runningBalance !== null && currentRowBalance !== null && movObj.absValue > 0) {
                const diffIfDebit = Math.abs(runningBalance - movObj.absValue - currentRowBalance);
                const diffIfCredit = Math.abs(runningBalance + movObj.absValue - currentRowBalance);
                if (diffIfDebit <= 0.05 && diffIfDebit < diffIfCredit) return 'debit';
                if (diffIfCredit <= 0.05 && diffIfCredit < diffIfDebit) return 'credit';
            }

            if (inferredDebitXEnd !== null && inferredCreditXEnd !== null) {
                const movXEnd = movObj.xEnd ?? movObj.x + 20;
                const distToDebitEnd = Math.abs(movXEnd - inferredDebitXEnd);
                const distToCreditEnd = Math.abs(movXEnd - inferredCreditXEnd);

                if (debitHeaderX !== null && creditHeaderX !== null) {
                    const splitX = ((debitHeaderXEnd ?? debitHeaderX + 35) + creditHeaderX) / 2;
                    const movCenter = movObj.xCenter ?? movObj.x + 10;
                    if (movCenter <= splitX || distToDebitEnd <= distToCreditEnd) {
                        return 'debit';
                    }
                    return 'credit';
                }

                return distToDebitEnd <= distToCreditEnd ? 'debit' : 'credit';
            }

            if (isDebitKeywordInLine && !isCreditKeywordInLine) return 'debit';
            if (isCreditKeywordInLine && !isDebitKeywordInLine) return 'credit';

            if (debitHeaderX !== null && Math.abs(movObj.x - debitHeaderX) <= 65) {
                return 'debit';
            }

            return 'credit';
        };

        if (columnMode === 'single') {
            const movAmountObj = amounts[0];
            const rowBalanceVal = amounts.length >= 2 ? amounts[amounts.length - 1].absValue : null;
            let signedVal = movAmountObj.signedValue;

            if (!movAmountObj.hasExplicitNegative && !movAmountObj.hasExplicitPositive) {
                const side = classifySingleMovementAmount(movAmountObj, rowBalanceVal);
                signedVal = side === 'debit' ? -Math.abs(movAmountObj.absValue) : Math.abs(movAmountObj.absValue);
            }

            if (signedVal < 0) {
                debe = Math.abs(signedVal);
                haber = 0.0;
            } else {
                debe = 0.0;
                haber = Math.abs(signedVal);
            }

            if (rowBalanceVal !== null) runningBalance = rowBalanceVal;
        } else {
            if (amounts.length >= 3) {
                debe = Math.abs(amounts[0].absValue);
                haber = Math.abs(amounts[1].absValue);
                runningBalance = amounts[2].absValue;
            } else if (amounts.length === 2) {
                const first = amounts[0];
                const second = amounts[1];

                const secondLooksLikeBalance =
                    (balanceHeaderX !== null && Math.abs(second.x - balanceHeaderX) < 65) ||
                    (balanceHeaderXEnd !== null && Math.abs((second.xEnd ?? second.x) - balanceHeaderXEnd) < 55) ||
                    (creditHeaderXEnd !== null && (second.xEnd ?? second.x) > creditHeaderXEnd + 35) ||
                    (first.absValue !== 0 && second.absValue !== 0);

                if (!secondLooksLikeBalance && (first.absValue === 0 || second.absValue === 0)) {
                    debe = Math.abs(first.absValue);
                    haber = Math.abs(second.absValue);
                } else {
                    const side = classifySingleMovementAmount(first, second.absValue);
                    if (side === 'debit') {
                        debe = first.absValue;
                        haber = 0.0;
                    } else {
                        debe = 0.0;
                        haber = first.absValue;
                    }
                    runningBalance = second.absValue;
                }
            } else if (amounts.length === 1) {
                const only = amounts[0];
                const side = classifySingleMovementAmount(only, null);
                if (side === 'debit') {
                    debe = only.absValue;
                    haber = 0.0;
                } else {
                    debe = 0.0;
                    haber = only.absValue;
                }
            }
        }

        extractedTransactions.push({
            rowId: idx + 1,
            banco: headerMeta.banco,
            cuenta: headerMeta.cuenta,
            fecha: isoDate,
            empresa: headerMeta.empresa,
            referencia,
            descripcion: descripcion || 'Movimiento estado de cuenta PDF',
            tipo: 'CUENTA',
            debe: Number(debe.toFixed(2)),
            haber: Number(haber.toFixed(2))
        });
    }

    return {
        transactions: extractedTransactions,
        detectedMode: columnMode
    };
}

