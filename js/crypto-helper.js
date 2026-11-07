/**
 * @file js/crypto-helper.js
 * @description Capa de abstracción para encriptación/desencriptación de datos sensibles
 *              (`encryptData` / `decryptData`) y verificación nativa (ES6+ puro sin librerías
 *              externas) de claves encriptadas en la tabla `usuarios` de Supabase (`$2y$` / `$2a$`
 *              Blowfish/Bcrypt y cifrado simétrico).
 */

const APP_DATA_KEY = 'disp_client_sym_layer_2026';
const BCRYPT_BASE64_CODE = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

let cachedBlowfishInit = null;

/**
 * Calcula mediante BigInt (fórmula de Machin para Pi) las constantes iniciales
 * P-array (18 uint32) y S-boxes (1024 uint32) del estándar Blowfish (dígitos hexadecimales de Pi - 3).
 * 100% JavaScript nativo ES6+, cero dependencias externas.
 * @returns {{ P: Uint32Array, S: Uint32Array }}
 */
function getBlowfishInitialState() {
    if (cachedBlowfishInit) {
        return {
            P: new Uint32Array(cachedBlowfishInit.P),
            S: new Uint32Array(cachedBlowfishInit.S)
        };
    }

    const hexDigits = 8352;
    const scale = 16n ** BigInt(hexDigits + 10);

    const arccot = (x) => {
        const xBig = BigInt(x);
        const xSq = xBig * xBig;
        let term = scale / xBig;
        let sum = term;
        let n = 3n;
        let sign = -1n;

        while (term > 0n) {
            term /= xSq;
            const step = term / n;
            if (step === 0n) break;
            sum += sign * step;
            sign = -sign;
            n += 2n;
        }
        return sum;
    };

    const piScaled = 16n * arccot(5) - 4n * arccot(239);
    const fractionalScale = 16n ** BigInt(hexDigits + 10);
    const fracPart = piScaled - 3n * fractionalScale;
    const hexString = (fracPart / (16n ** 10n)).toString(16).padStart(hexDigits, '0');

    const P = new Uint32Array(18);
    const S = new Uint32Array(1024);

    let offset = 0;
    for (let i = 0; i < 18; i++) {
        P[i] = parseInt(hexString.slice(offset, offset + 8), 16) >>> 0;
        offset += 8;
    }
    for (let i = 0; i < 1024; i++) {
        S[i] = parseInt(hexString.slice(offset, offset + 8), 16) >>> 0;
        offset += 8;
    }

    cachedBlowfishInit = { P, S };
    return {
        P: new Uint32Array(P),
        S: new Uint32Array(S)
    };
}

/**
 * Decodifica una cadena en alfabeto Base64 de Bcrypt a bytes.
 * @param {string} str
 * @param {number} maxBytes
 * @returns {Uint8Array}
 */
function bcryptBase64Decode(str, maxBytes) {
    const out = [];
    let i = 0;
    while (i < str.length && out.length < maxBytes) {
        const c1 = BCRYPT_BASE64_CODE.indexOf(str[i++]);
        const c2 = i < str.length ? BCRYPT_BASE64_CODE.indexOf(str[i++]) : -1;
        if (c1 === -1 || c2 === -1) break;
        out.push(((c1 << 2) | ((c2 & 0x30) >> 4)) & 0xff);
        if (out.length >= maxBytes || i >= str.length) break;

        const c3 = BCRYPT_BASE64_CODE.indexOf(str[i++]);
        if (c3 === -1) break;
        out.push((((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2)) & 0xff);
        if (out.length >= maxBytes || i >= str.length) break;

        const c4 = BCRYPT_BASE64_CODE.indexOf(str[i++]);
        if (c4 === -1) break;
        out.push((((c3 & 0x03) << 6) | c4) & 0xff);
    }
    return new Uint8Array(out);
}

/**
 * Codifica bytes usando el alfabeto Base64 de Bcrypt.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bcryptBase64Encode(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const b1 = bytes[i++] & 0xff;
        out += BCRYPT_BASE64_CODE[(b1 >> 2) & 0x3f];
        if (i >= bytes.length) {
            out += BCRYPT_BASE64_CODE[(b1 & 0x03) << 4];
            break;
        }
        const b2 = bytes[i++] & 0xff;
        out += BCRYPT_BASE64_CODE[((b1 & 0x03) << 4) | ((b2 >> 4) & 0x0f)];
        if (i >= bytes.length) {
            out += BCRYPT_BASE64_CODE[(b2 & 0x0f) << 2];
            break;
        }
        const b3 = bytes[i++] & 0xff;
        out += BCRYPT_BASE64_CODE[((b2 & 0x0f) << 2) | ((b3 >> 6) & 0x03)];
        out += BCRYPT_BASE64_CODE[b3 & 0x3f];
    }
    return out;
}

/**
 * Cifra un bloque de 64 bits [L, R] con Blowfish.
 * @param {number} L
 * @param {number} R
 * @param {Uint32Array} P
 * @param {Uint32Array} S
 * @param {Uint32Array} outPair
 */
function blowfishEncipher(L, R, P, S, outPair) {
    let xl = L | 0;
    let xr = R | 0;

    for (let i = 0; i < 16; i += 2) {
        xl ^= P[i];
        xr ^=
            (((S[xl >>> 24] + S[256 | ((xl >>> 16) & 0xff)]) ^
                S[512 | ((xl >>> 8) & 0xff)]) +
                S[768 | (xl & 0xff)]) |
            0;

        xr ^= P[i + 1];
        xl ^=
            (((S[xr >>> 24] + S[256 | ((xr >>> 16) & 0xff)]) ^
                S[512 | ((xr >>> 8) & 0xff)]) +
                S[768 | (xr & 0xff)]) |
            0;
    }

    xl ^= P[16];
    xr ^= P[17];

    outPair[0] = xr >>> 0;
    outPair[1] = xl >>> 0;
}

/**
 * Lee una palabra de 32 bits cíclica desde un arreglo de bytes.
 * @param {Uint8Array} data
 * @param {number} offsetRef
 * @returns {{ word: number, nextOffset: number }}
 */
function streamToWord(data, offsetRef) {
    let word = 0;
    let off = offsetRef;
    for (let i = 0; i < 4; i++) {
        word = ((word << 8) | (data[off] & 0xff)) >>> 0;
        off = (off + 1) % data.length;
    }
    return { word, nextOffset: off };
}

/**
 * Expande clave y sal sobre el estado P y S de Eksblowfish.
 * @param {Uint32Array} P
 * @param {Uint32Array} S
 * @param {Uint8Array|null} saltBytes
 * @param {Uint8Array} keyBytes
 */
function eksBlowfishExpand(P, S, saltBytes, keyBytes) {
    let keyOffset = 0;
    for (let i = 0; i < 18; i++) {
        const res = streamToWord(keyBytes, keyOffset);
        P[i] = (P[i] ^ res.word) >>> 0;
        keyOffset = res.nextOffset;
    }

    const saltWords = new Uint32Array(4);
    if (saltBytes && saltBytes.length === 16) {
        let sOff = 0;
        for (let i = 0; i < 4; i++) {
            const res = streamToWord(saltBytes, sOff);
            saltWords[i] = res.word;
            sOff = res.nextOffset;
        }
    }

    const lr = new Uint32Array([0, 0]);
    let saltIdx = 0;

    for (let i = 0; i < 18; i += 2) {
        lr[0] = (lr[0] ^ saltWords[saltIdx]) >>> 0;
        lr[1] = (lr[1] ^ saltWords[saltIdx + 1]) >>> 0;
        saltIdx = (saltIdx + 2) & 3;
        blowfishEncipher(lr[0], lr[1], P, S, lr);
        P[i] = lr[0];
        P[i + 1] = lr[1];
    }

    for (let i = 0; i < 1024; i += 2) {
        lr[0] = (lr[0] ^ saltWords[saltIdx]) >>> 0;
        lr[1] = (lr[1] ^ saltWords[saltIdx + 1]) >>> 0;
        saltIdx = (saltIdx + 2) & 3;
        blowfishEncipher(lr[0], lr[1], P, S, lr);
        S[i] = lr[0];
        S[i + 1] = lr[1];
    }
}

/**
 * Verifica una contraseña en texto plano contra un hash Bcrypt ($2a$, $2y$, $2b$)
 * almacenado en la columna `clave` de la tabla `usuarios`.
 * @param {string} plainPassword
 * @param {string} bcryptHash
 * @returns {boolean}
 */
export function verifyBcryptHash(plainPassword, bcryptHash) {
    if (!bcryptHash || typeof bcryptHash !== 'string' || bcryptHash.length !== 60) {
        return false;
    }

    const prefix = bcryptHash.slice(0, 4);
    if (prefix !== '$2a$' && prefix !== '$2y$' && prefix !== '$2b$') {
        return false;
    }

    const cost = parseInt(bcryptHash.slice(4, 6), 10);
    if (Number.isNaN(cost) || cost < 4 || cost > 31 || bcryptHash[6] !== '$') {
        return false;
    }

    const saltStr = bcryptHash.slice(7, 29);
    const saltBytes = bcryptBase64Decode(saltStr, 16);

    const encoder = new TextEncoder();
    const rawPass = encoder.encode(String(plainPassword));
    const passLen = Math.min(rawPass.length, 72);
    const keyBytes = new Uint8Array(passLen + 1);
    keyBytes.set(rawPass.subarray(0, passLen), 0);
    keyBytes[passLen] = 0; // Terminador nulo requerido por Eksblowfish

    const { P, S } = getBlowfishInitialState();
    eksBlowfishExpand(P, S, saltBytes, keyBytes);

    const rounds = 1 << cost;
    for (let r = 0; r < rounds; r++) {
        eksBlowfishExpand(P, S, null, keyBytes);
        eksBlowfishExpand(P, S, null, saltBytes);
    }

    // "OrpheanBeholderScryDoubt" en 6 palabras big-endian de 32 bits
    const cdata = new Uint32Array([
        0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274
    ]);
    const pair = new Uint32Array(2);

    for (let b = 0; b < 6; b += 2) {
        pair[0] = cdata[b];
        pair[1] = cdata[b + 1];
        for (let r = 0; r < 64; r++) {
            blowfishEncipher(pair[0], pair[1], P, S, pair);
        }
        cdata[b] = pair[0];
        cdata[b + 1] = pair[1];
    }

    const outBytes = new Uint8Array(23);
    for (let i = 0; i < 6; i++) {
        const w = cdata[i];
        const base = i * 4;
        if (base < 23) outBytes[base] = (w >>> 24) & 0xff;
        if (base + 1 < 23) outBytes[base + 1] = (w >>> 16) & 0xff;
        if (base + 2 < 23) outBytes[base + 2] = (w >>> 8) & 0xff;
        if (base + 3 < 23) outBytes[base + 3] = w & 0xff;
    }

    const computedTail = bcryptBase64Encode(outBytes).slice(0, 31);
    const expectedTail = bcryptHash.slice(29);
    return computedTail === expectedTail;
}

/**
 * Genera un hash Bcrypt ($2y$) compatible con PHP `password_hash` y PostgreSQL `crypt(..., gen_salt('bf', cost))`
 * en JavaScript ES6+ puro sin librerías externas.
 * @param {string} plainPassword
 * @param {number} [cost=10]
 * @param {string} [customSalt22]
 * @returns {string}
 */
export function generateBcryptHash(plainPassword, cost = 10, customSalt22 = '') {
    let saltStr = customSalt22;
    if (!saltStr || saltStr.length !== 22) {
        const randBytes = new Uint8Array(16);
        if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
            globalThis.crypto.getRandomValues(randBytes);
        } else {
            for (let i = 0; i < 16; i++) {
                randBytes[i] = Math.floor(Math.random() * 256);
            }
        }
        saltStr = bcryptBase64Encode(randBytes).slice(0, 22);
    }

    const saltBytes = bcryptBase64Decode(saltStr, 16);
    const encoder = new TextEncoder();
    const rawPass = encoder.encode(String(plainPassword));
    const passLen = Math.min(rawPass.length, 72);
    const keyBytes = new Uint8Array(passLen + 1);
    keyBytes.set(rawPass.subarray(0, passLen), 0);
    keyBytes[passLen] = 0;

    const { P, S } = getBlowfishInitialState();
    eksBlowfishExpand(P, S, saltBytes, keyBytes);

    const rounds = 1 << cost;
    for (let r = 0; r < rounds; r++) {
        eksBlowfishExpand(P, S, null, keyBytes);
        eksBlowfishExpand(P, S, null, saltBytes);
    }

    const cdata = new Uint32Array([
        0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274
    ]);
    const pair = new Uint32Array(2);

    for (let b = 0; b < 6; b += 2) {
        pair[0] = cdata[b];
        pair[1] = cdata[b + 1];
        for (let r = 0; r < 64; r++) {
            blowfishEncipher(pair[0], pair[1], P, S, pair);
        }
        cdata[b] = pair[0];
        cdata[b + 1] = pair[1];
    }

    const outBytes = new Uint8Array(23);
    for (let i = 0; i < 6; i++) {
        const w = cdata[i];
        const base = i * 4;
        if (base < 23) outBytes[base] = (w >>> 24) & 0xff;
        if (base + 1 < 23) outBytes[base + 1] = (w >>> 16) & 0xff;
        if (base + 2 < 23) outBytes[base + 2] = (w >>> 8) & 0xff;
        if (base + 3 < 23) outBytes[base + 3] = w & 0xff;
    }

    const computedTail = bcryptBase64Encode(outBytes).slice(0, 31);
    const costStr = String(cost).padStart(2, '0');
    return `$2y$${costStr}$${saltStr}${computedTail}`;
}

/**
 * Encripta un texto sensible en el cliente o mediante función RPC de Supabase (`encrypt_data`).
 * @param {string} plainText Texto legible a proteger.
 * @param {object|null} supabaseClient Instancia opcional de Supabase.
 * @returns {Promise<string>}
 */
export async function encryptData(plainText, supabaseClient = null) {
    if (plainText === null || plainText === undefined || plainText === '') {
        return '';
    }
    const text = String(plainText);

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.rpc('encrypt_data', {
                p_plain_text: text
            });
            if (!error && data) {
                return data;
            }
        } catch {
            // Respaldo local simétrico si la función RPC aún no ha sido ejecutada
        }
    }

    return encryptLocalSymmetric(text, APP_DATA_KEY);
}

/**
 * Desencripta un texto cifrado para mostrarlo legible en la interfaz de usuario.
 * @param {string} cipherText Texto cifrado almacenado en la base de datos.
 * @param {object|null} supabaseClient Instancia opcional de Supabase.
 * @returns {Promise<string>}
 */
export async function decryptData(cipherText, supabaseClient = null) {
    if (cipherText === null || cipherText === undefined || cipherText === '') {
        return '';
    }
    const text = String(cipherText);

    if (supabaseClient && !text.startsWith('ENCv1:')) {
        try {
            const { data, error } = await supabaseClient.rpc('decrypt_data', {
                p_cipher_text: text
            });
            if (!error && data && data !== '[DATO PROTEGIDO]') {
                return data;
            }
        } catch {
            // Continuar con desencriptación simétrica local
        }
    }

    return decryptLocalSymmetric(text, APP_DATA_KEY);
}

/**
 * Cifrado simétrico local (UTF-8 + XOR + Base64).
 * @param {string} plainText
 * @param {string} secretKey
 * @returns {string}
 */
export function encryptLocalSymmetric(plainText, secretKey = APP_DATA_KEY) {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(String(plainText));
    const keyBytes = encoder.encode(secretKey);
    const result = new Uint8Array(dataBytes.length);

    for (let i = 0; i < dataBytes.length; i++) {
        result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }

    let binary = '';
    for (let i = 0; i < result.length; i++) {
        binary += String.fromCharCode(result[i]);
    }
    return `ENCv1:${btoa(binary)}`;
}

/**
 * Descifrado simétrico local para presentar datos legibles en la UI.
 * @param {string} cipherText
 * @param {string} secretKey
 * @returns {string}
 */
export function decryptLocalSymmetric(cipherText, secretKey = APP_DATA_KEY) {
    if (!cipherText || typeof cipherText !== 'string') return '';
    if (!cipherText.startsWith('ENCv1:')) return cipherText;

    try {
        const b64Payload = cipherText.slice(6);
        const binary = atob(b64Payload);
        const cipherBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            cipherBytes[i] = binary.charCodeAt(i);
        }

        const encoder = new TextEncoder();
        const keyBytes = encoder.encode(secretKey);
        const plainBytes = new Uint8Array(cipherBytes.length);

        for (let i = 0; i < cipherBytes.length; i++) {
            plainBytes[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
        }

        const decoder = new TextDecoder();
        return decoder.decode(plainBytes);
    } catch {
        return '[Error de lectura]';
    }
}

/**
 * Verifica si la clave ingresada por el usuario coincide con la clave encriptada
 * almacenada en la columna `clave` de la tabla `usuarios`.
 * @param {string} plainPassword Clave ingresada en el formulario.
 * @param {string} storedEncryptedKey Clave encriptada proveniente de `usuarios.clave`.
 * @param {object|null} supabaseClient Cliente Supabase opcional.
 * @returns {Promise<boolean>}
 */
export async function verifyEncryptedPassword(plainPassword, storedEncryptedKey, supabaseClient = null) {
    if (!plainPassword || !storedEncryptedKey) return false;

    const cleanEncrypted = String(storedEncryptedKey).trim();
    const cleanInput = String(plainPassword);

    // 1. Si está encriptada con formato Blowfish / Bcrypt ($2y$, $2a$, $2b$)
    if (cleanEncrypted.startsWith('$2y$') || cleanEncrypted.startsWith('$2a$') || cleanEncrypted.startsWith('$2b$')) {
        return verifyBcryptHash(cleanInput, cleanEncrypted);
    }

    // 2. Si está encriptada con la capa simétrica (ENCv1 o pgcrypto decrypt_data)
    const decrypted = await decryptData(cleanEncrypted, supabaseClient);
    return decrypted === cleanInput;
}
