/**
 * @file js/views/usuariosView.js
 * @description Pantalla dedicada a Usuarios del Sistema y Cifrado Simétrico.
 */

export function getUsuariosViewHtml() {
    return `
    <section id="module-usuarios" class="module-section d-none">
        <div class="row g-3 mb-3">
            <div class="col-12 col-md-6">
                <div class="card card-institutional h-100">
                    <div class="card-body">
                        <h2 class="h6 fw-bold text-primary mb-2">
                            <i class="bi bi-person-badge-fill me-2"></i>Sesión Activa
                        </h2>
                        <div class="small text-secondary mb-1">Usuario autenticado mediante clave encriptada en Supabase:</div>
                        <div id="dashUserCard" class="fw-bold fs-6 text-dark">-</div>
                    </div>
                </div>
            </div>
            <div class="col-12 col-md-6">
                <div class="card card-institutional h-100">
                    <div class="card-body">
                        <h2 class="h6 fw-bold text-success mb-2">
                            <i class="bi bi-shield-lock-fill me-2"></i>Cifrado Simétrico y Modelo Contable
                        </h2>
                        <div class="small text-secondary">
                            Los campos de texto bancario viajan y se almacenan con prefijo <code>ENCv1:</code>.
                            El saldo disponible bancario se computa siempre como <strong>Crédito (Haber) − Débito (Debe)</strong>.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TABLA DE USUARIOS -->
        <div class="card card-institutional">
            <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span>
                    <i class="bi bi-people-fill me-2 text-white"></i>
                    Usuarios Registrados (<code class="text-white">public.usuarios</code>)
                </span>
                <div class="d-flex align-items-center gap-2">
                    <div class="input-group input-group-sm" style="width: 220px;">
                        <span class="input-group-text"><i class="bi bi-search"></i></span>
                        <input type="text" id="filterUsuarios" class="form-control" placeholder="Buscar usuario o rol..." />
                    </div>
                    <select id="pageSizeUsuarios" class="form-select form-select-sm" style="width: 80px;">
                        <option value="5">5</option>
                        <option value="10" selected>10</option>
                        <option value="20">20</option>
                    </select>
                </div>
            </div>
            <div class="card-body p-2 p-md-3">
                <div class="table-viewport-container">
                    <table class="table table-adaptive align-middle">
                        <thead id="theadUsuarios">
                            <tr>
                                <th style="width: 12%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                <th style="width: 42%;" class="sortable-th" data-sort="nombre">Usuario <span class="sort-indicator"></span></th>
                                <th style="width: 24%;" class="sortable-th" data-sort="rol">Rol <span class="sort-indicator"></span></th>
                                <th style="width: 22%;" class="sortable-th" data-sort="created_at">Fecha Registro <span class="sort-indicator"></span></th>
                            </tr>
                        </thead>
                        <tbody id="usuariosTableBody"></tbody>
                    </table>
                </div>
                <div id="paginationUsuarios" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
            </div>
        </div>
    </section>
    `;
}

