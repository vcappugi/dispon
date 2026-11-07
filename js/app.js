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
        flujo_neto: Number(m.debe || 0) - Number(m.haber || 0)
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

async function loadBancosFromDb() {
    const { data, error } = await supabase
        .from('bancos')
        .select('id, created_at, nombre, descripcion')
        .order('id', { ascending: true });

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
    const { data, error } = await supabase
        .from('cuentas')
        .select('id, created_at, banco_id, cuenta, tipo')
        .order('id', { ascending: true });

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
    const { data, error } = await supabase
        .from('saldos_banco')
        .select('id, created_at, banco_id, fecha, monto, moneda')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false });

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
    const { data, error } = await supabase
        .from('movimientos')
        .select('id, created_at, banco_id, cuenta_id, fecha, moneda, empresa, referencia, descripcion, tipo, debe, haber')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false });

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
    const { data, error } = await supabase
        .from('vista_resumen_saldos_movimientos')
        .select('*');

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
        saldo_disponible: Number(row.saldo_disponible || 0),
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
        item.saldo_disponible += debeVal - haberVal;
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
        const saldoColor = saldoVal >= 0 ? 'var(--bg-green-deep)' : 'var(--accent-orange-dark)';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${v.banco_nombre}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Movs" class="fw-semibold">${v.total_movimientos}</td>
            <td data-label="Total Debe" class="fw-bold" style="color: var(--bg-green-deep);">${debeFmt}</td>
            <td data-label="Total Haber" class="fw-bold" style="color: var(--accent-orange-dark);">${haberFmt}</td>
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
        const debeFmt = Number(m.debe || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const haberFmt = Number(m.haber || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
        const debeFmt = Number(m.debe || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const haberFmt = Number(m.haber || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            const debeVal = parseFloat(String(cols[8] || '0').replace(',', '.')) || 0;
            const haberVal = parseFloat(String(cols[9] || '0').replace(',', '.')) || 0;

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
            const { error: insertErr } = await supabase
                .from('movimientos')
                .insert(payloadsToInsert);

            if (insertErr) {
                showMovModalAlert(
                    `Error al insertar en <code>public.movimientos</code>: ${insertErr.message}`,
                    'danger'
                );
                return;
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
        const montoFmt = Number(s.monto || 0).toLocaleString('es-VE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

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
                                    style="width: ${pct}%; background-color: var(--bg-green-deep);"
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
                                    style="width: ${pctDebe}%; background-color: var(--bg-green-deep);"
                                    title="Debe: ${pctDebe}%"
                                ></div>
                                <div
                                    class="progress-bar"
                                    role="progressbar"
                                    style="width: ${pctHaber}%; background-color: var(--accent-orange);"
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
                        ? 'var(--bg-green-deep)'
                        : st.neto < 0
                        ? 'var(--accent-orange-dark)'
                        : '#1e293b';
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
                    <span class="fw-bold" style="color: var(--bg-green-deep);">${fmt} ${mon}</span>
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
                    <span class="fw-bold" style="color: var(--accent-orange-dark);">${fmt} ${mon}</span>
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
                    st.neto >= 0 ? 'var(--bg-green-deep)' : 'var(--accent-orange-dark)';
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold" style="color: ${color};">${sign}${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovNetoEl) {
        subMovNetoEl.textContent = 'Saldo Neto Total (Debe - Haber) respetando cada moneda';
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
        const saldoColor = saldoVal >= 0 ? 'var(--bg-green-deep)' : 'var(--accent-orange-dark)';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${v.banco_nombre}</td>
            <td data-label="Cuentas / Estructura" class="small">${v.cuentas_asociadas}</td>
            <td data-label="Fecha">${v.fecha || v.ultima_fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Movs" class="fw-semibold">${v.total_movimientos}</td>
            <td data-label="Total Debe" class="fw-bold" style="color: var(--bg-green-deep);">${debeFmt}</td>
            <td data-label="Total Haber" class="fw-bold" style="color: var(--accent-orange-dark);">${haberFmt}</td>
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

    const fmtNum = (n) =>
        Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    tbody.innerHTML = '';
    pageRows.forEach((m) => {
        const neto = Number(m.flujo_neto || 0);
        const netoColor = neto >= 0 ? 'var(--bg-green-deep)' : 'var(--accent-orange-dark)';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${m.id}</td>
            <td data-label="Banco" class="fw-semibold">${m.banco_nombre}</td>
            <td data-label="Cuenta" class="small">${m.cuenta_numero}</td>
            <td data-label="Fecha">${m.fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${m.moneda_legible}</span></td>
            <td data-label="Referencia"><code>${m.referencia_legible || '-'}</code></td>
            <td data-label="Tipo"><span class="badge badge-status-alert">${m.tipo_legible || '-'}</span></td>
            <td data-label="Debe" class="fw-bold" style="color: var(--bg-green-deep);">${fmtNum(m.debe)}</td>
            <td data-label="Haber" class="fw-bold" style="color: var(--accent-orange-dark);">${fmtNum(m.haber)}</td>
            <td data-label="Neto" class="fw-bold" style="color: ${netoColor};">${neto >= 0 ? '+' : ''}${fmtNum(neto)}</td>
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
    const btnFillTestUser = document.getElementById('btnFillTestUser');
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

    btnFillTestUser?.addEventListener('click', () => {
        if (inputUsuario) inputUsuario.value = 'vcappugi';
        if (inputClave) inputClave.value = '10838729';
        hideLoginAlert();
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
