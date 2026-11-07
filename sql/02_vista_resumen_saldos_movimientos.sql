-- ============================================================================
-- ARCHIVO: sql/02_vista_resumen_saldos_movimientos.sql
-- DESCRIPCIÓN: Vista en Supabase (`public.vista_resumen_saldos_movimientos`)
--              que totaliza por fecha (`fecha`), banco (`banco_id`) y moneda
--              los saldos bancarios e indicadores directamente como resumen
--              de la tabla `public.movimientos` (ignorando `saldos_banco`).
-- ESTÁNDAR: Nomenclatura estricta en minúsculas (snake_case) y security_invoker
--           para respetar las políticas Row Level Security (RLS).
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_resumen_saldos_movimientos
WITH (security_invoker = true)
AS
SELECT
    ROW_NUMBER() OVER (ORDER BY m.fecha DESC, m.banco_id ASC, m.moneda ASC) AS id,
    m.banco_id,
    b.nombre AS banco_nombre,
    b.descripcion AS banco_descripcion,
    m.fecha,
    COALESCE(m.moneda, 'VES') AS moneda,
    COUNT(m.id)::BIGINT AS total_movimientos,
    COUNT(m.id) FILTER (WHERE m.cuenta_id IS NOT NULL)::BIGINT AS movimientos_con_cuenta,
    COUNT(m.id) FILTER (WHERE m.cuenta_id IS NULL)::BIGINT AS movimientos_directo_banco,
    COUNT(DISTINCT m.cuenta_id)::BIGINT AS total_cuentas_movidas,
    COALESCE(SUM(m.debe), 0)::NUMERIC(18, 2) AS total_debe,
    COALESCE(SUM(m.haber), 0)::NUMERIC(18, 2) AS total_haber,
    COALESCE(SUM(COALESCE(m.debe, 0) - COALESCE(m.haber, 0)), 0)::NUMERIC(18, 2) AS saldo_disponible,
    MIN(m.fecha) AS primera_fecha,
    MAX(m.fecha) AS ultima_fecha
FROM public.movimientos m
LEFT JOIN public.bancos b ON b.id = m.banco_id
GROUP BY m.fecha, m.banco_id, b.nombre, b.descripcion, m.moneda;

GRANT SELECT ON public.vista_resumen_saldos_movimientos TO anon, authenticated;
