/**
 * @file js/modules/saldosModule.js
 * @description Controlador para Saldos Consolidados (`vista_resumen_saldos_movimientos`) y CRUD de `public.saldos_banco`.
 */

import { encryptLocalSymmetric } from '../crypto-helper.js';
import { supabase } from '../core/supabaseClient.js';
import { appState } from '../core/state.js';
import { refreshAllDatabaseData } from '../core/dataService.js';
import { formatCurrencyAmount, escapeHtml, showFeedback } from '../utils/formatters.js';
import {
    sortRowsByField,
    filterRowsBySearch,
    paginateAndRenderControls,
    updateSortIndicators,
    bindSortableHeaders
} from '../utils/tableHelpers.js';

export function resetFormSaldo() {
    document.getElementById('saldoId').value = '';
    document.getElementById('formCrudSaldosBanco')?.reset();
    const fechaInput = document.getElementById('saldoFecha');
    if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

    const badge = document.getElementById('badgeModeSaldo');
    if (badge) {
        badge.textContent = 'Nuevo Saldo';
        badge.className = 'badge badge-status-active';
    }
}

export function renderMainSaldosTable() {
    const saldosBody = document.getElementById('saldosBancoTableBody');
    if (!saldosBody) return;

    const st = appState.tableStates.saldosConsolidados;
    updateSortIndicators('theadMainSaldos', st);

    const corteBadge = document.getElementById('badgeMainSaldosCorte');
    if (corteBadge) {
        corteBadge.textContent = st.fecha
            ? `Total acumulado hasta: ${st.fecha}`
            : 'Totalizado por Banco y Moneda (Acumulado General)';
    }

    let sourceRows = appState.vistaResumenSaldos;
    if (st.bancoId) {
        sourceRows = sourceRows.filter((v) => Number(v.banco_id) === Number(st.bancoId));
    }
    if (st.fecha) {
        sourceRows = sourceRows.filter((v) => {
            const rowFecha = v.fecha || v.ultima_fecha || '';
            return rowFecha && rowFecha <= st.fecha;
        });
    }

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
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationMainSaldos', renderMainSaldosTable);

    if (pageRows.length === 0) {
        saldosBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Sin saldos consolidados que coincidan con el filtro.</td></tr>`;
        return;
    }

    saldosBody.innerHTML = '';
    pageRows.forEach((v) => {
        const mon = v.moneda_legible || 'VES';
        const saldoVal = Number(v.saldo_disponible || 0);
        const saldoColor = saldoVal >= 0 ? '#198754' : '#dc3545';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(v.banco_nombre)}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Movimientos" class="fw-semibold">${v.total_movimientos}</td>
            <td data-label="Total Debe" class="fw-bold text-danger">${formatCurrencyAmount(v.total_debe, mon)}</td>
            <td data-label="Total Haber" class="fw-bold text-success">${formatCurrencyAmount(v.total_haber, mon)}</td>
            <td data-label="Saldo Disponible" class="fw-bold" style="color: ${saldoColor};">${saldoVal >= 0 ? '+' : ''}${formatCurrencyAmount(saldoVal, mon)}</td>
        `;
        saldosBody.appendChild(tr);
    });
}

export function renderSaldosManualTable() {
    const tbody = document.getElementById('saldosManualTableBody');
    const totalBadge = document.getElementById('saldosManualTotalBadge');
    if (!tbody) return;

    const st = appState.tableStates.saldosBanco;
    updateSortIndicators('theadSaldosManual', st);

    let source = appState.saldosBanco;
    if (st.bancoId) {
        source = source.filter((s) => Number(s.banco_id) === Number(st.bancoId));
    }

    if (totalBadge) totalBadge.textContent = `${source.length} registro(s)`;

    const filtered = filterRowsBySearch(source, st.search, [
        'id',
        'banco_nombre',
        'fecha',
        'moneda_legible',
        'monto'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationSaldosManual', renderSaldosManualTable);

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted small py-3">No existen registros en <code>public.saldos_banco</code>.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((s) => {
        const mon = s.moneda_legible || 'VES';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="ID" class="fw-bold">#${s.id}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(s.banco_nombre)}</td>
            <td data-label="Fecha">${s.fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Monto" class="fw-bold text-primary">${formatCurrencyAmount(s.monto, mon)}</td>
            <td data-label="Acciones">
                <div class="d-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-saldo-manual" data-id="${s.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-saldo-manual" data-id="${s.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-saldo-manual').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const found = appState.saldosBanco.find((x) => Number(x.id) === id);
            if (!found) return;
            document.getElementById('saldoId').value = String(found.id);
            document.getElementById('saldoBancoId').value = String(found.banco_id);
            document.getElementById('saldoFecha').value = found.fecha || '';
            document.getElementById('saldoMoneda').value = found.moneda_legible || 'VES';
            document.getElementById('saldoMonto').value = String(found.monto ?? 0);
            const badge = document.getElementById('badgeModeSaldo');
            if (badge) {
                badge.textContent = `Editando #${found.id}`;
                badge.className = 'badge badge-status-alert';
            }
        });
    });

    tbody.querySelectorAll('.btn-del-saldo-manual').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar el registro de saldo ID #${id}?`)) return;
            const { error } = await supabase.from('saldos_banco').delete().eq('id', id);
            if (error) {
                showFeedback(`Error al eliminar saldo: ${error.message}`, 'danger');
                return;
            }
            showFeedback(`Saldo #${id} eliminado.`, 'warning');
            resetFormSaldo();
            await refreshAllDatabaseData();
        });
    });
}

export function renderSaldosScreen() {
    renderMainSaldosTable();
    renderSaldosManualTable();
}

export function initSaldosModule() {
    resetFormSaldo();

    bindSortableHeaders('theadMainSaldos', appState.tableStates.saldosConsolidados, renderMainSaldosTable);
    bindSortableHeaders('theadSaldosManual', appState.tableStates.saldosBanco, renderSaldosManualTable);

    // Filtros consolidado
    document.getElementById('filterSaldosBancoId')?.addEventListener('change', (e) => {
        appState.tableStates.saldosConsolidados.bancoId = e.target.value;
        appState.tableStates.saldosConsolidados.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('filterSaldosFecha')?.addEventListener('change', (e) => {
        appState.tableStates.saldosConsolidados.fecha = e.target.value;
        appState.tableStates.saldosConsolidados.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('filterMainSaldos')?.addEventListener('input', (e) => {
        appState.tableStates.saldosConsolidados.search = e.target.value;
        appState.tableStates.saldosConsolidados.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('pageSizeMainSaldos')?.addEventListener('change', (e) => {
        appState.tableStates.saldosConsolidados.pageSize = Number(e.target.value);
        appState.tableStates.saldosConsolidados.page = 1;
        renderMainSaldosTable();
    });
    document.getElementById('btnClearMainSaldosFilter')?.addEventListener('click', () => {
        ['filterSaldosBancoId', 'filterSaldosFecha', 'filterMainSaldos'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Object.assign(appState.tableStates.saldosConsolidados, {
            search: '',
            bancoId: '',
            fecha: '',
            page: 1
        });
        renderMainSaldosTable();
    });

    // Filtros y CRUD Manual `saldos_banco`
    document.getElementById('filterSaldosManualBancoId')?.addEventListener('change', (e) => {
        appState.tableStates.saldosBanco.bancoId = e.target.value;
        appState.tableStates.saldosBanco.page = 1;
        renderSaldosManualTable();
    });
    document.getElementById('filterSaldosManual')?.addEventListener('input', (e) => {
        appState.tableStates.saldosBanco.search = e.target.value;
        appState.tableStates.saldosBanco.page = 1;
        renderSaldosManualTable();
    });
    document.getElementById('pageSizeSaldosManual')?.addEventListener('change', (e) => {
        appState.tableStates.saldosBanco.pageSize = Number(e.target.value);
        appState.tableStates.saldosBanco.page = 1;
        renderSaldosManualTable();
    });

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
}
