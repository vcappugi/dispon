/**
 * @file js/views/usuariosView.js
 * @description Pantalla dedicada a Usuarios del Sistema, Cifrado Simétrico y Scripts SQL.
 */

const SQL_REFERENCE_SCRIPT = `CREATE OR REPLACE FUNCTION public.desencriptar_texto(
    p_cipher_text TEXT,
    p_secret_key TEXT DEFAULT 'disp_client_sym_layer_2026'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key TEXT;
    v_b64 TEXT;
    v_cipher_bytes BYTEA;
    v_key_bytes BYTEA;
    v_result_bytes BYTEA;
    v_data_len INTEGER;
    v_key_len INTEGER;
    i INTEGER;
BEGIN
    IF p_cipher_text IS NULL OR p_cipher_text = '' THEN
        RETURN p_cipher_text;
    END IF;
    v_key := COALESCE(NULLIF(p_secret_key, ''), 'disp_client_sym_layer_2026');
    IF left(p_cipher_text, 6) = 'ENCv1:' THEN
        BEGIN
            v_b64 := substring(p_cipher_text FROM 7);
            v_cipher_bytes := decode(v_b64, 'base64');
            v_key_bytes := convert_to(v_key, 'UTF8');
            v_data_len := octet_length(v_cipher_bytes);
            v_key_len := octet_length(v_key_bytes);
            IF v_data_len = 0 OR v_key_len = 0 THEN RETURN ''; END IF;
            v_result_bytes := v_cipher_bytes;
            FOR i IN 0 .. (v_data_len - 1) LOOP
                v_result_bytes := set_byte(
                    v_result_bytes,
                    i,
                    get_byte(v_cipher_bytes, i) # get_byte(v_key_bytes, mod(i, v_key_len))
                );
            END LOOP;
            RETURN convert_from(v_result_bytes, 'UTF8');
        EXCEPTION WHEN OTHERS THEN
            RETURN p_cipher_text;
        END;
    END IF;
    RETURN p_cipher_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.desencriptar_texto(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE VIEW public.vista_resumen_saldos_movimientos
WITH (security_invoker = true)
AS
SELECT
    ROW_NUMBER() OVER (ORDER BY m.fecha DESC, m.banco_id ASC, m.moneda ASC) AS id,
    m.banco_id,
    public.desencriptar_texto(b.nombre) AS banco_nombre,
    public.desencriptar_texto(b.descripcion) AS banco_descripcion,
    m.fecha,
    COALESCE(public.desencriptar_texto(m.moneda), 'VES') AS moneda,
    COUNT(m.id)::BIGINT AS total_movimientos,
    COUNT(m.id) FILTER (WHERE m.cuenta_id IS NOT NULL)::BIGINT AS movimientos_con_cuenta,
    COUNT(m.id) FILTER (WHERE m.cuenta_id IS NULL)::BIGINT AS movimientos_directo_banco,
    COUNT(DISTINCT m.cuenta_id)::BIGINT AS total_cuentas_movidas,
    COALESCE(SUM(m.debe), 0)::NUMERIC(18, 2) AS total_debe,
    COALESCE(SUM(m.haber), 0)::NUMERIC(18, 2) AS total_haber,
    COALESCE(SUM(COALESCE(m.haber, 0) - COALESCE(m.debe, 0)), 0)::NUMERIC(18, 2) AS saldo_disponible,
    MIN(m.fecha) AS primera_fecha,
    MAX(m.fecha) AS ultima_fecha
FROM public.movimientos m
LEFT JOIN public.bancos b ON b.id = m.banco_id
GROUP BY m.fecha, m.banco_id, b.nombre, b.descripcion, m.moneda;

GRANT SELECT ON public.vista_resumen_saldos_movimientos TO anon, authenticated;`;

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
        <div class="card card-institutional mb-3">
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
                                <th style="width: 8%;" class="sortable-th" data-sort="id">ID <span class="sort-indicator"></span></th>
                                <th style="width: 20%;" class="sortable-th" data-sort="nombre">Usuario <span class="sort-indicator"></span></th>
                                <th style="width: 14%;" class="sortable-th" data-sort="rol">Rol <span class="sort-indicator"></span></th>
                                <th style="width: 42%;" class="sortable-th" data-sort="clave">Clave Encriptada (BD) <span class="sort-indicator"></span></th>
                                <th style="width: 16%;" class="sortable-th" data-sort="created_at">Fecha Registro <span class="sort-indicator"></span></th>
                            </tr>
                        </thead>
                        <tbody id="usuariosTableBody"></tbody>
                    </table>
                </div>
                <div id="paginationUsuarios" class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"></div>
            </div>
        </div>

        <!-- REFERENCIA SQL DE SUPABASE -->
        <div class="card card-institutional">
            <div class="card-header d-flex justify-content-between align-items-center">
                <span>
                    <i class="bi bi-database-fill-gear me-2 text-white"></i>
                    Scripts SQL de Desencriptación y Vista de Disponibilidad
                </span>
                <button id="btnCopySqlVista" type="button" class="btn btn-sm btn-institutional-accent py-0 px-2">
                    <i class="bi bi-clipboard me-1"></i>Copiar SQL
                </button>
            </div>
            <div class="card-body bg-dark p-3">
                <pre id="sqlVistaCodeBlock" class="mb-0 p-2 rounded bg-black text-white small" style="overflow-x: auto;">${SQL_REFERENCE_SCRIPT}</pre>
            </div>
        </div>
    </section>
    `;
}
