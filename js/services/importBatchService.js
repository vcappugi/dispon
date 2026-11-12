/**
 * @file js/services/importBatchService.js
 * @description Resolución compartida de Bancos/Cuentas y persistencia por lotes en `public.movimientos`.
 */

import { encryptLocalSymmetric } from '../crypto-helper.js';
import { supabase, insertRowsInBatches } from '../core/supabaseClient.js';
import { appState } from '../core/state.js';

/**
 * Busca un banco por nombre legible en caché o lo crea encriptado en Supabase si `autoCreate` está activo.
 * @param {string} bancoNombre
 * @param {boolean} [autoCreate=true]
 * @param {string} [originLabel='Importación masiva']
 */
export async function resolveOrCreateBanco(bancoNombre, autoCreate = true, originLabel = 'Importación masiva') {
    const cleanName = String(bancoNombre || '').trim();
    if (!cleanName) return { bancoObj: null, error: 'El nombre del banco está vacío.' };

    const existing = appState.bancos.find(
        (b) => b.nombre_legible.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) return { bancoObj: existing, error: null };

    if (!autoCreate) {
        return { bancoObj: null, error: `El banco "${cleanName}" no existe en la tabla bancos.` };
    }

    const { data: created, error } = await supabase
        .from('bancos')
        .insert([
            {
                nombre: encryptLocalSymmetric(cleanName),
                descripcion: encryptLocalSymmetric(originLabel)
            }
        ])
        .select('id, created_at, nombre, descripcion');

    if (error || !created || created.length === 0) {
        return { bancoObj: null, error: `No se pudo registrar el banco "${cleanName}".` };
    }

    const newBanco = {
        ...created[0],
        nombre_legible: cleanName,
        descripcion_legible: originLabel
    };
    appState.bancos.push(newBanco);
    return { bancoObj: newBanco, error: null };
}

/**
 * Busca una cuenta asociada o la crea encriptada en `public.cuentas` si `autoCreate` está activo.
 * @param {object} bancoObj
 * @param {string} cuentaNro
 * @param {boolean} [autoCreate=true]
 */
export async function resolveOrCreateCuenta(bancoObj, cuentaNro, autoCreate = true) {
    const cleanCuenta = String(cuentaNro || '').trim();
    if (!cleanCuenta || cleanCuenta === 'SIN-CUENTA-DETECTADA') {
        return { cuentaId: null, error: null };
    }

    const existing =
        appState.cuentas.find(
            (c) =>
                Number(c.banco_id) === Number(bancoObj.id) &&
                c.cuenta_legible.trim().toLowerCase() === cleanCuenta.toLowerCase()
        ) ||
        appState.cuentas.find(
            (c) => c.cuenta_legible.trim().toLowerCase() === cleanCuenta.toLowerCase()
        );

    if (existing) return { cuentaId: existing.id, error: null };

    if (!autoCreate) {
        return { cuentaId: null, error: `La cuenta "${cleanCuenta}" no existe en la tabla cuentas.` };
    }

    const { data: created, error } = await supabase
        .from('cuentas')
        .insert([
            {
                banco_id: bancoObj.id,
                cuenta: encryptLocalSymmetric(cleanCuenta),
                tipo: encryptLocalSymmetric('Corriente')
            }
        ])
        .select('id, created_at, banco_id, cuenta, tipo');

    if (error || !created || created.length === 0) {
        return { cuentaId: null, error: `No se pudo registrar la cuenta "${cleanCuenta}".` };
    }

    const newCuenta = {
        ...created[0],
        cuenta_legible: cleanCuenta,
        tipo_legible: 'Corriente',
        banco_nombre: bancoObj.nombre_legible
    };
    appState.cuentas.push(newCuenta);
    return { cuentaId: newCuenta.id, error: null };
}

/**
 * Construye el objeto cifrado listo para insertar en `public.movimientos`.
 */
export function buildEncryptedMovimientoPayload({
    bancoId,
    cuentaId = null,
    fechaIso,
    moneda = 'VES',
    empresa = '',
    referencia = '',
    descripcion = '',
    tipo = 'CUENTA',
    debe = 0,
    haber = 0
}) {
    return {
        banco_id: bancoId,
        cuenta_id: cuentaId,
        fecha: fechaIso,
        moneda: encryptLocalSymmetric(String(moneda || 'VES').toUpperCase()),
        empresa: empresa ? encryptLocalSymmetric(empresa) : null,
        referencia: referencia ? encryptLocalSymmetric(referencia) : null,
        descripcion: descripcion ? encryptLocalSymmetric(descripcion) : null,
        tipo: encryptLocalSymmetric(tipo || 'CUENTA'),
        debe: Number(debe || 0),
        haber: Number(haber || 0)
    };
}

export { insertRowsInBatches };

