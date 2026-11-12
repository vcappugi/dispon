/**
 * @file js/views/cuentasView.js
 * @description Pantalla dedicada al CRUD completo de cuentas bancarias (`public.cuentas`).
 */

import { SUPPORTED_CURRENCIES } from '../utils/formatters.js';

export function getCuentasViewHtml() {
    const monedaOptionsHtml = SUPPORTED_CURRENCIES.map(
        (m) => `<option value="${m}">${m}</option>`
    ).join('');

    return `
    <section id="module-cuentas" class="module-section d-none">
        <div class="row g-3">
            <!-- Panel Izquierdo: Formulario CRUD de Cuenta -->
            <div class="col-12 col-lg-4">
                <div class="card card-institutional h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span><i class="bi bi-credit-card-2-front me-2 text-white"></i>Registro de Cuenta</span>
                        <span id="badgeModeCuenta" class="badge badge-status-active">Nueva Cuenta</span>
                    </div>
                    <div class="card-body">
                        <form id="formCrudCuentas" class="row g-3">
                            <input type="hidden" id="cuentaId" value="" />
                            <div class="col-12">
                                <label for="cuentaBancoId" class="form-label small fw-bold mb-1">
                                    Banco Asociado (<code>banco_id</code>)
                                </label>
                                <select id="cuentaBancoId" class="form-select form-select-sm" required>
                                    <option value="">Seleccione banco...</option>
                                </select>
                            </div>
                            <div class="col-12">
                                <label for="cuentaNumero" class="form-label small fw-bold mb-1">
                                    Número de Cuenta / IBAN (<code>cuenta</code>)
                                </label>
                                <input
                                    type="text"
                                    id="cuentaNumero"
                                    class="form-control form-control-sm"
                                    placeholder="Ej. 0134-0001-00-1234567890"
                                    required
                                />
                            </div>
                            <div class="col-12">
                                <label for="cuentaTipo" class="form-label small fw-bold mb-1">
                                    Tipo de Cuenta (<code>tipo</code>)
                                </label>
                                <select id="cuentaTipo" class="form-select form-select-sm" required>
                                    <option value="Corriente">Corriente</option>
                                    <option value="Ahorro">Ahorro</option>
                                    <option value="Custodia / Divisas">Custodia / Divisas</option>
                                </select>
                            </div>
                            <div class="col-12">
                                <label for="cuentaMoneda" class="form-label small fw-bold mb-1">
                                    Moneda de la Cuenta (<code>moneda</code>)
                                </label>
                                <select id="cuentaMoneda" class="form-select form-select-sm" required>
                                    ${monedaOptionsHtml}
                                </select>
                            </div>
                            <div class="col-12 d-flex gap-2 pt-2 border-top">
                                <button type="button" id="btnResetCuenta" class="btn btn-sm btn-outline-secondary w-50">
                                    <i class="bi bi-eraser me-1"></i>Limpiar
                                </button>
                                <button type="submit" class="btn btn-sm btn-institutional-primary w-50">
                                    <i class="bi bi-save me-1"></i>Guardar Cuenta
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Panel Derecho: Listado de Cuentas -->
            <div class="col-12 col-lg-8">
                <div class="card card-institutional h-100">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-wallet2 me-2 text-white"></i>
                            Cuentas Bancarias Registradas (<code class="text-white">public.cuentas</code>)
                        </span>
                        <span id="cuentasTotalBadge" class="badge bg-secondary">0 cuentas</span>
                    </div>
                    <div class="card-body p-2 p-md-3">
                        <div class="row g-2 align-items-end mb-3">
                            <div class="col-12 col-md-4">
                                <label for="filterCuentasBancoId" class="form-label small fw-bold mb-1">Filtrar por Banco</label>
                                <select id="filterCuentasBancoId" class="form-select form-select-sm">
                                    <option value="">Todos los bancos</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-5">
                                <label for="filterCuentas" class="form-label small fw-bold mb-1">Búsqueda rápida</label>
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                                    <input
                                        type="text"
                                        id="filterCuentas"
                                        class="form-control"
                                        placeholder="Código, banco, número, tipo o moneda..."
                                    />
                                </div>
                            </div>
                            <div class="col-12 col-md-3 d-flex justify-content-md-end align-items-center gap-2">
                                <label for="pageSizeCuentas" class="small fw-semibold mb-0">Filas:</label>
                                <select id="pageSizeCuentas" class="form-select form-select-sm" style="width: 80px;">
                                    <option value="5">5</option>
                                    <option value="10" selected>10</option>
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-viewport-container">
                            <table class="table table-adaptive align-middle">
                                <thead id="theadCuentas">
                                    <tr>
                                        <th style="width: 9%;" class="sortable-th" data-sort="id">
                                            ID <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 25%;" class="sortable-th" data-sort="banco_nombre">
                                            Banco <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 26%;" class="sortable-th" data-sort="cuenta_legible">
                                            Número de Cuenta <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 15%;" class="sortable-th" data-sort="tipo_legible">
                                            Tipo <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 11%;" class="sortable-th" data-sort="moneda_legible">
                                            Moneda <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 14%;">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody id="crudCuentasTableBody"></tbody>
                            </table>
                        </div>
                        <div id="paginationCuentas" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    `;
}

