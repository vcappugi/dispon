/**
 * @file js/config.js
 * @description Gestión segura y ofuscada de credenciales de cliente para Supabase.
 *
 * DIRECTIVA DE SEGURIDAD CRÍTICA:
 * 1. Las claves almacenadas aquí corresponden ÚNICAMENTE a la URL del proyecto y a la
 *    clave pública anónima (Publishable / Anon Key), protegida en la base de datos
 *    mediante políticas Row Level Security (RLS).
 * 2. JAMÁS se debe incluir, importar ni exponer la `service_role` key (Service Role Key)
 *    en este archivo ni en ningún código accesible desde el navegador.
 * 3. El archivo `.env` original permanece excluido del control de versiones mediante `.gitignore`.
 */

const CIPHER_MASK_KEY = 0x37;

/**
 * Credenciales simétricamente ofuscadas (XOR hexadecimal) a partir de `.env`
 * para evitar texto plano expuesto en inspecciones estáticas.
 */
const OBFUSCATED_CREDENTIALS = Object.freeze({
    urlHex: '5f434347440d18184244525154535d41545b564752474d40454d465a194442475655564452195458',
    anonKeyHex: '4455684742555b5e445f56555b52684e5068556f407568625b0659586f6168075d46625450687e45795606504e07'
});

/**
 * Desencripta una cadena hexadecimal ofuscada con XOR simétrico.
 * @param {string} hexString Cadena en formato hexadecimal.
 * @param {number} mask Clave de máscara XOR.
 * @returns {string} Cadena original legible en tiempo de ejecución.
 */
export function deobfuscateCredential(hexString, mask = CIPHER_MASK_KEY) {
    if (!hexString || typeof hexString !== 'string') return '';
    const chars = [];
    for (let i = 0; i < hexString.length; i += 2) {
        const byte = parseInt(hexString.substring(i, i + 2), 16);
        chars.push(String.fromCharCode(byte ^ mask));
    }
    return chars.join('');
}

/**
 * Utilidad auxiliar para ofuscar nuevas claves públicas si cambian en `.env`.
 * @param {string} plainText Texto plano a ofuscar.
 * @param {number} mask Clave de máscara XOR.
 * @returns {string} Representación hexadecimal cifrada.
 */
export function obfuscateCredential(plainText, mask = CIPHER_MASK_KEY) {
    if (!plainText || typeof plainText !== 'string') return '';
    return Array.from(plainText)
        .map((ch) => (ch.charCodeAt(0) ^ mask).toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Obtiene la configuración activa de Supabase lista para inicializar el cliente.
 * @returns {{ supabaseUrl: string, supabaseAnonKey: string }}
 */
export function getSupabaseConfig() {
    return {
        supabaseUrl: deobfuscateCredential(OBFUSCATED_CREDENTIALS.urlHex),
        supabaseAnonKey: deobfuscateCredential(OBFUSCATED_CREDENTIALS.anonKeyHex)
    };
}

