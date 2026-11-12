/**
 * @file js/views/importacionView.js
 * @description Pantalla dedicada exclusivamente a la Importación Masiva CSV y Análisis de Estados de Cuenta PDF.
 */

export function getImportacionViewHtml() {
    return `
    <section id="module-importacion" class="module-section d-none">
        <ul class="nav nav-tabs mb-3" id="importTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button
                    class="nav-link active fw-semibold"
                    id="tabImportPdfBtn"
                    data-bs-toggle="tab"
                    data-bs-target="#paneImportPdf"
                    type="button"
                    role="tab"
                >
                    <i class="bi bi-file-earmark-pdf-fill text-danger me-1"></i>Analizador de Estados de Cuenta PDF (PDF.js)
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button
                    class="nav-link fw-semibold"
                    id="tabImportCsvBtn"
                    data-bs-toggle="tab"
                    data-bs-target="#paneImportCsv"
                    type="button"
                    role="tab"
                >
                    <i class="bi bi-filetype-csv text-success me-1"></i>Carga Masiva por Plantilla CSV
                </button>
            </li>
        </ul>

        <div class="tab-content">
            <!-- PESTAÑA 1: ANALIZADOR PDF -->
            <div class="tab-pane fade show active" id="paneImportPdf" role="tabpanel">
                <div class="card card-institutional mb-3">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-cpu-fill me-2 text-white"></i>
                            Configuración de Lectura e Interpretación PDF
                        </span>
                        <span class="badge badge-status-active">8 Campos Estrictos · Tipo = CUENTA</span>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-12 col-md-3">
                                <label for="pdfTargetBancoId" class="form-label small fw-bold mb-1">Banco Destino (Opcional)</label>
                                <select id="pdfTargetBancoId" class="form-select form-select-sm">
                                    <option value="">-- Auto (Detectar del PDF) --</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-3">
                                <label for="pdfTargetCuentaId" class="form-label small fw-bold mb-1">Cuenta Destino (Opcional)</label>
                                <select id="pdfTargetCuentaId" class="form-select form-select-sm">
                                    <option value="">-- Auto / Directo a Banco --</option>
                                </select>
                            </div>
                            <div class="col-6 col-md-2">
                                <label for="pdfTargetMoneda" class="form-label small fw-bold mb-1">Moneda Lote</label>
                                <select id="pdfTargetMoneda" class="form-select form-select-sm">
                                    <option value="VES" selected>VES</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="USDT">USDT</option>
                                    <option value="BNB">BNB</option>
                                    <option value="BTC">BTC</option>
                                    <option value="YEN">YEN</option>
                                </select>
                            </div>
                            <div class="col-6 col-md-2">
                                <label for="pdfDecimalSeparator" class="form-label small fw-bold mb-1">Separador Decimal</label>
                                <select id="pdfDecimalSeparator" class="form-select form-select-sm">
                                    <option value="," selected>Coma ( , )</option>
                                    <option value=".">Punto ( . )</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-2">
                                <label for="pdfParserMode" class="form-label small fw-bold mb-1">Formato Columnas</label>
                                <select id="pdfParserMode" class="form-select form-select-sm">
                                    <option value="auto" selected>Automático</option>
                                    <option value="dual">Dual (Debe / Haber)</option>
                                    <option value="single">Única (+ / -)</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-4">
                                <label for="pdfTargetEmpresa" class="form-label small fw-bold mb-1">Empresa / Titular (Opcional)</label>
                                <input
                                    type="text"
                                    id="pdfTargetEmpresa"
                                    class="form-control form-control-sm"
                                    placeholder="Auto detectar del PDF o escribir manual"
                                />
                            </div>
                            <div class="col-12 col-md-8 d-flex align-items-end gap-2">
                                <div class="flex-grow-1">
                                    <label for="pdfBankStatementInput" class="form-label small fw-bold mb-1">Seleccionar Estado de Cuenta PDF</label>
                                    <input type="file" id="pdfBankStatementInput" accept=".pdf,application/pdf" class="form-control form-control-sm" />
                                </div>
                                <button type="button" id="btnProcessPdfStatement" class="btn btn-sm btn-institutional-primary text-nowrap">
                                    <i class="bi bi-magic me-1"></i>Analizar PDF
                                </button>
                                <button type="button" id="btnClearPdfPreview" class="btn btn-sm btn-outline-secondary text-nowrap">
                                    <i class="bi bi-trash me-1"></i>Limpiar
                                </button>
                            </div>
                        </div>

                        <div id="pdfDropZone" class="pdf-drop-zone text-center py-3 px-3 mb-2">
                            <i class="bi bi-cloud-arrow-up fs-3 text-primary d-block mb-1"></i>
                            <div class="small fw-semibold">Arrastra y suelta tu estado de cuenta en formato PDF aquí</div>
                            <div class="text-muted" style="font-size: 0.78rem;">
                                Lectura local 100% en navegador con soporte para referencias alfanuméricas, montos pequeños (ej. 1.05) y exportación CSV.
                            </div>
                        </div>

                        <div id="pdfImportAlert" class="alert alert-info py-2 small mb-0 d-none"></div>
                    </div>
                </div>

                <!-- RESULTADO DE PREVISUALIZACIÓN INTERACTIVA -->
                <div id="pdfPreviewWrapper" class="card card-institutional d-none">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-table me-2 text-white"></i>
                            Vista Previa Editable del PDF Analizado
                        </span>
                        <div class="d-flex flex-wrap gap-2">
                            <span id="pdfPreviewStatsBadge" class="badge badge-status-active">0 registros</span>
                            <span id="pdfPreviewTotalsBadge" class="badge bg-light text-dark">Debe: 0,00 | Haber: 0,00</span>
                        </div>
                    </div>
                    <div class="card-body p-2 p-md-3">
                        <div id="pdfDetectedHeaderSummary" class="small mb-2 p-2 rounded border bg-light"></div>

                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                            <div class="d-flex flex-wrap gap-2">
                                <button type="button" id="btnApplyPdfHeaderToRows" class="btn btn-sm btn-outline-primary">
                                    <i class="bi bi-arrow-repeat me-1"></i>Aplicar Banco/Cuenta/Empresa a todas las filas
                                </button>
                                <button type="button" id="btnExportPdfPreviewCsv" class="btn btn-sm btn-institutional-white border">
                                    <i class="bi bi-filetype-csv me-1"></i>Descargar Tabla Analizada (CSV)
                                </button>
                            </div>
                            <button type="button" id="btnSavePdfPreviewToDb" class="btn btn-sm btn-institutional-accent">
                                <i class="bi bi-cloud-check-fill me-1"></i>Guardar Movimientos en Supabase
                            </button>
                        </div>

                        <div class="table-viewport-container" style="max-height: 480px; overflow-y: auto;">
                            <table class="table table-adaptive table-sm align-middle">
                                <thead>
                                    <tr>
                                        <th style="width: 4%;">#</th>
                                        <th style="width: 11%;">Banco</th>
                                        <th style="width: 12%;">Cuenta</th>
                                        <th style="width: 10%;">Fecha</th>
                                        <th style="width: 12%;">Empresa</th>
                                        <th style="width: 11%;">Referencia</th>
                                        <th style="width: 14%;">Descripción</th>
                                        <th style="width: 7%;">Tipo</th>
                                        <th style="width: 8%;">Debe</th>
                                        <th style="width: 8%;">Haber</th>
                                        <th style="width: 3%;">Quitar</th>
                                    </tr>
                                </thead>
                                <tbody id="pdfPreviewTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PESTAÑA 2: PLANTILLA CSV BATCH -->
            <div class="tab-pane fade" id="paneImportCsv" role="tabpanel">
                <div class="card card-institutional">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>
                            <i class="bi bi-filetype-csv me-2 text-white"></i>
                            Importación por Lotes desde Plantilla CSV (Sin límite de filas)
                        </span>
                        <span class="badge badge-status-active">Lotes de 500 filas · Fecha DD/MM/YYYY</span>
                    </div>
                    <div class="card-body">
                        <div class="row g-3 align-items-end">
                            <div class="col-12 col-md-4">
                                <label class="form-label small fw-bold mb-1">Paso 1: Obtener formato oficial</label>
                                <button type="button" id="btnDownloadPlantillaCsv" class="btn btn-sm btn-outline-primary w-100">
                                    <i class="bi bi-download me-1"></i>1. Descargar Plantilla CSV
                                </button>
                            </div>
                            <div class="col-12 col-md-5">
                                <label for="movCsvTemplateFile" class="form-label small fw-bold mb-1">Paso 2: Seleccionar archivo CSV completado</label>
                                <input type="file" id="movCsvTemplateFile" accept=".csv,text/csv" class="form-control form-control-sm" />
                            </div>
                            <div class="col-12 col-md-3">
                                <button type="button" id="btnImportPlantillaCsv" class="btn btn-sm btn-institutional-accent w-100">
                                    <i class="bi bi-cloud-arrow-up-fill me-1"></i>2. Cargar a Movimientos
                                </button>
                            </div>
                        </div>

                        <div class="mt-3 p-3 rounded border bg-light small">
                            <div class="fw-bold mb-1"><i class="bi bi-info-circle-fill text-primary me-1"></i>Reglas de validación de la plantilla CSV:</div>
                            <ul class="mb-0 ps-3">
                                <li>El campo <code>banco</code> se resuelve automáticamente contra <code>public.bancos</code> (crea o busca por nombre).</li>
                                <li>El campo <code>cuenta</code> puede dejarse vacío para movimientos directos a banco (<code>cuenta_id = null</code>); si trae número se asocia o registra en <code>public.cuentas</code>.</li>
                                <li>Formato obligatorio de fecha: <code>DD/MM/YYYY</code>. Monedas admitidas: <code>VES, USD, EUR, USDT, BNB, BTC, YEN</code>.</li>
                            </ul>
                        </div>

                        <div id="movModalImportAlert" class="alert alert-info py-2 small mt-3 mb-0 d-none"></div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    `;
}

