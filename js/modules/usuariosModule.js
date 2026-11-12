/**
 * @file js/modules/usuariosModule.js
 * @description Controlador de Usuarios del sistema.
 */

import { appState } from '../core/state.js';
import { escapeHtml } from '../utils/formatters.js';
import {
    sortRowsByField,
    filterRowsBySearch,
    paginateAndRenderControls,
    updateSortIndicators,
    bindSortableHeaders
} from '../utils/tableHelpers.js';

export function renderUsuariosTable() {
    const tbody = document.getElementById('usuariosTableBody');
    const dashUserCard = document.getElementById('dashUserCard');

    if (dashUserCard && appState.currentUser) {
        dashUserCard.textContent = `${appState.currentUser.nombre} (${appState.currentUser.rol})`;
    }

    if (!tbody) return;

    const st = appState.tableStates.usuarios;
    updateSortIndicators('theadUsuarios', st);

    const filtered = filterRowsBySearch(appState.usuarios, st.search, ['id', 'nombre', 'rol']);
    const sorted = sortRowsByField(filtered, st.sortField, st.sortAsc);
    const pageRows = paginateAndRenderControls(sorted, st, 'paginationUsuarios', renderUsuariosTable);

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No se encontraron usuarios.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageRows.forEach((u) => {
        const fecha = u.created_at ? new Date(u.created_at).toLocaleDateString('es-VE') : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Código" class="fw-bold">#${u.id}</td>
            <td data-label="Usuario" class="fw-semibold">${escapeHtml(u.nombre)}</td>
            <td data-label="Rol">
                <span class="badge ${u.rol === 'admin' ? 'badge-status-active' : 'badge-status-alert'}">
                    ${escapeHtml(u.rol)}
                </span>
            </td>
            <td data-label="Fecha Registro">${fecha}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function initUsuariosModule() {
    bindSortableHeaders('theadUsuarios', appState.tableStates.usuarios, renderUsuariosTable);

    document.getElementById('filterUsuarios')?.addEventListener('input', (e) => {
        appState.tableStates.usuarios.search = e.target.value;
        appState.tableStates.usuarios.page = 1;
        renderUsuariosTable();
    });

    document.getElementById('pageSizeUsuarios')?.addEventListener('change', (e) => {
        appState.tableStates.usuarios.pageSize = Number(e.target.value);
        appState.tableStates.usuarios.page = 1;
        renderUsuariosTable();
    });
}

