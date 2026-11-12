/**
 * @file js/core/dataService.js
 * @description Sincronización de catálogos, movimientos, saldos y vista resumen desde Supabase.
 */

import { decryptLocalSymmetric } from '../crypto-helper.js';
import { supabase, fetchAllSupabaseRows } from './supabaseClient.js';
import { appState, getBancoNameById, getCuentaNameById, refreshAllEntitySelects } from './state.js';

const dataRefreshListeners = new Set();

/**
 * Registra un callback a ejecutarse cada vez que se refrescan los datos desde Supabase.
 * @param {() => void} listener
 */
export function onDataRefreshed(listener) {
    if (typeof listener === 'function') {
        dataRefreshListeners.add(listener);
    }
}

function formatVistaCuentasEstructura(bancoId, movsConCuenta, movsDirecto) {
    const ctasList = appState.cuentas
        .filter((c) => Number(c.banco_id) === Number(bancoId))
        .map((c) => c.cuenta_legible)
        .join(', ');
    const baseCtas = ctasList ? `Ctas: ${ctasList}` : 'Sin cuenta asociada';
    return `${baseCtas} (${movsConCuenta} en cta / ${movsDirecto} directos)`;
}

function buildVistaResumenFromMovimientos(movimientosSource) {
    const groups = new Map();

    movimientosSource.forEach((m) => {
        const bId = m.banco_id ?? 0;
        const fechaKey = m.fecha || '';
        const mon = (m.moneda_legible || 'VES').toUpperCase();
        const key = `${fechaKey}__${bId}__${mon}`;

        if (!groups.has(key)) {
            groups.set(key, {
                banco_id: m.banco_id,
                banco_nombre: m.banco_nombre || getBancoNameById(m.banco_id),
                fecha: m.fecha || null,
                moneda_legible: mon,
                total_movimientos: 0,
                movimientos_con_cuenta: 0,
                movimientos_directo_banco: 0,
                cuentasSet: new Set(),
                total_debe: 0,
                total_haber: 0,
                saldo_disponible: 0,
                primera_fecha: m.fecha || null,
                ultima_fecha: m.fecha || null
            });
        }

        const item = groups.get(key);
        const debeVal = Number(m.debe || 0);
        const haberVal = Number(m.haber || 0);

        item.total_movimientos += 1;
        if (m.cuenta_id) {
            item.movimientos_con_cuenta += 1;
            item.cuentasSet.add(m.cuenta_id);
        } else {
            item.movimientos_directo_banco += 1;
        }
        item.total_debe += debeVal;
        item.total_haber += haberVal;
        item.saldo_disponible += haberVal - debeVal; // Crédito menos Débito (banco)
    });

    const sortedEntries = [...groups.values()].sort((a, b) => {
        const dateCmp = String(b.fecha || '').localeCompare(String(a.fecha || ''));
        if (dateCmp !== 0) return dateCmp;
        const diffBanco = Number(a.banco_id || 0) - Number(b.banco_id || 0);
        if (diffBanco !== 0) return diffBanco;
        return String(a.moneda_legible).localeCompare(String(b.moneda_legible));
    });

    return sortedEntries.map((row, index) => ({
        id: index + 1,
        banco_id: row.banco_id,
        banco_nombre: row.banco_nombre,
        fecha: row.fecha,
        moneda_legible: row.moneda_legible,
        total_movimientos: row.total_movimientos,
        movimientos_con_cuenta: row.movimientos_con_cuenta,
        movimientos_directo_banco: row.movimientos_directo_banco,
        total_cuentas_movidas: row.cuentasSet.size,
        total_debe: Number(row.total_debe.toFixed(2)),
        total_haber: Number(row.total_haber.toFixed(2)),
        saldo_disponible: Number(row.saldo_disponible.toFixed(2)),
        primera_fecha: row.primera_fecha,
        ultima_fecha: row.ultima_fecha,
        cuentas_asociadas: formatVistaCuentasEstructura(
            row.banco_id,
            row.movimientos_con_cuenta,
            row.movimientos_directo_banco
        )
    }));
}

export async function loadBancosFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('bancos')
            .select('id, created_at, nombre, descripcion')
            .order('id', { ascending: true })
            .range(from, to)
    );

    if (error || !data) {
        appState.bancos = [];
        return;
    }

    appState.bancos = data.map((row) => ({
        ...row,
        nombre_legible: decryptLocalSymmetric(row.nombre || ''),
        descripcion_legible: decryptLocalSymmetric(row.descripcion || '')
    }));
}

export async function loadCuentasFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('cuentas')
            .select('id, created_at, banco_id, cuenta, tipo')
            .order('id', { ascending: true })
            .range(from, to)
    );

    if (error || !data) {
        appState.cuentas = [];
        return;
    }

    appState.cuentas = data.map((row) => ({
        ...row,
        cuenta_legible: decryptLocalSymmetric(row.cuenta || ''),
        tipo_legible: decryptLocalSymmetric(row.tipo || '')
    }));
}

export async function loadSaldosBancoFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('saldos_banco')
            .select('id, created_at, banco_id, fecha, monto, moneda')
            .order('fecha', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
    );

    if (error || !data) {
        appState.saldosBanco = [];
        return;
    }

    appState.saldosBanco = data.map((row) => ({
        ...row,
        monto: Number(row.monto || 0),
        moneda_legible: decryptLocalSymmetric(row.moneda || 'VES')
    }));
}

export async function loadMovimientosFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('movimientos')
            .select('id, created_at, banco_id, cuenta_id, fecha, moneda, empresa, referencia, descripcion, tipo, debe, haber')
            .order('fecha', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
    );

    if (error || !data) {
        appState.movimientos = [];
        return;
    }

    appState.movimientos = data.map((row) => ({
        ...row,
        debe: Number(row.debe || 0),
        haber: Number(row.haber || 0),
        moneda_legible: decryptLocalSymmetric(row.moneda || 'VES'),
        empresa_legible: decryptLocalSymmetric(row.empresa || ''),
        referencia_legible: decryptLocalSymmetric(row.referencia || ''),
        descripcion_legible: decryptLocalSymmetric(row.descripcion || ''),
        tipo_legible: decryptLocalSymmetric(row.tipo || '')
    }));
}

export async function loadVistaResumenSaldosFromDb() {
    const { data, error } = await fetchAllSupabaseRows((from, to) =>
        supabase
            .from('vista_resumen_saldos_movimientos')
            .select('*')
            .order('id', { ascending: true })
            .range(from, to)
    );

    if (error || !data) {
        appState.vistaActivaEnDb = false;
        appState.vistaResumenSaldos = [];
        return;
    }

    appState.vistaActivaEnDb = true;
    appState.vistaResumenSaldos = data.map((row, idx) => ({
        ...row,
        id: Number(row.id || idx + 1),
        banco_id: row.banco_id,
        banco_nombre_legible: row.banco_nombre ? decryptLocalSymmetric(row.banco_nombre) : '',
        banco_descripcion_legible: row.banco_descripcion ? decryptLocalSymmetric(row.banco_descripcion) : '',
        fecha: row.fecha || row.ultima_fecha || null,
        moneda_legible: decryptLocalSymmetric(row.moneda || 'VES').toUpperCase() || 'VES',
        total_movimientos: Number(row.total_movimientos || 0),
        movimientos_con_cuenta: Number(row.movimientos_con_cuenta || 0),
        movimientos_directo_banco: Number(row.movimientos_directo_banco || 0),
        total_cuentas_movidas: Number(row.total_cuentas_movidas || 0),
        total_debe: Number(row.total_debe || 0),
        total_haber: Number(row.total_haber || 0),
        saldo_disponible: Number(row.total_haber || 0) - Number(row.total_debe || 0), // Crédito menos Débito (banco)
        primera_fecha: row.primera_fecha || row.fecha || null,
        ultima_fecha: row.ultima_fecha || row.fecha || null
    }));
}

export async function loadUsuariosFromDb() {
    const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, clave, rol, created_at')
        .order('id', { ascending: true });

    appState.usuarios = !error && data ? data : [];
}

/**
 * Recarga toda la información desde Supabase, enriquece relaciones y notifica a los módulos registrados.
 */
export async function refreshAllDatabaseData() {
    await Promise.all([
        loadBancosFromDb(),
        loadCuentasFromDb(),
        loadSaldosBancoFromDb(),
        loadMovimientosFromDb(),
        loadVistaResumenSaldosFromDb(),
        loadUsuariosFromDb()
    ]);

    appState.cuentas = appState.cuentas.map((c) => ({
        ...c,
        banco_nombre: getBancoNameById(c.banco_id)
    }));

    appState.saldosBanco = appState.saldosBanco.map((s) => ({
        ...s,
        banco_nombre: getBancoNameById(s.banco_id)
    }));

    appState.movimientos = appState.movimientos.map((m) => ({
        ...m,
        banco_nombre: getBancoNameById(m.banco_id),
        cuenta_numero: getCuentaNameById(m.cuenta_id),
        flujo_neto: Number(m.haber || 0) - Number(m.debe || 0) // Crédito menos Débito (banco)
    }));

    if (appState.vistaActivaEnDb && appState.vistaResumenSaldos.length > 0) {
        appState.vistaResumenSaldos = appState.vistaResumenSaldos.map((v, idx) => ({
            ...v,
            id: Number(v.id || idx + 1),
            banco_nombre: v.banco_nombre_legible || getBancoNameById(v.banco_id),
            cuentas_asociadas: formatVistaCuentasEstructura(
                v.banco_id,
                v.movimientos_con_cuenta,
                v.movimientos_directo_banco
            )
        }));
    } else {
        appState.vistaResumenSaldos = buildVistaResumenFromMovimientos(appState.movimientos);
    }

    refreshAllEntitySelects();
    dataRefreshListeners.forEach((listener) => listener());
}
