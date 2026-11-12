/**
 * @file js/modules/bancosModule.js
 * @description Controlador CRUD dedicado de entidades bancarias (`public.bancos`).
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

export function resetFormBanco() {
    document.getElementById('bancoId').value = '';
    document.getElementById('formCrudBancos')?.reset();
    const badge = document.getElementById('badgeModeBanco');
    if (badge) {
        badge.textContent = 'Nuevo Banco';
        badge.className = 'badge badge-status-active';
    }
}

export function renderBancosTable() {
    const tbody = document.getElementById('crudBancosTableBody');
    const totalBadge = document.getElementById('bancosTotalBadge');
    if (!tbody) return;

    const cuentasCountMap = new Map();
    appState.cuentas.forEach((c) => {
        const bid = Number(c.banco_id);
        cuentasCountMap.set(bid, (cuentasCountMap.get(bid) || 0) + 1);
    });

    const enrichedBancos = appState.bancos.map((b) => ({
        ...b,
        total_cuentas: cuentasCountMap.get(Number(b.id)) || 0
    }));

    if (totalBadge) totalBadge.textContent = `${enrichedBancos.length} banco(s)`;

    const st = appState.tableStates.bancos;
    updateSortIndicators('theadBancos', st);

    const filtered = filterRowsBySearch(enrichedBancos, st.search, [
        'id',
        'nombre_legible',
        'tipo_legible',
        'descripcion_legible'
    ]);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationBancos', renderBancosTable);

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted small py-3">No se encontraron bancos que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((b) => {
        const tipoBadge = b.tipo_legible
            ? `<span class="badge badge-status-active">${escapeHtml(b.tipo_legible)}</span>`
            : '<span class="text-muted">-</span>';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="ID" class="fw-bold">#${b.id}</td>
            <td data-label="Nombre" class="fw-semibold">${escapeHtml(b.nombre_legible)}</td>
            <td data-label="Tipo">${tipoBadge}</td>
            <td data-label="Descripción" class="small text-secondary">${escapeHtml(b.descripcion_legible || '-')}</td>
            <td data-label="Cuentas">
                <span class="badge bg-info text-dark">${b.total_cuentas} cta(s)</span>
            </td>
            <td data-label="Acciones">
                <div class="d-flex gap-1">
                    <button type="button" class="btn btn-sm btn-institutional-white py-0 px-2 btn-edit-banco" data-id="${b.id}" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-del-banco" data-id="${b.id}" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit-banco').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const found = appState.bancos.find((x) => Number(x.id) === id);
            if (!found) return;
            document.getElementById('bancoId').value = String(found.id);
            document.getElementById('bancoNombre').value = found.nombre_legible;
            document.getElementById('bancoTipo').value = found.tipo_legible || 'Banco Nacional';
            document.getElementById('bancoDescripcion').value = found.descripcion_legible || '';
            const badge = document.getElementById('badgeModeBanco');
            if (badge) {
                badge.textContent = `Editando #${found.id}`;
                badge.className = 'badge badge-status-alert';
            }
        });
    });

    tbody.querySelectorAll('.btn-del-banco').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-id'));
            const found = appState.bancos.find((x) => Number(x.id) === id);
            if (!window.confirm(`¿Eliminar el banco "${found?.nombre_legible || id}" y sus registros asociados?`)) return;
            const { error } = await supabase.from('bancos').delete().eq('id', id);
            if (error) {
                showFeedback(`Error al eliminar banco: ${error.message}`, 'danger');
                return;
            }
            showFeedback(`Banco #${id} eliminado.`, 'warning');
            resetFormBanco();
            await refreshAllDatabaseData();
        });
    });
}

export function initBancosModule() {
    bindSortableHeaders('theadBancos', appState.tableStates.bancos, renderBancosTable);

    document.getElementById('filterBancos')?.addEventListener('input', (e) => {
        appState.tableStates.bancos.search = e.target.value;
        appState.tableStates.bancos.page = 1;
        renderBancosTable();
    });

    document.getElementById('pageSizeBancos')?.addEventListener('change', (e) => {
        appState.tableStates.bancos.pageSize = Number(e.target.value);
        appState.tableStates.bancos.page = 1;
        renderBancosTable();
    });

    document.getElementById('btnResetBanco')?.addEventListener('click', resetFormBanco);

    document.getElementById('formCrudBancos')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idVal = document.getElementById('bancoId').value;
        const nombrePlano = document.getElementById('bancoNombre').value.trim();
        const tipoPlano = document.getElementById('bancoTipo').value.trim();
        const descPlano = document.getElementById('bancoDescripcion').value.trim();

        if (!nombrePlano || !tipoPlano) return;

        const payload = {
            nombre: encryptLocalSymmetric(nombrePlano),
            tipo: encryptLocalSymmetric(tipoPlano),
            descripcion: descPlano ? encryptLocalSymmetric(descPlano) : null
        };

        const { error } = idVal
            ? await supabase.from('bancos').update(payload).eq('id', Number(idVal))
            : await supabase.from('bancos').insert([payload]);

        if (error) {
            showFeedback(`Error al guardar en bancos: ${error.message}`, 'danger');
            return;
        }

        showFeedback(
            idVal ? `Banco #${idVal} actualizado.` : `Banco "${nombrePlano}" registrado en bancos.`,
            'success'
        );
        resetFormBanco();
        await refreshAllDatabaseData();
    });
}

