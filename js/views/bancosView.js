/**
 * @file js/views/bancosView.js
 * @description Pantalla dedicada al CRUD completo de entidades bancarias (`public.bancos`).
 */

export function getBancosViewHtml() {
    return `
    <section id="module-bancos" class="module-section d-none">
        <div class="row g-3">
            <!-- Panel Izquierdo: Formulario CRUD de Banco -->
            <div class="col-12 col-lg-4">
                <div class="card card-institutional h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span><i class="bi bi-bank me-2 text-white"></i>Registro de Banco</span>
                        <span id="badgeModeBanco" class="badge badge-status-active">Nuevo Banco</span>
                    </div>
                    <div class="card-body">
                        <form id="formCrudBancos" class="row g-3">
                            <input type="hidden" id="bancoId" value="" />
                            <div class="col-12">
                                <label for="bancoNombre" class="form-label small fw-bold mb-1">
                                    Nombre del Banco (<code>nombre</code>)
                                </label>
                                <input
                                    type="text"
                                    id="bancoNombre"
                                    class="form-control form-control-sm"
                                    placeholder="Ej. Banesco Banco Universal"
                                    required
                                />
                                <div class="form-text small">Se almacena cifrado en Supabase con capa simétrica.</div>
                            </div>
                            <div class="col-12">
                                <label for="bancoTipo" class="form-label small fw-bold mb-1">
                                    Tipo de Entidad (<code>tipo</code>)
                                </label>
                                <select id="bancoTipo" class="form-select form-select-sm" required>
                                    <option value="Banco Nacional">Banco Nacional</option>
                                    <option value="Banco Internacional">Banco Internacional</option>
                                    <option value="Wallet">Wallet</option>
                                    <option value="Estructura">Estructura</option>
                                    <option value="Caja Efectivo">Caja Efectivo</option>
                                </select>
                            </div>
                            <div class="col-12">
                                <label for="bancoDescripcion" class="form-label small fw-bold mb-1">
                                    Descripción o Sucursal (<code>descripcion</code>)
                                </label>
                                <textarea
                                    id="bancoDescripcion"
                                    rows="3"
                                    class="form-control form-control-sm"
                                    placeholder="Ej. Cuenta corporativa principal / Banca Nacional"
                                ></textarea>
                            </div>
                            <div class="col-12 d-flex gap-2 pt-2 border-top">
                                <button type="button" id="btnResetBanco" class="btn btn-sm btn-outline-secondary w-50">
                                    <i class="bi bi-eraser me-1"></i>Limpiar
                                </button>
                                <button type="submit" class="btn btn-sm btn-institutional-primary w-50">
                                    <i class="bi bi-save me-1"></i>Guardar Banco
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Panel Derecho: Listado y Administración de Bancos -->
            <div class="col-12 col-lg-8">
                <div class="card card-institutional h-100">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-building-fill me-2 text-white"></i>
                            Catálogo de Bancos (<code class="text-white">public.bancos</code>)
                        </span>
                        <span id="bancosTotalBadge" class="badge bg-secondary">0 bancos</span>
                    </div>
                    <div class="card-body p-2 p-md-3">
                        <div class="row g-2 align-items-center mb-3">
                            <div class="col-12 col-md-8">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                                    <input
                                        type="text"
                                        id="filterBancos"
                                        class="form-control"
                                        placeholder="Buscar por código (ID), nombre, tipo o descripción..."
                                    />
                                </div>
                            </div>
                            <div class="col-12 col-md-4 d-flex justify-content-md-end align-items-center gap-2">
                                <label for="pageSizeBancos" class="small fw-semibold mb-0">Filas:</label>
                                <select id="pageSizeBancos" class="form-select form-select-sm" style="width: 80px;">
                                    <option value="5">5</option>
                                    <option value="10" selected>10</option>
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-viewport-container">
                            <table class="table table-adaptive align-middle">
                                <thead id="theadBancos">
                                    <tr>
                                        <th style="width: 9%;" class="sortable-th" data-sort="id">
                                            ID <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 24%;" class="sortable-th" data-sort="nombre_legible">
                                            Nombre del Banco <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 17%;" class="sortable-th" data-sort="tipo_legible">
                                            Tipo <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 26%;" class="sortable-th" data-sort="descripcion_legible">
                                            Descripción <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 11%;" class="sortable-th" data-sort="total_cuentas">
                                            Cuentas <span class="sort-indicator"></span>
                                        </th>
                                        <th style="width: 13%;">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody id="crudBancosTableBody"></tbody>
                            </table>
                        </div>
                        <div id="paginationBancos" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    `;
}

