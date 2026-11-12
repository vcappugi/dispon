/**
 * @file js/app.js
 * @description Orquestador modular principal: monta las pantallas HTML dedicadas,
 *              registra los controladores de cada módulo y coordina autenticación y datos.
 */

import { initAuthModule } from './core/auth.js';
import { onDataRefreshed } from './core/dataService.js';
import { initNavigationEvents } from './core/router.js';

import { getDashboardViewHtml } from './views/dashboardView.js';
import { getBancosViewHtml } from './views/bancosView.js';
import { getCuentasViewHtml } from './views/cuentasView.js';
import { getSaldosViewHtml } from './views/saldosView.js';
import { getMovimientosViewHtml } from './views/movimientosView.js';
import { getImportacionViewHtml } from './views/importacionView.js';
import { getExportacionViewHtml } from './views/exportacionView.js';
import { getUsuariosViewHtml } from './views/usuariosView.js';

import { initDashboardModule, renderDashboardScreen } from './modules/dashboardModule.js';
import { initBancosModule, renderBancosTable } from './modules/bancosModule.js';
import { initCuentasModule, renderCuentasTable } from './modules/cuentasModule.js';
import { initSaldosModule, renderSaldosScreen } from './modules/saldosModule.js';
import { initMovimientosModule, renderMovimientosTable } from './modules/movimientosModule.js';
import { initImportacionModule } from './modules/importacionModule.js';
import { initExportacionModule, renderExportTable } from './modules/exportacionModule.js';
import { initUsuariosModule, renderUsuariosTable } from './modules/usuariosModule.js';

/**
 * Renderiza el HTML de cada pantalla dedicada dentro de `#modulesRoot`.
 */
function mountModuleScreens() {
    const root = document.getElementById('modulesRoot');
    if (!root) return;

    root.innerHTML = [
        getDashboardViewHtml(),
        getBancosViewHtml(),
        getCuentasViewHtml(),
        getSaldosViewHtml(),
        getMovimientosViewHtml(),
        getImportacionViewHtml(),
        getExportacionViewHtml(),
        getUsuariosViewHtml()
    ].join('\n');
}

/**
 * Inicializa todos los módulos, eventos de navegación y ciclo de sincronización con Supabase.
 */
function bootstrapApplication() {
    mountModuleScreens();

    initDashboardModule();
    initBancosModule();
    initCuentasModule();
    initSaldosModule();
    initMovimientosModule();
    initImportacionModule();
    initExportacionModule();
    initUsuariosModule();

    onDataRefreshed(() => {
        renderDashboardScreen();
        renderBancosTable();
        renderCuentasTable();
        renderSaldosScreen();
        renderMovimientosTable();
        renderExportTable();
        renderUsuariosTable();
    });

    initNavigationEvents();
    initAuthModule();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApplication);
} else {
    bootstrapApplication();
}
