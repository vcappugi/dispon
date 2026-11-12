/**
 * @file js/views/dashboardView.js
 * @description Vista HTML de la pantalla dedicada al Dashboard Ejecutivo.
 */

export function getDashboardViewHtml() {
    return `
    <section id="module-dashboard" class="module-section">
        <!-- FILTRO GLOBAL DEL DASHBOARD -->
        <div class="row g-3 mb-3">
            <div class="col-12">
                <div class="card card-institutional">
                    <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
                        <span>
                            <i class="bi bi-funnel-fill me-2 text-white"></i>
                            Filtros Globales del Dashboard (Consolidado desde <code class="text-white">public.vista_resumen_saldos_movimientos</code>)
                        </span>
                        <div class="d-flex flex-wrap align-items-center gap-2">
                            <span id="dashViewSourceBadge" class="badge bg-info text-dark">
                                <i class="bi bi-database-check me-1"></i>vista_resumen_saldos_movimientos
                            </span>
                            <button id="btnDashRefresh" type="button" class="btn btn-sm btn-institutional-white py-0 px-2">
                                <i class="bi bi-arrow-clockwise me-1"></i>Actualizar
                            </button>
                            <button type="button" class="btn btn-sm btn-institutional-accent py-0 px-2" data-navigate-module="importacion">
                                <i class="bi bi-file-earmark-pdf me-1"></i>Importar PDF / CSV
                            </button>
                            <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2" data-navigate-module="exportacion">
                                <i class="bi bi-file-earmark-arrow-down me-1"></i>Exportar
                            </button>
                        </div>
                    </div>
                    <div class="card-body py-2 px-2 px-md-3">
                        <div class="row g-2 align-items-end">
                            <div class="col-12 col-sm-6 col-lg-3">
                                <label for="dashFilterBanco" class="form-label small fw-bold mb-1">Banco</label>
                                <select id="dashFilterBanco" class="form-select form-select-sm">
                                    <option value="">Todos los bancos</option>
                                </select>
                            </div>
                            <div class="col-12 col-sm-6 col-lg-2">
                                <label for="dashFilterMoneda" class="form-label small fw-bold mb-1">Moneda</label>
                                <select id="dashFilterMoneda" class="form-select form-select-sm">
                                    <option value="">Todas las monedas</option>
                                    <option value="VES">VES</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="USDT">USDT</option>
                                    <option value="BNB">BNB</option>
                                    <option value="BTC">BTC</option>
                                    <option value="YEN">YEN</option>
                                </select>
                            </div>
                            <div class="col-6 col-sm-6 col-lg-2">
                                <label for="dashFilterDesde" class="form-label small fw-bold mb-1">Fecha Desde</label>
                                <input type="date" id="dashFilterDesde" class="form-control form-control-sm" />
                            </div>
                            <div class="col-6 col-sm-6 col-lg-2">
                                <label for="dashFilterHasta" class="form-label small fw-bold mb-1">Fecha Hasta</label>
                                <input type="date" id="dashFilterHasta" class="form-control form-control-sm" />
                            </div>
                            <div class="col-12 col-lg-3 d-flex justify-content-lg-end gap-2">
                                <button id="btnDashClearFilters" type="button" class="btn btn-sm btn-outline-secondary w-100 w-lg-auto">
                                    <i class="bi bi-eraser me-1"></i>Limpiar Filtros
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- FILA 0: GRÁFICOS DE TORTA VECTORIALES POR MONEDA -->
        <div class="row g-3 mb-3">
            <div class="col-12">
                <div class="card card-institutional">
                    <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
                        <span>
                            <i class="bi bi-pie-chart-fill me-2 text-white"></i>
                            Distribución Porcentual de Saldos por Banco en Cada Moneda
                        </span>
                        <span id="dashPieChartsSubtitle" class="badge bg-secondary">Cargando distribución...</span>
                    </div>
                    <div class="card-body p-3">
                        <div id="dashPieChartsByCurrency" class="row g-3">
                            <div class="col-12 text-center text-muted small py-3">
                                Calculando gráficos de torta por moneda...
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- FILA 1: SALDOS DISPONIBLES SEPARADOS POR MONEDA -->
        <div class="row g-2 g-md-3 mb-3">
            <div class="col-12 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <h2 class="h6 fw-bold text-primary text-uppercase mb-0">
                    <i class="bi bi-cash-coin me-2"></i>
                    Disponibilidad Separada por Moneda (Crédito - Débito)
                </h2>
                <span id="dashSaldosCorteBadge" class="badge bg-secondary">Corte vista: -</span>
            </div>
        </div>
        <div id="dashCurrencyCardsContainer" class="row g-2 g-md-3 mb-3"></div>

        <!-- FILA 2: KPIs DE DEBE, HABER Y FLUJO NETO POR MONEDA -->
        <div class="row g-3 mb-3">
            <div class="col-12 col-sm-6 col-xl-3">
                <div class="card card-institutional h-100">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <div class="d-flex align-items-start justify-content-between mb-2">
                            <div>
                                <p class="text-uppercase small fw-bold text-secondary mb-1">Total Debe por Moneda</p>
                                <div id="dashSubMovDebe" class="small text-secondary">Cargos separados por moneda</div>
                            </div>
                            <span class="fs-4 icon-box-institutional rounded-3 px-2 py-1">
                                <i class="bi bi-arrow-down-left-circle-fill"></i>
                            </span>
                        </div>
                        <div id="dashMovTotalDebe" class="small fw-bold text-danger">0,00</div>
                    </div>
                </div>
            </div>

            <div class="col-12 col-sm-6 col-xl-3">
                <div class="card card-institutional h-100">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <div class="d-flex align-items-start justify-content-between mb-2">
                            <div>
                                <p class="text-uppercase small fw-bold text-secondary mb-1">Total Haber por Moneda</p>
                                <div id="dashSubMovHaber" class="small text-secondary">Abonos separados por moneda</div>
                            </div>
                            <span class="fs-4 icon-box-institutional rounded-3 px-2 py-1">
                                <i class="bi bi-arrow-up-right-circle-fill"></i>
                            </span>
                        </div>
                        <div id="dashMovTotalHaber" class="small fw-bold text-success">0,00</div>
                    </div>
                </div>
            </div>

            <div class="col-12 col-sm-6 col-xl-3">
                <div class="card card-institutional h-100">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <div class="d-flex align-items-start justify-content-between mb-2">
                            <div>
                                <p class="text-uppercase small fw-bold text-secondary mb-1">Saldo Neto Total (Crédito - Débito)</p>
                                <div id="dashSubMovNeto" class="small text-secondary">Sin mezclar divisas</div>
                            </div>
                            <span class="fs-4 icon-box-institutional rounded-3 px-2 py-1">
                                <i class="bi bi-activity"></i>
                            </span>
                        </div>
                        <div id="dashMovFlujoNeto" class="small fw-bold">0,00</div>
                    </div>
                </div>
            </div>

            <div class="col-12 col-sm-6 col-xl-3">
                <div class="card card-institutional h-100">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <div class="d-flex align-items-start justify-content-between mb-2">
                            <div>
                                <p class="text-uppercase small fw-bold text-secondary mb-1">Mayor Disponibilidad y Volumen</p>
                                <h2 class="h6 fw-bold mb-1"><span id="dashCountMovs">0</span> Movimientos</h2>
                                <div id="dashSubMovEstructura" class="small text-secondary">
                                    0 con cuenta / 0 directos (<span id="dashCountCuentas">0</span> ctas)
                                </div>
                            </div>
                            <span class="fs-4 icon-box-institutional rounded-3 px-2 py-1">
                                <i class="bi bi-bar-chart-line-fill"></i>
                            </span>
                        </div>
                        <div class="border-top pt-2 mt-1">
                            <div id="dashTopBancoSaldo" class="small fw-semibold">Sin registros</div>
                            <div id="dashSubSaldosMeta" class="small text-secondary mt-1">
                                <span id="dashCountSaldos">0</span> resúmenes en <span id="dashCountBancos">0</span> bancos
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- FILA 3: BARRAS COMPARATIVAS -->
        <div class="row g-3 mb-3">
            <div class="col-12 col-lg-6">
                <div class="card card-institutional h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span>
                            <i class="bi bi-bar-chart-steps me-2 text-white"></i>
                            Saldos por Banco (<code class="text-white">vista_resumen_saldos_movimientos</code>)
                        </span>
                        <span class="badge badge-status-active">Crédito - Débito</span>
                    </div>
                    <div id="dashKpiBarsSaldos" class="card-body p-3"></div>
                </div>
            </div>
            <div class="col-12 col-lg-6">
                <div class="card card-institutional h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span>
                            <i class="bi bi-graph-up me-2 text-white"></i>
                            Proporción Debe vs Haber por Banco
                        </span>
                        <span id="dashMovsCorteBadge" class="badge bg-secondary">Último mov: -</span>
                    </div>
                    <div id="dashKpiBarsMovimientos" class="card-body p-3"></div>
                </div>
            </div>
        </div>

        <!-- FILA 4: TABLA RESUMEN DE LA VISTA -->
        <div class="row g-3 mb-3">
            <div class="col-12">
                <div class="card card-institutional">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-table me-2 text-white"></i>
                            Resumen de Disponibilidad (<code class="text-white">public.vista_resumen_saldos_movimientos</code>)
                        </span>
                        <div class="d-flex flex-wrap align-items-center gap-2">
                            <div class="input-group input-group-sm" style="width: 240px;">
                                <span class="input-group-text"><i class="bi bi-search"></i></span>
                                <input type="text" id="filterDashSaldos" class="form-control" placeholder="Filtrar resumen..." />
                            </div>
                            <select id="pageSizeDashSaldos" class="form-select form-select-sm" style="width: 80px;">
                                <option value="5">5</option>
                                <option value="10" selected>10</option>
                                <option value="20">20</option>
                            </select>
                        </div>
                    </div>
                    <div class="card-body p-2 p-md-3">
                        <div class="table-viewport-container">
                            <table class="table table-adaptive align-middle">
                                <thead id="theadDashSaldos">
                                    <tr>
                                        <th style="width: 7%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                        <th style="width: 17%;" class="sortable-th" data-sort="banco_nombre">Banco <span class="sort-indicator"></span></th>
                                        <th style="width: 22%;" class="sortable-th" data-sort="cuentas_asociadas">Cuentas / Estructura <span class="sort-indicator"></span></th>
                                        <th style="width: 10%;" class="sortable-th" data-sort="fecha">Fecha <span class="sort-indicator"></span></th>
                                        <th style="width: 8%;" class="sortable-th" data-sort="moneda_legible">Moneda <span class="sort-indicator"></span></th>
                                        <th style="width: 7%;" class="sortable-th" data-sort="total_movimientos">Movs <span class="sort-indicator"></span></th>
                                        <th style="width: 10%;" class="sortable-th" data-sort="total_debe">Total Debe <span class="sort-indicator"></span></th>
                                        <th style="width: 10%;" class="sortable-th" data-sort="total_haber">Total Haber <span class="sort-indicator"></span></th>
                                        <th style="width: 9%;" class="sortable-th" data-sort="saldo_disponible">Saldo Disponible <span class="sort-indicator"></span></th>
                                    </tr>
                                </thead>
                                <tbody id="dashSaldosSummaryBody"></tbody>
                            </table>
                        </div>
                        <div id="paginationDashSaldos" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- FILA 5: TABLA RESUMEN DE MOVIMIENTOS -->
        <div class="row g-3">
            <div class="col-12">
                <div class="card card-institutional">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-list-ul me-2 text-white"></i>
                            Últimos Movimientos (<code class="text-white">public.movimientos</code>)
                        </span>
                        <div class="d-flex flex-wrap align-items-center gap-2">
                            <div class="input-group input-group-sm" style="width: 240px;">
                                <span class="input-group-text"><i class="bi bi-search"></i></span>
                                <input type="text" id="filterDashMovimientos" class="form-control" placeholder="Filtrar movimientos..." />
                            </div>
                            <select id="pageSizeDashMovimientos" class="form-select form-select-sm" style="width: 80px;">
                                <option value="5">5</option>
                                <option value="10" selected>10</option>
                                <option value="20">20</option>
                            </select>
                            <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2" data-navigate-module="movimientos">
                                Ir a CRUD Completo <i class="bi bi-arrow-right ms-1"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-body p-2 p-md-3">
                        <div class="table-viewport-container">
                            <table class="table table-adaptive align-middle">
                                <thead id="theadDashMovimientos">
                                    <tr>
                                        <th style="width: 6%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                        <th style="width: 14%;" class="sortable-th" data-sort="banco_nombre">Banco <span class="sort-indicator"></span></th>
                                        <th style="width: 14%;" class="sortable-th" data-sort="cuenta_numero">Cuenta <span class="sort-indicator"></span></th>
                                        <th style="width: 9%;" class="sortable-th" data-sort="fecha">Fecha <span class="sort-indicator"></span></th>
                                        <th style="width: 7%;" class="sortable-th" data-sort="moneda_legible">Moneda <span class="sort-indicator"></span></th>
                                        <th style="width: 12%;" class="sortable-th" data-sort="referencia_legible">Referencia <span class="sort-indicator"></span></th>
                                        <th style="width: 10%;" class="sortable-th" data-sort="tipo_legible">Tipo <span class="sort-indicator"></span></th>
                                        <th style="width: 9%;" class="sortable-th" data-sort="debe">Debe <span class="sort-indicator"></span></th>
                                        <th style="width: 9%;" class="sortable-th" data-sort="haber">Haber <span class="sort-indicator"></span></th>
                                        <th style="width: 10%;" class="sortable-th" data-sort="flujo_neto">Neto <span class="sort-indicator"></span></th>
                                    </tr>
                                </thead>
                                <tbody id="dashMovimientosSummaryBody"></tbody>
                            </table>
                        </div>
                        <div id="paginationDashMovimientos" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2"></div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    `;
}

