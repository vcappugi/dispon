/**
 * @file js/modules/exportacionModule.js
 * @description Controlador de filtros multicriterio, vista previa y descarga CSV en Reportes y Exportación.
 */

import { appState } from '../core/state.js';
import { formatCurrencyAmount, escapeHtml, showFeedback } from '../utils/formatters.js';
import {
    sortRowsByField,
    filterRowsBySearch,
    paginateAndRenderControls,
    updateSortIndicators,
    bindSortableHeaders
} from '../utils/tableHelpers.js';
import { downloadCsvFile } from '../utils/csvUtils.js';

function getFilteredExportRows() {
    const st = appState.tableStates.exportSaldos;
    const targetMoneda = (st.moneda || '').toUpperCase();

    const filteredByControls = appState.vistaResumenSaldos.filter((v) => {
        if (st.bancoId && Number(v.banco_id) !== Number(st.bancoId)) return false;
        if (targetMoneda && String(v.moneda_legible || '').toUpperCase() !== targetMoneda) return false;
        const rowFecha = v.fecha || v.ultima_fecha || '';
        if (st.desde && (!rowFecha || rowFecha < st.desde)) return false;
        if (st.hasta && (!rowFecha || rowFecha > st.hasta)) return false;
        return true;
    });

    const filtered = filterRowsBySearch(filteredByControls, st.search, [
        'id',
        'banco_nombre',
        'fecha',
        'moneda_legible',
        'saldo_disponible'
    ]);

    return sortRowsByField(filtered, st.sortField, st.sortAsc);
}

export function renderExportTable() {
    const exportBody = document.getElementById('exportacionTableBody');
    const countBadge = document.getElementById('expPreviewCountBadge');
    if (!exportBody) return;

    const st = appState.tableStates.exportSaldos;
    updateSortIndicators('theadExport', st);

    const sorted = getFilteredExportRows();
    if (countBadge) countBadge.textContent = `${sorted.length} registro(s)`;

    const pageRows = paginateAndRenderControls(sorted, st, 'paginationExport', renderExportTable);

    if (pageRows.length === 0) {
        exportBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Sin datos de resumen para exportar con los filtros actuales.</td></tr>`;
        return;
    }

    exportBody.innerHTML = '';
    pageRows.forEach((v) => {
        const mon = v.moneda_legible || 'VES';
        const saldoVal = Number(v.saldo_disponible || 0);
        const saldoColor = saldoVal >= 0 ? '#198754' : '#dc3545';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(v.banco_nombre)}</td>
            <td data-label="Fecha">${v.fecha || v.ultima_fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Total Debe" class="fw-bold text-danger">${formatCurrencyAmount(v.total_debe, mon)}</td>
            <td data-label="Total Haber" class="fw-bold text-success">${formatCurrencyAmount(v.total_haber, mon)}</td>
            <td data-label="Saldo Disponible" class="fw-bold" style="color: ${saldoColor};">${saldoVal >= 0 ? '+' : ''}${formatCurrencyAmount(saldoVal, mon)}</td>
        `;
        exportBody.appendChild(tr);
    });
}

function exportSaldosCsv() {
    const rows = getFilteredExportRows();
    if (rows.length === 0) {
        showFeedback('No hay saldos consolidados que exportar con los filtros actuales.', 'warning');
        return;
    }

    const headers = [
        'Codigo ID',
        'Banco',
        'Fecha',
        'Moneda',
        'Movimientos',
        'Total Debe',
        'Total Haber',
        'Saldo Disponible'
    ];

    const dataRows = rows.map((r) => [
        r.id,
        r.banco_nombre,
        r.fecha || r.ultima_fecha || '',
        r.moneda_legible || 'VES',
        r.total_movimientos || 0,
        Number(r.total_debe || 0).toFixed(2),
        Number(r.total_haber || 0).toFixed(2),
        Number(r.saldo_disponible || 0).toFixed(2)
    ]);

    downloadCsvFile(
        `reporte_saldos_consolidados_${new Date().toISOString().slice(0, 10)}.csv`,
        headers,
        dataRows,
        true
    );
    showFeedback(`Exportados ${rows.length} registros de saldos en CSV.`, 'success');
}

function exportMovimientosCsv() {
    const st = appState.tableStates.exportSaldos;
    const targetMoneda = (st.moneda || '').toUpperCase();

    const rows = appState.movimientos.filter((m) => {
        if (st.bancoId && Number(m.banco_id) !== Number(st.bancoId)) return false;
        if (targetMoneda && String(m.moneda_legible || '').toUpperCase() !== targetMoneda) return false;
        if (st.desde && (!m.fecha || m.fecha < st.desde)) return false;
        if (st.hasta && (!m.fecha || m.fecha > st.hasta)) return false;
        return true;
    });

    if (rows.length === 0) {
        showFeedback('No hay movimientos que exportar con los filtros actuales.', 'warning');
        return;
    }

    const headers = [
        'Codigo ID',
        'Fecha',
        'Banco',
        'Cuenta',
        'Moneda',
        'Empresa',
        'Referencia',
        'Descripcion',
        'Tipo',
        'Debe',
        'Haber',
        'Neto (Haber - Debe)'
    ];

    const dataRows = rows.map((m) => [
        m.id,
        m.fecha || '',
        m.banco_nombre || '',
        m.cuenta_numero || '',
        m.moneda_legible || 'VES',
        m.empresa_legible || '',
        m.referencia_legible || '',
        m.descripcion_legible || '',
        m.tipo_legible || '',
        Number(m.debe || 0).toFixed(2),
        Number(m.haber || 0).toFixed(2),
        Number(m.flujo_neto || 0).toFixed(2)
    ]);

    downloadCsvFile(
        `reporte_movimientos_${new Date().toISOString().slice(0, 10)}.csv`,
        headers,
        dataRows,
        true
    );
    showFeedback(`Exportados ${rows.length} movimientos en CSV.`, 'success');
}

export function initExportacionModule() {
    bindSortableHeaders('theadExport', appState.tableStates.exportSaldos, renderExportTable);

    const triggerFilter = () => {
        appState.tableStates.exportSaldos.page = 1;
        renderExportTable();
    };

    document.getElementById('expFilterBanco')?.addEventListener('change', (e) => {
        appState.tableStates.exportSaldos.bancoId = e.target.value;
        triggerFilter();
    });
    document.getElementById('expFilterMoneda')?.addEventListener('change', (e) => {
        appState.tableStates.exportSaldos.moneda = e.target.value;
        triggerFilter();
    });
    document.getElementById('expFilterDesde')?.addEventListener('change', (e) => {
        appState.tableStates.exportSaldos.desde = e.target.value;
        triggerFilter();
    });
    document.getElementById('expFilterHasta')?.addEventListener('change', (e) => {
        appState.tableStates.exportSaldos.hasta = e.target.value;
        triggerFilter();
    });
    document.getElementById('expSearchText')?.addEventListener('input', (e) => {
        appState.tableStates.exportSaldos.search = e.target.value;
        triggerFilter();
    });
    document.getElementById('pageSizeExport')?.addEventListener('change', (e) => {
        appState.tableStates.exportSaldos.pageSize = Number(e.target.value);
        triggerFilter();
    });

    document.getElementById('btnClearExpFilters')?.addEventListener('click', () => {
        ['expFilterBanco', 'expFilterMoneda', 'expFilterDesde', 'expFilterHasta', 'expSearchText'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Object.assign(appState.tableStates.exportSaldos, {
            search: '',
            bancoId: '',
            moneda: '',
            desde: '',
            hasta: '',
            page: 1
        });
        renderExportTable();
    });

    document.getElementById('btnExportCsvSaldos')?.addEventListener('click', exportSaldosCsv);
    document.getElementById('btnExportCsvMovimientos')?.addEventListener('click', exportMovimientosCsv);
}
