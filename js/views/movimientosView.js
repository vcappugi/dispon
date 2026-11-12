/**
 * @file js/views/movimientosView.js
 * @description Pantalla dedicada al CRUD completo y búsqueda avanzada de `public.movimientos`.
 */

export function getMovimientosViewHtml() {
    return `
    <section id="module-movimientos" class="module-section d-none">
        <!-- BARRA SUPERIOR DE RESUMEN Y ACCIONES -->
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div class="d-flex flex-wrap align-items-center gap-2">
                <span class="badge bg-primary" id="movFilteredCountBadge">0 movimientos</span>
                <span class="badge bg-danger" id="movFilteredDebeBadge">Debe: 0,00</span>
                <span class="badge bg-success" id="movFilteredHaberBadge">Haber: 0,00</span>
                <span class="badge bg-dark" id="movFilteredNetoBadge">Neto (Haber - Debe): 0,00</span>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    data-bs-toggle="collapse"
                    data-bs-target="#collapseFormMovimiento"
                    aria-expanded="true"
                >
                    <i class="bi bi-plus-circle me-1"></i>Mostrar / Ocultar Formulario
                </button>
                <button type="button" class="btn btn-sm btn-institutional-accent" data-navigate-module="importacion">
                    <i class="bi bi-file-earmark-pdf me-1"></i>Importación Masiva (CSV / PDF)
                </button>
            </div>
        </div>

        <!-- FORMULARIO DEDICADO CRUD `public.movimientos` -->
        <div class="collapse show mb-3" id="collapseFormMovimiento">
            <div class="card card-institutional">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-journal-plus me-2 text-white"></i>Registro / Edición Individual de Movimiento</span>
                    <span id="badgeModeMovimiento" class="badge badge-status-active">Nuevo Movimiento</span>
                </div>
                <div class="card-body">
                    <form id="formCrudMovimientos" class="row g-2">
                        <input type="hidden" id="movId" value="" />
                        <div class="col-12 col-md-3">
                            <label for="movBancoId" class="form-label small fw-bold mb-1">Banco (<code>banco_id</code>)</label>
                            <select id="movBancoId" class="form-select form-select-sm" required>
                                <option value="">Seleccione banco...</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-3">
                            <label for="movCuentaId" class="form-label small fw-bold mb-1">Cuenta (<code>cuenta_id</code>)</label>
                            <select id="movCuentaId" class="form-select form-select-sm">
                                <option value="">-- Directo a Banco (Sin cuenta) --</option>
                            </select>
                        </div>
                        <div class="col-6 col-md-2">
                            <label for="movFecha" class="form-label small fw-bold mb-1">Fecha (<code>fecha</code>)</label>
                            <input type="date" id="movFecha" class="form-control form-control-sm" required />
                        </div>
                        <div class="col-6 col-md-2">
                            <label for="movMoneda" class="form-label small fw-bold mb-1">Moneda (<code>moneda</code>)</label>
                            <select id="movMoneda" class="form-select form-select-sm" required>
                                <option value="VES">VES</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="USDT">USDT</option>
                                <option value="BNB">BNB</option>
                                <option value="BTC">BTC</option>
                                <option value="YEN">YEN</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-2">
                            <label for="movTipo" class="form-label small fw-bold mb-1">Tipo (<code>tipo</code>)</label>
                            <select id="movTipo" class="form-select form-select-sm">
                                <option value="CUENTA">CUENTA</option>
                                <option value="Crédito">Crédito</option>
                                <option value="Débito">Débito</option>
                                <option value="Transferencia">Transferencia</option>
                                <option value="Saldo Directo">Saldo Directo</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-3">
                            <label for="movEmpresa" class="form-label small fw-bold mb-1">Empresa (<code>empresa</code>)</label>
                            <input type="text" id="movEmpresa" class="form-control form-control-sm" placeholder="Nombre de empresa" />
                        </div>
                        <div class="col-12 col-md-2">
                            <label for="movReferencia" class="form-label small fw-bold mb-1">Referencia (<code>referencia</code>)</label>
                            <input type="text" id="movReferencia" class="form-control form-control-sm" placeholder="Ref. bancaria" />
                        </div>
                        <div class="col-12 col-md-3">
                            <label for="movDescripcion" class="form-label small fw-bold mb-1">Descripción (<code>descripcion</code>)</label>
                            <input type="text" id="movDescripcion" class="form-control form-control-sm" placeholder="Concepto o detalle" />
                        </div>
                        <div class="col-6 col-md-2">
                            <label for="movDebe" class="form-label small fw-bold mb-1">Debe (<code>debe</code>)</label>
                            <input type="number" step="any" id="movDebe" class="form-control form-control-sm" value="0.00" />
                        </div>
                        <div class="col-6 col-md-2">
                            <label for="movHaber" class="form-label small fw-bold mb-1">Haber (<code>haber</code>)</label>
                            <input type="number" step="any" id="movHaber" class="form-control form-control-sm" value="0.00" />
                        </div>
                        <div class="col-12 d-flex justify-content-end gap-2 mt-2 pt-2 border-top">
                            <button type="button" id="btnResetMovimiento" class="btn btn-sm btn-outline-secondary">
                                <i class="bi bi-eraser me-1"></i>Limpiar
                            </button>
                            <button type="submit" class="btn btn-sm btn-institutional-primary">
                                <i class="bi bi-save me-1"></i>Guardar Movimiento
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- FILTROS Y TABLA PRINCIPAL DE MOVIMIENTOS -->
        <div class="card card-institutional">
            <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span>
                    <i class="bi bi-list-columns-reverse me-2 text-white"></i>
                    Historial de Movimientos (<code class="text-white">public.movimientos</code>)
                </span>
                <div class="d-flex align-items-center gap-2">
                    <label for="pageSizeMovimientos" class="small text-white mb-0">Filas:</label>
                    <select id="pageSizeMovimientos" class="form-select form-select-sm" style="width: 80px;">
                        <option value="10">10</option>
                        <option value="15" selected>15</option>
                        <option value="30">30</option>
                        <option value="50">50</option>
                    </select>
                </div>
            </div>
            <div class="card-body p-2 p-md-3">
                <div class="row g-2 align-items-end mb-3 p-2 rounded border bg-light">
                    <div class="col-12 col-md-2">
                        <label for="filterMovBancoId" class="form-label small fw-bold mb-1">Banco</label>
                        <select id="filterMovBancoId" class="form-select form-select-sm">
                            <option value="">Todos los bancos</option>
                        </select>
                    </div>
                    <div class="col-12 col-md-2">
                        <label for="filterMovCuentaId" class="form-label small fw-bold mb-1">Cuenta</label>
                        <select id="filterMovCuentaId" class="form-select form-select-sm">
                            <option value="">Todas las cuentas</option>
                        </select>
                    </div>
                    <div class="col-6 col-md-1">
                        <label for="filterMovMoneda" class="form-label small fw-bold mb-1">Moneda</label>
                        <select id="filterMovMoneda" class="form-select form-select-sm">
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
                        <label for="filterMovDesde" class="form-label small fw-bold mb-1">Desde</label>
                        <input type="date" id="filterMovDesde" class="form-control form-control-sm" />
                    </div>
                    <div class="col-6 col-md-2">
                        <label for="filterMovHasta" class="form-label small fw-bold mb-1">Hasta</label>
                        <input type="date" id="filterMovHasta" class="form-control form-control-sm" />
                    </div>
                    <div class="col-12 col-md-2">
                        <label for="filterMovSearch" class="form-label small fw-bold mb-1">Buscar</label>
                        <input type="text" id="filterMovSearch" class="form-control form-control-sm" placeholder="Ref, empresa, desc..." />
                    </div>
                    <div class="col-6 col-md-1">
                        <button id="btnClearMovFilters" type="button" class="btn btn-sm btn-outline-secondary w-100" title="Limpiar filtros">
                            <i class="bi bi-eraser"></i>
                        </button>
                    </div>
                </div>

                <div class="table-viewport-container">
                    <table class="table table-adaptive table-sm align-middle">
                        <thead id="theadMovimientos">
                            <tr>
                                <th style="width: 6%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                <th style="width: 9%;" class="sortable-th" data-sort="fecha">Fecha <span class="sort-indicator"></span></th>
                                <th style="width: 13%;" class="sortable-th" data-sort="banco_nombre">Banco <span class="sort-indicator"></span></th>
                                <th style="width: 12%;" class="sortable-th" data-sort="cuenta_numero">Cuenta <span class="sort-indicator"></span></th>
                                <th style="width: 11%;" class="sortable-th" data-sort="empresa_legible">Empresa <span class="sort-indicator"></span></th>
                                <th style="width: 10%;" class="sortable-th" data-sort="referencia_legible">Referencia <span class="sort-indicator"></span></th>
                                <th style="width: 14%;" class="sortable-th" data-sort="descripcion_legible">Descripción <span class="sort-indicator"></span></th>
                                <th style="width: 8%;" class="sortable-th" data-sort="debe">Debe <span class="sort-indicator"></span></th>
                                <th style="width: 8%;" class="sortable-th" data-sort="haber">Haber <span class="sort-indicator"></span></th>
                                <th style="width: 9%;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="movimientosTableBody"></tbody>
                    </table>
                </div>
                <div id="paginationMovimientos" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
            </div>
        </div>
    </section>
    `;
}
