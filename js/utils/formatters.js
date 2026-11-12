/**
 * @file js/utils/formatters.js
 * @description Constantes de monedas, paleta Bootstrap 5, formateadores numéricos y alertas UI.
 */

export const SUPPORTED_CURRENCIES = ['VES', 'USD', 'EUR', 'USDT', 'BNB', 'BTC', 'YEN'];

export const CURRENCY_ICONS = {
    VES: 'bi-cash-stack',
    USD: 'bi-currency-dollar',
    EUR: 'bi-currency-euro',
    USDT: 'bi-coin',
    BNB: 'bi-hexagon-half',
    BTC: 'bi-currency-bitcoin',
    YEN: 'bi-currency-yen'
};

export const PIE_SLICE_PALETTE = [
    '#0d6efd', // Bootstrap Primary
    '#198754', // Bootstrap Success
    '#0dcaf0', // Bootstrap Info
    '#ffc107', // Bootstrap Warning
    '#fd7e14', // Bootstrap Orange
    '#6f42c1', // Bootstrap Indigo/Purple
    '#6c757d', // Bootstrap Secondary
    '#20c997'  // Bootstrap Teal
];

/**
 * Escapa caracteres HTML especiales para renderizado seguro en tablas e inputs.
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function escapeHtml(raw) {
    return String(raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Formatea un monto numérico respetando la precisión de la moneda
 * (hasta 8 decimales si existen fracciones para BTC/BNB, mínimo 2 decimales).
 * @param {number} amount
 * @param {string} [moneda='VES']
 * @returns {string}
 */
export function formatCurrencyAmount(amount, moneda = 'VES') {
    const num = Number(amount || 0);
    const mon = String(moneda || 'VES').toUpperCase();
    const isCryptoHighPrecision = mon === 'BTC' || mon === 'BNB';
    const hasSubCentDecimals = Math.abs(num * 100 - Math.round(num * 100)) > 1e-6;
    const maxDecimals = isCryptoHighPrecision && hasSubCentDecimals ? 8 : 2;
    return num.toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxDecimals
    });
}

let feedbackTimer = null;

/**
 * Muestra una alerta temporal en la barra global de notificaciones.
 * @param {string} message
 * @param {'success'|'danger'|'warning'|'info'} [type='success']
 */
export function showFeedback(message, type = 'success') {
    const alertEl = document.getElementById('globalFeedbackAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} py-2 small mb-3`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');

    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
        alertEl.classList.add('d-none');
    }, 4500);
}

/**
 * Muestra una alerta contextual en un contenedor específico por ID.
 * @param {string} elementId
 * @param {string} message
 * @param {'info'|'success'|'warning'|'danger'} [type='info']
 */
export function showScopedAlert(elementId, message, type = 'info') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.className = `alert alert-${type} py-2 small mb-3`;
    el.innerHTML = message;
    el.classList.remove('d-none');
}

/**
 * Oculta un contenedor de alerta por ID.
 * @param {string} elementId
 */
export function hideScopedAlert(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('d-none');
}

