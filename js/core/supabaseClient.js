/**
 * @file js/core/supabaseClient.js
 * @description Cliente singleton de Supabase y utilidades de lectura paginada / escritura por lotes.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getSupabaseConfig } from '../config.js';

const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Obtiene la totalidad de los registros de una tabla o vista de Supabase superando
 * el límite por defecto de 1000 filas por petición de PostgREST mediante paginación `.range()`.
 * @param {(from: number, to: number) => Promise<{ data: Array<any>, error: any }>} pageQueryFn
 * @param {number} [pageSize=1000]
 * @returns {Promise<{ data: Array<any>, error: any }>}
 */
export async function fetchAllSupabaseRows(pageQueryFn, pageSize = 1000) {
    const allRows = [];
    let offset = 0;

    while (true) {
        const { data, error } = await pageQueryFn(offset, offset + pageSize - 1);
        if (error) {
            return { data: allRows, error };
        }
        if (!data || data.length === 0) {
            break;
        }
        allRows.push(...data);
        if (data.length < pageSize) {
            break;
        }
        offset += pageSize;
    }

    return { data: allRows, error: null };
}

/**
 * Inserta registros en una tabla de Supabase por lotes para soportar cargas ilimitadas.
 * @param {string} tableName
 * @param {Array<object>} payloads
 * @param {number} [batchSize=500]
 * @param {(batchIndex: number, totalBatches: number, endCount: number, totalCount: number) => void} [onProgress]
 * @returns {Promise<{ inserted: number, error: any, failedRange?: [number, number] }>}
 */
export async function insertRowsInBatches(tableName, payloads, batchSize = 500, onProgress = null) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
        return { inserted: 0, error: null };
    }

    const totalBatches = Math.ceil(payloads.length / batchSize);
    for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
        const start = bIdx * batchSize;
        const end = Math.min(start + batchSize, payloads.length);
        const chunk = payloads.slice(start, end);

        if (typeof onProgress === 'function') {
            onProgress(bIdx + 1, totalBatches, end, payloads.length);
        }

        const { error } = await supabase.from(tableName).insert(chunk);
        if (error) {
            return {
                inserted: start,
                error,
                failedRange: [start + 1, end],
                failedBatch: bIdx + 1,
                totalBatches
            };
        }
    }

    return { inserted: payloads.length, error: null };
}

