/**
 * @file js/utils/csvUtils.js
 * @description Utilidades de parseo, formateo y descarga de archivos CSV (plantilla, movimientos, saldos y PDF).
 */

/**
 * Escapa y envuelve en comillas una celda CSV usando `;` como delimitador estándar Excel ES.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Descarga contenido textual como archivo CSV con BOM UTF-8.
 * @param {string} filename
 * @param {Array<string>} headers
 * @param {Array<Array<string|number>>} rows
 * @param {boolean} [quoteAll=true]
 */
export function downloadCsvFile(filename, headers, rows, quoteAll = true) {
    const serializeRow = (cols) =>
        cols
            .map((col) => (quoteAll ? escapeCsvCell(col) : String(col ?? '')))
            .join(';');

    const lines = [serializeRow(headers), ...rows.map(serializeRow)];
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Valida y convierte una fecha en formato `DD/MM/YYYY` a formato ISO `YYYY-MM-DD`.
 * @param {string} rawDate
 * @returns {{ valid: boolean, isoDate?: string }}
 */
export function parseDdMmYyyyToIso(rawDate) {
    const clean = String(rawDate || '').trim();
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean);
    if (!match) {
        return { valid: false };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
        return { valid: false };
    }

    const testDate = new Date(year, month - 1, day);
    if (
        testDate.getFullYear() !== year ||
        testDate.getMonth() !== month - 1 ||
        testDate.getDate() !== day
    ) {
        return { valid: false };
    }

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { valid: true, isoDate };
}

/**
 * Divide una línea CSV respetando comillas y el delimitador detectado (`;` o `,`).
 * @param {string} line
 * @param {string} delimiter
 * @returns {Array<string>}
 */
export function splitCsvLine(line, delimiter) {
    const cols = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            cols.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    cols.push(current.trim());
    return cols;
}

/**
 * Convierte un valor numérico de una celda CSV soportando formatos con o sin
 * separadores de miles (`1.500,00`, `1,500.00`, `1500,50`, `1500.50`).
 * @param {string|number} rawVal
 * @returns {number}
 */
export function parseCsvNumericAmount(rawVal) {
    let str = String(rawVal ?? '0').trim().replace(/\s+/g, '');
    if (!str) return 0;

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else if (lastComma > -1) {
        const commaCount = (str.match(/,/g) || []).length;
        str = commaCount > 1 ? str.replace(/,/g, '') : str.replace(',', '.');
    }

    const parsed = parseFloat(str);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Descarga la plantilla CSV oficial para importar movimientos a `public.movimientos`.
 * @param {Array<object>} bancos
 * @param {Array<object>} cuentas
 */
export function downloadPlantillaMovimientosCsv(bancos = [], cuentas = []) {
    const sampleBanco = bancos[0]?.nombre_legible || 'Banesco';
    const sampleCuenta = cuentas[0]?.cuenta_legible || '0134-0001-00-1234567890';
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const todayDdMmYyyy = `${dd}/${mm}/${yyyy}`;

    const headers = [
        'banco (Nombre del Banco)',
        'cuenta (Nro de Cuenta o vacio para saldo directo a banco)',
        'fecha (DD/MM/YYYY)',
        'moneda (VES/USD/EUR/USDT/BNB/BTC/YEN)',
        'empresa',
        'referencia',
        'descripcion',
        'tipo',
        'debe',
        'haber'
    ];

    const exampleRows = [
        [
            sampleBanco,
            sampleCuenta,
            todayDdMmYyyy,
            'VES',
            'Empresa Principal C.A.',
            'REF-1001',
            'Deposito o transferencia en cuenta',
            'Crédito',
            '0.00',
            '1500.00'
        ],
        [
            sampleBanco,
            '',
            todayDdMmYyyy,
            'VES',
            'Empresa Principal C.A.',
            'SALDO-DIR-01',
            'Carga de saldo directo a banco sin numero de cuenta',
            'Saldo Directo',
            '0.00',
            '5000.00'
        ]
    ];

    downloadCsvFile('plantilla_movimientos_banco.csv', headers, exampleRows, false);
}
