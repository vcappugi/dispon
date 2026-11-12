/**
 * @file js/modules/movimientosModule.js
 * @description Controlador CRUD completo de `public.movimientos` con filtros multicriterio y totales.
 */

import { encryptLocalSymmetric } from '../crypto-helper.js';
import { supabase } from '../core/supabaseClient.js';
import { appState, populateCuentaSelectById } from '../core/state.js';
import { refreshAllDatabaseData } from '../core/dataService.js';
import { formatCurrencyAmount, escapeHtml, showFeedback } from '../utils/formatters.js';
import {
    sortRowsByField,
    filterRowsBySearch,
    paginateAndRenderControls,
    updateSortIndicators,
    bindSortableHeaders
} from '../utils/tableHelpers.js';

export function resetFormMovimiento() {
    document.getElementById('movId').value = '';
    document.getElementById('formCrudMovimientos')?.reset();
    const fechaInput = document.getElementById('movFecha');
    if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

    populateCuentaSelectById('movCuentaId', '', '-- Directo a Banco (Sin cuenta) --');

    const badge = document.getElementById('badgeModeMovimiento');
    if (badge) {
        badge.textContent = 'Nuevo Movimiento';
        badge.className = 'badge badge-status-active';
    }
}

export function getFilteredMovimientosRows() {
    const st = appState.tableStates.movimientos;
    const targetMoneda = (st.moneda || '').toUpperCase();

    const filteredByControls = appState.movimientos.filter((m) => {
        if (st.bancoId && Number(m.banco_id) !== Number(st.bancoId)) return false;
        if (st.cuentaId && Number(m.cuenta_id) !== Number(st.cuentaId)) return false;
        if (targetMoneda && String(m.moneda_legible || '').toUpperCase() !== targetMoneda) return false;
        if (st.desde && (!m.fecha || m.fecha < st.desde)) return false;
        if (st.hasta && (!m.fecha || m.fecha > st.hasta)) return false;
        return true;
    });

    return filterRowsBySearch(filteredByControls, st.search, [
        'id',
        'fecha',
        'banco_nombre',
        'cuenta_numero',
        'empresa_legible',
        'referencia_legible',
        'descripcion_legible',
        'tipo_legible',
        'moneda_legible'
    ]);
}

export function renderMovimientosTable() {
    const tbody = document.getElementById('movimientosTableBody');
    if (!tbody) return;

    const st = appState.tableStates.movimientos;
    updateSortIndicators('theadMovimientos', st);

    const filtered = getFilteredMovimientosRows();

    let totalDebe = 0;
    let totalHaber = 0;
    filtered.forEach((m) => {
        totalDebe += Number(m.debe || 0);
        totalHaber += Number(m.haber || 0);
    });
    const netoTotal = totalHaber - totalDebe;

    const countBadge = document.getElementById('movFilteredCountBadge');
    const debeBadge = document.getElementById('movFilteredDebeBadge');
    const haberBadge = document.getElementById('movFilteredHaberBadge');
    const netoBadge = document.getElementById('movFilteredNetoBadge');
    const monLabel = st.moneda ? ` ${st.moneda}` : '';

    if (countBadge) countBadge.textContent = `${filtered.length} movimiento(s)`;
    if (debeBadge) debeBadge.textContent = `Debe: ${formatCurrencyAmount(totalDebe, st.moneda || 'VES')}${monLabel}`;
    if (haberBadge) haberBadge.textContent = `Haber: ${formatCurrencyAmount(totalHaber, st.moneda || 'VES')}${monLabel}`;
    if (netoBadge) {
        netoBadge.textContent = `Neto (Haber - Debe): ${netoTotal >= 0 ? '+' : ''}${formatCurrencyAmount(netoTotal, st.moneda || 'VES')}${monLabel}`;
        netoBadge.className = `badge ${netoTotal >= 0 ? 'bg-dark' : 'bg-warning text-dark'}`;
    }

    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationMovimientos', renderMovimientosTable);

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-3">No existen movimientos que coincidan con los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((m) => {
        const mon = m.moneda_legible || 'VES';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="ID" class="fw-bold">#${m.id}</td>
            <td data-label="Fecha">${m.fecha || '-'}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(m.banco_nombre)}</td>
            <td data-label="Cuenta" class="small">${escapeHtml(m.cuenta_numero)}</td>
            <td data-label="Empresa" class="small">${escapeHtml(m.empresa_legible || '-')}</td>
            <td data-label="Referencia"><code>${escapeHtml(m.referencia_legible || '-')}</code></td>
            <td data-label="Descripción" class="small">
                <span class="badge bg-secondary me-1">${mon}</span>
                ${escapeHtml(m.descripcion_legible || '-')}
            </td>
            <td data-label="Debe" class="fw-bold text-danger">${formatCurrencyAmount(m.debe, mon)}</td>
            <td data-label="Haber" class="fw-bold text-success">${formatCurrencyAmount(m.haber, mon)}</td>
            <td data-label="Acciones">
                <div class="d-flex gap-1">
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
            const found = appState.movimientos.find((x) => Number(x.id) === id);
            if (!found) return;

            document.getElementById('movId').value = String(found.id);
            document.getElementById('movBancoId').value = String(found.banco_id);
            populateCuentaSelectById('movCuentaId', found.banco_id, '-- Directo a Banco (Sin cuenta) --');
            document.getElementById('movCuentaId').value = found.cuenta_id ? String(found.cuenta_id) : '';
            document.getElementById('movFecha').value = found.fecha || '';
            document.getElementById('movMoneda').value = found.moneda_legible || 'VES';
            document.getElementById('movTipo').value = found.tipo_legible || 'CUENTA';
            document.getElementById('movEmpresa').value = found.empresa_legible || '';
            document.getElementById('movReferencia').value = found.referencia_legible || '';
            document.getElementById('movDescripcion').value = found.descripcion_legible || '';
            document.getElementById('movDebe').value = String(found.debe ?? 0);
            document.getElementById('movHaber').value = String(found.haber ?? 0);

            const badge = document.getElementById('badgeModeMovimiento');
            if (badge) {
                badge.textContent = `Editando #${found.id}`;
                badge.className = 'badge badge-status-alert';
            }

            const collapseEl = document.getElementById('collapseFormMovimiento');
            if (collapseEl && !collapseEl.classList.contains('show') && window.bootstrap) {
                new window.bootstrap.Collapse(collapseEl, { toggle: false }).show();
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    tbody.querySelectorAll('.btn-del-mov').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar el movimiento ID #${id}?`)) return;
            const { error } = await supabase.from('movimientos').delete().eq('id', id);
            if (error) {
                showFeedback(`Error al eliminar movimiento: ${error.message}`, 'danger');
                return;
            }
            showFeedback(`Movimiento #${id} eliminado.`, 'warning');
            resetFormMovimiento();
            await refreshAllDatabaseData();
        });
    });
}

export function initMovimientosModule() {
    resetFormMovimiento();

    bindSortableHeaders('theadMovimientos', appState.tableStates.movimientos, renderMovimientosTable);

    document.getElementById('movBancoId')?.addEventListener('change', (e) => {
        populateCuentaSelectById('movCuentaId', e.target.value, '-- Directo a Banco (Sin cuenta) --');
    });

    document.getElementById('filterMovBancoId')?.addEventListener('change', (e) => {
        appState.tableStates.movimientos.bancoId = e.target.value;
        appState.tableStates.movimientos.cuentaId = '';
        populateCuentaSelectById('filterMovCuentaId', e.target.value, 'Todas las cuentas');
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('filterMovCuentaId')?.addEventListener('change', (e) => {
        appState.tableStates.movimientos.cuentaId = e.target.value;
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('filterMovMoneda')?.addEventListener('change', (e) => {
        appState.tableStates.movimientos.moneda = e.target.value;
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('filterMovDesde')?.addEventListener('change', (e) => {
        appState.tableStates.movimientos.desde = e.target.value;
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('filterMovHasta')?.addEventListener('change', (e) => {
        appState.tableStates.movimientos.hasta = e.target.value;
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('filterMovSearch')?.addEventListener('input', (e) => {
        appState.tableStates.movimientos.search = e.target.value;
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('pageSizeMovimientos')?.addEventListener('change', (e) => {
        appState.tableStates.movimientos.pageSize = Number(e.target.value);
        appState.tableStates.movimientos.page = 1;
        renderMovimientosTable();
    });

    document.getElementById('btnClearMovFilters')?.addEventListener('click', () => {
        [
            'filterMovBancoId',
            'filterMovCuentaId',
            'filterMovMoneda',
            'filterMovDesde',
            'filterMovHasta',
            'filterMovSearch'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Object.assign(appState.tableStates.movimientos, {
            search: '',
            bancoId: '',
            cuentaId: '',
            moneda: '',
            desde: '',
            hasta: '',
            page: 1
        });
        populateCuentaSelectById('filterMovCuentaId', '', 'Todas las cuentas');
        renderMovimientosTable();
    });

    document.getElementById('btnResetMovimiento')?.addEventListener('click', resetFormMovimiento);

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
}

