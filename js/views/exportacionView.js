/**
 * @file js/views/exportacionView.js
 * @description Pantalla dedicada a Reportes Multicriterio y Exportación CSV de Saldos y Movimientos.
 */

export function getExportacionViewHtml() {
    return `
    <section id="module-exportacion" class="module-section d-none">
        <!-- FILTROS Y DESCARGAS -->
        <div class="card card-institutional mb-3">
            <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <span>
                    <i class="bi bi-file-earmark-spreadsheet-fill me-2 text-white"></i>
                    Centro de Reportes y Exportación CSV
                </span>
                <div class="d-flex flex-wrap gap-2">
                    <button id="btnExportCsvSaldos" type="button" class="btn btn-sm btn-institutional-accent">
                        <i class="bi bi-download me-1"></i>Exportar Saldos Consolidados CSV
                    </button>
                    <button id="btnExportCsvMovimientos" type="button" class="btn btn-sm btn-institutional-white">
                        <i class="bi bi-download me-1"></i>Exportar Movimientos Filtrados CSV
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="row g-2 align-items-end">
                    <div class="col-12 col-sm-6 col-md-3">
                        <label for="expFilterBanco" class="form-label small fw-bold mb-1">Banco</label>
                        <select id="expFilterBanco" class="form-select form-select-sm">
                            <option value="">Todos los bancos</option>
                        </select>
                    </div>
                    <div class="col-12 col-sm-6 col-md-2">
                        <label for="expFilterMoneda" class="form-label small fw-bold mb-1">Moneda</label>
                        <select id="expFilterMoneda" class="form-select form-select-sm">
                            <option value="">Todas</option>
                            <option value="VES">VES</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="USDT">USDT</option>
                            <option value="BNB">BNB</option>
                            <option value="BTC">BTC</option>
                            <option value="YEN">YEN</option>
                        </select>
                    </div>
                    <div class="col-6 col-md-2">
                        <label for="expFilterDesde" class="form-label small fw-bold mb-1">Fecha Desde</label>
                        <input type="date" id="expFilterDesde" class="form-control form-control-sm" />
                    </div>
                    <div class="col-6 col-md-2">
                        <label for="expFilterHasta" class="form-label small fw-bold mb-1">Fecha Hasta</label>
                        <input type="date" id="expFilterHasta" class="form-control form-control-sm" />
                    </div>
                    <div class="col-12 col-md-2">
                        <label for="expSearchText" class="form-label small fw-bold mb-1">Buscar en Vista</label>
                        <input type="text" id="expSearchText" class="form-control form-control-sm" placeholder="Banco, moneda, fecha..." />
                    </div>
                    <div class="col-12 col-md-1">
                        <button id="btnClearExpFilters" type="button" class="btn btn-sm btn-outline-secondary w-100" title="Limpiar filtros">
                            <i class="bi bi-eraser"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- TABLA DE VISTA PREVIA -->
        <div class="card card-institutional">
            <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <span>
                    <i class="bi bi-table me-2 text-white"></i>
                    Vista Previa de Resumen de Saldos (<code class="text-white">public.vista_resumen_saldos_movimientos</code>)
                </span>
                <div class="d-flex align-items-center gap-2">
                    <span id="expPreviewCountBadge" class="badge badge-status-active">0 registros</span>
                    <label for="pageSizeExport" class="small text-white mb-0">Filas:</label>
                    <select id="pageSizeExport" class="form-select form-select-sm" style="width: 80px;">
                        <option value="5">5</option>
                        <option value="10" selected>10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                    </select>
                </div>
            </div>
            <div class="card-body p-2 p-md-3">
                <div class="table-viewport-container">
                    <table class="table table-adaptive align-middle">
                        <thead id="theadExport">
                            <tr>
                                <th style="width: 8%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                <th style="width: 24%;" class="sortable-th" data-sort="banco_nombre">Banco <span class="sort-indicator"></span></th>
                                <th style="width: 14%;" class="sortable-th" data-sort="fecha">Fecha <span class="sort-indicator"></span></th>
                                <th style="width: 10%;" class="sortable-th" data-sort="moneda_legible">Moneda <span class="sort-indicator"></span></th>
                                <th style="width: 14%;" class="sortable-th" data-sort="total_debe">Total Debe <span class="sort-indicator"></span></th>
                                <th style="width: 14%;" class="sortable-th" data-sort="total_haber">Total Haber <span class="sort-indicator"></span></th>
                                <th style="width: 16%;" class="sortable-th" data-sort="saldo_disponible">Saldo Disponible <span class="sort-indicator"></span></th>
                            </tr>
                        </thead>
                        <tbody id="exportacionTableBody"></tbody>
                    </table>
                </div>
                <div id="paginationExport" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
            </div>
        </div>
    </section>
    `;
}
