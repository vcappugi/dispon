/**
 * @file js/utils/tableHelpers.js
 * @description Helpers reutilizables para ordenamiento, filtrado, paginación y cabeceras de tablas.
 */

/**
 * Ordena un arreglo de objetos por el campo y dirección indicados.
 * @param {Array<object>} rows
 * @param {string} field
 * @param {boolean} [asc=true]
 * @returns {Array<object>}
 */
export function sortRowsByField(rows, field, asc = true) {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
        const valA = a[field] ?? '';
        const valB = b[field] ?? '';

        const numA = Number(valA);
        const numB = Number(valB);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && valA !== '' && valB !== '') {
            return (numA - numB) * dir;
        }

        return String(valA).localeCompare(String(valB), 'es', { numeric: true, sensitivity: 'base' }) * dir;
    });
}

/**
 * Filtra un arreglo verificando si alguno de los campos indicados contiene el término buscado.
 * @param {Array<object>} rows
 * @param {string} query
 * @param {Array<string>} fields
 * @returns {Array<object>}
 */
export function filterRowsBySearch(rows, query, fields) {
    const cleanQuery = String(query || '').trim().toLowerCase();
    if (!cleanQuery) return rows;

    return rows.filter((row) =>
        fields.some((f) => String(row[f] ?? '').toLowerCase().includes(cleanQuery))
    );
}

/**
 * Pagina un arreglo y renderiza los controles Bootstrap de paginación.
 * @param {Array<object>} rows
 * @param {{ page: number, pageSize: number }} tblState
 * @param {string} containerId
 * @param {() => void} onPageChange
 * @returns {Array<object>}
 */
export function paginateAndRenderControls(rows, tblState, containerId, onPageChange) {
    const total = rows.length;
    const pageSize = Number(tblState.pageSize) || 10;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (tblState.page > totalPages) tblState.page = totalPages;
    if (tblState.page < 1) tblState.page = 1;

    const startIdx = (tblState.page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageRows = rows.slice(startIdx, endIdx);

    const container = document.getElementById(containerId);
    if (container) {
        const infoText =
            total === 0
                ? 'Mostrando 0 de 0 registros'
                : `Mostrando ${startIdx + 1} - ${endIdx} de ${total} registros`;

        let pagesHtml = '';
        const maxButtons = 5;
        let startPage = Math.max(1, tblState.page - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage + 1 < maxButtons) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        pagesHtml += `
            <li class="page-item ${tblState.page <= 1 ? 'disabled' : ''}">
                <button type="button" class="page-link" data-page="${tblState.page - 1}">&laquo;</button>
            </li>
        `;

        for (let p = startPage; p <= endPage; p++) {
            pagesHtml += `
                <li class="page-item ${p === tblState.page ? 'active' : ''}">
                    <button type="button" class="page-link" data-page="${p}">${p}</button>
                </li>
            `;
        }

        pagesHtml += `
            <li class="page-item ${tblState.page >= totalPages ? 'disabled' : ''}">
                <button type="button" class="page-link" data-page="${tblState.page + 1}">&raquo;</button>
            </li>
        `;

        container.innerHTML = `
            <span class="small text-secondary fw-semibold">${infoText}</span>
            <nav aria-label="Paginación">
                <ul class="pagination pagination-sm pagination-institutional mb-0">
                    ${pagesHtml}
                </ul>
            </nav>
        `;

        container.querySelectorAll('button[data-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetPage = Number(btn.getAttribute('data-page'));
                if (targetPage >= 1 && targetPage <= totalPages && targetPage !== tblState.page) {
                    tblState.page = targetPage;
                    onPageChange();
                }
            });
        });
    }

    return pageRows;
}

/**
 * Actualiza los indicadores visuales de ordenamiento en un `<thead>`.
 * @param {string} theadId
 * @param {{ sortField: string, sortAsc: boolean }} tblState
 */
export function updateSortIndicators(theadId, tblState) {
    const thead = document.getElementById(theadId);
    if (!thead) return;

    thead.querySelectorAll('th.sortable-th').forEach((th) => {
        const field = th.getAttribute('data-sort');
        const indicator = th.querySelector('.sort-indicator');
        if (!indicator) return;

        if (field === tblState.sortField) {
            indicator.innerHTML = tblState.sortAsc
                ? '<i class="bi bi-caret-up-fill"></i>'
                : '<i class="bi bi-caret-down-fill"></i>';
        } else {
            indicator.innerHTML = '<i class="bi bi-arrow-down-up opacity-50"></i>';
        }
    });
}

/**
 * Vincula eventos de clic para ordenar columnas en un `<thead>`.
 * @param {string} theadId
 * @param {{ sortField: string, sortAsc: boolean, page: number }} tblState
 * @param {() => void} renderFn
 */
export function bindSortableHeaders(theadId, tblState, renderFn) {
    const thead = document.getElementById(theadId);
    if (!thead) return;

    thead.querySelectorAll('th.sortable-th').forEach((th) => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            if (!field) return;

            if (tblState.sortField === field) {
                tblState.sortAsc = !tblState.sortAsc;
            } else {
                tblState.sortField = field;
                tblState.sortAsc = true;
            }
            tblState.page = 1;
            renderFn();
        });
    });
}

