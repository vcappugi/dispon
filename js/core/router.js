/**
 * @file js/core/router.js
 * @description Navegación modular entre pantallas dedicadas desde el panel lateral de iconos.
 */

import { appState } from './state.js';

export const MODULE_METADATA = {
    dashboard: {
        title: 'Dashboard Ejecutivo',
        subtitle: 'Indicadores, gráficos de distribución por moneda y disponibilidad bancaria'
    },
    bancos: {
        title: 'Gestión de Bancos',
        subtitle: 'Catálogo maestro de entidades financieras (public.bancos)'
    },
    cuentas: {
        title: 'Cuentas Bancarias',
        subtitle: 'Administración de cuentas vinculadas por entidad bancaria (public.cuentas)'
    },
    saldos: {
        title: 'Saldos y Disponibilidad',
        subtitle: 'Consolidado desde vista_resumen_saldos_movimientos y registro manual saldos_banco'
    },
    movimientos: {
        title: 'Movimientos Bancarios',
        subtitle: 'CRUD completo, búsqueda avanzada y cálculo Crédito - Débito (public.movimientos)'
    },
    importacion: {
        title: 'Importación Masiva (CSV y PDF)',
        subtitle: 'Carga por plantilla CSV y analizador inteligente de estados de cuenta PDF'
    },
    exportacion: {
        title: 'Reportes y Exportación CSV',
        subtitle: 'Filtros multicriterio, vista previa y descarga de movimientos y saldos'
    },
    usuarios: {
        title: 'Usuarios y Sistema',
        subtitle: 'Cuentas de acceso, cifrado simétrico y scripts SQL de soporte'
    }
};

const routeChangeListeners = new Set();

/**
 * Registra un callback ejecutado al cambiar de pantalla.
 * @param {(moduleKey: string) => void} listener
 */
export function onRouteChange(listener) {
    if (typeof listener === 'function') {
        routeChangeListeners.add(listener);
    }
}

/**
 * Activa una pantalla específica por clave y actualiza títulos y panel lateral.
 * @param {string} moduleKey
 */
export function switchModule(moduleKey) {
    const targetKey = MODULE_METADATA[moduleKey] ? moduleKey : 'dashboard';
    appState.activeModule = targetKey;

    document.querySelectorAll('.module-section').forEach((sec) => {
        sec.classList.add('d-none');
    });
    const targetSection = document.getElementById(`module-${targetKey}`);
    if (targetSection) {
        targetSection.classList.remove('d-none');
    }

    document.querySelectorAll('.sidebar-link[data-module]').forEach((link) => {
        link.classList.toggle('active', link.getAttribute('data-module') === targetKey);
    });

    const meta = MODULE_METADATA[targetKey];
    const titleEl = document.getElementById('topbarModuleTitle');
    const subtitleEl = document.getElementById('topbarModuleSubtitle');
    if (titleEl) titleEl.textContent = meta.title;
    if (subtitleEl) subtitleEl.textContent = meta.subtitle;

    const sidebar = document.getElementById('appSidebar');
    if (sidebar?.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
    }

    routeChangeListeners.forEach((fn) => fn(targetKey));
}

/**
 * Vincula los enlaces de navegación lateral, botones de acceso rápido y menú móvil.
 */
export function initNavigationEvents() {
    document.querySelectorAll('.sidebar-link[data-module], .sidebar-brand[data-module]').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const moduleKey = link.getAttribute('data-module');
            if (moduleKey) switchModule(moduleKey);
        });
    });

    document.getElementById('modulesRoot')?.addEventListener('click', (e) => {
        const navBtn = e.target.closest('[data-navigate-module]');
        if (navBtn) {
            const targetModule = navBtn.getAttribute('data-navigate-module');
            if (targetModule) switchModule(targetModule);
        }
    });

    document.getElementById('btnMobileSidebar')?.addEventListener('click', () => {
        document.getElementById('appSidebar')?.classList.toggle('mobile-open');
    });

    switchModule('dashboard');
}
