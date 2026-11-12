/**
 * @file js/core/state.js
 * @description Estado centralizado en memoria sincronizado con Supabase y helpers de resolución/selects.
 */

export const appState = {
    bancos: [],
    cuentas: [],
    saldosBanco: [],
    movimientos: [],
    vistaResumenSaldos: [],
    vistaActivaEnDb: false,
    usuarios: [],
    pdfPreviewRows: [],
    currentUser: null,
    activeModule: 'dashboard',

    tableStates: {
        bancos: { sortField: 'id', sortAsc: true, page: 1, pageSize: 10, search: '' },
        cuentas: { sortField: 'id', sortAsc: true, page: 1, pageSize: 10, search: '', bancoId: '' },
        saldosConsolidados: { sortField: 'banco_nombre', sortAsc: true, page: 1, pageSize: 10, search: '', bancoId: '', fecha: '' },
        saldosBanco: { sortField: 'fecha', sortAsc: false, page: 1, pageSize: 10, search: '', bancoId: '' },
        movimientos: { sortField: 'fecha', sortAsc: false, page: 1, pageSize: 15, search: '', bancoId: '', cuentaId: '', moneda: '', desde: '', hasta: '' },
        exportSaldos: { sortField: 'fecha', sortAsc: false, page: 1, pageSize: 10, search: '', bancoId: '', moneda: '', desde: '', hasta: '' },
        dashSaldos: { sortField: 'fecha', sortAsc: false, page: 1, pageSize: 10, search: '' },
        dashMovimientos: { sortField: 'id', sortAsc: false, page: 1, pageSize: 10, search: '' },
        dashGlobalFilters: { bancoId: '', moneda: '', desde: '', hasta: '' },
        usuarios: { sortField: 'id', sortAsc: true, page: 1, pageSize: 10, search: '' }
    }
};

/**
 * Busca el nombre legible de un banco por su ID.
 * @param {number|string|null} bancoId
 * @returns {string}
 */
export function getBancoNameById(bancoId) {
    const found = appState.bancos.find((b) => Number(b.id) === Number(bancoId));
    return found ? found.nombre_legible : `Banco ID #${bancoId ?? '-'}`;
}

/**
 * Busca el número legible de una cuenta por su ID.
 * @param {number|string|null} cuentaId
 * @returns {string}
 */
export function getCuentaNameById(cuentaId) {
    if (!cuentaId) return 'Directo a Banco (Sin cuenta)';
    const found = appState.cuentas.find((c) => Number(c.id) === Number(cuentaId));
    return found ? found.cuenta_legible : `Cta #${cuentaId}`;
}

/**
 * Rellena un `<select>` con el catálogo de bancos preservando el valor actual si existe.
 * @param {string} selectId
 * @param {string} placeholder
 * @param {boolean} [includeDescription=true]
 */
export function populateBancoSelectById(selectId, placeholder = 'Seleccione banco...', includeDescription = true) {
    const el = document.getElementById(selectId);
    if (!el) return;

    const currentVal = el.value;
    el.innerHTML = `<option value="">${placeholder}</option>`;
    appState.bancos.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = String(b.id);
        opt.textContent =
            includeDescription && b.descripcion_legible
                ? `${b.nombre_legible} - ${b.descripcion_legible}`
                : b.nombre_legible;
        el.appendChild(opt);
    });
    if (currentVal) el.value = currentVal;
}

/**
 * Rellena un `<select>` con las cuentas filtradas opcionalmente por banco.
 * @param {string} selectId
 * @param {string|number} [filterBancoId='']
 * @param {string} [placeholder='-- Directo a Banco (Sin cuenta) --']
 */
export function populateCuentaSelectById(
    selectId,
    filterBancoId = '',
    placeholder = '-- Directo a Banco (Sin cuenta) --'
) {
    const el = document.getElementById(selectId);
    if (!el) return;

    const currentVal = el.value;
    el.innerHTML = `<option value="">${placeholder}</option>`;

    const list = filterBancoId
        ? appState.cuentas.filter((c) => Number(c.banco_id) === Number(filterBancoId))
        : appState.cuentas;

    list.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = `${c.cuenta_legible} (${c.banco_nombre || getBancoNameById(c.banco_id)})`;
        el.appendChild(opt);
    });

    if (currentVal) el.value = currentVal;
}

/**
 * Actualiza todos los `<select>` de bancos y cuentas en las distintas pantallas.
 */
export function refreshAllEntitySelects() {
    const bancoSelectMappings = [
        ['dashFilterBanco', 'Todos los bancos', true],
        ['cuentaBancoId', 'Seleccione banco...', true],
        ['filterCuentasBancoId', 'Todos los bancos', false],
        ['saldoBancoId', 'Seleccione banco...', true],
        ['filterSaldosBancoId', 'Todos los bancos', false],
        ['filterSaldosManualBancoId', 'Todos los bancos', false],
        ['movBancoId', 'Seleccione banco...', true],
        ['filterMovBancoId', 'Todos los bancos', false],
        ['expFilterBanco', 'Todos los bancos', true],
        ['pdfTargetBancoId', '-- Auto (Detectar del PDF) --', false]
    ];

    bancoSelectMappings.forEach(([id, placeholder, withDesc]) => {
        populateBancoSelectById(id, placeholder, withDesc);
    });

    const movBancoVal = document.getElementById('movBancoId')?.value || '';
    const filterMovBancoVal = document.getElementById('filterMovBancoId')?.value || '';
    const pdfBancoVal = document.getElementById('pdfTargetBancoId')?.value || '';

    populateCuentaSelectById('movCuentaId', movBancoVal, '-- Directo a Banco (Sin cuenta) --');
    populateCuentaSelectById('filterMovCuentaId', filterMovBancoVal, 'Todas las cuentas');
    populateCuentaSelectById('pdfTargetCuentaId', pdfBancoVal, '-- Auto / Directo a Banco --');
}

