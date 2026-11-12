/**
 * @file js/app.js
 * @description Controlador principal de la aplicación:
 *              - Login contra `public.usuarios` con verificación de clave encriptada (`vcappugi` / `10838729`).
 *              - Panel lateral izquierdo desplegable de solo iconos (Dashboard, Ingresos/Edición, Exportación).
 *              - En la opción de Ingresos/Edición:
 *                * Parte superior: Botones de opción para activar los 3 Modales CRUD (`bancos`, `cuentas`, `saldos_banco`).
 *                * Parte inferior: Tabla completa de registros de `saldos_banco`.
 *              - En la opción de Exportación:
 *                * Modal CRUD y tabla paginada/ordenable de `movimientos` + vista previa de `saldos_banco`.
 *              - Todas las tablas cuentan con paginación, ordenamiento por cada campo y filtrado por
 *                nombre, número o código según aplique.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getSupabaseConfig } from './config.js';
import {
    verifyEncryptedPassword,
    encryptLocalSymmetric,
    decryptLocalSymmetric
} from './crypto-helper.js';

const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SESSION_STORAGE_KEY = 'disp_authenticated_user_v1';

const MODULE_TITLES = {
    dashboard: 'Dashboard',
    'estados-cuenta': 'Ingresos o Edición de Estados de Cuenta',
    exportacion: 'Exportación de Movimientos'
};

// Datos sincronizados con Supabase
let stateBancos = [];
let stateCuentas = [];
let stateSaldosBanco = [];
let stateMovimientos = [];
let stateVistaResumenSaldos = [];
let stateVistaActivaEnDb = false;
let stateUsuarios = [];

// Estado de ordenamiento, filtrado y paginación para cada tabla
const tableStates = {
    mainSaldos: { sortField: 'banco_nombre', sortAsc: true, page: 1, pageSize: 10, search: '', bancoId: '', fecha: '' },
    modalBancos: { sortField: 'id', sortAsc: true, page: 1, pageSize: 5, search: '' },
    modalCuentas: { sortField: 'id', sortAsc: true, page: 1, pageSize: 5, search: '' },
    modalSaldos: { sortField: 'id', sortAsc: false, page: 1, pageSize: 5, search: '' },
    dashSaldos: { sortField: 'fecha', sortAsc: false, page: 1, pageSize: 10, search: '' },
    dashMovimientos: { sortField: 'id', sortAsc: false, page: 1, pageSize: 10, search: '' },
    dashGlobalFilters: { bancoId: '', moneda: '', desde: '', hasta: '' },
    usuarios: { sortField: 'id', sortAsc: true, page: 1, pageSize: 5, search: '' },
    movimientos: { sortField: 'id', sortAsc: false, page: 1, pageSize: 10 },
    modalMovimientos: { sortField: 'id', sortAsc: false, page: 1, pageSize: 5, search: '' },
    exportSaldos: { sortField: 'fecha', sortAsc: false, page: 1, pageSize: 10, search: '', bancoId: '', moneda: '', desde: '', hasta: '' }
};

/**
 * Ordena un arreglo de objetos por el campo y dirección indicados.
 */
function sortRowsByField(rows, field, asc = true) {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
        const valA = a[field] ?? '';
        const valB = b[field] ?? '';

        const numA = Number(valA);
        const numB = Number(valB);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && valA !== '' && valB !== '') {
            return (numA - numB) * dir;
        }

        return String(valA).localeCompare(String(valB), 'es', { numeric: true, sensitivity: 'base' }) * dir;
    });
}

/**
 * Filtra un arreglo verificando si alguno de los campos indicados contiene el término buscado.
 */
function filterRowsBySearch(rows, query, fields) {
    const cleanQuery = String(query || '').trim().toLowerCase();
    if (!cleanQuery) return rows;

    return rows.filter((row) =>
        fields.some((f) => String(row[f] ?? '').toLowerCase().includes(cleanQuery))
    );
}

/**
 * Pagina un arreglo y renderiza los controles de paginación.
 */
function paginateAndRenderControls(rows, tblState, containerId, onPageChange) {
    const total = rows.length;
    const pageSize = Number(tblState.pageSize) || 10;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (tblState.page > totalPages) tblState.page = totalPages;
    if (tblState.page < 1) tblState.page = 1;

    const startIdx = (tblState.page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageRows = rows.slice(startIdx, endIdx);

    const container = document.getElementById(containerId);
    if (container) {
        const infoText =
            total === 0
                ? 'Mostrando 0 de 0 registros'
                : `Mostrando ${startIdx + 1} - ${endIdx} de ${total} registros`;

        let pagesHtml = '';
        const maxButtons = 5;
        let startPage = Math.max(1, tblState.page - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage + 1 < maxButtons) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        pagesHtml += `
            <li class="page-item ${tblState.page <= 1 ? 'disabled' : ''}">
                <button type="button" class="page-link" data-page="${tblState.page - 1}">&laquo;</button>
            </li>
        `;

        for (let p = startPage; p <= endPage; p++) {
            pagesHtml += `
                <li class="page-item ${p === tblState.page ? 'active' : ''}">
                    <button type="button" class="page-link" data-page="${p}">${p}</button>
                </li>
            `;
        }

        pagesHtml += `
            <li class="page-item ${tblState.page >= totalPages ? 'disabled' : ''}">
                <button type="button" class="page-link" data-page="${tblState.page + 1}">&raquo;</button>
            </li>
        `;

        container.innerHTML = `
            <span class="small text-secondary fw-semibold">${infoText}</span>
            <nav aria-label="Paginación">
                <ul class="pagination pagination-sm pagination-institutional mb-0">
                    ${pagesHtml}
                </ul>
            </nav>
        `;

        container.querySelectorAll('button[data-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetPage = Number(btn.getAttribute('data-page'));
                if (targetPage >= 1 && targetPage <= totalPages && targetPage !== tblState.page) {
                    tblState.page = targetPage;
                    onPageChange();
                }
            });
        });
    }

    return pageRows;
}

/**
 * Actualiza los indicadores visuales de ordenamiento en un `<thead>`.
 */
function updateSortIndicators(theadId, tblState) {
    const thead = document.getElementById(theadId);
    if (!thead) return;

    thead.querySelectorAll('th.sortable-th').forEach((th) => {
        const field = th.getAttribute('data-sort');
        const indicator = th.querySelector('.sort-indicator');
        if (!indicator) return;

        if (field === tblState.sortField) {
            indicator.innerHTML = tblState.sortAsc
                ? '<i class="bi bi-caret-up-fill"></i>'
                : '<i class="bi bi-caret-down-fill"></i>';
        } else {
            indicator.innerHTML = '<i class="bi bi-arrow-down-up opacity-50"></i>';
        }
    });
}

/**
 * Vincula eventos de clic para ordenar columnas en un `<thead>`.
 */
function bindSortableHeaders(theadId, tblState, renderFn) {
    const thead = document.getElementById(theadId);
    if (!thead) return;

    thead.querySelectorAll('th.sortable-th').forEach((th) => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            if (!field) return;

            if (tblState.sortField === field) {
                tblState.sortAsc = !tblState.sortAsc;
            } else {
                tblState.sortField = field;
                tblState.sortAsc = true;
            }
            tblState.page = 1;
            renderFn();
        });
    });
}

function showLoginAlert(message, type = 'danger') {
    const alertEl = document.getElementById('loginAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} py-2 small mb-3`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');
}

function hideLoginAlert() {
    const alertEl = document.getElementById('loginAlert');
    if (alertEl) alertEl.classList.add('d-none');
}

function showFeedback(message, type = 'success') {
    const alertEl = document.getElementById('globalFeedbackAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} py-2 small mb-3`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');
    setTimeout(() => {
        alertEl.classList.add('d-none');
    }, 4500);
}

async function authenticateUser(username, plainPassword) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(plainPassword || '');

    if (!cleanUser || !cleanPass) {
        return { ok: false, message: 'Por favor ingrese usuario y clave.' };
    }

    const { data: users, error } = await supabase
        .from('usuarios')
        .select('id, nombre, clave, rol, created_at')
        .ilike('nombre', cleanUser)
        .limit(1);

    if (error) {
        return {
            ok: false,
            message: `Error al consultar la tabla <code>usuarios</code>: ${error.message}`
        };
    }

    if (!users || users.length === 0) {
        return {
            ok: false,
            message: `El usuario <strong>${cleanUser}</strong> no existe en la tabla <code>usuarios</code>.`
        };
    }

    const userRow = users[0];
    const isPasswordValid = await verifyEncryptedPassword(cleanPass, userRow.clave, supabase);

    if (!isPasswordValid) {
        return {
            ok: false,
            message: 'La clave ingresada no coincide con la clave encriptada almacenada en la base de datos.'
        };
    }

    const sessionUser = {
        id: userRow.id,
        nombre: userRow.nombre,
        rol: userRow.rol || 'usuario',
        created_at: userRow.created_at
    };

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    return { ok: true, user: sessionUser };
}

function updateAuthView(user) {
    const loginSection = document.getElementById('loginSection');
    const appWorkspace = document.getElementById('appWorkspace');

    if (user) {
        loginSection?.classList.add('d-none');
        appWorkspace?.classList.remove('d-none');

        const nameEl = document.getElementById('activeUserName');
        const roleEl = document.getElementById('activeUserRole');
        const dashUserCard = document.getElementById('dashUserCard');

        if (nameEl) nameEl.textContent = user.nombre;
        if (roleEl) roleEl.textContent = user.rol;
        if (dashUserCard) dashUserCard.textContent = `${user.nombre} (${user.rol})`;

        refreshAllDatabaseData();
    } else {
        appWorkspace?.classList.add('d-none');
        loginSection?.classList.remove('d-none');
        const inputUsuario = document.getElementById('inputUsuario');
        const inputClave = document.getElementById('inputClave');
        if (inputUsuario) inputUsuario.value = '';
        if (inputClave) inputClave.value = '';
    }
}

async function refreshAllDatabaseData() {
    await Promise.all([
        loadBancosFromDb(),
        loadCuentasFromDb(),
        loadMovimientosFromDb(),
        loadVistaResumenSaldosFromDb(),
        loadUsuariosFromDb()
    ]);

    stateCuentas = stateCuentas.map((c) => ({
        ...c,
        banco_nombre: getBancoNameById(c.banco_id)
    }));

    stateMovimientos = stateMovimientos.map((m) => ({
        ...m,
        banco_nombre: getBancoNameById(m.banco_id),
        cuenta_numero: getCuentaNameById(m.cuenta_id),
        flujo_neto: Number(m.haber || 0) - Number(m.debe || 0) // Crédito menos Débito (banco)
    }));

    // Enriquecer o sincronizar la vista `public.vista_resumen_saldos_movimientos`
    if (stateVistaActivaEnDb && stateVistaResumenSaldos.length > 0) {
        stateVistaResumenSaldos = stateVistaResumenSaldos.map((v, idx) => ({
            ...v,
            id: Number(v.id || idx + 1),
            banco_nombre: v.banco_nombre_legible || getBancoNameById(v.banco_id),
            cuentas_asociadas: formatVistaCuentasEstructura(v.banco_id, v.movimientos_con_cuenta, v.movimientos_directo_banco)
        }));
    } else {
        stateVistaResumenSaldos = buildVistaResumenFromMovimientos(stateMovimientos);
    }

    populateBancoSelects();
    populateCuentaSelects();
    renderCrudBancosTable();
    renderCrudCuentasTable();
    renderMainSaldosTable();
    renderMovimientosTable();
    renderModalMovimientosTable();
    renderExportTable();
    renderDashboardSummary();
    renderDashboardMovimientosTable();
    renderUsuariosTable();
}

/**
 * Obtiene la totalidad de los registros de una tabla o vista de Supabase superando
 * el límite por defecto de 1000 filas por petición de PostgREST mediante paginación `.range()`.
 * @param {(from: number, to: number) => Promise<{ data: Array<any>, error: any }>} pageQueryFn
 * @param {number} [pageSize=1000]
 * @returns {Promise<{ data: Array<any>, error: any }>}
 */
async function fetchAllSupabaseRows(pageQueryFn, pageSize = 1000) {
    const allRows = [];
    let offset = 0;

    while (true) {
        const { data, error } = await pageQueryFn(offset, offset + pageSize - 1);
        if (error) {
            return { data: allRows, error };
        }
        if (!data || data.length === 0) {
            break;
        }
        allRows.push(...data);
        if (data.length < pageSize) {
            break;
        }
        offset += pageSize;
    }

    return { data: allRows, error: null };
}

async function loadBancosFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('bancos')
            .select('id, created_at, nombre, descripcion')
            .order('id', { ascending: true })
            .range(from, to)
    );

    if (error || !data) {
        stateBancos = [];
        return;
    }

    stateBancos = data.map((row) => ({
        ...row,
        nombre_legible: decryptLocalSymmetric(row.nombre || ''),
        descripcion_legible: decryptLocalSymmetric(row.descripcion || '')
    }));
}

async function loadCuentasFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('cuentas')
            .select('id, created_at, banco_id, cuenta, tipo')
            .order('id', { ascending: true })
            .range(from, to)
    );

    if (error || !data) {
        stateCuentas = [];
        return;
    }

    stateCuentas = data.map((row) => ({
        ...row,
        cuenta_legible: decryptLocalSymmetric(row.cuenta || ''),
        tipo_legible: decryptLocalSymmetric(row.tipo || '')
    }));
}

async function loadSaldosBancoFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('saldos_banco')
            .select('id, created_at, banco_id, fecha, monto, moneda')
            .order('fecha', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
    );

    if (error || !data) {
        stateSaldosBanco = [];
        return;
    }

    stateSaldosBanco = data.map((row) => ({
        ...row,
        monto: Number(row.monto || 0),
        moneda_legible: decryptLocalSymmetric(row.moneda || 'VES')
    }));
}

async function loadMovimientosFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('movimientos')
            .select('id, created_at, banco_id, cuenta_id, fecha, moneda, empresa, referencia, descripcion, tipo, debe, haber')
            .order('fecha', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
    );

    if (error || !data) {
        stateMovimientos = [];
        return;
    }

    stateMovimientos = data.map((row) => ({
        ...row,
        debe: Number(row.debe || 0),
        haber: Number(row.haber || 0),
        moneda_legible: decryptLocalSymmetric(row.moneda || 'VES'),
        empresa_legible: decryptLocalSymmetric(row.empresa || ''),
        referencia_legible: decryptLocalSymmetric(row.referencia || ''),
        descripcion_legible: decryptLocalSymmetric(row.descripcion || ''),
        tipo_legible: decryptLocalSymmetric(row.tipo || '')
    }));
}

/**
 * Consulta en Supabase la vista `public.vista_resumen_saldos_movimientos`
 * que totaliza por fecha (`fecha`), banco (`banco_id`) y moneda los saldos bancarios
 * e indicadores desde `public.movimientos` (ignorando `saldos_banco`).
 */
async function loadVistaResumenSaldosFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('vista_resumen_saldos_movimientos')
            .select('*')
            .order('id', { ascending: true })
            .range(from, to)
    );

    if (error || !data) {
        stateVistaActivaEnDb = false;
        stateVistaResumenSaldos = [];
        return;
    }

    stateVistaActivaEnDb = true;
    stateVistaResumenSaldos = data.map((row, idx) => ({
        ...row,
        id: Number(row.id || idx + 1),
        banco_id: row.banco_id,
        banco_nombre_legible: row.banco_nombre ? decryptLocalSymmetric(row.banco_nombre) : '',
        banco_descripcion_legible: row.banco_descripcion ? decryptLocalSymmetric(row.banco_descripcion) : '',
        fecha: row.fecha || row.ultima_fecha || null,
        moneda_legible: decryptLocalSymmetric(row.moneda || 'VES').toUpperCase() || 'VES',
        total_movimientos: Number(row.total_movimientos || 0),
        movimientos_con_cuenta: Number(row.movimientos_con_cuenta || 0),
        movimientos_directo_banco: Number(row.movimientos_directo_banco || 0),
        total_cuentas_movidas: Number(row.total_cuentas_movidas || 0),
        total_debe: Number(row.total_debe || 0),
        total_haber: Number(row.total_haber || 0),
        saldo_disponible: Number(row.total_haber || 0) - Number(row.total_debe || 0), // Crédito menos Débito (banco)
        primera_fecha: row.primera_fecha || row.fecha || null,
        ultima_fecha: row.ultima_fecha || row.fecha || null
    }));
}

function formatVistaCuentasEstructura(bancoId, movsConCuenta, movsDirecto) {
    const ctasList = stateCuentas
        .filter((c) => Number(c.banco_id) === Number(bancoId))
        .map((c) => c.cuenta_legible)
        .join(', ');
    const baseCtas = ctasList ? `Ctas: ${ctasList}` : 'Sin cuenta asociada';
    return `${baseCtas} (${movsConCuenta} en cta / ${movsDirecto} directos)`;
}

/**
 * Construye exactamente la estructura de `public.vista_resumen_saldos_movimientos`
 * totalizando por fecha (`fecha`), banco (`banco_id`) y moneda a partir de `public.movimientos`
 * (ignorando `saldos_banco`).
 */
function buildVistaResumenFromMovimientos(movimientosSource) {
    const groups = new Map();

    movimientosSource.forEach((m) => {
        const bId = m.banco_id ?? 0;
        const fechaKey = m.fecha || '';
        const mon = (m.moneda_legible || 'VES').toUpperCase();
        const key = `${fechaKey}__${bId}__${mon}`;

        if (!groups.has(key)) {
            groups.set(key, {
                banco_id: m.banco_id,
                banco_nombre: m.banco_nombre || getBancoNameById(m.banco_id),
                fecha: m.fecha || null,
                moneda_legible: mon,
                total_movimientos: 0,
                movimientos_con_cuenta: 0,
                movimientos_directo_banco: 0,
                cuentasSet: new Set(),
                total_debe: 0,
                total_haber: 0,
                saldo_disponible: 0,
                primera_fecha: m.fecha || null,
                ultima_fecha: m.fecha || null
            });
        }

        const item = groups.get(key);
        const debeVal = Number(m.debe || 0);
        const haberVal = Number(m.haber || 0);

        item.total_movimientos += 1;
        if (m.cuenta_id) {
            item.movimientos_con_cuenta += 1;
            item.cuentasSet.add(m.cuenta_id);
        } else {
            item.movimientos_directo_banco += 1;
        }
        item.total_debe += debeVal;
        item.total_haber += haberVal;
        item.saldo_disponible += haberVal - debeVal; // Crédito menos Débito (banco)
    });

    const sortedEntries = [...groups.values()].sort((a, b) => {
        const dateCmp = String(b.fecha || '').localeCompare(String(a.fecha || ''));
        if (dateCmp !== 0) return dateCmp;
        const diffBanco = Number(a.banco_id || 0) - Number(b.banco_id || 0);
        if (diffBanco !== 0) return diffBanco;
        return String(a.moneda_legible).localeCompare(String(b.moneda_legible));
    });

    return sortedEntries.map((row, index) => ({
        id: index + 1,
        banco_id: row.banco_id,
        banco_nombre: row.banco_nombre,
        fecha: row.fecha,
        moneda_legible: row.moneda_legible,
        total_movimientos: row.total_movimientos,
        movimientos_con_cuenta: row.movimientos_con_cuenta,
        movimientos_directo_banco: row.movimientos_directo_banco,
        total_cuentas_movidas: row.cuentasSet.size,
        total_debe: Number(row.total_debe.toFixed(2)),
        total_haber: Number(row.total_haber.toFixed(2)),
        saldo_disponible: Number(row.saldo_disponible.toFixed(2)),
        primera_fecha: row.primera_fecha,
        ultima_fecha: row.ultima_fecha,
        cuentas_asociadas: formatVistaCuentasEstructura(
            row.banco_id,
            row.movimientos_con_cuenta,
            row.movimientos_directo_banco
        )
    }));
}

async function loadUsuariosFromDb() {
    const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, clave, rol, created_at')
        .order('id', { ascending: true });

    stateUsuarios = !error && data ? data : [];
}

function getBancoNameById(bancoId) {
    const found = stateBancos.find((b) => Number(b.id) === Number(bancoId));
    return found ? found.nombre_legible : `Banco ID #${bancoId ?? '-'}`;
}

function getCuentaNameById(cuentaId) {
    if (!cuentaId) return 'Directo a Banco (Sin cuenta)';
    const found = stateCuentas.find((c) => Number(c.id) === Number(cuentaId));
    return found ? found.cuenta_legible : `Cta #${cuentaId}`;
}

function populateBancoSelects() {
    const formSelects = [
        { el: document.getElementById('cuentaBancoId'), placeholder: 'Seleccione banco...' },
        { el: document.getElementById('saldoBancoId'), placeholder: 'Seleccione banco...' },
        { el: document.getElementById('movBancoId'), placeholder: 'Seleccione banco...' },
        { el: document.getElementById('filterSaldosBancoId'), placeholder: 'Todos los bancos...' },
        { el: document.getElementById('expFilterBanco'), placeholder: 'Todos los bancos' },
        { el: document.getElementById('dashFilterBanco'), placeholder: 'Todos los bancos' }
    ];

    formSelects.forEach(({ el, placeholder }) => {
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = `<option value="">${placeholder}</option>`;
        stateBancos.forEach((b) => {
            const opt = document.createElement('option');
            opt.value = String(b.id);
            opt.textContent = `${b.nombre_legible}${b.descripcion_legible ? ' - ' + b.descripcion_legible : ''}`;
            el.appendChild(opt);
        });
        if (currentVal) el.value = currentVal;
    });
}

function populateCuentaSelects(filterBancoId = '') {
    const movCuentaSel = document.getElementById('movCuentaId');
    if (!movCuentaSel) return;

    const currentVal = movCuentaSel.value;
    movCuentaSel.innerHTML = '<option value="">-- Directo a Banco (Sin cuenta) --</option>';

    const list = filterBancoId
        ? stateCuentas.filter((c) => Number(c.banco_id) === Number(filterBancoId))
        : stateCuentas;

    list.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = `${c.cuenta_legible} (${c.banco_nombre})`;
        movCuentaSel.appendChild(opt);
    });

    if (currentVal) movCuentaSel.value = currentVal;
}

/**
 * 1. Renderiza la tabla paginada, ordenable y filtrable del Modal CRUD `bancos`.
 */
function renderCrudBancosTable() {
    const tbody = document.getElementById('crudBancosTableBody');
    if (!tbody) return;

    const st = tableStates.modalBancos;
    updateSortIndicators('theadModalBancos', st);

    const filtered = filterRowsBySearch(stateBancos, st.search, [
        'id',
        'nombre_legible',
        'descripcion_legible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationModalBancos',
        renderCrudBancosTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted small py-3">No se encontraron bancos que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((b) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código (ID)" class="fw-bold">#${b.id}</td>
            <td data-label="Nombre" class="fw-semibold">${b.nombre_legible}</td>
            <td data-label="Descripción" class="small">${b.descripcion_legible || '-'}</td>
            <td data-label="Acciones">
                <div class="d-inline-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-banco" data-id="${b.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-banco" data-id="${b.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-banco').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const item = stateBancos.find((x) => Number(x.id) === id);
            if (!item) return;
            document.getElementById('bancoId').value = String(item.id);
            document.getElementById('bancoNombre').value = item.nombre_legible;
            document.getElementById('bancoDescripcion').value = item.descripcion_legible;
            const badge = document.getElementById('badgeModeBanco');
            if (badge) {
                badge.textContent = `Editando #${item.id}`;
                badge.className = 'badge badge-status-alert';
            }
        });
    });

    tbody.querySelectorAll('.btn-del-banco').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar el banco ID #${id}?`)) return;
            const { error } = await supabase.from('bancos').delete().eq('id', id);
            if (error) {
                showFeedback(`Error al eliminar banco: ${error.message}`, 'danger');
            } else {
                showFeedback(`Banco #${id} eliminado correctamente.`, 'warning');
                await refreshAllDatabaseData();
            }
        });
    });
}

/**
 * 2. Renderiza la tabla paginada, ordenable y filtrable del Modal CRUD `cuentas`.
 */
function renderCrudCuentasTable() {
    const tbody = document.getElementById('crudCuentasTableBody');
    if (!tbody) return;

    const st = tableStates.modalCuentas;
    updateSortIndicators('theadModalCuentas', st);

    const filtered = filterRowsBySearch(stateCuentas, st.search, [
        'id',
        'banco_nombre',
        'cuenta_legible',
        'tipo_legible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationModalCuentas',
        renderCrudCuentasTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted small py-3">No se encontraron cuentas que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((c) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código (ID)" class="fw-bold">#${c.id}</td>
            <td data-label="Banco" class="small fw-semibold">${c.banco_nombre}</td>
            <td data-label="Número de Cuenta" class="small">${c.cuenta_legible}</td>
            <td data-label="Tipo"><span class="badge badge-status-active">${c.tipo_legible}</span></td>
            <td data-label="Acciones">
                <div class="d-inline-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-cuenta" data-id="${c.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-cuenta" data-id="${c.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-cuenta').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const item = stateCuentas.find((x) => Number(x.id) === id);
            if (!item) return;
            document.getElementById('cuentaId').value = String(item.id);
            document.getElementById('cuentaBancoId').value = String(item.banco_id || '');
            document.getElementById('cuentaNumero').value = item.cuenta_legible;
            document.getElementById('cuentaTipo').value = item.tipo_legible || 'Corriente';
            const badge = document.getElementById('badgeModeCuenta');
            if (badge) {
                badge.textContent = `Editando #${item.id}`;
                badge.className = 'badge badge-status-alert';
            }
        });
    });

    tbody.querySelectorAll('.btn-del-cuenta').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar la cuenta ID #${id}?`)) return;
            const { error } = await supabase.from('cuentas').delete().eq('id', id);
            if (error) {
                showFeedback(`Error al eliminar cuenta: ${error.message}`, 'danger');
            } else {
                showFeedback(`Cuenta #${id} eliminada correctamente.`, 'warning');
                await refreshAllDatabaseData();
            }
        });
    });
}

function loadSaldoIntoModalForm(id, openModal = false) {
    const item = stateSaldosBanco.find((x) => Number(x.id) === Number(id));
    if (!item) return;

    document.getElementById('saldoId').value = String(item.id);
    document.getElementById('saldoBancoId').value = String(item.banco_id || '');
    document.getElementById('saldoFecha').value = item.fecha || '';
    document.getElementById('saldoMoneda').value = item.moneda_legible || 'VES';
    document.getElementById('saldoMonto').value = item.monto ?? 0;

    const badge = document.getElementById('badgeModeSaldo');
    if (badge) {
        badge.textContent = `Editando Saldo #${item.id}`;
        badge.className = 'badge badge-status-alert';
    }

    if (openModal) {
        const modalEl = document.getElementById('modalCrudSaldosBanco');
        if (modalEl && window.bootstrap) {
            window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }
}

/**
 * 3. Renderiza la tabla paginada, ordenable y filtrable dentro del Modal CRUD `saldos_banco`.
 */
function renderModalSaldosTable() {
    const tbody = document.getElementById('modalSaldosTableBody');
    if (!tbody) return;

    const st = tableStates.modalSaldos;
    updateSortIndicators('theadModalSaldos', st);

    const filtered = filterRowsBySearch(stateSaldosBanco, st.search, [
        'id',
        'banco_nombre',
        'fecha',
        'moneda_legible',
        'monto'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationModalSaldos',
        renderModalSaldosTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted small py-3">Sin registros en <code>saldos_banco</code>.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((s) => {
        const montoFmt = Number(s.monto || 0).toLocaleString('es-VE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código (ID)" class="fw-bold">#${s.id}</td>
            <td data-label="Banco" class="fw-semibold">${s.banco_nombre}</td>
            <td data-label="Fecha">${s.fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${s.moneda_legible}</span></td>
            <td data-label="Monto" class="fw-bold">${montoFmt}</td>
            <td data-label="Acciones">
                <div class="d-inline-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-modal-saldo" data-id="${s.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-modal-saldo" data-id="${s.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-modal-saldo').forEach((btn) => {
        btn.addEventListener('click', () => {
            loadSaldoIntoModalForm(Number(btn.getAttribute('data-id')), false);
        });
    });

    tbody.querySelectorAll('.btn-del-modal-saldo').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar el registro de saldo ID #${id}?`)) return;
            const { error } = await supabase.from('saldos_banco').delete().eq('id', id);
            if (!error) {
                showFeedback(`Saldo #${id} eliminado.`, 'warning');
                await refreshAllDatabaseData();
            }
        });
    });
}

/**
 * 4. Renderiza la tabla principal en la opción "Ingresos o Edición de Estados de Cuenta"
 *    directamente desde la vista `public.vista_resumen_saldos_movimientos`,
 *    sumando por Banco y por Moneda (sin columna de fecha en la tabla) y aplicando
 *    el filtro de fecha como corte acumulado "hasta esa fecha" (`<= fecha`).
 */
function renderMainSaldosTable() {
    const saldosBody = document.getElementById('saldosBancoTableBody');
    if (!saldosBody) return;

    const st = tableStates.mainSaldos;
    updateSortIndicators('theadMainSaldos', st);

    const corteBadge = document.getElementById('badgeMainSaldosCorte');
    if (corteBadge) {
        corteBadge.textContent = st.fecha
            ? `Total acumulado hasta: ${st.fecha}`
            : 'Totalizado por Banco y Moneda (Acumulado General)';
    }

    let sourceRows = stateVistaResumenSaldos;
    if (st.bancoId) {
        sourceRows = sourceRows.filter((v) => Number(v.banco_id) === Number(st.bancoId));
    }
    if (st.fecha) {
        sourceRows = sourceRows.filter((v) => {
            const rowFecha = v.fecha || v.ultima_fecha || '';
            return rowFecha && rowFecha <= st.fecha;
        });
    }

    // Agrupar y sumar por Banco + Moneda (sin desglosar por fecha en las filas)
    const groupedMap = new Map();
    sourceRows.forEach((v) => {
        const bancoId = Number(v.banco_id || 0);
        const mon = String(v.moneda_legible || 'VES').toUpperCase();
        const key = `${bancoId}__${mon}`;

        const current = groupedMap.get(key) || {
            id: bancoId || groupedMap.size + 1,
            banco_id: bancoId,
            banco_nombre: v.banco_nombre || `Banco #${bancoId}`,
            moneda_legible: mon,
            total_movimientos: 0,
            total_debe: 0,
            total_haber: 0,
            saldo_disponible: 0
        };

        current.total_movimientos += Number(v.total_movimientos || 0);
        current.total_debe += Number(v.total_debe || 0);
        current.total_haber += Number(v.total_haber || 0);
        current.saldo_disponible += Number(v.saldo_disponible || 0);
        groupedMap.set(key, current);
    });

    const groupedRows = [...groupedMap.values()].map((item, idx) => ({
        ...item,
        id: idx + 1
    }));

    const filtered = filterRowsBySearch(groupedRows, st.search, [
        'id',
        'banco_nombre',
        'moneda_legible',
        'total_movimientos',
        'total_debe',
        'total_haber',
        'saldo_disponible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationMainSaldos',
        renderMainSaldosTable
    );

    if (pageRows.length === 0) {
        saldosBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Sin saldos totalizados por banco y moneda en <code>public.vista_resumen_saldos_movimientos</code>${st.fecha ? ` hasta la fecha ${st.fecha}` : ''} que coincidan con la búsqueda.</td></tr>`;
        return;
    }

    saldosBody.innerHTML = '';
    pageRows.forEach((v) => {
        const mon = v.moneda_legible || 'VES';
        const debeFmt = formatCurrencyAmount(v.total_debe, mon);
        const haberFmt = formatCurrencyAmount(v.total_haber, mon);
        const saldoVal = Number(v.saldo_disponible || 0);
        const saldoFmt = formatCurrencyAmount(saldoVal, mon);
        const saldoColor = saldoVal >= 0 ? '#198754' : '#dc3545';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${v.banco_nombre}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Movs" class="fw-semibold">${v.total_movimientos}</td>
            <td data-label="Total Debe" class="fw-bold text-danger">${debeFmt}</td>
            <td data-label="Total Haber" class="fw-bold text-success">${haberFmt}</td>
            <td data-label="Saldo Disponible" class="fw-bold" style="color: ${saldoColor};">${saldoVal >= 0 ? '+' : ''}${saldoFmt} ${mon}</td>
        `;
        saldosBody.appendChild(tr);
    });
}

/**
 * Obtiene las filas de `movimientos` filtradas y ordenadas en el módulo de Exportación.
 */
function getFilteredSortedMovimientosRows() {
    const expSt = tableStates.exportSaldos;
    const movSt = tableStates.movimientos;

    let rows = stateMovimientos.filter((m) => {
        if (expSt.bancoId && Number(m.banco_id) !== Number(expSt.bancoId)) return false;
        if (expSt.moneda && m.moneda_legible !== expSt.moneda) return false;
        if (expSt.desde && m.fecha && m.fecha < expSt.desde) return false;
        if (expSt.hasta && m.fecha && m.fecha > expSt.hasta) return false;
        return true;
    });

    rows = filterRowsBySearch(rows, expSt.search, [
        'id',
        'banco_nombre',
        'cuenta_numero',
        'empresa_legible',
        'referencia_legible',
        'descripcion_legible',
        'moneda_legible'
    ]);

    return sortRowsByField(rows, movSt.sortField, movSt.sortAsc);
}

/**
 * 5. Renderiza la tabla paginada, ordenable y filtrable de `public.movimientos`.
 */
function renderMovimientosTable() {
    const tbody = document.getElementById('movimientosTableBody');
    if (!tbody) return;

    const st = tableStates.movimientos;
    updateSortIndicators('theadMovimientos', st);

    const sorted = getFilteredSortedMovimientosRows();
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationMovimientos',
        renderMovimientosTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-3">Sin registros en <code>public.movimientos</code> que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((m) => {
        const mon = m.moneda_legible || 'VES';
        const debeFmt = formatCurrencyAmount(m.debe, mon);
        const haberFmt = formatCurrencyAmount(m.haber, mon);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${m.id}</td>
            <td data-label="Fecha">${m.fecha || '-'}</td>
            <td data-label="Banco" class="fw-semibold small">${m.banco_nombre}</td>
            <td data-label="Cuenta" class="small">${m.cuenta_numero}</td>
            <td data-label="Empresa" class="small">${m.empresa_legible || '-'}</td>
            <td data-label="Referencia" class="small">${m.referencia_legible || '-'}</td>
            <td data-label="Descripción" class="small">${m.descripcion_legible || '-'}</td>
            <td data-label="Debe" class="fw-semibold">${debeFmt}</td>
            <td data-label="Haber" class="fw-semibold">${haberFmt}</td>
            <td data-label="Acciones">
                <div class="d-inline-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-mov" data-id="${m.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-mov" data-id="${m.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-mov').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const item = stateMovimientos.find((x) => Number(x.id) === id);
            if (!item) return;

            document.getElementById('movId').value = String(item.id);
            document.getElementById('movBancoId').value = String(item.banco_id || '');
            populateCuentaSelects(item.banco_id);
            document.getElementById('movCuentaId').value = String(item.cuenta_id || '');
            document.getElementById('movFecha').value = item.fecha || '';
            document.getElementById('movMoneda').value = item.moneda_legible || 'VES';
            document.getElementById('movTipo').value = item.tipo_legible || 'Crédito';
            document.getElementById('movEmpresa').value = item.empresa_legible || '';
            document.getElementById('movReferencia').value = item.referencia_legible || '';
            document.getElementById('movDescripcion').value = item.descripcion_legible || '';
            document.getElementById('movDebe').value = item.debe ?? 0;
            document.getElementById('movHaber').value = item.haber ?? 0;

            const badge = document.getElementById('badgeModeMovimiento');
            if (badge) {
                badge.textContent = `Editando #${item.id}`;
                badge.className = 'badge badge-status-alert';
            }

            const modalEl = document.getElementById('modalCrudMovimientos');
            if (modalEl && window.bootstrap) {
                window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        });
    });

    tbody.querySelectorAll('.btn-del-mov').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar el movimiento ID #${id}?`)) return;
            const { error } = await supabase.from('movimientos').delete().eq('id', id);
            if (!error) {
                showFeedback(`Movimiento #${id} eliminado.`, 'warning');
                await refreshAllDatabaseData();
            }
        });
    });
}

/**
 * Renderiza la tabla paginada, ordenable y filtrable dentro del Modal de Movimientos (`#modalCrudMovimientos`).
 */
function renderModalMovimientosTable() {
    const tbody = document.getElementById('modalMovimientosTableBody');
    if (!tbody) return;

    const st = tableStates.modalMovimientos;
    updateSortIndicators('theadModalMovimientos', st);

    const filtered = filterRowsBySearch(stateMovimientos, st.search, [
        'id',
        'fecha',
        'banco_nombre',
        'cuenta_numero',
        'empresa_legible',
        'referencia_legible',
        'descripcion_legible',
        'moneda_legible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationModalMovimientos',
        renderModalMovimientosTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted small py-3">Sin registros en <code>public.movimientos</code>.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((m) => {
        const mon = m.moneda_legible || 'VES';
        const debeFmt = formatCurrencyAmount(m.debe, mon);
        const haberFmt = formatCurrencyAmount(m.haber, mon);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${m.id}</td>
            <td data-label="Fecha">${m.fecha || '-'}</td>
            <td data-label="Banco" class="fw-semibold small">${m.banco_nombre}</td>
            <td data-label="Cuenta" class="small">${m.cuenta_numero}</td>
            <td data-label="Empresa" class="small">${m.empresa_legible || '-'}</td>
            <td data-label="Referencia" class="small">${m.referencia_legible || '-'}</td>
            <td data-label="Descripción" class="small">${m.descripcion_legible || '-'}</td>
            <td data-label="Debe" class="fw-semibold">${debeFmt}</td>
            <td data-label="Haber" class="fw-semibold">${haberFmt}</td>
            <td data-label="Acciones">
                <div class="d-inline-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-modal-mov" data-id="${m.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-modal-mov" data-id="${m.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-modal-mov').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const item = stateMovimientos.find((x) => Number(x.id) === id);
            if (!item) return;

            document.getElementById('movId').value = String(item.id);
            document.getElementById('movBancoId').value = String(item.banco_id || '');
            populateCuentaSelects(item.banco_id);
            document.getElementById('movCuentaId').value = String(item.cuenta_id || '');
            document.getElementById('movFecha').value = item.fecha || '';
            document.getElementById('movMoneda').value = item.moneda_legible || 'VES';
            document.getElementById('movTipo').value = item.tipo_legible || 'Crédito';
            document.getElementById('movEmpresa').value = item.empresa_legible || '';
            document.getElementById('movReferencia').value = item.referencia_legible || '';
            document.getElementById('movDescripcion').value = item.descripcion_legible || '';
            document.getElementById('movDebe').value = item.debe ?? 0;
            document.getElementById('movHaber').value = item.haber ?? 0;

            const badge = document.getElementById('badgeModeMovimiento');
            if (badge) {
                badge.textContent = `Editando #${item.id}`;
                badge.className = 'badge badge-status-alert';
            }
        });
    });

    tbody.querySelectorAll('.btn-del-modal-mov').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar el movimiento ID #${id}?`)) return;
            const { error } = await supabase.from('movimientos').delete().eq('id', id);
            if (!error) {
                showMovModalAlert(`Movimiento #${id} eliminado correctamente.`, 'warning');
                await refreshAllDatabaseData();
            }
        });
    });
}

/**
 * Muestra una alerta informativa dentro del modal de Movimientos.
 */
function showMovModalAlert(message, type = 'info') {
    const alertEl = document.getElementById('movModalAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} py-2 small mb-3`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');
}

/**
 * Descarga la plantilla CSV para importar movimientos a `public.movimientos`.
 * Indica explícitamente el formato de fecha DD/MM/YYYY y ejemplifica tanto
 * movimientos con número de cuenta como cargas de saldo directo a banco (cuenta vacía).
 */
function downloadPlantillaMovimientosCsv() {
    const sampleBanco = stateBancos[0]?.nombre_legible || 'Banesco';
    const sampleCuenta = stateCuentas[0]?.cuenta_legible || '0134-0001-00-1234567890';
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
            '1500.00',
            '0.00'
        ],
        [
            sampleBanco,
            '', // Vacío: carga de saldo directo a banco
            todayDdMmYyyy,
            'VES',
            'Empresa Principal C.A.',
            'SALDO-DIR-01',
            'Carga de saldo directo a banco sin numero de cuenta',
            'Saldo Directo',
            '5000.00',
            '0.00'
        ]
    ];

    const lines = [
        headers.join(';'),
        ...exampleRows.map((r) => r.join(';'))
    ];

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_movimientos_banco.csv';
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
function parseDdMmYyyyToIso(rawDate) {
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
function splitCsvLine(line, delimiter) {
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
function parseCsvNumericAmount(rawVal) {
    let str = String(rawVal ?? '0').trim().replace(/\s+/g, '');
    if (!str) return 0;

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            // Formato europeo/venezolano: 1.234.567,89
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // Formato anglosajón: 1,234,567.89
            str = str.replace(/,/g, '');
        }
    } else if (lastComma > -1) {
        // Solo comas: si hay múltiples comas (1,234,567) son miles; si hay una sola, es decimal
        const commaCount = (str.match(/,/g) || []).length;
        str = commaCount > 1 ? str.replace(/,/g, '') : str.replace(',', '.');
    }

    const parsed = parseFloat(str);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Procesa e importa el archivo CSV seleccionado hacia la tabla `public.movimientos`,
 * identificando:
 * 1. El banco por el nombre del banco (`bancos.nombre` -> `banco_id`).
 * 2. La cuenta por el nro de la cuenta (`cuentas.cuenta` -> `cuenta_id`), o `null` si queda vacío (saldo directo a banco).
 * 3. Las fechas con formato obligatorio `DD/MM/YYYY`.
 */
async function importPlantillaCsvToMovimientos() {
    const fileInput = document.getElementById('inputCsvMovimientos');
    const autoCreate = document.getElementById('chkAutoCreateBancoCuenta')?.checked ?? true;
    const btnImport = document.getElementById('btnImportCsvMovimientos');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showMovModalAlert('Por favor seleccione primero un archivo CSV basado en la plantilla.', 'warning');
        return;
    }

    const file = fileInput.files[0];
    const text = await file.text();
    const rawLines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (rawLines.length < 2) {
        showMovModalAlert('El archivo CSV está vacío o solo contiene la fila de encabezados.', 'danger');
        return;
    }

    // Detectar delimitador (; o ,) en la cabecera
    const headerLine = rawLines[0];
    const delimiter = headerLine.includes(';') ? ';' : ',';
    const dataLines = rawLines.slice(1);

    if (btnImport) {
        btnImport.disabled = true;
        btnImport.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importando CSV...';
    }

    try {
        const payloadsToInsert = [];
        const errors = [];
        let directBankCount = 0;

        for (let idx = 0; idx < dataLines.length; idx++) {
            const lineNum = idx + 2;
            const cols = splitCsvLine(dataLines[idx], delimiter);

            const bancoNombreCsv = (cols[0] || '').trim();
            const cuentaNroCsv = (cols[1] || '').trim();
            const fechaDdMmYyyy = (cols[2] || '').trim();
            const monedaCsv = (cols[3] || 'VES').trim().toUpperCase() || 'VES';
            const empresaCsv = (cols[4] || '').trim();
            const referenciaCsv = (cols[5] || '').trim();
            const descripcionCsv = (cols[6] || '').trim();
            const tipoCsv = (cols[7] || (cuentaNroCsv ? 'Crédito' : 'Saldo Directo')).trim();
            const debeVal = parseCsvNumericAmount(cols[8]);
            const haberVal = parseCsvNumericAmount(cols[9]);

            if (!bancoNombreCsv) {
                errors.push(`Fila ${lineNum}: El nombre del banco está vacío.`);
                continue;
            }

            // 3. Validar fecha en formato DD/MM/YYYY
            const parsedDate = parseDdMmYyyyToIso(fechaDdMmYyyy);
            if (!parsedDate.valid) {
                errors.push(
                    `Fila ${lineNum}: La fecha "${fechaDdMmYyyy}" no cumple el formato obligatorio DD/MM/YYYY.`
                );
                continue;
            }

            // 1. Identificar el banco por su nombre
            let bancoObj = stateBancos.find(
                (b) => b.nombre_legible.trim().toLowerCase() === bancoNombreCsv.toLowerCase()
            );

            if (!bancoObj) {
                if (autoCreate) {
                    const { data: createdBancos, error: errB } = await supabase
                        .from('bancos')
                        .insert([
                            {
                                nombre: encryptLocalSymmetric(bancoNombreCsv),
                                descripcion: encryptLocalSymmetric('Creado desde importación CSV')
                            }
                        ])
                        .select('id, created_at, nombre, descripcion');

                    if (errB || !createdBancos || createdBancos.length === 0) {
                        errors.push(`Fila ${lineNum}: No se pudo registrar el banco "${bancoNombreCsv}".`);
                        continue;
                    }

                    bancoObj = {
                        ...createdBancos[0],
                        nombre_legible: bancoNombreCsv,
                        descripcion_legible: 'Creado desde importación CSV'
                    };
                    stateBancos.push(bancoObj);
                } else {
                    errors.push(
                        `Fila ${lineNum}: El banco "${bancoNombreCsv}" no existe en la tabla bancos.`
                    );
                    continue;
                }
            }

            // 2. Identificar la cuenta por el nro de cuenta (o vacío si es saldo directo a banco)
            let cuentaId = null;
            if (cuentaNroCsv !== '') {
                let cuentaObj =
                    stateCuentas.find(
                        (c) =>
                            Number(c.banco_id) === Number(bancoObj.id) &&
                            c.cuenta_legible.trim().toLowerCase() === cuentaNroCsv.toLowerCase()
                    ) ||
                    stateCuentas.find(
                        (c) => c.cuenta_legible.trim().toLowerCase() === cuentaNroCsv.toLowerCase()
                    );

                if (!cuentaObj) {
                    if (autoCreate) {
                        const { data: createdCtas, error: errC } = await supabase
                            .from('cuentas')
                            .insert([
                                {
                                    banco_id: bancoObj.id,
                                    cuenta: encryptLocalSymmetric(cuentaNroCsv),
                                    tipo: encryptLocalSymmetric('Corriente')
                                }
                            ])
                            .select('id, created_at, banco_id, cuenta, tipo');

                        if (errC || !createdCtas || createdCtas.length === 0) {
                            errors.push(
                                `Fila ${lineNum}: No se pudo registrar la cuenta "${cuentaNroCsv}".`
                            );
                            continue;
                        }

                        cuentaObj = {
                            ...createdCtas[0],
                            cuenta_legible: cuentaNroCsv,
                            tipo_legible: 'Corriente',
                            banco_nombre: bancoObj.nombre_legible
                        };
                        stateCuentas.push(cuentaObj);
                    } else {
                        errors.push(
                            `Fila ${lineNum}: La cuenta "${cuentaNroCsv}" no existe en la tabla cuentas.`
                        );
                        continue;
                    }
                }
                cuentaId = cuentaObj.id;
            } else {
                directBankCount++;
            }

            payloadsToInsert.push({
                banco_id: bancoObj.id,
                cuenta_id: cuentaId,
                fecha: parsedDate.isoDate,
                moneda: encryptLocalSymmetric(monedaCsv),
                empresa: empresaCsv ? encryptLocalSymmetric(empresaCsv) : null,
                referencia: referenciaCsv ? encryptLocalSymmetric(referenciaCsv) : null,
                descripcion: descripcionCsv ? encryptLocalSymmetric(descripcionCsv) : null,
                tipo: encryptLocalSymmetric(tipoCsv),
                debe: debeVal,
                haber: haberVal
            });
        }

        if (payloadsToInsert.length > 0) {
            const BATCH_SIZE = 500;
            const totalBatches = Math.ceil(payloadsToInsert.length / BATCH_SIZE);

            for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
                const start = bIdx * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, payloadsToInsert.length);
                const chunk = payloadsToInsert.slice(start, end);

                if (btnImport) {
                    btnImport.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Cargando lote ${bIdx + 1}/${totalBatches} (${end}/${payloadsToInsert.length} filas)...`;
                }

                const { error: insertErr } = await supabase
                    .from('movimientos')
                    .insert(chunk);

                if (insertErr) {
                    showMovModalAlert(
                        `Error al insertar el lote ${bIdx + 1}/${totalBatches} (filas ${start + 1} a ${end}) en <code>public.movimientos</code>: ${insertErr.message}`,
                        'danger'
                    );
                    return;
                }
            }
        }

        await refreshAllDatabaseData();
        fileInput.value = '';

        const summaryParts = [
            `<strong>Importación completada:</strong> ${payloadsToInsert.length} movimiento(s) cargado(s) en <code>public.movimientos</code>.`
        ];
        if (directBankCount > 0) {
            summaryParts.push(
                `(${directBankCount} registro(s) cargado(s) como saldo directo a banco sin número de cuenta).`
            );
        }
        if (errors.length > 0) {
            summaryParts.push(`<br><span class="text-danger">${errors.join('<br>')}</span>`);
        }

        showMovModalAlert(
            summaryParts.join(' '),
            errors.length > 0 && payloadsToInsert.length === 0 ? 'danger' : 'success'
        );
        showFeedback(
            `Se importaron ${payloadsToInsert.length} movimientos desde la plantilla CSV.`,
            'success'
        );
    } catch (err) {
        showMovModalAlert(`Error al procesar el archivo CSV: ${err.message}`, 'danger');
    } finally {
        if (btnImport) {
            btnImport.disabled = false;
            btnImport.innerHTML =
                '<i class="bi bi-cloud-arrow-up-fill me-1"></i>2. Cargar Plantilla a Movimientos';
        }
    }
}

// ============================================================================
// PROCESAMIENTO E IMPORTACIÓN DE ESTADOS DE CUENTA BANCARIOS DESDE PDF (PDF.js)
// ============================================================================

const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const KNOWN_BANK_NAMES = [
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

const SPANISH_MONTHS_MAP = {
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

// Estado en memoria de las filas previsualizadas desde el PDF
let statePdfPreviewRows = [];

function showPdfImportAlert(message, type = 'info') {
    const alertEl = document.getElementById('pdfImportAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} py-2 small mb-2`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');
}

function hidePdfImportAlert() {
    const alertEl = document.getElementById('pdfImportAlert');
    if (alertEl) alertEl.classList.add('d-none');
}

/**
 * Normaliza una cadena de fecha extraída de un PDF bancario al formato estricto `YYYY-MM-DD`.
 * Soporta `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `DD/MM/YY`, `YYYY-MM-DD`, `DD-MMM-YYYY` y `DD/MM`.
 * @param {string} rawDateStr
 * @param {number} [fallbackYear]
 * @returns {{ valid: boolean, isoDate?: string }}
 */
function normalizePdfDateToIso(rawDateStr, fallbackYear = new Date().getFullYear()) {
    const clean = String(rawDateStr || '').trim();
    if (!clean) return { valid: false };

    // 1. Formato ISO YYYY-MM-DD o YYYY/MM/DD
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

    // 2. Formato DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY o DD/MM/YY
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

    // 3. Formato DD-MMM-YYYY o DD MMM YYYY (ej. 15 ENE 2026 / 15-ENE-26)
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

    // 4. Formato corto DD/MM, DD-MM o DD.MM (usando el año detectado en el estado de cuenta)
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
 * Normaliza signos menos Unicode y espacios especiales provenientes de fuentes PDF.
 * @param {string} str
 * @returns {string}
 */
function normalizePdfTextFragment(str) {
    return String(str || '')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2212\u2013\u2014\uFE63\uFF0D]/g, '-');
}

/**
 * Extrae las líneas de texto ordenadas espacialmente (coordenadas Y descendente y X ascendente)
 * de todas las páginas del archivo PDF usando PDF.js, uniendo fragmentos numéricos divididos por kerning
 * y separando tokens compuestos con coordenadas X proporcionales.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ lines: Array<{ page: number, y: number, text: string, tokens: Array<{ text: string, x: number, y: number, width: number, xEnd: number }> }>, numPages: number }>}
 */
async function extractStructuredLinesFromPdf(arrayBuffer) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
        throw new Error(
            'La librería PDF.js no está disponible. Verifique su conexión a internet y recargue la página.'
        );
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;

    // Validar firma mágica %PDF- para descartar archivos corruptos o que no sean PDF reales
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
        throw new Error(`No se pudo decodificar el archivo PDF (documento dañando o ilegible): ${err.message}`);
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

        // Ordenar de arriba hacia abajo (Y mayor a menor en coordenadas PDF)
        pageBuckets.sort((a, b) => b.y - a.y);

        for (const bucket of pageBuckets) {
            bucket.tokens.sort((a, b) => a.x - b.x);

            // 1. Unir fragmentos adyacentes que PDF.js haya dividido por kerning (ej. "1" + ".05" o "1." + "05" o "-" + "1.05")
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

            // 2. Si un token individual contiene múltiples fragmentos separados por espacios (ej. "COMISION IGTF 1.05" o "1.05 1,250.00"),
            // desglosar en sub-tokens calculando la coordenada X y ancho proporcional de cada fragmento.
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
 * Analiza el encabezado del estado de cuenta PDF para extraer:
 * 1. Nombre del banco
 * 2. Nro de cuenta bancaria (o IBAN)
 * 4. Nombre de la empresa o titular de la cuenta
 * + Año de referencia y moneda si están presentes.
 * @param {Array<{ page: number, y: number, text: string }>} lines
 */
function extractPdfHeaderMetadata(lines) {
    const headerLines = lines.slice(0, 45);
    const fullHeaderText = headerLines.map((l) => l.text).join('\n');

    // 1. Detectar Nombre del Banco
    let detectedBanco = '';
    for (const b of stateBancos) {
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
        detectedBanco = firstClean ? firstClean.text : stateBancos[0]?.nombre_legible || 'Banco Detectado PDF';
    }

    // 2. Detectar Número de Cuenta Bancaria o IBAN
    let detectedCuenta = '';
    const digitsOnlyHeader = fullHeaderText.replace(/[-\s]/g, '');
    for (const c of stateCuentas) {
        const cNum = (c.cuenta_legible || '').trim();
        const cDigits = cNum.replace(/[-\s]/g, '');
        if (cDigits.length >= 8 && digitsOnlyHeader.includes(cDigits)) {
            detectedCuenta = cNum;
            break;
        }
    }
    if (!detectedCuenta) {
        // Patrón de 20 dígitos bancarios (Venezuela) con o sin guiones/espacios
        const vzlaAccMatch = /\b(\d{4}[-\s]?\d{4}[-\s]?\d{2}[-\s]?\d{10}|\d{20})\b/.exec(fullHeaderText);
        if (vzlaAccMatch) {
            detectedCuenta = vzlaAccMatch[1].replace(/\s+/g, '');
        }
    }
    if (!detectedCuenta) {
        // Patrón IBAN internacional
        const ibanMatch = /\b([A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16})\b/.exec(fullHeaderText);
        if (ibanMatch) {
            detectedCuenta = ibanMatch[1];
        }
    }
    if (!detectedCuenta) {
        // Etiqueta explícita de Cuenta / Account
        const accLabelMatch = /(?:nro\.?\s*de\s*cuenta|n[uú]mero\s*de\s*cuenta|cuenta\s*(?:corriente|ahorro|nro|n[uú]mero|#)?|cta\.?\s*(?:nro|#)?|account\s*(?:number|no|#)?|iban)[:\s#]*([0-9A-Z][0-9A-Z\-*]{5,28}[0-9])/i.exec(
            fullHeaderText
        );
        if (accLabelMatch) {
            detectedCuenta = accLabelMatch[1].trim();
        }
    }

    // 4. Detectar Nombre de la Empresa o Titular de la Cuenta
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

    // Año de referencia para fechas cortas DD/MM
    let detectedYear = new Date().getFullYear();
    const yearMatch = /\b(20\d{2})\b/.exec(fullHeaderText);
    if (yearMatch) {
        detectedYear = parseInt(yearMatch[1], 10);
    }

    // Moneda detectada en el encabezado
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
 * Evalúa si un token o fragmento de texto representa un importe monetario utilizando
 * el separador decimal configurado (`,` o `.`), con respaldo automático para importes
 * inequívocos de 2 decimales (ej. `1.05` o `1,05`), devolviendo su valor numérico con signo.
 * @param {string} rawToken
 * @param {string} [decimalSeparator=','] Carácter separador decimal (',' o '.')
 * @returns {{ isAmount: boolean, signedValue: number, absValue: number, hasExplicitNegative: boolean, hasExplicitPositive: boolean }}
 */
function parsePdfMonetaryToken(rawToken, decimalSeparator = ',') {
    const str = normalizePdfTextFragment(rawToken).trim();
    if (!str) {
        return { isAmount: false, signedValue: 0, absValue: 0, hasExplicitNegative: false, hasExplicitPositive: false };
    }

    // Descartar fechas (ej. 10.05.2026, 10/05/2026, 2026-05-10) o porcentajes (16.00%)
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
        const cleanDigits = `${cleanInt}.${decPart}`;
        const absValue = parseFloat(cleanDigits);
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

    // 1. Intentar primero con el separador decimal configurado por el usuario
    const primaryResult = tryParseWithSep(primaryDec, primaryThou, false);
    if (primaryResult) {
        return primaryResult;
    }

    // 2. Respaldo para importes monetarios inequívocos con exactamente 2 decimales en el separador opuesto
    // (ej. "1.05" o "1,250.00" cuando el selector está en ',', ya que 2 dígitos tras el separador jamás pueden ser miles)
    const fallbackResult = tryParseWithSep(primaryThou, primaryDec, true);
    if (fallbackResult) {
        return fallbackResult;
    }

    return { isAmount: false, signedValue: 0, absValue: 0, hasExplicitNegative: false, hasExplicitPositive: false };
}

/**
 * Extrae todos los importes monetarios presentes en una línea del PDF conservando sus coordenadas
 * horizontales (`x`, `width`, `xCenter`, `xEnd`) para distinguir con precisión columnas alineadas a la derecha.
 * @param {{ text: string, tokens: Array<{ text: string, x: number, width?: number, xEnd?: number }> }} line
 * @param {string} [decimalSeparator=',']
 * @param {number} [minXAfterDate=-Infinity] Coordenada X mínima posterior a la fecha de la fila
 * @returns {Array<{ signedValue: number, absValue: number, x: number, width: number, xCenter: number, xEnd: number, raw: string, hasExplicitNegative: boolean, hasExplicitPositive: boolean }>}
 */
function extractAmountsFromPdfLine(line, decimalSeparator = ',', minXAfterDate = -Infinity) {
    const results = [];
    const decChar = decimalSeparator === '.' ? '.' : ',';
    const tokens = Array.isArray(line?.tokens) ? line.tokens : [];

    // 1. Evaluar token por token conservando coordenadas X exactas de inicio y fin (vital para montos cortos como 1.05)
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.x < minXAfterDate) continue;

        let candidateText = normalizePdfTextFragment(tok.text).trim();
        let startX = tok.x;
        let endX = tok.xEnd ?? tok.x + Math.max(Number(tok.width || 0), candidateText.length * 4.5);

        // Si el signo '-' o '+' o símbolo de moneda viene en el token inmediatamente anterior/siguiente, unirlo
        if (
            (/^[+\-(]$/.test(candidateText) || /^(?:Bs\.?S?|USD|EUR|VES|\$|€)$/i.test(candidateText)) &&
            i + 1 < tokens.length
        ) {
            const nextTok = tokens[i + 1];
            if (nextTok.x - endX <= 18) {
                candidateText = `${candidateText} ${ normalizePdfTextFragment(nextTok.text).trim() }`;
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

    if (results.length > 0) {
        return results;
    }

    // 2. Respaldo por expresión regular sobre el texto completo de la línea (para casos sin tokens desglosados)
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
 * cuando el estado de cuenta PDF no posee una columna dedicada de Referencia.
 * @param {string} descripcionText
 * @param {number} fallbackYear
 * @returns {string}
 */
function extractEquivalentReferenceFromDescription(descripcionText, fallbackYear) {
    const clean = String(descripcionText || '').trim();
    if (!clean) return '';

    // 1. Buscar patrones etiquetados explícitos dentro de la descripción (REF, DOC, OPER, COMP, NRO, LOTE, SEC, ID, AUT, CONF)
    const labeledMatch = /\b(?:ref(?:erencia)?\.?|doc(?:umento)?\.?|nro\.?|n[uú]m\.?|comp(?:robante)?\.?|oper(?:aci[oó]n)?\.?|serial|sec(?:uencia)?\.?|id|cod(?:igo)?\.?|lote|aut(?:orizaci[oó]n)?\.?|conf(?:irmaci[oó]n)?\.?|liq(?:uidaci[oó]n)?\.?)[:\s#\-]*([A-Z0-9][A-Z0-9\-\/._]{2,29})\b/i.exec(
        clean
    );
    if (labeledMatch && /\d/.test(labeledMatch[1])) {
        return labeledMatch[1].trim();
    }

    // 2. Buscar tokens alfanuméricos o numéricos que actúen como código de transacción/referencia en la descripción
    const tokens = clean.split(/\s+/).filter(Boolean);
    const candidates = [];

    for (const rawTok of tokens) {
        const tok = rawTok.replace(/^[(:;#,\-]+|[):;.,\-]+$/g, '');
        if (tok.length < 3 || tok.length > 30) continue;

        // Ignorar fechas que puedan venir dentro de la descripción
        if (normalizePdfDateToIso(tok, fallbackYear).valid) continue;

        // Debe ser alfanumérico (con guiones/barras opcionales) y contener al menos un dígito
        if (/^[A-Z0-9][A-Z0-9\-\/._]*[A-Z0-9]$/i.test(tok) && /\d/.test(tok)) {
            const digitCount = (tok.match(/\d/g) || []).length;
            const hasLetters = /[A-Z]/i.test(tok);
            // Evitar porcentajes o siglas cortas como "3%" o "24H" si hay códigos más largos
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
 * Analiza las líneas estructuradas del PDF, detecta las coordenadas de las columnas de
 * Referencia, Descripción, Débito/Debe y Crédito/Haber (o columna única de Monto) y construye
 * las filas de transacciones siguiendo estrictamente las reglas de negocio solicitadas.
 * @param {Array<{ page: number, y: number, text: string, tokens: Array<{ text: string, x: number, y: number, width: number, xEnd?: number }> }>} lines
 * @param {{ banco: string, cuenta: string, empresa: string, year: number }} headerMeta
 * @param {string} forcedMode ('auto' | 'dual' | 'single')
 * @param {string} [decimalSeparator=','] (',' o '.')
 */
function parseBankStatementTransactionsFromLines(lines, headerMeta, forcedMode = 'auto', decimalSeparator = ',') {
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

    // 1. Detectar cabeceras de tabla para obtener las coordenadas X e XEnd de Fecha, Referencia, Descripción, Debe, Haber, Monto y Saldo
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

        // Ignorar líneas que ya son movimientos con importes monetarios
        if ( (hasDateHeader && hasFinanceHeader) || hasDualColumnWords ) {
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

    // Determinar modo de columnas ('dual' = Débito y Crédito separados | 'single' = Columna única con signo)
    let columnMode = forcedMode;
    if (columnMode === 'auto') {
        if (debitHeaderX !== null && creditHeaderX !== null) {
            columnMode = 'dual';
        } else if (singleAmountHeaderX !== null && debitHeaderX === null && creditHeaderX === null) {
            columnMode = 'single';
        }
    }

    // 2. Recolectar líneas candidatas (soportando prefijos cortos antes de la fecha, filas envueltas en 2 líneas y captura de Saldo Anterior)
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

        // Capturar Saldo Anterior / Saldo Inicial si está presente para validar matemáticamente el primer movimiento
        if (initialBalanceRegex.test(cleanLineText)) {
            const initAmounts = extractAmountsFromPdfLine(line, decChar);
            if (initAmounts.length > 0) {
                initialStatementBalance = initAmounts[initAmounts.length - 1].absValue;
            }
            continue;
        }

        // Ignorar líneas de totales o resúmenes de pie de página
        if (summaryFooterRegex.test(cleanLineText)) {
            continue;
        }

        const dateMatch = dateLineRegex.exec(cleanLineText);
        if (!dateMatch) continue;

        const rawDateToken = dateMatch[1];
        let restOfLine = dateMatch[2] || '';
        const normDate = normalizePdfDateToIso(rawDateToken, headerMeta.year);
        if (!normDate.valid) continue;

        // Coordenada X mínima después del token de fecha para no confundir la fecha con un importe
        const dateTokObj = line.tokens.find((t) => t.text.includes(rawDateToken)) || line.tokens[0];
        const minXAfterDate = dateTokObj ? dateTokObj.x + 8 : -Infinity;

        let amounts = extractAmountsFromPdfLine(line, decChar, minXAfterDate);
        let combinedLine = line;

        // Si la fila tiene Fecha y Descripción en la línea `i`, pero el monto (ej. 1.05) quedó en la línea `i + 1` por salto de línea
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
                    i++; // Consumir la línea envolvente
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

    // Analizar agrupamiento de bordes derechos (`xEnd`) de los importes del movimiento (columna 1 de importes)
    // En estados de cuenta bancarios los importes están alineados a la derecha, por lo que `1.05` y `150,000.00`
    // dentro de la columna "Debe" comparten exactamente el mismo `xEnd` (borde derecho).
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

        // Si es modo dual y existen dos clusters claros de bordes derechos (Debe a la izquierda, Haber a la derecha)
        if (columnMode === 'dual' && maxXEnd - minXEnd > 38) {
            if (inferredDebitXEnd === null) inferredDebitXEnd = minXEnd;
            if (inferredCreditXEnd === null) inferredCreditXEnd = maxXEnd;
        }
    }

    // Expresión regular para limpiar los importes monetarios del texto de descripción/referencia
    const amountStripRegex =
        /(?:^|\s)[+\-(]?\s*(?:(?:Bs\.?S?|USD|EUR|VES|\$|€)\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{1,4}(?:\s*[)\-*]?\s*(?:DB|DR|CR|CARGO|ABONO)?)?(?=\s|$)/gi;

    // 3. Construir las transacciones finales con los 8 campos estrictos y verificación matemática de Saldo
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

        // REGLA 1A: Si el PDF posee una columna de Referencia detectada en el encabezado (`refHeaderX !== null`),
        // extraer TODO el contenido alfanumérico que caiga en el rango horizontal de esa columna.
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

        // REGLA 1B: Si el PDF no tiene columna de Referencia (o la columna vino vacía en esta fila),
        // extraer del campo Descripción el código alfanumérico equivalente a una referencia.
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

        // Determinar Debe y Haber según las reglas 7 y 8 (con validación matemática de Saldo, alineación derecha `xEnd` y palabras clave)
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

        // Función auxiliar para clasificar un importe único (`movObj`) como Debe ('debit') o Haber ('credit')
        const classifySingleMovementAmount = (movObj, currentRowBalance = null) => {
            // 1. Signo explícito (-, (), DB, DR, CARGO vs +, CR, ABONO)
            if (movObj.hasExplicitNegative) return 'debit';
            if (movObj.hasExplicitPositive) return 'credit';

            // 2. Verificación matemática contra el Saldo acumulado anterior (`runningBalance`)
            if (runningBalance !== null && currentRowBalance !== null && movObj.absValue > 0) {
                const diffIfDebit = Math.abs(runningBalance - movObj.absValue - currentRowBalance);
                const diffIfCredit = Math.abs(runningBalance + movObj.absValue - currentRowBalance);
                if (diffIfDebit <= 0.05 && diffIfDebit < diffIfCredit) {
                    return 'debit';
                }
                if (diffIfCredit <= 0.05 && diffIfCredit < diffIfDebit) {
                    return 'credit';
                }
            }

            // 3. Si es la primera fila sin Saldo Anterior, verificar contra el Saldo de la fila siguiente (`idx + 1`)
            if (
                runningBalance === null &&
                currentRowBalance !== null &&
                idx + 1 < rawCandidateRows.length &&
                rawCandidateRows[idx + 1].amounts.length >= 2
            ) {
                // La coordenada X de la columna determina la posición
            }

            // 4. Posición horizontal por borde derecho (`xEnd`) y centro (`xCenter`) respecto a las columnas Debe y Haber
            if (inferredDebitXEnd !== null && inferredCreditXEnd !== null) {
                const movXEnd = movObj.xEnd ?? movObj.x + 20;
                const distToDebitEnd = Math.abs(movXEnd - inferredDebitXEnd);
                const distToCreditEnd = Math.abs(movXEnd - inferredCreditXEnd);

                // Si las cabeceras también existen, verificar a qué columna pertenece el rango X
                if (debitHeaderX !== null && creditHeaderX !== null) {
                    const splitX = ((debitHeaderXEnd ?? debitHeaderX + 35) + creditHeaderX) / 2;
                    const movCenter = movObj.xCenter ?? movObj.x + 10;
                    if (movCenter <= splitX || distToDebitEnd <= distToCreditEnd) {
                        return 'debit';
                    }
                    return 'credit';
                }

                if (distToDebitEnd <= distToCreditEnd) {
                    return 'debit';
                }
                return 'credit';
            }

            // 5. Palabras clave bancarias en la descripción
            if (isDebitKeywordInLine && !isCreditKeywordInLine) return 'debit';
            if (isCreditKeywordInLine && !isDebitKeywordInLine) return 'credit';

            // 6. Si solo se detectó cabecera de Debe y el monto está cerca de ella
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

            if (rowBalanceVal !== null) {
                runningBalance = rowBalanceVal;
            }
        } else {
            // Regla de Columnas Separadas (Débito y Crédito):
            if (amounts.length >= 3) {
                // [Debe, Haber, Saldo]
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
                    // Columnas explícitas [Debe, Haber] sin columna de Saldo donde una de las dos viene en 0.00
                    debe = Math.abs(first.absValue);
                    haber = Math.abs(second.absValue);
                } else {
                    // `first` es el monto del movimiento (en Debe o Haber) y `second` es el Saldo acumulado
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
            tipo: 'CUENTA', // Regla 6: Obligatoriamente la palabra fija "CUENTA"
            debe: Number(debe.toFixed(2)),
            haber: Number(haber.toFixed(2))
        });
    }

    return {
        transactions: extractedTransactions,
        detectedMode: columnMode
    };
}

/**
 * Renderiza la tabla HTML interactiva (`#pdfPreviewTableBody`) con los 8 campos estrictos
 * extraídos del estado de cuenta en PDF.
 */
function renderPdfPreviewTable() {
    const previewSection = document.getElementById('pdfPreviewSection');
    const tbody = document.getElementById('pdfPreviewTableBody');
    const statsBadge = document.getElementById('pdfPreviewStatsBadge');
    const totalsText = document.getElementById('pdfPreviewTotalsText');
    const btnTopCsv = document.getElementById('btnDownloadPdfAnalizadoCsvTop');
    const moneda = (document.getElementById('pdfMonedaDefault')?.value || 'VES').toUpperCase();

    if (btnTopCsv) {
        btnTopCsv.disabled = statePdfPreviewRows.length === 0;
    }

    if (!previewSection || !tbody) return;

    if (statePdfPreviewRows.length === 0) {
        previewSection.classList.add('d-none');
        tbody.innerHTML = '';
        return;
    }

    previewSection.classList.remove('d-none');

    let sumDebe = 0;
    let sumHaber = 0;

    tbody.innerHTML = '';
    statePdfPreviewRows.forEach((row, index) => {
        sumDebe += Number(row.debe || 0);
        sumHaber += Number(row.haber || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="1. Nombre del Banco">
                <input
                    type="text"
                    class="form-control form-control-sm pdf-row-input"
                    data-idx="${index}"
                    data-field="banco"
                    value="${String(row.banco || '').replace(/"/g, '&quot;')}"
                />
            </td>
            <td data-label="2. Nro. de Cuenta">
                <input
                    type="text"
                    class="form-control form-control-sm pdf-row-input"
                    data-idx="${index}"
                    data-field="cuenta"
                    value="${String(row.cuenta || '').replace(/"/g, '&quot;')}"
                />
            </td>
            <td data-label="3. Fecha (YYYY-MM-DD)">
                <input
                    type="date"
                    class="form-control form-control-sm pdf-row-input"
                    data-idx="${index}"
                    data-field="fecha"
                    value="${row.fecha || ''}"
                />
            </td>
            <td data-label="4. Empresa / Titular">
                <input
                    type="text"
                    class="form-control form-control-sm pdf-row-input"
                    data-idx="${index}"
                    data-field="empresa"
                    value="${String(row.empresa || '').replace(/"/g, '&quot;')}"
                />
            </td>
            <td data-label="5. Nro. Referencia">
                <input
                    type="text"
                    class="form-control form-control-sm pdf-row-input"
                    data-idx="${index}"
                    data-field="referencia"
                    value="${String(row.referencia || '').replace(/"/g, '&quot;')}"
                />
            </td>
            <td data-label="6. Tipo" class="text-center">
                <span class="badge badge-status-active">CUENTA</span>
            </td>
            <td data-label="7. Debe">
                <input
                    type="number"
                    step="any"
                    class="form-control form-control-sm text-end fw-bold pdf-row-input text-danger"
                    data-idx="${index}"
                    data-field="debe"
                    value="${Number(row.debe || 0).toFixed(2)}"
                />
            </td>
            <td data-label="8. Haber">
                <input
                    type="number"
                    step="any"
                    class="form-control form-control-sm text-end fw-bold pdf-row-input text-success"
                    data-idx="${index}"
                    data-field="haber"
                    value="${Number(row.haber || 0).toFixed(2)}"
                />
            </td>
            <td data-label="Quitar" class="text-center">
                <button
                    type="button"
                    class="btn btn-sm btn-danger py-0 px-2 btn-remove-pdf-row"
                    data-idx="${index}"
                    title="Quitar fila de la vista previa"
                >
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const updateTotalsSummary = () => {
        let totalD = 0;
        let totalH = 0;
        statePdfPreviewRows.forEach((r) => {
            totalD += Number(r.debe || 0);
            totalH += Number(r.haber || 0);
        });
        const neto = totalH - totalD; // Crédito (Haber) menos Débito (Debe)
        if (statsBadge) {
            statsBadge.textContent = `${statePdfPreviewRows.length} movimiento(s) mapeado(s)`;
        }
        if (totalsText) {
            const netoColor = neto >= 0 ? '#198754' : '#dc3545';
            totalsText.innerHTML = `Total Debe (Débito): <span class="text-danger">${formatCurrencyAmount(totalD, moneda)} ${moneda}</span> &nbsp;|&nbsp; Total Haber (Crédito): <span class="text-success">${formatCurrencyAmount(totalH, moneda)} ${moneda}</span> &nbsp;|&nbsp; Saldo Neto (Crédito - Débito): <strong style="color: ${netoColor};">${neto >= 0 ? '+' : ''}${formatCurrencyAmount(neto, moneda)} ${moneda}</strong>`;
        }
    };

    updateTotalsSummary();

    tbody.querySelectorAll('.pdf-row-input').forEach((input) => {
        input.addEventListener('input', (e) => {
            const idx = Number(e.target.getAttribute('data-idx'));
            const field = e.target.getAttribute('data-field');
            if (!statePdfPreviewRows[idx] || !field) return;

            if (field === 'debe' || field === 'haber') {
                statePdfPreviewRows[idx][field] = parseFloat(e.target.value) || 0;
                updateTotalsSummary();
            } else {
                statePdfPreviewRows[idx][field] = e.target.value;
            }
        });
    });

    tbody.querySelectorAll('.btn-remove-pdf-row').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-idx'));
            statePdfPreviewRows.splice(idx, 1);
            renderPdfPreviewTable();
        });
    });
}

/**
 * Procesa el archivo PDF seleccionado, extrae los metadatos del encabezado y las transacciones
 * y las presenta en la tabla HTML interactiva de vista previa.
 */
async function processPdfBankStatement() {
    const fileInput = document.getElementById('inputPdfMovimientos');
    const btnProcess = document.getElementById('btnProcessPdfMovimientos');
    const modeSelect = document.getElementById('pdfColumnModeSelect');
    const badgeMode = document.getElementById('badgePdfModeDetected');

    hidePdfImportAlert();

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showPdfImportAlert('Por favor seleccione un archivo PDF de estado de cuenta bancario.', 'warning');
        return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        showPdfImportAlert(
            'Formato inválido: el archivo seleccionado no es un documento PDF (<code>.pdf</code>).',
            'danger'
        );
        return;
    }

    if (btnProcess) {
        btnProcess.disabled = true;
        btnProcess.innerHTML =
            '<span class="spinner-border spinner-border-sm me-1"></span>Analizando PDF...';
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const { lines, numPages } = await extractStructuredLinesFromPdf(arrayBuffer);

        if (lines.length === 0) {
            showPdfImportAlert(
                'El archivo PDF no contiene texto seleccionable (parece ser una imagen escaneada sin capa de texto OCR). Por favor suba un estado de cuenta PDF digital.',
                'danger'
            );
            statePdfPreviewRows = [];
            renderPdfPreviewTable();
            return;
        }

        const headerMeta = extractPdfHeaderMetadata(lines);
        const forcedMode = modeSelect?.value || 'auto';
        const decimalSeparator = document.getElementById('pdfDecimalSeparator')?.value || ',';
        const { transactions, detectedMode } = parseBankStatementTransactionsFromLines(
            lines,
            headerMeta,
            forcedMode,
            decimalSeparator
        );

        if (transactions.length === 0) {
            showPdfImportAlert(
                `Se analizaron ${numPages} página(s) y ${lines.length} líneas de texto (separador decimal configurado: "<code>${decimalSeparator}</code>"), pero no se encontraron filas de movimientos con formato de fecha y monto reconocibles. Verifique que el separador decimal seleccionado coincida con el del PDF.`,
                'danger'
            );
            statePdfPreviewRows = [];
            renderPdfPreviewTable();
            return;
        }

        // Poblar controles de encabezado detectado
        const bancoInput = document.getElementById('pdfDetectedBanco');
        const cuentaInput = document.getElementById('pdfDetectedCuenta');
        const empresaInput = document.getElementById('pdfDetectedEmpresa');
        const monedaSelect = document.getElementById('pdfMonedaDefault');

        if (bancoInput) bancoInput.value = headerMeta.banco;
        if (cuentaInput) cuentaInput.value = headerMeta.cuenta;
        if (empresaInput) empresaInput.value = headerMeta.empresa;
        if (monedaSelect && headerMeta.moneda && SUPPORTED_CURRENCIES.includes(headerMeta.moneda)) {
            monedaSelect.value = headerMeta.moneda;
        }

        if (badgeMode) {
            const sepLabel = decimalSeparator === '.' ? 'Punto (.)' : 'Coma (,)';
            badgeMode.textContent =
                detectedMode === 'single'
                    ? `Modo: Columna Única (+ Haber / - Debe) | Decimal: ${sepLabel}`
                    : `Modo: Columnas Separadas (Débito / Crédito) | Decimal: ${sepLabel}`;
        }

        statePdfPreviewRows = transactions;
        renderPdfPreviewTable();

        showPdfImportAlert(
            `<strong>Análisis de PDF exitoso:</strong> Se extrajeron <strong>${transactions.length}</strong> movimiento(s) en ${numPages} página(s). Revise la vista previa interactiva y presione <strong>"2. Guardar Movimientos del PDF en Supabase"</strong>.`,
            'success'
        );
    } catch (err) {
        statePdfPreviewRows = [];
        renderPdfPreviewTable();
        showPdfImportAlert(`<strong>Error al procesar el PDF:</strong> ${err.message}`, 'danger');
    } finally {
        if (btnProcess) {
            btnProcess.disabled = false;
            btnProcess.innerHTML =
                '<i class="bi bi-cpu-fill me-1"></i>1. Analizar y Previsualizar PDF';
        }
    }
}

/**
 * Aplica los valores de Banco, Cuenta y Empresa de la barra de encabezado detectado
 * a todas las filas activas en la vista previa del PDF.
 */
function applyPdfHeaderToAllPreviewRows() {
    if (statePdfPreviewRows.length === 0) return;

    const bancoVal = (document.getElementById('pdfDetectedBanco')?.value || '').trim();
    const cuentaVal = (document.getElementById('pdfDetectedCuenta')?.value || '').trim();
    const empresaVal = (document.getElementById('pdfDetectedEmpresa')?.value || '').trim();

    statePdfPreviewRows = statePdfPreviewRows.map((row) => ({
        ...row,
        banco: bancoVal || row.banco,
        cuenta: cuentaVal || row.cuenta,
        empresa: empresaVal || row.empresa,
        tipo: 'CUENTA'
    }));

    renderPdfPreviewTable();
    showPdfImportAlert(
        'Datos de Banco, Cuenta y Empresa aplicados a todas las filas de la vista previa.',
        'info'
    );
}

/**
 * Descarga en un archivo CSV (UTF-8 con BOM) la tabla analizada y previsualizada del PDF
 * con los 8 campos estrictos mapeados (`Nombre del Banco`, `Nro de Cuenta Bancaria`,
 * `Fecha (YYYY-MM-DD)`, `Empresa o Titular`, `Nro de Referencia`, `Tipo`, `Debe`, `Haber`).
 */
function downloadPdfPreviewTableCsv() {
    if (!statePdfPreviewRows || statePdfPreviewRows.length === 0) {
        showPdfImportAlert(
            'Primero analice un archivo PDF para poder descargar la tabla extraída en CSV.',
            'warning'
        );
        return;
    }

    const headers = [
        'Nombre del Banco',
        'Nro de Cuenta Bancaria',
        'Fecha (YYYY-MM-DD)',
        'Nombre de la Empresa o Titular',
        'Nro de Referencia',
        'Tipo',
        'Debe',
        'Haber'
    ];

    const escapeCsvField = (val) => {
        const clean = String(val ?? '').replace(/\r?\n/g, ' ').trim();
        if (clean.includes(';') || clean.includes('"')) {
            return `"${clean.replace(/"/g, '""')}"`;
        }
        return clean;
    };

    const lines = [headers.join(';')];

    statePdfPreviewRows.forEach((row) => {
        lines.push(
            [
                escapeCsvField(row.banco || ''),
                escapeCsvField(row.cuenta || ''),
                escapeCsvField(row.fecha || ''),
                escapeCsvField(row.empresa || ''),
                escapeCsvField(row.referencia || ''),
                'CUENTA',
                Number(row.debe || 0).toFixed(2),
                Number(row.haber || 0).toFixed(2)
            ].join(';')
        );
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `estado_cuenta_pdf_analizado_${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Inserta las filas previsualizadas desde el PDF directamente en la tabla relacional
 * `public.movimientos` de Supabase (resolviendo o creando `banco_id` y `cuenta_id` y
 * asegurando `tipo = "CUENTA"`).
 */
async function savePdfPreviewToMovimientos() {
    if (statePdfPreviewRows.length === 0) {
        showPdfImportAlert('No hay movimientos en la vista previa del PDF para guardar.', 'warning');
        return;
    }

    const btnSave = document.getElementById('btnSavePdfMovimientos');
    const autoCreate = document.getElementById('chkAutoCreateBancoCuenta')?.checked ?? true;
    const monedaPlano = (document.getElementById('pdfMonedaDefault')?.value || 'VES').trim().toUpperCase();

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML =
            '<span class="spinner-border spinner-border-sm me-1"></span>Guardando en Supabase...';
    }

    try {
        const payloadsToInsert = [];
        const errors = [];

        for (let i = 0; i < statePdfPreviewRows.length; i++) {
            const row = statePdfPreviewRows[i];
            const rowNum = i + 1;

            const bancoNombre = String(row.banco || '').trim();
            const cuentaNro = String(row.cuenta || '').trim();
            const fechaIso = String(row.fecha || '').trim();
            const empresaNombre = String(row.empresa || '').trim();
            const referenciaNro = String(row.referencia || '').trim();
            const debeVal = Number(row.debe || 0);
            const haberVal = Number(row.haber || 0);

            if (!bancoNombre) {
                errors.push(`Fila #${rowNum}: El nombre del banco es obligatorio.`);
                continue;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
                errors.push(`Fila #${rowNum}: La fecha "${fechaIso}" debe tener formato YYYY-MM-DD.`);
                continue;
            }

            // 1. Resolver o crear Banco en `public.bancos`
            let bancoObj = stateBancos.find(
                (b) => b.nombre_legible.trim().toLowerCase() === bancoNombre.toLowerCase()
            );

            if (!bancoObj) {
                if (autoCreate) {
                    const { data: createdBancos, error: errB } = await supabase
                        .from('bancos')
                        .insert([
                            {
                                nombre: encryptLocalSymmetric(bancoNombre),
                                descripcion: encryptLocalSymmetric('Creado desde importación de Estado de Cuenta PDF')
                            }
                        ])
                        .select('id, created_at, nombre, descripcion');

                    if (errB || !createdBancos || createdBancos.length === 0) {
                        errors.push(`Fila #${rowNum}: No se pudo crear el banco "${bancoNombre}".`);
                        continue;
                    }

                    bancoObj = {
                        ...createdBancos[0],
                        nombre_legible: bancoNombre,
                        descripcion_legible: 'Creado desde importación de Estado de Cuenta PDF'
                    };
                    stateBancos.push(bancoObj);
                } else {
                    errors.push(`Fila #${rowNum}: El banco "${bancoNombre}" no existe en la tabla bancos.`);
                    continue;
                }
            }

            // 2. Resolver o crear Cuenta en `public.cuentas`
            let cuentaId = null;
            if (cuentaNro && cuentaNro !== 'SIN-CUENTA-DETECTADA') {
                let cuentaObj =
                    stateCuentas.find(
                        (c) =>
                            Number(c.banco_id) === Number(bancoObj.id) &&
                            c.cuenta_legible.trim().toLowerCase() === cuentaNro.toLowerCase()
                    ) ||
                    stateCuentas.find(
                        (c) => c.cuenta_legible.trim().toLowerCase() === cuentaNro.toLowerCase()
                    );

                if (!cuentaObj && autoCreate) {
                    const { data: createdCtas, error: errC } = await supabase
                        .from('cuentas')
                        .insert([
                            {
                                banco_id: bancoObj.id,
                                cuenta: encryptLocalSymmetric(cuentaNro),
                                tipo: encryptLocalSymmetric('Corriente')
                            }
                        ])
                        .select('id, created_at, banco_id, cuenta, tipo');

                    if (!errC && createdCtas && createdCtas.length > 0) {
                        cuentaObj = {
                            ...createdCtas[0],
                            cuenta_legible: cuentaNro,
                            tipo_legible: 'Corriente',
                            banco_nombre: bancoObj.nombre_legible
                        };
                        stateCuentas.push(cuentaObj);
                    }
                }

                if (cuentaObj) {
                    cuentaId = cuentaObj.id;
                }
            }

            // 3. Construir registro para `public.movimientos` con Tipo fijo = "CUENTA"
            payloadsToInsert.push({
                banco_id: bancoObj.id,
                cuenta_id: cuentaId,
                fecha: fechaIso,
                moneda: encryptLocalSymmetric(monedaPlano),
                empresa: empresaNombre ? encryptLocalSymmetric(empresaNombre) : null,
                referencia: referenciaNro ? encryptLocalSymmetric(referenciaNro) : null,
                descripcion: encryptLocalSymmetric(row.descripcion || `Estado de cuenta PDF (${cuentaNro || bancoNombre})`),
                tipo: encryptLocalSymmetric('CUENTA'),
                debe: debeVal,
                haber: haberVal
            });
        }

        if (payloadsToInsert.length > 0) {
            const BATCH_SIZE = 500;
            const totalBatches = Math.ceil(payloadsToInsert.length / BATCH_SIZE);

            for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
                const start = bIdx * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, payloadsToInsert.length);
                const chunk = payloadsToInsert.slice(start, end);

                if (btnSave) {
                    btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Guardando lote ${bIdx + 1}/${totalBatches} (${end}/${payloadsToInsert.length})...`;
                }

                const { error: insertErr } = await supabase
                    .from('movimientos')
                    .insert(chunk);

                if (insertErr) {
                    showPdfImportAlert(
                        `Error al insertar lote ${bIdx + 1}/${totalBatches} en <code>public.movimientos</code>: ${insertErr.message}`,
                        'danger'
                    );
                    return;
                }
            }
        }

        await refreshAllDatabaseData();

        statePdfPreviewRows = [];
        renderPdfPreviewTable();
        const fileInput = document.getElementById('inputPdfMovimientos');
        if (fileInput) fileInput.value = '';

        const msg = `<strong>Importación PDF completada:</strong> Se guardaron <strong>${payloadsToInsert.length}</strong> movimiento(s) en <code>public.movimientos</code> con Tipo <code>CUENTA</code>.${
            errors.length > 0 ? `<br><span class="text-danger">${errors.join('<br>')}</span>` : ''
        }`;
        showPdfImportAlert(msg, errors.length > 0 && payloadsToInsert.length === 0 ? 'danger' : 'success');
        showMovModalAlert(msg, 'success');
        showFeedback(
            `Se importaron ${payloadsToInsert.length} movimientos desde el estado de cuenta PDF.`,
            'success'
        );
    } catch (err) {
        showPdfImportAlert(`Error inesperado al guardar movimientos del PDF: ${err.message}`, 'danger');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML =
                '<i class="bi bi-cloud-check-fill me-1"></i>2. Guardar Movimientos del PDF en Supabase';
        }
    }
}

function getFilteredSortedExportRows() {
    const st = tableStates.exportSaldos;
    let rows = stateVistaResumenSaldos
        .map((v) => ({
            ...v,
            fecha: v.fecha || v.ultima_fecha || '-',
            monto: Number(v.saldo_disponible || 0)
        }))
        .filter((s) => {
            if (st.bancoId && Number(s.banco_id) !== Number(st.bancoId)) return false;
            if (st.moneda && s.moneda_legible !== st.moneda) return false;
            if (st.desde && s.fecha !== '-' && s.fecha < st.desde) return false;
            if (st.hasta && s.fecha !== '-' && s.fecha > st.hasta) return false;
            return true;
        });

    rows = filterRowsBySearch(rows, st.search, [
        'id',
        'banco_nombre',
        'fecha',
        'moneda_legible',
        'monto'
    ]);

    return sortRowsByField(rows, st.sortField, st.sortAsc);
}

/**
 * 6. Renderiza la tabla paginada, ordenable y filtrable de saldos en el módulo de Exportación.
 */
function renderExportTable() {
    const expBody = document.getElementById('exportacionTableBody');
    if (!expBody) return;

    const st = tableStates.exportSaldos;
    updateSortIndicators('theadExport', st);

    const sorted = getFilteredSortedExportRows();
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationExport', renderExportTable);

    if (pageRows.length === 0) {
        expBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">Sin registros que coincidan con el filtro para exportar.</td></tr>`;
        return;
    }

    expBody.innerHTML = '';
    pageRows.forEach((s) => {
        const mon = s.moneda_legible || 'VES';
        const montoFmt = formatCurrencyAmount(s.monto, mon);

        const trExp = document.createElement('tr');
        trExp.innerHTML = `
            <td data-label="Código (ID)" class="fw-bold">#${s.id}</td>
            <td data-label="Banco" class="fw-semibold">${s.banco_nombre}</td>
            <td data-label="Fecha">${s.fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${s.moneda_legible}</span></td>
            <td data-label="Monto Disponible" class="fw-bold">${montoFmt}</td>
        `;
        expBody.appendChild(trExp);
    });
}

/**
 * Obtiene los registros de la vista `public.vista_resumen_saldos_movimientos`
 * y de `public.movimientos` aplicando los filtros superiores del Dashboard
 * (ignorando por completo la tabla `saldos_banco`).
 */
function getDashboardGlobalFilteredData() {
    const gf = tableStates.dashGlobalFilters;

    const movsFiltered = stateMovimientos.filter((m) => {
        if (gf.bancoId && Number(m.banco_id) !== Number(gf.bancoId)) return false;
        if (gf.moneda && m.moneda_legible !== gf.moneda) return false;
        if (gf.desde && m.fecha && m.fecha < gf.desde) return false;
        if (gf.hasta && m.fecha && m.fecha > gf.hasta) return false;
        return true;
    });

    // Como la vista `public.vista_resumen_saldos_movimientos` incluye `fecha`,
    // podemos filtrar directamente sus registros por banco, moneda y rango de fechas.
    const vistaRows = stateVistaResumenSaldos.filter((v) => {
        const f = v.fecha || v.ultima_fecha || '';
        if (gf.bancoId && Number(v.banco_id) !== Number(gf.bancoId)) return false;
        if (gf.moneda && v.moneda_legible !== gf.moneda) return false;
        if (gf.desde && f && f < gf.desde) return false;
        if (gf.hasta && f && f > gf.hasta) return false;
        return true;
    });

    return { vistaRows, movsFiltered };
}

/**
 * Lista oficial de monedas soportadas en el sistema:
 * Fiat: VES, USD, EUR, YEN | Criptoactivos: USDT, BNB, BTC
 */
const SUPPORTED_CURRENCIES = ['VES', 'USD', 'EUR', 'USDT', 'BNB', 'BTC', 'YEN'];

const CURRENCY_ICONS = {
    VES: 'bi-cash-stack',
    USD: 'bi-currency-dollar',
    EUR: 'bi-currency-euro',
    USDT: 'bi-coin',
    BNB: 'bi-hexagon-half',
    BTC: 'bi-currency-bitcoin',
    YEN: 'bi-currency-yen'
};

/**
 * Formatea un monto numérico respetando la precisión de la moneda
 * (hasta 8 decimales si existen fracciones para BTC/BNB, mínimo 2 decimales).
 * @param {number} amount
 * @param {string} [moneda]
 * @returns {string}
 */
function formatCurrencyAmount(amount, moneda = 'VES') {
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

/**
 * Renderiza las barras comparativas del Dashboard tomando exclusivamente los datos
 * de la vista `public.vista_resumen_saldos_movimientos` y respetando cada moneda
 * (el porcentaje de participación de cada banco se calcula solo contra el total de su misma moneda).
 */
function renderDashboardComparativeBars(vistaList) {
    const saldosContainer = document.getElementById('dashKpiBarsSaldos');
    const movsContainer = document.getElementById('dashKpiBarsMovimientos');

    // Consolidar las filas de la vista por (Banco + Moneda) sin mezclar monedas distintas
    const consolidatedMap = new Map();
    const absTotalByMoneda = new Map();

    vistaList.forEach((v) => {
        const mon = String(v.moneda_legible || 'VES').toUpperCase();
        const key = `${v.banco_nombre} (${mon})`;
        const curr = consolidatedMap.get(key) || {
            label: key,
            banco_nombre: v.banco_nombre,
            moneda_legible: mon,
            saldo_disponible: 0,
            total_debe: 0,
            total_haber: 0,
            total_movimientos: 0
        };
        curr.saldo_disponible += Number(v.saldo_disponible || 0);
        curr.total_debe += Number(v.total_debe || 0);
        curr.total_haber += Number(v.total_haber || 0);
        curr.total_movimientos += Number(v.total_movimientos || 0);
        consolidatedMap.set(key, curr);
    });

    const consolidatedList = [...consolidatedMap.values()];
    consolidatedList.forEach((item) => {
        const mon = item.moneda_legible;
        absTotalByMoneda.set(
            mon,
            (absTotalByMoneda.get(mon) || 0) + Math.abs(Number(item.saldo_disponible || 0))
        );
    });

    if (saldosContainer) {
        if (consolidatedList.length === 0) {
            saldosContainer.innerHTML =
                '<div class="text-muted small text-center py-2">Sin registros en <code>vista_resumen_saldos_movimientos</code> para los filtros seleccionados.</div>';
        } else {
            const entries = [...consolidatedList]
                .sort((a, b) => {
                    if (a.moneda_legible !== b.moneda_legible) {
                        return (
                            SUPPORTED_CURRENCIES.indexOf(a.moneda_legible) -
                            SUPPORTED_CURRENCIES.indexOf(b.moneda_legible)
                        );
                    }
                    return Number(b.saldo_disponible || 0) - Number(a.saldo_disponible || 0);
                })
                .slice(0, 7);

            saldosContainer.innerHTML = entries
                .map((v) => {
                    const amount = Number(v.saldo_disponible || 0);
                    const monTotal = absTotalByMoneda.get(v.moneda_legible) || 0;
                    const pct =
                        monTotal > 0
                            ? Math.min(100, Math.round((Math.abs(amount) / monTotal) * 100))
                            : 0;
                    const fmt = formatCurrencyAmount(amount, v.moneda_legible);
                    return `
                        <div class="mb-2">
                            <div class="d-flex justify-content-between small fw-semibold mb-1">
                                <span>${v.banco_nombre} <span class="badge badge-status-active ms-1">${v.moneda_legible}</span></span>
                                <span>${fmt} ${v.moneda_legible} (${pct}% de ${v.moneda_legible})</span>
                            </div>
                            <div class="progress" style="height: 8px; background-color: #e2e8f0;">
                                <div
                                    class="progress-bar"
                                    role="progressbar"
                                    style="width: ${pct}%; background-color: #0d6efd;"
                                    aria-valuenow="${pct}"
                                    aria-valuemin="0"
                                    aria-valuemax="100"
                                ></div>
                            </div>
                        </div>
                    `;
                })
                .join('');
        }
    }

    if (movsContainer) {
        if (consolidatedList.length === 0) {
            movsContainer.innerHTML =
                '<div class="text-muted small text-center py-2">Sin registros en <code>vista_resumen_saldos_movimientos</code> para los filtros seleccionados.</div>';
        } else {
            const entries = [...consolidatedList]
                .sort((a, b) => Number(b.total_movimientos || 0) - Number(a.total_movimientos || 0))
                .slice(0, 7);

            movsContainer.innerHTML = entries
                .map((v) => {
                    const debe = Number(v.total_debe || 0);
                    const haber = Number(v.total_haber || 0);
                    const totalVol = debe + haber;
                    const pctDebe = totalVol > 0 ? Math.round((debe / totalVol) * 100) : 50;
                    const pctHaber = 100 - pctDebe;
                    const neto = Number(v.saldo_disponible || 0);
                    const netoFmt = formatCurrencyAmount(neto, v.moneda_legible);
                    return `
                        <div class="mb-2">
                            <div class="d-flex justify-content-between small fw-semibold mb-1">
                                <span>${v.banco_nombre} <span class="badge badge-status-active ms-1">${v.moneda_legible}</span> <span class="text-secondary">(${v.total_movimientos} movs)</span></span>
                                <span>Neto: <strong>${netoFmt} ${v.moneda_legible}</strong> (Debe ${pctDebe}% / Haber ${pctHaber}%)</span>
                            </div>
                            <div class="progress" style="height: 8px; background-color: #e2e8f0;">
                                <div
                                    class="progress-bar"
                                    role="progressbar"
                                    style="width: ${pctDebe}%; background-color: #dc3545;"
                                    title="Debe: ${pctDebe}%"
                                ></div>
                                <div
                                    class="progress-bar"
                                    role="progressbar"
                                    style="width: ${pctHaber}%; background-color: #198754;"
                                    title="Haber: ${pctHaber}%"
                                ></div>
                            </div>
                        </div>
                    `;
                })
                .join('');
        }
    }
}

const PIE_SLICE_PALETTE = [
    '#0d6efd', // Bootstrap Primary (Azul)
    '#198754', // Bootstrap Success (Verde)
    '#0dcaf0', // Bootstrap Info (Cian)
    '#ffc107', // Bootstrap Warning (Amarillo)
    '#fd7e14', // Bootstrap Orange
    '#6f42c1', // Bootstrap Indigo/Purple
    '#6c757d', // Bootstrap Secondary
    '#20c997'  // Bootstrap Teal
];

/**
 * Renderiza en la parte superior del Dashboard un gráfico de torta (SVG vectorial interactivo)
 * para cada moneda con movimientos, mostrando la distribución porcentual y en monto por banco.
 * @param {Map<string, object>} statsByMoneda
 * @param {Array<string>} currenciesOrder
 */
function renderDashboardPieChartsByCurrency(statsByMoneda, currenciesOrder) {
    const container = document.getElementById('dashPieChartsByCurrency');
    const subtitleBadge = document.getElementById('dashPieChartsSubtitle');
    if (!container) return;

    const currenciesWithData = currenciesOrder.filter((mon) => {
        const st = statsByMoneda.get(mon);
        if (!st || st.totalsByBanco.size === 0) return false;
        let sumAbs = 0;
        st.totalsByBanco.forEach((val) => {
            sumAbs += Math.abs(Number(val || 0));
        });
        return sumAbs > 0 || st.filasVista > 0;
    });

    if (subtitleBadge) {
        subtitleBadge.textContent = `${currenciesWithData.length} moneda(s) con distribución activa`;
    }

    if (currenciesWithData.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center text-muted small py-3">
                Sin movimientos registrados para generar gráficos de torta por moneda con los filtros actuales.
            </div>
        `;
        return;
    }

    const colClass =
        currenciesWithData.length === 1
            ? 'col-12 col-lg-6 mx-auto'
            : currenciesWithData.length === 2
            ? 'col-12 col-lg-6'
            : 'col-12 col-md-6 col-xl-4';

    container.innerHTML = currenciesWithData
        .map((mon) => {
            const st = statsByMoneda.get(mon);
            const bankEntries = [...st.totalsByBanco.entries()]
                .map(([bancoNombre, saldo]) => ({
                    bancoNombre,
                    saldo: Number(saldo || 0),
                    absSaldo: Math.abs(Number(saldo || 0))
                }))
                .sort((a, b) => b.absSaldo - a.absSaldo);

            const totalAbs = bankEntries.reduce((acc, item) => acc + item.absSaldo, 0);
            const netoMonedaFmt = formatCurrencyAmount(st.neto, mon);

            const cx = 100;
            const cy = 100;
            const r = 82;
            let svgPaths = '';
            let svgLabels = '';

            if (totalAbs <= 0) {
                svgPaths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#cbd5e1" stroke="#ffffff" stroke-width="2" />`;
                svgLabels = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#1e293b" font-size="12" font-weight="700">0%</text>`;
            } else if (bankEntries.length === 1) {
                const only = bankEntries[0];
                const color = PIE_SLICE_PALETTE[0];
                const fmtVal = formatCurrencyAmount(only.saldo, mon);
                svgPaths = `
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2" class="pie-svg-slice">
                        <title>${only.bancoNombre}: ${fmtVal} ${mon} (100%)</title>
                    </circle>
                `;
                svgLabels = `
                    <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700">
                        100%
                    </text>
                `;
            } else {
                let currentAngle = -Math.PI / 2;
                bankEntries.forEach((entry, idx) => {
                    if (entry.absSaldo <= 0) return;
                    const fraction = entry.absSaldo / totalAbs;
                    const pct = fraction * 100;
                    const pctStr = pct.toFixed(1);
                    const sliceAngle = fraction * Math.PI * 2;
                    const endAngle = currentAngle + sliceAngle;

                    const x1 = (cx + r * Math.cos(currentAngle)).toFixed(2);
                    const y1 = (cy + r * Math.sin(currentAngle)).toFixed(2);
                    const x2 = (cx + r * Math.cos(endAngle)).toFixed(2);
                    const y2 = (cy + r * Math.sin(endAngle)).toFixed(2);
                    const largeArc = sliceAngle > Math.PI ? 1 : 0;
                    const color = PIE_SLICE_PALETTE[idx % PIE_SLICE_PALETTE.length];
                    const fmtVal = formatCurrencyAmount(entry.saldo, mon);

                    svgPaths += `
                        <path
                            d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z"
                            fill="${color}"
                            stroke="#ffffff"
                            stroke-width="2"
                            class="pie-svg-slice"
                        >
                            <title>${entry.bancoNombre}: ${fmtVal} ${mon} (${pctStr}%)</title>
                        </path>
                    `;

                    if (pct >= 8) {
                        const midAngle = currentAngle + sliceAngle / 2;
                        const labelR = r * 0.62;
                        const lx = (cx + labelR * Math.cos(midAngle)).toFixed(2);
                        const ly = (cy + labelR * Math.sin(midAngle) + 4).toFixed(2);
                        svgLabels += `
                            <text
                                x="${lx}"
                                y="${ly}"
                                text-anchor="middle"
                                fill="#ffffff"
                                font-size="11"
                                font-weight="700"
                                pointer-events="none"
                            >${Math.round(pct)}%</text>
                        `;
                    }

                    currentAngle = endAngle;
                });
            }

            const legendHtml = bankEntries
                .map((entry, idx) => {
                    const color = PIE_SLICE_PALETTE[idx % PIE_SLICE_PALETTE.length];
                    const pct = totalAbs > 0 ? ((entry.absSaldo / totalAbs) * 100).toFixed(1) : '0.0';
                    const fmtVal = formatCurrencyAmount(entry.saldo, mon);
                    return `
                        <div class="d-flex align-items-center justify-content-between gap-2 py-1 border-bottom small">
                            <div class="d-flex align-items-center gap-2 text-truncate">
                                <span class="pie-legend-swatch" style="background-color: ${color};"></span>
                                <span class="fw-semibold text-truncate" title="${entry.bancoNombre}">${entry.bancoNombre}</span>
                            </div>
                            <div class="text-nowrap fw-bold">
                                ${fmtVal} <span class="text-secondary fw-normal">(${pct}%)</span>
                            </div>
                        </div>
                    `;
                })
                .join('');

            return `
                <div class="${colClass}">
                    <div class="pie-currency-card">
                        <div class="d-flex align-items-center justify-content-between border-bottom pb-2 mb-2">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge badge-status-active">${mon}</span>
                                <span class="small fw-bold text-uppercase text-primary">
                                    Distribución en ${mon}
                                </span>
                            </div>
                            <span class="small fw-bold text-dark">
                                Total: ${netoMonedaFmt} ${mon}
                            </span>
                        </div>
                        <div class="d-flex flex-column flex-sm-row align-items-center gap-3">
                            <div class="pie-svg-wrapper">
                                <svg viewBox="0 0 200 200" width="150" height="150" role="img" aria-label="Gráfico de torta ${mon}">
                                    ${svgPaths}
                                    ${svgLabels}
                                </svg>
                            </div>
                            <div class="flex-grow-1 w-100">
                                ${legendHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

/**
 * 7. Actualiza todos los indicadores del Dashboard tomando los saldos bancarios
 *    y métricas de flujo directamente desde `public.vista_resumen_saldos_movimientos`
 *    (resumen de `public.movimientos`, ignorando `saldos_banco`) y respetando
 *    estrictamente la moneda (`VES`, `USD`, `EUR`, `USDT`, `BNB`, `BTC`, `YEN`)
 *    para nunca sumar divisas distintas entre sí.
 */
function renderDashboardSummary() {
    const { vistaRows } = getDashboardGlobalFilteredData();
    const filterMoneda = (document.getElementById('dashFilterMoneda')?.value || '').toUpperCase();

    // Estructura de acumulación estrictamente separada por moneda
    const statsByMoneda = new Map();
    SUPPORTED_CURRENCIES.forEach((mon) => {
        statsByMoneda.set(mon, {
            moneda: mon,
            debe: 0,
            haber: 0,
            neto: 0,
            movimientos: 0,
            filasVista: 0,
            bancosSet: new Set(),
            totalsByBanco: new Map()
        });
    });

    let totalMovimientos = 0;
    let totalConCuenta = 0;
    let totalDirectoBanco = 0;
    let latestCorteDate = '';
    const bancosGlobalSet = new Set();

    vistaRows.forEach((v) => {
        const saldoVal = Number(v.saldo_disponible || 0);
        const debeVal = Number(v.total_debe || 0);
        const haberVal = Number(v.total_haber || 0);
        const movsVal = Number(v.total_movimientos || 0);
        const mon = String(v.moneda_legible || 'VES').toUpperCase();

        if (!statsByMoneda.has(mon)) {
            statsByMoneda.set(mon, {
                moneda: mon,
                debe: 0,
                haber: 0,
                neto: 0,
                movimientos: 0,
                filasVista: 0,
                bancosSet: new Set(),
                totalsByBanco: new Map()
            });
        }

        const bucket = statsByMoneda.get(mon);
        bucket.debe += debeVal;
        bucket.haber += haberVal;
        bucket.neto += saldoVal;
        bucket.movimientos += movsVal;
        bucket.filasVista += 1;
        if (v.banco_id) bucket.bancosSet.add(v.banco_id);

        const bKey = v.banco_nombre || `Banco #${v.banco_id}`;
        bucket.totalsByBanco.set(bKey, (bucket.totalsByBanco.get(bKey) || 0) + saldoVal);

        totalMovimientos += movsVal;
        totalConCuenta += Number(v.movimientos_con_cuenta || 0);
        totalDirectoBanco += Number(v.movimientos_directo_banco || 0);

        if (v.banco_id) bancosGlobalSet.add(v.banco_id);
        if (v.ultima_fecha && (!latestCorteDate || v.ultima_fecha > latestCorteDate)) {
            latestCorteDate = v.ultima_fecha;
        }
    });

    // Determinar las monedas a presentar en las tarjetas superiores
    const allCurrenciesOrder = [...statsByMoneda.keys()];
    const currenciesForCards = filterMoneda
        ? allCurrenciesOrder.filter((m) => m === filterMoneda)
        : allCurrenciesOrder;

    // Renderizar en la parte superior del Dashboard los gráficos de torta por banco en cada moneda
    renderDashboardPieChartsByCurrency(statsByMoneda, currenciesForCards);

    // Renderizar Fila 1: Tarjetas de Saldo Disponible por cada moneda (VES, USD, EUR, USDT, BNB, BTC, YEN)
    const currencyCardsContainer = document.getElementById('dashCurrencyCardsContainer');
    if (currencyCardsContainer) {
        currencyCardsContainer.innerHTML = currenciesForCards
            .map((mon) => {
                const st = statsByMoneda.get(mon);
                const netoFmt = formatCurrencyAmount(st.neto, mon);
                const debeFmt = formatCurrencyAmount(st.debe, mon);
                const haberFmt = formatCurrencyAmount(st.haber, mon);
                const iconClass = CURRENCY_ICONS[mon] || 'bi-cash-coin';
                const netoColor =
                    st.neto > 0
                        ? '#198754'
                        : st.neto < 0
                        ? '#dc3545'
                        : '#212529';
                const colClass =
                    currenciesForCards.length === 1
                        ? 'col-12 col-md-6 col-xl-4'
                        : 'col-12 col-sm-6 col-md-4 col-xl-3';

                return `
                    <div class="${colClass}">
                        <div class="card card-institutional h-100">
                            <div class="card-body py-2 px-3 d-flex align-items-center justify-content-between">
                                <div>
                                    <div class="d-flex align-items-center gap-2 mb-1">
                                        <span class="badge badge-status-active">${mon}</span>
                                        <span class="text-uppercase small fw-bold text-secondary">Saldo Disponible</span>
                                    </div>
                                    <h2 class="h6 fw-bold mb-1" style="color: ${netoColor};">${netoFmt} ${mon}</h2>
                                    <div class="small text-secondary" style="font-size: 0.76rem;">
                                        Debe: <strong>${debeFmt}</strong> | Haber: <strong>${haberFmt}</strong>
                                    </div>
                                    <div class="small text-secondary" style="font-size: 0.74rem;">
                                        ${st.bancosSet.size} banco(s) · ${st.movimientos} mov(s)
                                    </div>
                                </div>
                                <span class="fs-4 icon-box-institutional rounded-3 px-2 py-1">
                                    <i class="bi ${iconClass}"></i>
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    // Monedas con actividad (o todas las soportadas si aún no hay registros) para los desgloses de Debe, Haber y Saldo Neto Total
    const activeCurrencies = currenciesForCards.filter((mon) => {
        const st = statsByMoneda.get(mon);
        return st && (st.filasVista > 0 || st.debe !== 0 || st.haber !== 0 || st.neto !== 0);
    });
    const breakdownCurrencies = activeCurrencies.length > 0 ? activeCurrencies : currenciesForCards;

    const saldosCorteBadge = document.getElementById('dashSaldosCorteBadge');
    const viewSourceBadge = document.getElementById('dashViewSourceBadge');
    const bancosEl = document.getElementById('dashCountBancos');
    const cuentasEl = document.getElementById('dashCountCuentas');
    const saldosEl = document.getElementById('dashCountSaldos');
    const topBancoEl = document.getElementById('dashTopBancoSaldo');

    if (saldosCorteBadge) {
        saldosCorteBadge.textContent = `Corte vista: ${latestCorteDate || 'Sin fecha'}`;
    }
    if (viewSourceBadge) {
        viewSourceBadge.innerHTML = stateVistaActivaEnDb
            ? '<i class="bi bi-check-circle-fill me-1"></i>Vista activa: public.vista_resumen_saldos_movimientos'
            : '<i class="bi bi-layers-fill me-1"></i>Vista resumen de movimientos (SQL listo en Ver SQL de la Vista)';
    }
    if (bancosEl) bancosEl.textContent = String(bancosGlobalSet.size || stateBancos.length);
    if (cuentasEl) cuentasEl.textContent = String(stateCuentas.length);
    if (saldosEl) saldosEl.textContent = String(vistaRows.length);

    if (topBancoEl) {
        if (activeCurrencies.length === 0) {
            topBancoEl.textContent = 'Sin movimientos registrados';
        } else {
            topBancoEl.innerHTML = activeCurrencies
                .map((mon) => {
                    const st = statsByMoneda.get(mon);
                    let topName = 'Sin banco';
                    let topVal = -Infinity;
                    st.totalsByBanco.forEach((val, bName) => {
                        if (val > topVal) {
                            topVal = val;
                            topName = bName;
                        }
                    });
                    const valFmt = formatCurrencyAmount(topVal === -Infinity ? 0 : topVal, mon);
                    return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                        <span><span class="badge badge-status-active me-1">${mon}</span>${topName}</span>
                        <span class="fw-bold">${valFmt} ${mon}</span>
                    </div>`;
                })
                .join('');
        }
    }

    const movDebeEl = document.getElementById('dashMovTotalDebe');
    const subMovDebeEl = document.getElementById('dashSubMovDebe');
    const movHaberEl = document.getElementById('dashMovTotalHaber');
    const subMovHaberEl = document.getElementById('dashSubMovHaber');
    const movNetoEl = document.getElementById('dashMovFlujoNeto');
    const subMovNetoEl = document.getElementById('dashSubMovNeto');
    const movsEl = document.getElementById('dashCountMovs');
    const subMovEstructuraEl = document.getElementById('dashSubMovEstructura');
    const movsCorteBadge = document.getElementById('dashMovsCorteBadge');

    if (movDebeEl) {
        movDebeEl.innerHTML = breakdownCurrencies
            .map((mon) => {
                const st = statsByMoneda.get(mon);
                const fmt = formatCurrencyAmount(st.debe, mon);
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold text-danger">${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovDebeEl) {
        subMovDebeEl.textContent = `Total Debe por moneda (${vistaRows.length} resumen(es) en vista)`;
    }

    if (movHaberEl) {
        movHaberEl.innerHTML = breakdownCurrencies
            .map((mon) => {
                const st = statsByMoneda.get(mon);
                const fmt = formatCurrencyAmount(st.haber, mon);
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold text-success">${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovHaberEl) {
        subMovHaberEl.textContent = `Total Haber por moneda (${vistaRows.length} resumen(es) en vista)`;
    }

    if (movNetoEl) {
        movNetoEl.innerHTML = breakdownCurrencies
            .map((mon) => {
                const st = statsByMoneda.get(mon);
                const sign = st.neto > 0 ? '+' : '';
                const fmt = formatCurrencyAmount(st.neto, mon);
                const color =
                    st.neto >= 0 ? '#198754' : '#dc3545';
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold" style="color: ${color};">${sign}${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovNetoEl) {
        subMovNetoEl.textContent = 'Saldo Neto Total (Crédito - Débito) respetando cada moneda';
    }

    if (movsEl) movsEl.textContent = String(totalMovimientos);
    if (subMovEstructuraEl) {
        subMovEstructuraEl.innerHTML = `${totalConCuenta} con cuenta / ${totalDirectoBanco} directo a banco (<span id="dashCountCuentas">${stateCuentas.length}</span> ctas)`;
    }
    if (movsCorteBadge) {
        movsCorteBadge.textContent = `Último mov: ${latestCorteDate || 'Sin fecha'}`;
    }

    // Barras comparativas desde `vista_resumen_saldos_movimientos`
    renderDashboardComparativeBars(vistaRows);

    // Tabla de `vista_resumen_saldos_movimientos` en el Dashboard
    const summaryBody = document.getElementById('dashSaldosSummaryBody');
    if (!summaryBody) return;

    const st = tableStates.dashSaldos;
    updateSortIndicators('theadDashSaldos', st);

    const filtered = filterRowsBySearch(vistaRows, st.search, [
        'id',
        'banco_nombre',
        'cuentas_asociadas',
        'fecha',
        'ultima_fecha',
        'moneda_legible',
        'total_movimientos',
        'total_debe',
        'total_haber',
        'saldo_disponible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationDashSaldos',
        renderDashboardSummary
    );

    if (pageRows.length === 0) {
        summaryBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">Sin saldos resumidos en <code>vista_resumen_saldos_movimientos</code> que coincidan con el filtro.</td></tr>`;
        return;
    }

    summaryBody.innerHTML = '';
    pageRows.forEach((v) => {
        const mon = v.moneda_legible || 'VES';
        const debeFmt = formatCurrencyAmount(v.total_debe, mon);
        const haberFmt = formatCurrencyAmount(v.total_haber, mon);
        const saldoVal = Number(v.saldo_disponible || 0);
        const saldoFmt = formatCurrencyAmount(saldoVal, mon);
        const saldoColor = saldoVal >= 0 ? '#198754' : '#dc3545';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${v.banco_nombre}</td>
            <td data-label="Cuentas / Estructura" class="small">${v.cuentas_asociadas}</td>
            <td data-label="Fecha">${v.fecha || v.ultima_fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Movs" class="fw-semibold">${v.total_movimientos}</td>
            <td data-label="Total Debe" class="fw-bold text-danger">${debeFmt}</td>
            <td data-label="Total Haber" class="fw-bold text-success">${haberFmt}</td>
            <td data-label="Saldo Disponible" class="fw-bold" style="color: ${saldoColor};">${saldoVal >= 0 ? '+' : ''}${saldoFmt}</td>
        `;
        summaryBody.appendChild(tr);
    });
}

/**
 * 8. Renderiza la tabla paginada, ordenable y filtrable de `movimientos` en el Dashboard.
 */
function renderDashboardMovimientosTable() {
    const tbody = document.getElementById('dashMovimientosSummaryBody');
    if (!tbody) return;

    const { movsFiltered } = getDashboardGlobalFilteredData();
    const st = tableStates.dashMovimientos;
    updateSortIndicators('theadDashMovimientos', st);

    const filtered = filterRowsBySearch(movsFiltered, st.search, [
        'id',
        'banco_nombre',
        'cuenta_numero',
        'fecha',
        'moneda_legible',
        'empresa_legible',
        'referencia_legible',
        'descripcion_legible',
        'tipo_legible',
        'debe',
        'haber',
        'flujo_neto'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationDashMovimientos',
        renderDashboardMovimientosTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-3">Sin movimientos registrados que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((m) => {
        const mon = m.moneda_legible || 'VES';
        const debeFmt = formatCurrencyAmount(m.debe, mon);
        const haberFmt = formatCurrencyAmount(m.haber, mon);
        const neto = Number(m.flujo_neto || 0);
        const netoFmt = formatCurrencyAmount(neto, mon);
        const netoColor = neto >= 0 ? '#198754' : '#dc3545';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${m.id}</td>
            <td data-label="Banco" class="fw-semibold">${m.banco_nombre}</td>
            <td data-label="Cuenta" class="small">${m.cuenta_numero}</td>
            <td data-label="Fecha">${m.fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Referencia"><code>${m.referencia_legible || '-'}</code></td>
            <td data-label="Tipo"><span class="badge badge-status-alert">${m.tipo_legible || '-'}</span></td>
            <td data-label="Debe" class="fw-bold text-danger">${debeFmt}</td>
            <td data-label="Haber" class="fw-bold text-success">${haberFmt}</td>
            <td data-label="Neto" class="fw-bold" style="color: ${netoColor};">${neto >= 0 ? '+' : ''}${netoFmt}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * 9. Renderiza la tabla paginada, ordenable y filtrable de `usuarios` (si está presente).
 */
function renderUsuariosTable() {
    const tbody = document.getElementById('usuariosTableBody');
    if (!tbody) return;

    const st = tableStates.usuarios;
    updateSortIndicators('theadUsuarios', st);

    const filtered = filterRowsBySearch(stateUsuarios, st.search, ['id', 'nombre', 'rol', 'clave']);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(
        sorted,
        st,
        'paginationUsuarios',
        renderUsuariosTable
    );

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No se encontraron usuarios.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((u) => {
        const fecha = u.created_at ? new Date(u.created_at).toLocaleDateString('es-VE') : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${u.id}</td>
            <td data-label="Usuario" class="fw-semibold">${u.nombre}</td>
            <td data-label="Rol">
                <span class="badge ${u.rol === 'admin' ? 'badge-status-active' : 'badge-status-alert'}">
                    ${u.rol}
                </span>
            </td>
            <td data-label="Clave Encriptada (BD)">
                <code class="small text-break bg-light border text-dark px-2 py-1 rounded d-inline-block w-100">
                    ${u.clave}
                </code>
            </td>
            <td data-label="Fecha Registro">${fecha}</td>
        `;
        tbody.appendChild(tr);
    });
}

function resetFormBanco() {
    document.getElementById('formCrudBancos')?.reset();
    document.getElementById('bancoId').value = '';
    const badge = document.getElementById('badgeModeBanco');
    if (badge) {
        badge.textContent = 'Nuevo Banco';
        badge.className = 'badge badge-status-active';
    }
}

function resetFormCuenta() {
    document.getElementById('formCrudCuentas')?.reset();
    document.getElementById('cuentaId').value = '';
    const badge = document.getElementById('badgeModeCuenta');
    if (badge) {
        badge.textContent = 'Nueva Cuenta';
        badge.className = 'badge badge-status-active';
    }
}

function resetFormSaldo() {
    document.getElementById('formCrudSaldosBanco')?.reset();
    document.getElementById('saldoId').value = '';
    const fechaInput = document.getElementById('saldoFecha');
    if (fechaInput) fechaInput.value = new Date().toISOString().slice(0, 10);
    const badge = document.getElementById('badgeModeSaldo');
    if (badge) {
        badge.textContent = 'Nuevo Saldo';
        badge.className = 'badge badge-status-active';
    }
}

function resetFormMovimiento() {
    document.getElementById('formCrudMovimientos')?.reset();
    document.getElementById('movId').value = '';
    const fechaInput = document.getElementById('movFecha');
    if (fechaInput) fechaInput.value = new Date().toISOString().slice(0, 10);
    const badge = document.getElementById('badgeModeMovimiento');
    if (badge) {
        badge.textContent = 'Nuevo Movimiento';
        badge.className = 'badge badge-status-active';
    }
}

function switchModule(moduleKey) {
    document.querySelectorAll('.app-module').forEach((mod) => mod.classList.add('d-none'));

    const target = document.getElementById(`module-${moduleKey}`);
    if (target) target.classList.remove('d-none');

    document.querySelectorAll('.sidebar-nav .sidebar-link').forEach((link) => {
        if (link.getAttribute('data-module') === moduleKey) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    const viewTitle = document.getElementById('viewTitle');
    if (viewTitle && MODULE_TITLES[moduleKey]) {
        viewTitle.textContent = MODULE_TITLES[moduleKey];
    }

    const sidebar = document.getElementById('appSidebar');
    if (sidebar && window.innerWidth < 768) {
        sidebar.classList.remove('mobile-open');
    }
}

function exportSaldosCsv() {
    const rows = getFilteredSortedExportRows();
    const headers = ['ID', 'Banco_ID', 'Banco_Nombre', 'Ultima_Fecha', 'Moneda', 'Total_Movimientos', 'Total_Debe', 'Total_Haber', 'Saldo_Disponible'];
    const lines = [headers.join(';')];

    rows.forEach((s) => {
        const banco = (s.banco_nombre || '').replace(/;/g, ',');
        lines.push([
            s.id,
            s.banco_id,
            `"${banco}"`,
            s.fecha,
            s.moneda_legible,
            s.total_movimientos ?? 0,
            s.total_debe ?? 0,
            s.total_haber ?? 0,
            s.monto ?? 0
        ].join(';'));
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saldos_banco_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportMovimientosCsv() {
    const rows = getFilteredSortedMovimientosRows();
    const headers = ['ID', 'Banco', 'Cuenta', 'Fecha', 'Moneda', 'Empresa', 'Referencia', 'Descripcion', 'Tipo', 'Debe', 'Haber'];
    const lines = [headers.join(';')];

    rows.forEach((m) => {
        const banco = (m.banco_nombre || '').replace(/;/g, ',');
        lines.push([
            m.id,
            `"${banco}"`,
            `"${(m.cuenta_numero || '').replace(/;/g, ',')}"`,
            m.fecha || '',
            m.moneda_legible,
            `"${m.empresa_legible.replace(/;/g, ',')}"`,
            `"${m.referencia_legible.replace(/;/g, ',')}"`,
            `"${m.descripcion_legible.replace(/;/g, ',')}"`,
            `"${m.tipo_legible}"`,
            m.debe ?? 0,
            m.haber ?? 0
        ].join(';'));
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimientos_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function initAppEvents() {
    const loginForm = document.getElementById('loginForm');
    const btnTogglePassword = document.getElementById('btnTogglePassword');
    const inputUsuario = document.getElementById('inputUsuario');
    const inputClave = document.getElementById('inputClave');
    const btnSubmitLogin = document.getElementById('btnSubmitLogin');

    resetFormSaldo();
    resetFormMovimiento();

    // Configurar encabezados ordenables en todas las tablas
    bindSortableHeaders('theadMainSaldos', tableStates.mainSaldos, renderMainSaldosTable);
    bindSortableHeaders('theadModalBancos', tableStates.modalBancos, renderCrudBancosTable);
    bindSortableHeaders('theadModalCuentas', tableStates.modalCuentas, renderCrudCuentasTable);
    bindSortableHeaders('theadModalSaldos', tableStates.modalSaldos, renderModalSaldosTable);
    bindSortableHeaders('theadDashSaldos', tableStates.dashSaldos, renderDashboardSummary);
    bindSortableHeaders('theadDashMovimientos', tableStates.dashMovimientos, renderDashboardMovimientosTable);
    bindSortableHeaders('theadUsuarios', tableStates.usuarios, renderUsuariosTable);
    bindSortableHeaders('theadMovimientos', tableStates.movimientos, renderMovimientosTable);
    bindSortableHeaders('theadModalMovimientos', tableStates.modalMovimientos, renderModalMovimientosTable);
    bindSortableHeaders('theadExport', tableStates.exportSaldos, renderExportTable);

    // Eventos de filtrado por texto y tamaño de página
    document.getElementById('filterMainSaldosText')?.addEventListener('input', (e) => {
        tableStates.mainSaldos.search = e.target.value;
        tableStates.mainSaldos.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('filterSaldosBancoId')?.addEventListener('change', (e) => {
        tableStates.mainSaldos.bancoId = e.target.value;
        tableStates.mainSaldos.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('filterMainSaldosFecha')?.addEventListener('change', (e) => {
        tableStates.mainSaldos.fecha = e.target.value;
        tableStates.mainSaldos.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('pageSizeMainSaldos')?.addEventListener('change', (e) => {
        tableStates.mainSaldos.pageSize = Number(e.target.value);
        tableStates.mainSaldos.page = 1;
        renderMainSaldosTable();
    });

    document.getElementById('filterModalBancos')?.addEventListener('input', (e) => {
        tableStates.modalBancos.search = e.target.value;
        tableStates.modalBancos.page = 1;
        renderCrudBancosTable();
    });
    document.getElementById('pageSizeModalBancos')?.addEventListener('change', (e) => {
        tableStates.modalBancos.pageSize = Number(e.target.value);
        tableStates.modalBancos.page = 1;
        renderCrudBancosTable();
    });

    document.getElementById('filterModalCuentas')?.addEventListener('input', (e) => {
        tableStates.modalCuentas.search = e.target.value;
        tableStates.modalCuentas.page = 1;
        renderCrudCuentasTable();
    });
    document.getElementById('pageSizeModalCuentas')?.addEventListener('change', (e) => {
        tableStates.modalCuentas.pageSize = Number(e.target.value);
        tableStates.modalCuentas.page = 1;
        renderCrudCuentasTable();
    });

    document.getElementById('filterModalSaldos')?.addEventListener('input', (e) => {
        tableStates.modalSaldos.search = e.target.value;
        tableStates.modalSaldos.page = 1;
        renderModalSaldosTable();
    });
    document.getElementById('pageSizeModalSaldos')?.addEventListener('change', (e) => {
        tableStates.modalSaldos.pageSize = Number(e.target.value);
        tableStates.modalSaldos.page = 1;
        renderModalSaldosTable();
    });

    document.getElementById('filterModalMovimientos')?.addEventListener('input', (e) => {
        tableStates.modalMovimientos.search = e.target.value;
        tableStates.modalMovimientos.page = 1;
        renderModalMovimientosTable();
    });
    document.getElementById('pageSizeModalMovimientos')?.addEventListener('change', (e) => {
        tableStates.modalMovimientos.pageSize = Number(e.target.value);
        tableStates.modalMovimientos.page = 1;
        renderModalMovimientosTable();
    });

    document.getElementById('filterDashSaldos')?.addEventListener('input', (e) => {
        tableStates.dashSaldos.search = e.target.value;
        tableStates.dashSaldos.page = 1;
        renderDashboardSummary();
    });
    document.getElementById('pageSizeDashSaldos')?.addEventListener('change', (e) => {
        tableStates.dashSaldos.pageSize = Number(e.target.value);
        tableStates.dashSaldos.page = 1;
        renderDashboardSummary();
    });

    document.getElementById('filterDashMovimientos')?.addEventListener('input', (e) => {
        tableStates.dashMovimientos.search = e.target.value;
        tableStates.dashMovimientos.page = 1;
        renderDashboardMovimientosTable();
    });
    document.getElementById('pageSizeDashMovimientos')?.addEventListener('change', (e) => {
        tableStates.dashMovimientos.pageSize = Number(e.target.value);
        tableStates.dashMovimientos.page = 1;
        renderDashboardMovimientosTable();
    });

    // Filtros superiores de Indicadores del Dashboard (`saldos_banco` y `movimientos`)
    const triggerDashGlobalFilter = () => {
        tableStates.dashSaldos.page = 1;
        tableStates.dashMovimientos.page = 1;
        renderDashboardSummary();
        renderDashboardMovimientosTable();
    };

    document.getElementById('dashFilterBanco')?.addEventListener('change', (e) => {
        tableStates.dashGlobalFilters.bancoId = e.target.value;
        triggerDashGlobalFilter();
    });
    document.getElementById('dashFilterMoneda')?.addEventListener('change', (e) => {
        tableStates.dashGlobalFilters.moneda = e.target.value;
        triggerDashGlobalFilter();
    });
    document.getElementById('dashFilterDesde')?.addEventListener('change', (e) => {
        tableStates.dashGlobalFilters.desde = e.target.value;
        triggerDashGlobalFilter();
    });
    document.getElementById('dashFilterHasta')?.addEventListener('change', (e) => {
        tableStates.dashGlobalFilters.hasta = e.target.value;
        triggerDashGlobalFilter();
    });
    document.getElementById('btnClearDashFilters')?.addEventListener('click', () => {
        ['dashFilterBanco', 'dashFilterMoneda', 'dashFilterDesde', 'dashFilterHasta', 'filterDashSaldos', 'filterDashMovimientos'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Object.assign(tableStates.dashGlobalFilters, {
            bancoId: '',
            moneda: '',
            desde: '',
            hasta: ''
        });
        tableStates.dashSaldos.search = '';
        tableStates.dashMovimientos.search = '';
        triggerDashGlobalFilter();
    });
    document.getElementById('btnRefreshDashIndicators')?.addEventListener('click', refreshAllDatabaseData);
    document.getElementById('btnCopySqlVista')?.addEventListener('click', async () => {
        const sqlText = document.getElementById('sqlVistaCodeBlock')?.textContent || '';
        if (sqlText && navigator.clipboard) {
            await navigator.clipboard.writeText(sqlText);
            showFeedback('Script SQL de la vista `public.vista_resumen_saldos_movimientos` copiado al portapapeles.', 'success');
        }
    });

    document.getElementById('filterUsuarios')?.addEventListener('input', (e) => {
        tableStates.usuarios.search = e.target.value;
        tableStates.usuarios.page = 1;
        renderUsuariosTable();
    });
    document.getElementById('pageSizeUsuarios')?.addEventListener('change', (e) => {
        tableStates.usuarios.pageSize = Number(e.target.value);
        tableStates.usuarios.page = 1;
        renderUsuariosTable();
    });

    // Filtros de Exportación y Movimientos
    const triggerExportAndMovsRender = () => {
        tableStates.exportSaldos.page = 1;
        tableStates.movimientos.page = 1;
        renderMovimientosTable();
        renderExportTable();
    };

    document.getElementById('expFilterSearch')?.addEventListener('input', (e) => {
        tableStates.exportSaldos.search = e.target.value;
        triggerExportAndMovsRender();
    });
    document.getElementById('expFilterBanco')?.addEventListener('change', (e) => {
        tableStates.exportSaldos.bancoId = e.target.value;
        triggerExportAndMovsRender();
    });
    document.getElementById('expFilterMoneda')?.addEventListener('change', (e) => {
        tableStates.exportSaldos.moneda = e.target.value;
        triggerExportAndMovsRender();
    });
    document.getElementById('expFilterDesde')?.addEventListener('change', (e) => {
        tableStates.exportSaldos.desde = e.target.value;
        triggerExportAndMovsRender();
    });
    document.getElementById('expFilterHasta')?.addEventListener('change', (e) => {
        tableStates.exportSaldos.hasta = e.target.value;
        triggerExportAndMovsRender();
    });
    document.getElementById('pageSizeMovimientos')?.addEventListener('change', (e) => {
        tableStates.movimientos.pageSize = Number(e.target.value);
        tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });
    document.getElementById('pageSizeExport')?.addEventListener('change', (e) => {
        tableStates.exportSaldos.pageSize = Number(e.target.value);
        tableStates.exportSaldos.page = 1;
        renderExportTable();
    });
    document.getElementById('btnClearExpFilters')?.addEventListener('click', () => {
        ['expFilterSearch', 'expFilterBanco', 'expFilterMoneda', 'expFilterDesde', 'expFilterHasta'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Object.assign(tableStates.exportSaldos, {
            search: '',
            bancoId: '',
            moneda: '',
            desde: '',
            hasta: '',
            page: 1
        });
        tableStates.movimientos.page = 1;
        renderMovimientosTable();
        renderExportTable();
    });

    if (btnTogglePassword && inputClave) {
        btnTogglePassword.addEventListener('click', () => {
            const isPass = inputClave.type === 'password';
            inputClave.type = isPass ? 'text' : 'password';
            btnTogglePassword.innerHTML = isPass
                ? '<i class="bi bi-eye-slash-fill"></i>'
                : '<i class="bi bi-eye-fill"></i>';
        });
    }

    loginForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideLoginAlert();

        if (btnSubmitLogin) {
            btnSubmitLogin.disabled = true;
            btnSubmitLogin.innerHTML =
                '<span class="spinner-border spinner-border-sm me-2"></span>Verificando clave encriptada...';
        }

        try {
            const result = await authenticateUser(inputUsuario?.value, inputClave?.value);
            if (!result.ok) {
                showLoginAlert(result.message, 'danger');
            } else {
                updateAuthView(result.user);
            }
        } catch (err) {
            showLoginAlert(`Error inesperado en autenticación: ${err.message}`, 'danger');
        } finally {
            if (btnSubmitLogin) {
                btnSubmitLogin.disabled = false;
                btnSubmitLogin.innerHTML =
                    '<i class="bi bi-shield-check me-2"></i>Validar Credenciales e Ingresar';
            }
        }
    });

    // 1. Eventos CRUD `bancos`
    document.getElementById('btnResetBanco')?.addEventListener('click', resetFormBanco);
    document.getElementById('formCrudBancos')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idVal = document.getElementById('bancoId').value;
        const nombrePlano = document.getElementById('bancoNombre').value.trim();
        const descPlano = document.getElementById('bancoDescripcion').value.trim();

        if (!nombrePlano) return;

        const payload = {
            nombre: encryptLocalSymmetric(nombrePlano),
            descripcion: descPlano ? encryptLocalSymmetric(descPlano) : null
        };

        const { error } = idVal
            ? await supabase.from('bancos').update(payload).eq('id', Number(idVal))
            : await supabase.from('bancos').insert([payload]);

        if (error) {
            showFeedback(`Error al guardar en bancos: ${error.message}`, 'danger');
            return;
        }

        showFeedback(
            idVal ? `Banco #${idVal} actualizado.` : `Banco "${nombrePlano}" registrado en bancos.`,
            'success'
        );
        resetFormBanco();
        await refreshAllDatabaseData();
    });

    // 2. Eventos CRUD `cuentas`
    document.getElementById('btnResetCuenta')?.addEventListener('click', resetFormCuenta);
    document.getElementById('formCrudCuentas')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idVal = document.getElementById('cuentaId').value;
        const bancoId = Number(document.getElementById('cuentaBancoId').value);
        const cuentaPlano = document.getElementById('cuentaNumero').value.trim();
        const tipoPlano = document.getElementById('cuentaTipo').value.trim();

        if (!bancoId || !cuentaPlano) return;

        const payload = {
            banco_id: bancoId,
            cuenta: encryptLocalSymmetric(cuentaPlano),
            tipo: encryptLocalSymmetric(tipoPlano)
        };

        const { error } = idVal
            ? await supabase.from('cuentas').update(payload).eq('id', Number(idVal))
            : await supabase.from('cuentas').insert([payload]);

        if (error) {
            showFeedback(`Error al guardar en cuentas: ${error.message}`, 'danger');
            return;
        }

        showFeedback(
            idVal ? `Cuenta #${idVal} actualizada.` : 'Nueva cuenta registrada en tabla cuentas.',
            'success'
        );
        resetFormCuenta();
        await refreshAllDatabaseData();
    });

    // 3. Eventos CRUD `saldos_banco`
    document.getElementById('btnOpenModalNuevoSaldo')?.addEventListener('click', resetFormSaldo);
    document.getElementById('btnResetSaldo')?.addEventListener('click', resetFormSaldo);
    document.getElementById('formCrudSaldosBanco')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idVal = document.getElementById('saldoId').value;
        const bancoId = Number(document.getElementById('saldoBancoId').value);
        const fecha = document.getElementById('saldoFecha').value;
        const monedaPlano = document.getElementById('saldoMoneda').value.trim();
        const monto = parseFloat(document.getElementById('saldoMonto').value) || 0;

        if (!bancoId || !fecha || !monedaPlano) return;

        const payload = {
            banco_id: bancoId,
            fecha,
            monto,
            moneda: encryptLocalSymmetric(monedaPlano)
        };

        const { error } = idVal
            ? await supabase.from('saldos_banco').update(payload).eq('id', Number(idVal))
            : await supabase.from('saldos_banco').insert([payload]);

        if (error) {
            showFeedback(`Error al guardar en saldos_banco: ${error.message}`, 'danger');
            return;
        }

        showFeedback(
            idVal
                ? `Saldo #${idVal} actualizado en saldos_banco.`
                : 'Nuevo registro ingresado en saldos_banco.',
            'success'
        );
        resetFormSaldo();
        await refreshAllDatabaseData();
    });

    // 4. Eventos `movimientos` e importación desde plantilla CSV
    document.getElementById('movBancoId')?.addEventListener('change', (e) => {
        populateCuentaSelects(e.target.value);
    });
    document.getElementById('btnOpenModalMovimiento')?.addEventListener('click', resetFormMovimiento);
    document.getElementById('btnOpenModalMovimientoTop')?.addEventListener('click', resetFormMovimiento);
    document.getElementById('btnResetMovimiento')?.addEventListener('click', resetFormMovimiento);
    document.getElementById('btnDownloadPlantillaMovs')?.addEventListener('click', downloadPlantillaMovimientosCsv);
    document.getElementById('btnImportCsvMovimientos')?.addEventListener('click', importPlantillaCsvToMovimientos);
    document.getElementById('btnProcessPdfMovimientos')?.addEventListener('click', processPdfBankStatement);
    document.getElementById('btnApplyPdfHeaderToRows')?.addEventListener('click', applyPdfHeaderToAllPreviewRows);
    document.getElementById('btnDownloadPdfAnalizadoCsvTop')?.addEventListener('click', downloadPdfPreviewTableCsv);
    document.getElementById('btnDownloadPdfAnalizadoCsv')?.addEventListener('click', downloadPdfPreviewTableCsv);
    document.getElementById('btnSavePdfMovimientos')?.addEventListener('click', savePdfPreviewToMovimientos);
    document.getElementById('btnClearPdfPreview')?.addEventListener('click', () => {
        statePdfPreviewRows = [];
        renderPdfPreviewTable();
        hidePdfImportAlert();
    });
    document.getElementById('pdfMonedaDefault')?.addEventListener('change', () => {
        if (statePdfPreviewRows.length > 0) renderPdfPreviewTable();
    });
    const reprocessPdfIfFileLoaded = () => {
        const pdfInput = document.getElementById('inputPdfMovimientos');
        if (pdfInput && pdfInput.files && pdfInput.files.length > 0 && statePdfPreviewRows.length > 0) {
            processPdfBankStatement();
        }
    };
    document.getElementById('pdfDecimalSeparator')?.addEventListener('change', reprocessPdfIfFileLoaded);
    document.getElementById('pdfColumnModeSelect')?.addEventListener('change', reprocessPdfIfFileLoaded);
    document.getElementById('formCrudMovimientos')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idVal = document.getElementById('movId').value;
        const bancoId = Number(document.getElementById('movBancoId').value) || null;
        const cuentaId = Number(document.getElementById('movCuentaId').value) || null;
        const fecha = document.getElementById('movFecha').value;
        const monedaPlano = document.getElementById('movMoneda').value.trim();
        const tipoPlano = document.getElementById('movTipo').value.trim();
        const empresaPlano = document.getElementById('movEmpresa').value.trim();
        const refPlano = document.getElementById('movReferencia').value.trim();
        const descPlano = document.getElementById('movDescripcion').value.trim();
        const debe = parseFloat(document.getElementById('movDebe').value) || 0;
        const haber = parseFloat(document.getElementById('movHaber').value) || 0;

        if (!bancoId || !fecha) return;

        const payload = {
            banco_id: bancoId,
            cuenta_id: cuentaId,
            fecha,
            moneda: encryptLocalSymmetric(monedaPlano),
            tipo: encryptLocalSymmetric(tipoPlano),
            empresa: empresaPlano ? encryptLocalSymmetric(empresaPlano) : null,
            referencia: refPlano ? encryptLocalSymmetric(refPlano) : null,
            descripcion: descPlano ? encryptLocalSymmetric(descPlano) : null,
            debe,
            haber
        };

        const { error } = idVal
            ? await supabase.from('movimientos').update(payload).eq('id', Number(idVal))
            : await supabase.from('movimientos').insert([payload]);

        if (error) {
            showFeedback(`Error al guardar en movimientos: ${error.message}`, 'danger');
            return;
        }

        showFeedback(
            idVal ? `Movimiento #${idVal} actualizado.` : 'Movimiento registrado en tabla movimientos.',
            'success'
        );
        resetFormMovimiento();
        await refreshAllDatabaseData();
    });

    document.getElementById('btnRefreshAllCruds')?.addEventListener('click', refreshAllDatabaseData);

    // Navegación del panel lateral de iconos
    document.querySelectorAll('[data-module]').forEach((el) => {
        el.addEventListener('click', (event) => {
            event.preventDefault();
            const mod = el.getAttribute('data-module');
            if (mod) switchModule(mod);
        });
    });

    document.querySelectorAll('[data-go-module]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mod = btn.getAttribute('data-go-module');
            if (mod) switchModule(mod);
        });
    });

    const btnMobileSidebar = document.getElementById('btnMobileSidebar');
    const sidebar = document.getElementById('appSidebar');
    if (btnMobileSidebar && sidebar) {
        btnMobileSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }

    const handleLogout = (event) => {
        event?.preventDefault();
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        updateAuthView(null);
    };

    document.getElementById('btnSidebarLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnTopbarLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnExportCsv')?.addEventListener('click', exportSaldosCsv);
    document.getElementById('btnExportMovsCsv')?.addEventListener('click', exportMovimientosCsv);
}

document.addEventListener('DOMContentLoaded', () => {
    initAppEvents();

    const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (savedSession) {
        try {
            const parsedUser = JSON.parse(savedSession);
            if (parsedUser && parsedUser.nombre) {
                updateAuthView(parsedUser);
                return;
            }
        } catch {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
    }

    updateAuthView(null);
});
