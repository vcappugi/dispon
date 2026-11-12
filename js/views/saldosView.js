/**
 * @file js/views/saldosView.js
 * @description Pantalla dedicada a Saldos Consolidados (`vista_resumen_saldos_movimientos`)
 *              y a la gestión CRUD manual de `public.saldos_banco`.
 */

export function getSaldosViewHtml() {
    return `
    <section id="module-saldos" class="module-section d-none">
        <!-- Navegación interna por pestañas para separar Consolidado vs CRUD Manual -->
        <ul class="nav nav-tabs mb-3" id="saldosTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button
                    class="nav-link active fw-semibold"
                    id="tabSaldosConsolidadosBtn"
                    data-bs-toggle="tab"
                    data-bs-target="#paneSaldosConsolidados"
                    type="button"
                    role="tab"
                >
                    <i class="bi bi-layers-fill me-1"></i>Consolidado por Banco y Moneda (<code>vista_resumen_saldos_movimientos</code>)
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button
                    class="nav-link fw-semibold"
                    id="tabSaldosManualesBtn"
                    data-bs-toggle="tab"
                    data-bs-target="#paneSaldosManuales"
                    type="button"
                    role="tab"
                >
                    <i class="bi bi-cash-stack me-1"></i>Saldos Manuales (<code>public.saldos_banco</code>)
                </button>
            </li>
        </ul>

        <div class="tab-content">
            <!-- PANEL 1: CONSOLIDADO DESDE MOVIMIENTOS -->
            <div class="tab-pane fade show active" id="paneSaldosConsolidados" role="tabpanel">
                <div class="card card-institutional">
                    <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                        <span>
                            <i class="bi bi-bank2 me-2 text-white"></i>
                            Saldos Totales Agrupados por Banco y Moneda
                        </span>
                        <span id="badgeMainSaldosCorte" class="badge badge-status-active">
                            Totalizado por Banco y Moneda (Acumulado General)
                        </span>
                    </div>
                    <div class="card-body p-2 p-md-3">
                        <div class="row g-2 align-items-end mb-3 p-2 rounded border bg-light">
                            <div class="col-12 col-md-3">
                                <label for="filterSaldosBancoId" class="form-label small fw-bold mb-1">Banco</label>
                                <select id="filterSaldosBancoId" class="form-select form-select-sm">
                                    <option value="">Todos los bancos...</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-2">
                                <label for="filterSaldosFecha" class="form-label small fw-bold mb-1">Fecha de Corte (&lt;=)</label>
                                <input type="date" id="filterSaldosFecha" class="form-control form-control-sm" />
                            </div>
                            <div class="col-12 col-md-4">
                                <label for="filterMainSaldos" class="form-label small fw-bold mb-1">Búsqueda</label>
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                                    <input
                                        type="text"
                                        id="filterMainSaldos"
                                        class="form-control"
                                        placeholder="Banco, moneda o monto..."
                                    />
                                </div>
                            </div>
                            <div class="col-6 col-md-2 d-flex align-items-center gap-2">
                                <label for="pageSizeMainSaldos" class="small fw-semibold mb-0">Filas:</label>
                                <select id="pageSizeMainSaldos" class="form-select form-select-sm">
                                    <option value="5">5</option>
                                    <option value="10" selected>10</option>
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                </select>
                            </div>
                            <div class="col-6 col-md-1">
                                <button id="btnClearMainSaldosFilter" type="button" class="btn btn-sm btn-outline-secondary w-100" title="Limpiar filtros">
                                    <i class="bi bi-eraser"></i>
                                </button>
                            </div>
                        </div>

                        <div class="table-viewport-container">
                            <table class="table table-adaptive align-middle">
                                <thead id="theadMainSaldos">
                                    <tr>
                                        <th style="width: 8%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                        <th style="width: 26%;" class="sortable-th" data-sort="banco_nombre">Banco <span class="sort-indicator"></span></th>
                                        <th style="width: 12%;" class="sortable-th" data-sort="moneda_legible">Moneda <span class="sort-indicator"></span></th>
                                        <th style="width: 10%;" class="sortable-th" data-sort="total_movimientos">Movs <span class="sort-indicator"></span></th>
                                        <th style="width: 14%;" class="sortable-th" data-sort="total_debe">Total Debe <span class="sort-indicator"></span></th>
                                        <th style="width: 14%;" class="sortable-th" data-sort="total_haber">Total Haber <span class="sort-indicator"></span></th>
                                        <th style="width: 16%;" class="sortable-th" data-sort="saldo_disponible">Saldo Disponible <span class="sort-indicator"></span></th>
                                    </tr>
                                </thead>
                                <tbody id="saldosBancoTableBody"></tbody>
                            </table>
                        </div>
                        <div id="paginationMainSaldos" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
                    </div>
                </div>
            </div>

            <!-- PANEL 2: CRUD MANUAL `public.saldos_banco` -->
            <div class="tab-pane fade" id="paneSaldosManuales" role="tabpanel">
                <div class="row g-3">
                    <div class="col-12 col-lg-4">
                        <div class="card card-institutional h-100">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span><i class="bi bi-pencil-square me-2 text-white"></i>Registro Manual de Saldo</span>
                                <span id="badgeModeSaldo" class="badge badge-status-active">Nuevo Saldo</span>
                            </div>
                            <div class="card-body">
                                <form id="formCrudSaldosBanco" class="row g-3">
                                    <input type="hidden" id="saldoId" value="" />
                                    <div class="col-12">
                                        <label for="saldoBancoId" class="form-label small fw-bold mb-1">Banco (<code>banco_id</code>)</label>
                                        <select id="saldoBancoId" class="form-select form-select-sm" required>
                                            <option value="">Seleccione banco...</option>
                                        </select>
                                    </div>
                                    <div class="col-12 col-sm-6">
                                        <label for="saldoFecha" class="form-label small fw-bold mb-1">Fecha (<code>fecha</code>)</label>
                                        <input type="date" id="saldoFecha" class="form-control form-control-sm" required />
                                    </div>
                                    <div class="col-12 col-sm-6">
                                        <label for="saldoMoneda" class="form-label small fw-bold mb-1">Moneda (<code>moneda</code>)</label>
                                        <select id="saldoMoneda" class="form-select form-select-sm" required>
                                            <option value="VES">VES</option>
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
                                            <option value="USDT">USDT</option>
                                            <option value="BNB">BNB</option>
                                            <option value="BTC">BTC</option>
                                            <option value="YEN">YEN</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label for="saldoMonto" class="form-label small fw-bold mb-1">Monto Disponible (<code>monto</code>)</label>
                                        <input type="number" step="any" id="saldoMonto" class="form-control form-control-sm" placeholder="0.00" required />
                                    </div>
                                    <div class="col-12 d-flex gap-2 pt-2 border-top">
                                        <button type="button" id="btnResetSaldo" class="btn btn-sm btn-outline-secondary w-50">Limpiar</button>
                                        <button type="submit" class="btn btn-sm btn-institutional-accent w-50">
                                            <i class="bi bi-save me-1"></i>Guardar Saldo
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div class="col-12 col-lg-8">
                        <div class="card card-institutional h-100">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span><i class="bi bi-table me-2 text-white"></i>Registros en <code class="text-white">public.saldos_banco</code></span>
                                <span id="saldosManualTotalBadge" class="badge bg-secondary">0 registros</span>
                            </div>
                            <div class="card-body p-2 p-md-3">
                                <div class="row g-2 align-items-end mb-3">
                                    <div class="col-12 col-md-4">
                                        <label for="filterSaldosManualBancoId" class="form-label small fw-bold mb-1">Banco</label>
                                        <select id="filterSaldosManualBancoId" class="form-select form-select-sm">
                                            <option value="">Todos los bancos</option>
                                        </select>
                                    </div>
                                    <div class="col-12 col-md-5">
                                        <label for="filterSaldosManual" class="form-label small fw-bold mb-1">Buscar</label>
                                        <input type="text" id="filterSaldosManual" class="form-control form-control-sm" placeholder="ID, banco, fecha, moneda..." />
                                    </div>
                                    <div class="col-12 col-md-3 d-flex align-items-center justify-content-md-end gap-2">
                                        <label for="pageSizeSaldosManual" class="small fw-semibold mb-0">Filas:</label>
                                        <select id="pageSizeSaldosManual" class="form-select form-select-sm" style="width: 80px;">
                                            <option value="5">5</option>
                                            <option value="10" selected>10</option>
                                            <option value="20">20</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="table-viewport-container">
                                    <table class="table table-adaptive table-sm align-middle">
                                        <thead id="theadSaldosManual">
                                            <tr>
                                                <th style="width: 10%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                                <th style="width: 30%;" class="sortable-th" data-sort="banco_nombre">Banco <span class="sort-indicator"></span></th>
                                                <th style="width: 16%;" class="sortable-th" data-sort="fecha">Fecha <span class="sort-indicator"></span></th>
                                                <th style="width: 14%;" class="sortable-th" data-sort="moneda_legible">Moneda <span class="sort-indicator"></span></th>
                                                <th style="width: 16%;" class="sortable-th" data-sort="monto">Monto <span class="sort-indicator"></span></th>
                                                <th style="width: 14%;">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody id="saldosManualTableBody"></tbody>
                                    </table>
                                </div>
                                <div id="paginationSaldosManual" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    `;
}
