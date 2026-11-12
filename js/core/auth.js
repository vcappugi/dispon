/**
 * @file js/core/auth.js
 * @description Autenticación de usuarios contra `public.usuarios` con verificación encriptada y sesión.
 */

import { verifyEncryptedPassword } from '../crypto-helper.js';
import { supabase } from './supabaseClient.js';
import { appState } from './state.js';
import { refreshAllDatabaseData } from './dataService.js';

export const SESSION_STORAGE_KEY = 'disp_authenticated_user_v1';

function showLoginAlert(message, type = 'danger') {
    const alertEl = document.getElementById('loginAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} py-2 small mb-3`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');
}

function hideLoginAlert() {
    const alertEl = document.getElementById('loginAlert');
    if (alertEl) alertEl.classList.add('d-none');
}

/**
 * Valida credenciales contra la tabla `public.usuarios` y verifica la clave encriptada.
 * @param {string} username
 * @param {string} plainPassword
 */
export async function authenticateUser(username, plainPassword) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(plainPassword || '');

    if (!cleanUser || !cleanPass) {
        return { ok: false, message: 'Por favor ingrese usuario y clave.' };
    }

    const { data: users, error } = await supabase
        .from('usuarios')
        .select('id, nombre, clave, rol, created_at')
        .ilike('nombre', cleanUser)
        .limit(1);

    if (error) {
        return {
            ok: false,
            message: `Error al consultar la tabla <code>usuarios</code>: ${error.message}`
        };
    }

    if (!users || users.length === 0) {
        return {
            ok: false,
            message: `El usuario <strong>${cleanUser}</strong> no existe en la tabla <code>usuarios</code>.`
        };
    }

    const userRow = users[0];
    const isPasswordValid = await verifyEncryptedPassword(cleanPass, userRow.clave, supabase);

    if (!isPasswordValid) {
        return {
            ok: false,
            message: 'La clave ingresada no coincide con la clave encriptada almacenada en la base de datos.'
        };
    }

    const sessionUser = {
        id: userRow.id,
        nombre: userRow.nombre,
        rol: userRow.rol || 'usuario',
        created_at: userRow.created_at
    };

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    return { ok: true, user: sessionUser };
}

/**
 * Alterna la vista entre pantalla de Login y Workspace autenticado.
 * @param {object|null} user
 */
export function updateAuthView(user) {
    const loginSection = document.getElementById('loginSection');
    const appWorkspace = document.getElementById('appWorkspace');
    appState.currentUser = user || null;

    if (user) {
        loginSection?.classList.add('d-none');
        appWorkspace?.classList.remove('d-none');

        const nameEl = document.getElementById('activeUserName');
        const roleEl = document.getElementById('activeUserRole');
        const dashUserCard = document.getElementById('dashUserCard');

        if (nameEl) nameEl.textContent = user.nombre;
        if (roleEl) roleEl.textContent = user.rol;
        if (dashUserCard) dashUserCard.textContent = `${user.nombre} (${user.rol})`;

        refreshAllDatabaseData();
    } else {
        appWorkspace?.classList.add('d-none');
        loginSection?.classList.remove('d-none');
        const inputUsuario = document.getElementById('inputUsuario');
        const inputClave = document.getElementById('inputClave');
        if (inputUsuario) inputUsuario.value = '';
        if (inputClave) inputClave.value = '';
    }
}

/**
 * Inicializa eventos de login, toggle de visibilidad de clave, cierre de sesión y restauración.
 */
export function initAuthModule() {
    const loginForm = document.getElementById('loginForm');
    const btnSubmitLogin = document.getElementById('btnSubmitLogin');
    const toggleBtn = document.getElementById('btnTogglePassword');
    const inputClave = document.getElementById('inputClave');

    toggleBtn?.addEventListener('click', () => {
        if (!inputClave) return;
        const isPassword = inputClave.type === 'password';
        inputClave.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword
            ? '<i class="bi bi-eye-slash-fill"></i>'
            : '<i class="bi bi-eye-fill"></i>';
    });

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideLoginAlert();

        const userVal = document.getElementById('inputUsuario')?.value;
        const passVal = document.getElementById('inputClave')?.value;

        if (btnSubmitLogin) {
            btnSubmitLogin.disabled = true;
            btnSubmitLogin.innerHTML =
                '<span class="spinner-border spinner-border-sm me-2"></span>Verificando clave encriptada...';
        }

        try {
            const result = await authenticateUser(userVal, passVal);
            if (result.ok) {
                updateAuthView(result.user);
            } else {
                showLoginAlert(result.message, 'danger');
            }
        } catch (err) {
            showLoginAlert(`Error inesperado en autenticación: ${err.message}`, 'danger');
        } finally {
            if (btnSubmitLogin) {
                btnSubmitLogin.disabled = false;
                btnSubmitLogin.innerHTML =
                    '<i class="bi bi-shield-check me-2"></i>Validar Credenciales e Ingresar';
            }
        }
    });

    const handleLogout = (e) => {
        e?.preventDefault();
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        updateAuthView(null);
    };

    document.getElementById('btnSidebarLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnTopbarLogout')?.addEventListener('click', handleLogout);

    try {
        const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            updateAuthView(parsed && parsed.nombre ? parsed : null);
        } else {
            updateAuthView(null);
        }
    } catch {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        updateAuthView(null);
    }
}
