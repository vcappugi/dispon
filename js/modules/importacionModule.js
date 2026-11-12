/**
 * @file js/modules/importacionModule.js
 * @description Controlador de pantalla Importación Masiva (Plantilla CSV Batch y Analizador PDF con PDF.js).
 */

import { appState, populateCuentaSelectById, getBancoNameById, getCuentaNameById } from '../core/state.js';
import { refreshAllDatabaseData } from '../core/dataService.js';
import {
    SUPPORTED_CURRENCIES,
    formatCurrencyAmount,
    escapeHtml,
    showFeedback,
    showScopedAlert,
    hideScopedAlert
} from '../utils/formatters.js';
import {
    splitCsvLine,
    parseDdMmYyyyToIso,
    parseCsvNumericAmount,
    downloadCsvFile,
    downloadPlantillaMovimientosCsv
} from '../utils/csvUtils.js';
import {
    extractStructuredLinesFromPdf,
    extractPdfHeaderMetadata,
    parseBankStatementTransactionsFromLines
} from '../services/pdfParserService.js';
import {
    resolveOrCreateBanco,
    resolveOrCreateCuenta,
    buildEncryptedMovimientoPayload,
    insertRowsInBatches
} from '../services/importBatchService.js';

function getSelectedPdfTargetOverrides() {
    const bancoId = document.getElementById('pdfTargetBancoId')?.value || '';
    const cuentaId = document.getElementById('pdfTargetCuentaId')?.value || '';
    const empresa = (document.getElementById('pdfTargetEmpresa')?.value || '').trim();
    const moneda = (document.getElementById('pdfTargetMoneda')?.value || 'VES').toUpperCase();

    return {
        bancoNombre: bancoId ? getBancoNameById(bancoId) : '',
        cuentaNumero: cuentaId ? getCuentaNameById(cuentaId) : '',
        empresa,
        moneda
    };
}

export function renderPdfPreviewTable() {
    const wrapper = document.getElementById('pdfPreviewWrapper');
    const tbody = document.getElementById('pdfPreviewTableBody');
    const statsBadge = document.getElementById('pdfPreviewStatsBadge');
    const totalsBadge = document.getElementById('pdfPreviewTotalsBadge');
    const moneda = (document.getElementById('pdfTargetMoneda')?.value || 'VES').toUpperCase();

    if (!wrapper || !tbody) return;

    if (appState.pdfPreviewRows.length === 0) {
        wrapper.classList.add('d-none');
        tbody.innerHTML = '';
        return;
    }

    wrapper.classList.remove('d-none');
    tbody.innerHTML = '';

    appState.pdfPreviewRows.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="#" class="fw-bold text-secondary">${index + 1}</td>
            <td data-label="Banco">
                <input type="text" class="form-control form-control-sm pdf-row-input" data-idx="${index}" data-field="banco" value="${escapeHtml(row.banco)}" />
            </td>
            <td data-label="Cuenta">
                <input type="text" class="form-control form-control-sm pdf-row-input" data-idx="${index}" data-field="cuenta" value="${escapeHtml(row.cuenta)}" />
            </td>
            <td data-label="Fecha">
                <input type="date" class="form-control form-control-sm pdf-row-input" data-idx="${index}" data-field="fecha" value="${escapeHtml(row.fecha)}" />
            </td>
            <td data-label="Empresa">
                <input type="text" class="form-control form-control-sm pdf-row-input" data-idx="${index}" data-field="empresa" value="${escapeHtml(row.empresa)}" />
            </td>
            <td data-label="Referencia">
                <input type="text" class="form-control form-control-sm pdf-row-input" data-idx="${index}" data-field="referencia" value="${escapeHtml(row.referencia)}" />
            </td>
            <td data-label="Descripción">
                <input type="text" class="form-control form-control-sm pdf-row-input" data-idx="${index}" data-field="descripcion" value="${escapeHtml(row.descripcion)}" />
            </td>
            <td data-label="Tipo" class="text-center">
                <span class="badge badge-status-active">CUENTA</span>
            </td>
            <td data-label="Debe">
                <input type="number" step="any" class="form-control form-control-sm text-end fw-bold pdf-row-input text-danger" data-idx="${index}" data-field="debe" value="${Number(row.debe || 0).toFixed(2)}" />
            </td>
            <td data-label="Haber">
                <input type="number" step="any" class="form-control form-control-sm text-end fw-bold pdf-row-input text-success" data-idx="${index}" data-field="haber" value="${Number(row.haber || 0).toFixed(2)}" />
            </td>
            <td data-label="Quitar" class="text-center">
                <button type="button" class="btn btn-sm btn-danger py-0 px-2 btn-remove-pdf-row" data-idx="${index}" title="Quitar fila">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const updateTotalsSummary = () => {
        let totalD = 0;
        let totalH = 0;
        appState.pdfPreviewRows.forEach((r) => {
            totalD += Number(r.debe || 0);
            totalH += Number(r.haber || 0);
        });
        const neto = totalH - totalD;

        if (statsBadge) statsBadge.textContent = `${appState.pdfPreviewRows.length} movimiento(s)`;
        if (totalsBadge) {
            totalsBadge.innerHTML = `Debe: <span class="text-danger">${formatCurrencyAmount(totalD, moneda)}</span> | Haber: <span class="text-success">${formatCurrencyAmount(totalH, moneda)}</span> | Neto (Crédito - Débito): <strong>${neto >= 0 ? '+' : ''}${formatCurrencyAmount(neto, moneda)} ${moneda}</strong>`;
        }
    };

    updateTotalsSummary();

    tbody.querySelectorAll('.pdf-row-input').forEach((input) => {
        input.addEventListener('input', (e) => {
            const idx = Number(e.target.getAttribute('data-idx'));
            const field = e.target.getAttribute('data-field');
            if (!appState.pdfPreviewRows[idx] || !field) return;

            if (field === 'debe' || field === 'haber') {
                appState.pdfPreviewRows[idx][field] = parseFloat(e.target.value) || 0;
                updateTotalsSummary();
            } else {
                appState.pdfPreviewRows[idx][field] = e.target.value;
            }
        });
    });

    tbody.querySelectorAll('.btn-remove-pdf-row').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-idx'));
            appState.pdfPreviewRows.splice(idx, 1);
            renderPdfPreviewTable();
        });
    });
}

async function processPdfFile(fileOverride = null) {
    const fileInput = document.getElementById('pdfBankStatementInput');
    const btnProcess = document.getElementById('btnProcessPdfStatement');
    const summaryEl = document.getElementById('pdfDetectedHeaderSummary');
    const decimalSeparator = document.getElementById('pdfDecimalSeparator')?.value || ',';
    const forcedMode = document.getElementById('pdfParserMode')?.value || 'auto';

    hideScopedAlert('pdfImportAlert');

    const file = fileOverride || (fileInput?.files && fileInput.files[0]);
    if (!file) {
        showScopedAlert('pdfImportAlert', 'Por favor seleccione o arrastre un archivo PDF primero.', 'warning');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        showScopedAlert('pdfImportAlert', 'El archivo seleccionado no es un PDF válido.', 'danger');
        return;
    }

    if (btnProcess) {
        btnProcess.disabled = true;
        btnProcess.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Analizando...';
    }

    try {
        const buffer = await file.arrayBuffer();
        const { lines, numPages } = await extractStructuredLinesFromPdf(buffer);

        if (lines.length === 0) {
            appState.pdfPreviewRows = [];
            renderPdfPreviewTable();
            showScopedAlert(
                'pdfImportAlert',
                'El PDF no contiene capa de texto seleccionable (imagen escaneada sin OCR).',
                'danger'
            );
            return;
        }

        const headerMeta = extractPdfHeaderMetadata(lines, appState.bancos, appState.cuentas);
        const overrides = getSelectedPdfTargetOverrides();

        const effectiveMeta = {
            ...headerMeta,
            banco: overrides.bancoNombre || headerMeta.banco,
            cuenta: overrides.cuentaNumero || headerMeta.cuenta,
            empresa: overrides.empresa || headerMeta.empresa
        };

        const monedaSelect = document.getElementById('pdfTargetMoneda');
        if (monedaSelect && headerMeta.moneda && SUPPORTED_CURRENCIES.includes(headerMeta.moneda)) {
            monedaSelect.value = headerMeta.moneda;
        }

        const { transactions, detectedMode } = parseBankStatementTransactionsFromLines(
            lines,
            effectiveMeta,
            forcedMode,
            decimalSeparator
        );

        if (transactions.length === 0) {
            appState.pdfPreviewRows = [];
            renderPdfPreviewTable();
            showScopedAlert(
                'pdfImportAlert',
                `Se leyeron ${numPages} página(s) y ${lines.length} líneas (decimal "${decimalSeparator}"), pero no se detectaron filas de movimientos válidas. Pruebe cambiar el separador decimal o modo de columnas.`,
                'danger'
            );
            return;
        }

        appState.pdfPreviewRows = transactions;
        if (summaryEl) {
            const sepLabel = decimalSeparator === '.' ? 'Punto (.)' : 'Coma (,)';
            const modeLabel = detectedMode === 'single' ? 'Columna Única (+/-)' : 'Dual (Débito / Crédito)';
            summaryEl.innerHTML = `<strong>Encabezado Detectado:</strong> Banco: <code>${escapeHtml(effectiveMeta.banco)}</code> · Cuenta: <code>${escapeHtml(effectiveMeta.cuenta)}</code> · Empresa: <code>${escapeHtml(effectiveMeta.empresa)}</code> · Modo: <span class="badge bg-primary">${modeLabel}</span> · Decimal: <span class="badge bg-secondary">${sepLabel}</span>`;
        }

        renderPdfPreviewTable();
        showScopedAlert(
            'pdfImportAlert',
            `<strong>Análisis completado:</strong> ${transactions.length} movimiento(s) extraído(s) en ${numPages} página(s). Puede editar cualquier celda o descargar el CSV antes de guardar.`,
            'success'
        );
    } catch (err) {
        appState.pdfPreviewRows = [];
        renderPdfPreviewTable();
        showScopedAlert('pdfImportAlert', `<strong>Error al analizar PDF:</strong> ${err.message}`, 'danger');
    } finally {
        if (btnProcess) {
            btnProcess.disabled = false;
            btnProcess.innerHTML = '<i class="bi bi-magic me-1"></i>Analizar PDF';
        }
    }
}

function applyPdfOverridesToPreviewRows() {
    if (appState.pdfPreviewRows.length === 0) return;
    const overrides = getSelectedPdfTargetOverrides();

    appState.pdfPreviewRows = appState.pdfPreviewRows.map((row) => ({
        ...row,
        banco: overrides.bancoNombre || row.banco,
        cuenta: overrides.cuentaNumero || row.cuenta,
        empresa: overrides.empresa || row.empresa,
        tipo: 'CUENTA'
    }));

    renderPdfPreviewTable();
    showScopedAlert(
        'pdfImportAlert',
        'Banco, cuenta y empresa aplicados a todas las filas de la vista previa.',
        'info'
    );
}

function exportPdfPreviewCsv() {
    if (appState.pdfPreviewRows.length === 0) {
        showScopedAlert('pdfImportAlert', 'Primero analice un PDF para descargar la tabla en CSV.', 'warning');
        return;
    }

    const headers = [
        'Nombre del Banco',
        'Nro de Cuenta Bancaria',
        'Fecha (YYYY-MM-DD)',
        'Nombre de la Empresa o Titular',
        'Nro de Referencia',
        'Tipo',
        'Debe',
        'Haber'
    ];

    const rows = appState.pdfPreviewRows.map((r) => [
        r.banco || '',
        r.cuenta || '',
        r.fecha || '',
        r.empresa || '',
        r.referencia || '',
        'CUENTA',
        Number(r.debe || 0).toFixed(2),
        Number(r.haber || 0).toFixed(2)
    ]);

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`estado_cuenta_pdf_analizado_${dateStamp}.csv`, headers, rows, true);
}

async function savePdfPreviewToSupabase() {
    if (appState.pdfPreviewRows.length === 0) {
        showScopedAlert('pdfImportAlert', 'No hay movimientos previsualizados para guardar.', 'warning');
        return;
    }

    const btnSave = document.getElementById('btnSavePdfPreviewToDb');
    const moneda = (document.getElementById('pdfTargetMoneda')?.value || 'VES').toUpperCase();

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';
    }

    try {
        const payloads = [];
        const errors = [];

        for (let i = 0; i < appState.pdfPreviewRows.length; i++) {
            const row = appState.pdfPreviewRows[i];
            const rowNum = i + 1;
            const fechaIso = String(row.fecha || '').trim();

            if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
                errors.push(`Fila #${rowNum}: Fecha "${fechaIso}" inválida (requiere YYYY-MM-DD).`);
                continue;
            }

            const { bancoObj, error: bErr } = await resolveOrCreateBanco(
                row.banco,
                true,
                'Creado desde importación de Estado de Cuenta PDF'
            );
            if (!bancoObj) {
                errors.push(`Fila #${rowNum}: ${bErr}`);
                continue;
            }

            const { cuentaId } = await resolveOrCreateCuenta(bancoObj, row.cuenta, true);

            payloads.push(
                buildEncryptedMovimientoPayload({
                    bancoId: bancoObj.id,
                    cuentaId,
                    fechaIso,
                    moneda,
                    empresa: String(row.empresa || '').trim(),
                    referencia: String(row.referencia || '').trim(),
                    descripcion: row.descripcion || `Estado de cuenta PDF (${row.cuenta || row.banco})`,
                    tipo: 'CUENTA',
                    debe: row.debe,
                    haber: row.haber
                })
            );
        }

        const batchRes = await insertRowsInBatches('movimientos', payloads, 500, (bIdx, totalB, endCount, totalCount) => {
            if (btnSave) {
                btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Lote ${bIdx}/${totalB} (${endCount}/${totalCount})...`;
            }
        });

        if (batchRes.error) {
            showScopedAlert(
                'pdfImportAlert',
                `Error al insertar lote ${batchRes.failedBatch}/${batchRes.totalBatches}: ${batchRes.error.message}`,
                'danger'
            );
            return;
        }

        await refreshAllDatabaseData();
        appState.pdfPreviewRows = [];
        renderPdfPreviewTable();
        const fileInput = document.getElementById('pdfBankStatementInput');
        if (fileInput) fileInput.value = '';

        showScopedAlert(
            'pdfImportAlert',
            `<strong>Importación PDF completada:</strong> ${payloads.length} movimiento(s) guardado(s) en <code>public.movimientos</code>.${
                errors.length > 0 ? `<br><span class="text-danger">${errors.join('<br>')}</span>` : ''
            }`,
            errors.length > 0 && payloads.length === 0 ? 'danger' : 'success'
        );
        showFeedback(`Se importaron ${payloads.length} movimientos desde PDF.`, 'success');
    } catch (err) {
        showScopedAlert('pdfImportAlert', `Error inesperado: ${err.message}`, 'danger');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-cloud-check-fill me-1"></i>Guardar Movimientos en Supabase';
        }
    }
}

async function importPlantillaCsvToMovimientos() {
    const fileInput = document.getElementById('movCsvTemplateFile');
    const btnImport = document.getElementById('btnImportPlantillaCsv');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showScopedAlert('movModalImportAlert', 'Seleccione primero un archivo CSV basado en la plantilla.', 'warning');
        return;
    }

    const text = await fileInput.files[0].text();
    const rawLines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (rawLines.length < 2) {
        showScopedAlert('movModalImportAlert', 'El archivo CSV está vacío o solo tiene encabezados.', 'danger');
        return;
    }

    const delimiter = rawLines[0].includes(';') ? ';' : ',';
    const dataLines = rawLines.slice(1);

    if (btnImport) {
        btnImport.disabled = true;
        btnImport.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importando...';
    }

    try {
        const payloads = [];
        const errors = [];
        let directBankCount = 0;

        for (let idx = 0; idx < dataLines.length; idx++) {
            const lineNum = idx + 2;
            const cols = splitCsvLine(dataLines[idx], delimiter);

            const bancoNombreCsv = (cols[0] || '').trim();
            const cuentaNroCsv = (cols[1] || '').trim();
            const fechaDdMmYyyy = (cols[2] || '').trim();
            const monedaCsv = (cols[3] || 'VES').trim().toUpperCase() || 'VES';
            const empresaCsv = (cols[4] || '').trim();
            const referenciaCsv = (cols[5] || '').trim();
            const descripcionCsv = (cols[6] || '').trim();
            const tipoCsv = (cols[7] || (cuentaNroCsv ? 'Crédito' : 'Saldo Directo')).trim();
            const debeVal = parseCsvNumericAmount(cols[8]);
            const haberVal = parseCsvNumericAmount(cols[9]);

            const parsedDate = parseDdMmYyyyToIso(fechaDdMmYyyy);
            if (!parsedDate.valid) {
                errors.push(`Fila ${lineNum}: Fecha "${fechaDdMmYyyy}" no cumple DD/MM/YYYY.`);
                continue;
            }

            const { bancoObj, error: bErr } = await resolveOrCreateBanco(
                bancoNombreCsv,
                true,
                'Creado desde importación CSV'
            );
            if (!bancoObj) {
                errors.push(`Fila ${lineNum}: ${bErr}`);
                continue;
            }

            let cuentaId = null;
            if (cuentaNroCsv) {
                const { cuentaId: cId, error: cErr } = await resolveOrCreateCuenta(bancoObj, cuentaNroCsv, true);
                if (cErr) {
                    errors.push(`Fila ${lineNum}: ${cErr}`);
                    continue;
                }
                cuentaId = cId;
            } else {
                directBankCount++;
            }

            payloads.push(
                buildEncryptedMovimientoPayload({
                    bancoId: bancoObj.id,
                    cuentaId,
                    fechaIso: parsedDate.isoDate,
                    moneda: monedaCsv,
                    empresa: empresaCsv,
                    referencia: referenciaCsv,
                    descripcion: descripcionCsv,
                    tipo: tipoCsv,
                    debe: debeVal,
                    haber: haberVal
                })
            );
        }

        const batchRes = await insertRowsInBatches('movimientos', payloads, 500, (bIdx, totalB, endCount, totalCount) => {
            if (btnImport) {
                btnImport.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Lote ${bIdx}/${totalB} (${endCount}/${totalCount})...`;
            }
        });

        if (batchRes.error) {
            showScopedAlert(
                'movModalImportAlert',
                `Error al insertar lote ${batchRes.failedBatch}/${batchRes.totalBatches}: ${batchRes.error.message}`,
                'danger'
            );
            return;
        }

        await refreshAllDatabaseData();
        fileInput.value = '';

        const summaryParts = [
            `<strong>Importación completada:</strong> ${payloads.length} movimiento(s) cargado(s) en <code>public.movimientos</code>.`
        ];
        if (directBankCount > 0) {
            summaryParts.push(`(${directBankCount} directo a banco sin número de cuenta).`);
        }
        if (errors.length > 0) {
            summaryParts.push(`<br><span class="text-danger">${errors.join('<br>')}</span>`);
        }

        showScopedAlert(
            'movModalImportAlert',
            summaryParts.join(' '),
            errors.length > 0 && payloads.length === 0 ? 'danger' : 'success'
        );
        showFeedback(`Se importaron ${payloads.length} movimientos desde CSV.`, 'success');
    } catch (err) {
        showScopedAlert('movModalImportAlert', `Error al procesar CSV: ${err.message}`, 'danger');
    } finally {
        if (btnImport) {
            btnImport.disabled = false;
            btnImport.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1"></i>2. Cargar a Movimientos';
        }
    }
}

export function initImportacionModule() {
    document.getElementById('pdfTargetBancoId')?.addEventListener('change', (e) => {
        populateCuentaSelectById('pdfTargetCuentaId', e.target.value, '-- Auto / Directo a Banco --');
    });

    document.getElementById('btnProcessPdfStatement')?.addEventListener('click', () => processPdfFile());
    document.getElementById('btnApplyPdfHeaderToRows')?.addEventListener('click', applyPdfOverridesToPreviewRows);
    document.getElementById('btnExportPdfPreviewCsv')?.addEventListener('click', exportPdfPreviewCsv);
    document.getElementById('btnSavePdfPreviewToDb')?.addEventListener('click', savePdfPreviewToSupabase);
    document.getElementById('btnClearPdfPreview')?.addEventListener('click', () => {
        appState.pdfPreviewRows = [];
        renderPdfPreviewTable();
        hideScopedAlert('pdfImportAlert');
    });

    document.getElementById('pdfTargetMoneda')?.addEventListener('change', () => {
        if (appState.pdfPreviewRows.length > 0) renderPdfPreviewTable();
    });

    const reprocessIfLoaded = () => {
        const input = document.getElementById('pdfBankStatementInput');
        if (input?.files?.length > 0 && appState.pdfPreviewRows.length > 0) {
            processPdfFile();
        }
    };
    document.getElementById('pdfDecimalSeparator')?.addEventListener('change', reprocessIfLoaded);
    document.getElementById('pdfParserMode')?.addEventListener('change', reprocessIfLoaded);

    const dropZone = document.getElementById('pdfDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const droppedFile = e.dataTransfer?.files?.[0];
            if (droppedFile) processPdfFile(droppedFile);
        });
    }

    document.getElementById('btnDownloadPlantillaCsv')?.addEventListener('click', () => {
        downloadPlantillaMovimientosCsv(appState.bancos, appState.cuentas);
    });
    document.getElementById('btnImportPlantillaCsv')?.addEventListener('click', importPlantillaCsvToMovimientos);
}
