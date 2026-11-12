/**
 * @file js/modules/dashboardModule.js
 * @description Controlador de indicadores, gráficos SVG por moneda y tablas del Dashboard.
 */

import { appState } from '../core/state.js';
import { refreshAllDatabaseData } from '../core/dataService.js';
import {
    SUPPORTED_CURRENCIES,
    CURRENCY_ICONS,
    PIE_SLICE_PALETTE,
    formatCurrencyAmount,
    escapeHtml
} from '../utils/formatters.js';
import {
    sortRowsByField,
    filterRowsBySearch,
    paginateAndRenderControls,
    updateSortIndicators,
    bindSortableHeaders
} from '../utils/tableHelpers.js';

function getDashboardGlobalFilteredData() {
    const f = appState.tableStates.dashGlobalFilters;
    const targetMoneda = (f.moneda || '').toUpperCase();

    const vistaRows = appState.vistaResumenSaldos.filter((v) => {
        if (f.bancoId && Number(v.banco_id) !== Number(f.bancoId)) return false;
        if (targetMoneda && String(v.moneda_legible || '').toUpperCase() !== targetMoneda) return false;
        const rowFecha = v.fecha || v.ultima_fecha || '';
        if (f.desde && rowFecha && rowFecha < f.desde) return false;
        if (f.hasta && rowFecha && rowFecha > f.hasta) return false;
        return true;
    });

    const movsFiltered = appState.movimientos.filter((m) => {
        if (f.bancoId && Number(m.banco_id) !== Number(f.bancoId)) return false;
        if (targetMoneda && String(m.moneda_legible || '').toUpperCase() !== targetMoneda) return false;
        if (f.desde && (!m.fecha || m.fecha < f.desde)) return false;
        if (f.hasta && (!m.fecha || m.fecha > f.hasta)) return false;
        return true;
    });

    return { vistaRows, movsFiltered };
}

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
                svgPaths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ced4da" stroke="#ffffff" stroke-width="2" />`;
                svgLabels = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#212529" font-size="12" font-weight="700">0%</text>`;
            } else if (bankEntries.length === 1) {
                const only = bankEntries[0];
                const color = PIE_SLICE_PALETTE[0];
                const fmtVal = formatCurrencyAmount(only.saldo, mon);
                svgPaths = `
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2" class="pie-svg-slice">
                        <title>${escapeHtml(only.bancoNombre)}: ${fmtVal} ${mon} (100%)</title>
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
                            <title>${escapeHtml(entry.bancoNombre)}: ${fmtVal} ${mon} (${pct.toFixed(1)}%)</title>
                        </path>
                    `;

                    if (pct >= 8) {
                        const midAngle = currentAngle + sliceAngle / 2;
                        const labelR = r * 0.62;
                        const lx = (cx + labelR * Math.cos(midAngle)).toFixed(2);
                        const ly = (cy + labelR * Math.sin(midAngle) + 4).toFixed(2);
                        svgLabels += `
                            <text x="${lx}" y="${ly}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700" pointer-events="none">
                                ${Math.round(pct)}%
                            </text>
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
                                <span class="fw-semibold text-truncate" title="${escapeHtml(entry.bancoNombre)}">${escapeHtml(entry.bancoNombre)}</span>
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
                                <span class="small fw-bold text-uppercase text-primary">Distribución en ${mon}</span>
                            </div>
                            <span class="small fw-bold text-dark">Total: ${netoMonedaFmt} ${mon}</span>
                        </div>
                        <div class="d-flex flex-column flex-sm-row align-items-center gap-3">
                            <div class="pie-svg-wrapper">
                                <svg viewBox="0 0 200 200" width="150" height="150" role="img" aria-label="Gráfico de torta ${mon}">
                                    ${svgPaths}
                                    ${svgLabels}
                                </svg>
                            </div>
                            <div class="flex-grow-1 w-100">${legendHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderDashboardComparativeBars(vistaList) {
    const saldosContainer = document.getElementById('dashKpiBarsSaldos');
    const movsContainer = document.getElementById('dashKpiBarsMovimientos');

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
        absTotalByMoneda.set(
            item.moneda_legible,
            (absTotalByMoneda.get(item.moneda_legible) || 0) + Math.abs(Number(item.saldo_disponible || 0))
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
                    const pct = monTotal > 0 ? Math.min(100, Math.round((Math.abs(amount) / monTotal) * 100)) : 0;
                    const fmt = formatCurrencyAmount(amount, v.moneda_legible);
                    return `
                        <div class="mb-2">
                            <div class="d-flex justify-content-between small fw-semibold mb-1">
                                <span>${escapeHtml(v.banco_nombre)} <span class="badge badge-status-active ms-1">${v.moneda_legible}</span></span>
                                <span>${fmt} ${v.moneda_legible} (${pct}% de ${v.moneda_legible})</span>
                            </div>
                            <div class="progress" style="height: 8px; background-color: #e9ecef;">
                                <div class="progress-bar bg-primary" role="progressbar" style="width: ${pct}%;"></div>
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
                    const netoFmt = formatCurrencyAmount(Number(v.saldo_disponible || 0), v.moneda_legible);
                    return `
                        <div class="mb-2">
                            <div class="d-flex justify-content-between small fw-semibold mb-1">
                                <span>${escapeHtml(v.banco_nombre)} <span class="badge badge-status-active ms-1">${v.moneda_legible}</span> <span class="text-secondary">(${v.total_movimientos} movs)</span></span>
                                <span>Neto: <strong>${netoFmt} ${v.moneda_legible}</strong> (Debe ${pctDebe}% / Haber ${pctHaber}%)</span>
                            </div>
                            <div class="progress" style="height: 8px; background-color: #e9ecef;">
                                <div class="progress-bar bg-danger" role="progressbar" style="width: ${pctDebe}%;" title="Debe: ${pctDebe}%"></div>
                                <div class="progress-bar bg-success" role="progressbar" style="width: ${pctHaber}%;" title="Haber: ${pctHaber}%"></div>
                            </div>
                        </div>
                    `;
                })
                .join('');
        }
    }
}

export function renderDashboardSummary() {
    const { vistaRows } = getDashboardGlobalFilteredData();
    const filterMoneda = (document.getElementById('dashFilterMoneda')?.value || '').toUpperCase();

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

    const allCurrenciesOrder = [...statsByMoneda.keys()];
    const currenciesForCards = filterMoneda
        ? allCurrenciesOrder.filter((m) => m === filterMoneda)
        : allCurrenciesOrder;

    renderDashboardPieChartsByCurrency(statsByMoneda, currenciesForCards);

    const currencyCardsContainer = document.getElementById('dashCurrencyCardsContainer');
    if (currencyCardsContainer) {
        currencyCardsContainer.innerHTML = currenciesForCards
            .map((mon) => {
                const st = statsByMoneda.get(mon);
                const netoFmt = formatCurrencyAmount(st.neto, mon);
                const debeFmt = formatCurrencyAmount(st.debe, mon);
                const haberFmt = formatCurrencyAmount(st.haber, mon);
                const iconClass = CURRENCY_ICONS[mon] || 'bi-cash-coin';
                const netoColor = st.neto > 0 ? '#198754' : st.neto < 0 ? '#dc3545' : '#212529';
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

    if (saldosCorteBadge) saldosCorteBadge.textContent = `Corte vista: ${latestCorteDate || 'Sin fecha'}`;
    if (viewSourceBadge) {
        viewSourceBadge.innerHTML = appState.vistaActivaEnDb
            ? '<i class="bi bi-check-circle-fill me-1"></i>Vista activa: public.vista_resumen_saldos_movimientos'
            : '<i class="bi bi-layers-fill me-1"></i>Vista resumen calculada desde movimientos';
    }
    if (bancosEl) bancosEl.textContent = String(bancosGlobalSet.size || appState.bancos.length);
    if (cuentasEl) cuentasEl.textContent = String(appState.cuentas.length);
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
                        <span><span class="badge badge-status-active me-1">${mon}</span>${escapeHtml(topName)}</span>
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
                const fmt = formatCurrencyAmount(statsByMoneda.get(mon).debe, mon);
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold text-danger">${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovDebeEl) subMovDebeEl.textContent = `Total Debe por moneda (${vistaRows.length} resumen(es))`;

    if (movHaberEl) {
        movHaberEl.innerHTML = breakdownCurrencies
            .map((mon) => {
                const fmt = formatCurrencyAmount(statsByMoneda.get(mon).haber, mon);
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold text-success">${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovHaberEl) subMovHaberEl.textContent = `Total Haber por moneda (${vistaRows.length} resumen(es))`;

    if (movNetoEl) {
        movNetoEl.innerHTML = breakdownCurrencies
            .map((mon) => {
                const st = statsByMoneda.get(mon);
                const sign = st.neto > 0 ? '+' : '';
                const fmt = formatCurrencyAmount(st.neto, mon);
                const color = st.neto >= 0 ? '#198754' : '#dc3545';
                return `<div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span class="badge badge-status-active">${mon}</span>
                    <span class="fw-bold" style="color: ${color};">${sign}${fmt} ${mon}</span>
                </div>`;
            })
            .join('');
    }
    if (subMovNetoEl) subMovNetoEl.textContent = 'Saldo Neto Total (Crédito - Débito) respetando cada moneda';

    if (movsEl) movsEl.textContent = String(totalMovimientos);
    if (subMovEstructuraEl) {
        subMovEstructuraEl.innerHTML = `${totalConCuenta} con cuenta / ${totalDirectoBanco} directo a banco (<span id="dashCountCuentas">${appState.cuentas.length}</span> ctas)`;
    }
    if (movsCorteBadge) movsCorteBadge.textContent = `Último mov: ${latestCorteDate || 'Sin fecha'}`;

    renderDashboardComparativeBars(vistaRows);

    const summaryBody = document.getElementById('dashSaldosSummaryBody');
    if (!summaryBody) return;

    const st = appState.tableStates.dashSaldos;
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
        summaryBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">Sin saldos resumidos que coincidan con el filtro.</td></tr>`;
        return;
    }

    summaryBody.innerHTML = '';
    pageRows.forEach((v) => {
        const mon = v.moneda_legible || 'VES';
        const saldoVal = Number(v.saldo_disponible || 0);
        const saldoColor = saldoVal >= 0 ? '#198754' : '#dc3545';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${v.id}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(v.banco_nombre)}</td>
            <td data-label="Cuentas / Estructura" class="small">${escapeHtml(v.cuentas_asociadas)}</td>
            <td data-label="Fecha">${v.fecha || v.ultima_fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Movs" class="fw-semibold">${v.total_movimientos}</td>
            <td data-label="Total Debe" class="fw-bold text-danger">${formatCurrencyAmount(v.total_debe, mon)}</td>
            <td data-label="Total Haber" class="fw-bold text-success">${formatCurrencyAmount(v.total_haber, mon)}</td>
            <td data-label="Saldo Disponible" class="fw-bold" style="color: ${saldoColor};">${saldoVal >= 0 ? '+' : ''}${formatCurrencyAmount(saldoVal, mon)}</td>
        `;
        summaryBody.appendChild(tr);
    });
}

export function renderDashboardMovimientosTable() {
    const tbody = document.getElementById('dashMovimientosSummaryBody');
    if (!tbody) return;

    const { movsFiltered } = getDashboardGlobalFilteredData();
    const st = appState.tableStates.dashMovimientos;
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
        const neto = Number(m.flujo_neto || 0);
        const netoColor = neto >= 0 ? '#198754' : '#dc3545';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${m.id}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(m.banco_nombre)}</td>
            <td data-label="Cuenta" class="small">${escapeHtml(m.cuenta_numero)}</td>
            <td data-label="Fecha">${m.fecha || '-'}</td>
            <td data-label="Moneda"><span class="badge badge-status-active">${mon}</span></td>
            <td data-label="Referencia"><code>${escapeHtml(m.referencia_legible || '-')}</code></td>
            <td data-label="Tipo"><span class="badge badge-status-alert">${escapeHtml(m.tipo_legible || '-')}</span></td>
            <td data-label="Debe" class="fw-bold text-danger">${formatCurrencyAmount(m.debe, mon)}</td>
            <td data-label="Haber" class="fw-bold text-success">${formatCurrencyAmount(m.haber, mon)}</td>
            <td data-label="Neto" class="fw-bold" style="color: ${netoColor};">${neto >= 0 ? '+' : ''}${formatCurrencyAmount(neto, mon)}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function renderDashboardScreen() {
    renderDashboardSummary();
    renderDashboardMovimientosTable();
}

export function initDashboardModule() {
    bindSortableHeaders('theadDashSaldos', appState.tableStates.dashSaldos, renderDashboardSummary);
    bindSortableHeaders('theadDashMovimientos', appState.tableStates.dashMovimientos, renderDashboardMovimientosTable);

    const triggerDashFilter = () => {
        appState.tableStates.dashSaldos.page = 1;
        appState.tableStates.dashMovimientos.page = 1;
        renderDashboardScreen();
    };

    document.getElementById('dashFilterBanco')?.addEventListener('change', (e) => {
        appState.tableStates.dashGlobalFilters.bancoId = e.target.value;
        triggerDashFilter();
    });
    document.getElementById('dashFilterMoneda')?.addEventListener('change', (e) => {
        appState.tableStates.dashGlobalFilters.moneda = e.target.value;
        triggerDashFilter();
    });
    document.getElementById('dashFilterDesde')?.addEventListener('change', (e) => {
        appState.tableStates.dashGlobalFilters.desde = e.target.value;
        triggerDashFilter();
    });
    document.getElementById('dashFilterHasta')?.addEventListener('change', (e) => {
        appState.tableStates.dashGlobalFilters.hasta = e.target.value;
        triggerDashFilter();
    });

    document.getElementById('btnDashClearFilters')?.addEventListener('click', () => {
        ['dashFilterBanco', 'dashFilterMoneda', 'dashFilterDesde', 'dashFilterHasta', 'filterDashSaldos', 'filterDashMovimientos'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Object.assign(appState.tableStates.dashGlobalFilters, {
            bancoId: '',
            moneda: '',
            desde: '',
            hasta: ''
        });
        appState.tableStates.dashSaldos.search = '';
        appState.tableStates.dashMovimientos.search = '';
        triggerDashFilter();
    });

    document.getElementById('btnDashRefresh')?.addEventListener('click', refreshAllDatabaseData);

    document.getElementById('filterDashSaldos')?.addEventListener('input', (e) => {
        appState.tableStates.dashSaldos.search = e.target.value;
        appState.tableStates.dashSaldos.page = 1;
        renderDashboardSummary();
    });
    document.getElementById('pageSizeDashSaldos')?.addEventListener('change', (e) => {
        appState.tableStates.dashSaldos.pageSize = Number(e.target.value);
        appState.tableStates.dashSaldos.page = 1;
        renderDashboardSummary();
    });

    document.getElementById('filterDashMovimientos')?.addEventListener('input', (e) => {
        appState.tableStates.dashMovimientos.search = e.target.value;
        appState.tableStates.dashMovimientos.page = 1;
        renderDashboardMovimientosTable();
    });
    document.getElementById('pageSizeDashMovimientos')?.addEventListener('change', (e) => {
        appState.tableStates.dashMovimientos.pageSize = Number(e.target.value);
        appState.tableStates.dashMovimientos.page = 1;
        renderDashboardMovimientosTable();
    });
}

