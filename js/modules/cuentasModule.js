/**
 * @file js/modules/cuentasModule.js
 * @description Controlador CRUD dedicado de cuentas bancarias (`public.cuentas`).
 */

import { encryptLocalSymmetric } from '../crypto-helper.js';
import { supabase } from '../core/supabaseClient.js';
import { appState } from '../core/state.js';
import { refreshAllDatabaseData } from '../core/dataService.js';
import { escapeHtml, showFeedback } from '../utils/formatters.js';
import {
    sortRowsByField,
    filterRowsBySearch,
    paginateAndRenderControls,
    updateSortIndicators,
    bindSortableHeaders
} from '../utils/tableHelpers.js';

export function resetFormCuenta() {
    document.getElementById('cuentaId').value = '';
    document.getElementById('formCrudCuentas')?.reset();
    const badge = document.getElementById('badgeModeCuenta');
    if (badge) {
        badge.textContent = 'Nueva Cuenta';
        badge.className = 'badge badge-status-active';
    }
}

export function renderCuentasTable() {
    const tbody = document.getElementById('crudCuentasTableBody');
    const totalBadge = document.getElementById('cuentasTotalBadge');
    if (!tbody) return;

    const st = appState.tableStates.cuentas;
    updateSortIndicators('theadCuentas', st);

    let source = appState.cuentas;
    if (st.bancoId) {
        source = source.filter((c) => Number(c.banco_id) === Number(st.bancoId));
    }

    if (totalBadge) totalBadge.textContent = `${source.length} cuenta(s)`;

    const filtered = filterRowsBySearch(source, st.search, [
        'id',
        'banco_nombre',
        'cuenta_legible',
        'tipo_legible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationCuentas', renderCuentasTable);

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted small py-3">No se encontraron cuentas que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((c) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="ID" class="fw-bold">#${c.id}</td>
            <td data-label="Banco" class="fw-semibold">${escapeHtml(c.banco_nombre)}</td>
            <td data-label="Número"><code>${escapeHtml(c.cuenta_legible)}</code></td>
            <td data-label="Tipo"><span class="badge badge-status-active">${escapeHtml(c.tipo_legible || 'Corriente')}</span></td>
            <td data-label="Acciones">
                <div class="d-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-cuenta" data-id="${c.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-cuenta" data-id="${c.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-cuenta').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const found = appState.cuentas.find((x) => Number(x.id) === id);
            if (!found) return;
            document.getElementById('cuentaId').value = String(found.id);
            document.getElementById('cuentaBancoId').value = String(found.banco_id);
            document.getElementById('cuentaNumero').value = found.cuenta_legible;
            document.getElementById('cuentaTipo').value = found.tipo_legible || 'Corriente';
            const badge = document.getElementById('badgeModeCuenta');
            if (badge) {
                badge.textContent = `Editando #${found.id}`;
                badge.className = 'badge badge-status-alert';
            }
        });
    });

    tbody.querySelectorAll('.btn-del-cuenta').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            if (!window.confirm(`¿Eliminar la cuenta ID #${id}?`)) return;
            const { error } = await supabase.from('cuentas').delete().eq('id', id);
            if (error) {
                showFeedback(`Error al eliminar cuenta: ${error.message}`, 'danger');
                return;
            }
            showFeedback(`Cuenta #${id} eliminada.`, 'warning');
            resetFormCuenta();
            await refreshAllDatabaseData();
        });
    });
}

export function initCuentasModule() {
    bindSortableHeaders('theadCuentas', appState.tableStates.cuentas, renderCuentasTable);

    document.getElementById('filterCuentasBancoId')?.addEventListener('change', (e) => {
        appState.tableStates.cuentas.bancoId = e.target.value;
        appState.tableStates.cuentas.page = 1;
        renderCuentasTable();
    });

    document.getElementById('filterCuentas')?.addEventListener('input', (e) => {
        appState.tableStates.cuentas.search = e.target.value;
        appState.tableStates.cuentas.page = 1;
        renderCuentasTable();
    });

    document.getElementById('pageSizeCuentas')?.addEventListener('change', (e) => {
        appState.tableStates.cuentas.pageSize = Number(e.target.value);
        appState.tableStates.cuentas.page = 1;
        renderCuentasTable();
    });

    document.getElementById('btnResetCuenta')?.addEventListener('click', resetFormCuenta);

    document.getElementById('formCrudCuentas')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idVal = document.getElementById('cuentaId').value;
        const bancoId = Number(document.getElementById('cuentaBancoId').value);
        const cuentaPlano = document.getElementById('cuentaNumero').value.trim();
        const tipoPlano = document.getElementById('cuentaTipo').value.trim();

        if (!bancoId || !cuentaPlano) return;

        const payload = {
            banco_id: bancoId,
            cuenta: encryptLocalSymmetric(cuentaPlano),
            tipo: encryptLocalSymmetric(tipoPlano)
        };

        const { error } = idVal
            ? await supabase.from('cuentas').update(payload).eq('id', Number(idVal))
            : await supabase.from('cuentas').insert([payload]);

        if (error) {
            showFeedback(`Error al guardar en cuentas: ${error.message}`, 'danger');
            return;
        }

        showFeedback(
            idVal ? `Cuenta #${idVal} actualizada.` : 'Nueva cuenta registrada en tabla cuentas.',
            'success'
        );
        resetFormCuenta();
        await refreshAllDatabaseData();
    });
}
