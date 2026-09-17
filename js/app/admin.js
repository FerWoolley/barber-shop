/* ==========================================================================
   ADMIN APP LOGIC (Vanilla JS)
   96 BARBER SHOP - Dashboard Admin, Imágenes Base64, Barberos Restringidos
   ========================================================================== */

let currentBase64ProductImage = "";
let isAdminDashboardInitialized = false;
let cashAvailableServices = [];
let cashAvailableProducts = [];
let cashAvailableCustomers = [];
let cashSelectedCustomerId = null;
let currentAdminEmail = '';
let currentAdminProfile = null;
import '../services/db.js';

function normalizeAdminEmail(email) {
    return String(email || '').trim().toLowerCase();
}
const getAdminUsers = () => window.BarberAuth.getUsers();
function updateCurrentAdminUI() {
    document.querySelectorAll('[data-current-admin-email]').forEach(element => {
        element.textContent = currentAdminEmail;
    });
}
function isCurrentAdminMaster() {
    return currentAdminProfile?.role === 'master' && currentAdminProfile.active;
}
async function initAdminAuth() {
    const loginScreen = document.getElementById('admin-login-screen');
    const adminPanel = document.getElementById('admin-panel');
    const loginForm = document.getElementById('admin-login-form');
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginError = document.getElementById('admin-login-error');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const openLogin = () => {
        currentAdminProfile = null;
        currentAdminEmail = '';
        updateCurrentAdminUI();
        closeAdminMobileMenu();
        adminPanel.hidden = true;
        loginScreen.hidden = false;
        document.body.classList.remove('admin-authenticated');
    };
    openLogin();
    submitButton.disabled = true;
    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!loginForm.reportValidity()) return;
        submitButton.disabled = true;
        loginError.textContent = '';
        try {
            await window.BarberAuth.login(normalizeAdminEmail(emailInput.value), passwordInput.value);
            passwordInput.value = '';
        } catch (error) {
            console.error('Error de inicio de sesión:', error.code || error.message);
            loginError.textContent = 'No se pudo iniciar sesión. Revisá tus datos y tu acceso al panel.';
            passwordInput.select();
        } finally {
            submitButton.disabled = false;
        }
    });
    document.querySelectorAll('[data-admin-logout]').forEach(button => {
        button.addEventListener('click', async () => {
            try {
                await window.BarberAuth.logout();
                window.location.reload();
            } catch (error) {
                showToast('No se pudo cerrar la sesión. Intentá nuevamente.', 'error');
            }
        });
    });
    try {
        await window.BarberAuth.ready;
        window.BarberAuth.observe(async profile => {
            if (!profile) { openLogin(); return; }
            currentAdminProfile = profile;
            currentAdminEmail = profile.email;
            updateCurrentAdminUI();
            loginScreen.hidden = true;
            adminPanel.hidden = false;
            document.body.classList.add('admin-authenticated');
            try {
                await initAdminDashboard();
                await renderAdminUsers();
            } catch (error) {
                showToast('No se pudo cargar el panel. Revisá la conexión.', 'error');
            }
        }, () => {
            openLogin();
            loginError.textContent = 'No se pudo comprobar tu acceso. Revisá la conexión.';
        });
    } catch (error) {
        loginError.textContent = 'No se pudo conectar con Firebase. Recargá la página.';
    } finally {
        submitButton.disabled = false;
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminAuth, { once: true });
else initAdminAuth();

async function initAdminDashboard() {
    if (isAdminDashboardInitialized) return;
    isAdminDashboardInitialized = true;

    initTabNavigation();
    initAdminMobileMenu();
    initAdminUserManagement();
    initDateDisplay();
    await initBarberFilterOptions();
    await loadAppointmentsTab();
    await loadCashModule();
    await loadInventoryTab();
    await loadCRMTab();
    await loadConfigTab();
    setupAdminModalListeners();
    setupManualCustomerModal();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function initTabNavigation() {
    const tabButtons = document.querySelectorAll(
        '.sidebar-nav .nav-item[data-tab], .admin-mobile-menu-item[data-tab]'
    );
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            tabButtons.forEach(button => {
                button.classList.toggle('active', button.dataset.tab === tabId);
            });
            tabPanes.forEach(p => p.classList.remove('active'));

            const targetPane = document.getElementById(tabId);
            if (targetPane) targetPane.classList.add('active');

            if (tabId === 'appointments-tab') loadAppointmentsTab();
            if (tabId === 'cash-tab') loadCashModule();
            if (tabId === 'inventory-tab') loadInventoryTab();
            if (tabId === 'crm-tab') loadCRMTab();
            if (tabId === 'config-tab') loadConfigTab();
        });
    });
}

function closeAdminMobileMenu() {
    const menu = document.getElementById('admin-mobile-menu');
    const toggle = document.getElementById('admin-mobile-menu-toggle');

    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('admin-menu-open');
}

function initAdminMobileMenu() {
    const menu = document.getElementById('admin-mobile-menu');
    const toggle = document.getElementById('admin-mobile-menu-toggle');
    const closeButton = document.getElementById('admin-mobile-menu-close');

    if (!menu || !toggle || !closeButton) return;

    const openMenu = () => {
        menu.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('admin-menu-open');
        requestAnimationFrame(() => {
            const activeItem = menu.querySelector('.admin-mobile-menu-item.active');
            (activeItem || closeButton).focus();
        });
    };

    const closeMenuAndRestoreFocus = () => {
        closeAdminMobileMenu();
        toggle.focus();
    };

    toggle.addEventListener('click', () => {
        if (menu.hidden) openMenu();
        else closeMenuAndRestoreFocus();
    });

    closeButton.addEventListener('click', closeMenuAndRestoreFocus);

    menu.querySelectorAll('[data-tab], [data-admin-logout]').forEach(item => {
        item.addEventListener('click', closeAdminMobileMenu);
    });

    document.addEventListener('keydown', event => {
        if (menu.hidden) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenuAndRestoreFocus();
            return;
        }

        if (event.key !== 'Tab') return;
        const focusableItems = [...menu.querySelectorAll('button:not([disabled])')];
        const firstItem = focusableItems[0];
        const lastItem = focusableItems[focusableItems.length - 1];

        if (event.shiftKey && document.activeElement === firstItem) {
            event.preventDefault();
            lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
            event.preventDefault();
            firstItem.focus();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && !menu.hidden) closeAdminMobileMenu();
    });
}

function initAdminUserManagement() {
    const form = document.getElementById('admin-user-form');
    const tableBody = document.getElementById('admin-users-tbody');
    if (!form || !tableBody) return;
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!isCurrentAdminMaster()) {
            showToast('Solo el usuario maestro puede administrar accesos.', 'error');
            return;
        }
        if (!form.reportValidity()) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await window.BarberAuth.createUser(
                normalizeAdminEmail(document.getElementById('new-admin-email').value),
                document.getElementById('new-admin-password').value
            );
            form.reset();
            await renderAdminUsers();
            showToast('Administrador agregado correctamente.', 'success');
        } catch (error) {
            showToast(error.code === 'functions/already-exists' ? 'Ya existe un administrador con ese email.' : 'No se pudo guardar el administrador.', 'error');
        } finally { button.disabled = !isCurrentAdminMaster(); }
    });
    tableBody.addEventListener('click', async event => {
        const button = event.target.closest('.btn-change-admin-password, .btn-delete-admin-user');
        if (!button || !tableBody.contains(button) || !isCurrentAdminMaster()) return;
        const row = button.closest('tr');
        const uid = row.dataset.uid;
        const passwordInput = row.querySelector('.admin-user-password-input');
        const changing = button.classList.contains('btn-change-admin-password');
        if (changing && passwordInput.value.length < 6) {
            showToast('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
            passwordInput.focus();
            return;
        }
        if (!changing && !window.confirm('¿Eliminar el acceso de ' + row.dataset.email + '?')) return;
        button.disabled = true;
        try {
            if (changing) await window.BarberAuth.changePassword(uid, passwordInput.value);
            else await window.BarberAuth.deleteUser(uid);
            await renderAdminUsers();
            showToast(changing ? 'Contraseña actualizada correctamente.' : 'Administrador eliminado correctamente.', 'success');
        } catch (error) {
            showToast(changing ? 'No se pudo actualizar la contraseña.' : 'No se pudo eliminar el administrador.', 'error');
        } finally { button.disabled = false; }
    });
}

async function renderAdminUsers() {
    const tableBody = document.getElementById('admin-users-tbody');
    const form = document.getElementById('admin-user-form');
    const permissionNote = document.getElementById('admin-users-permission-note');
    if (!tableBody || !form) return;

    let users;
    try { users = await getAdminUsers(); }
    catch (error) {
        showToast('No se pudieron cargar los administradores.', 'error');
        return;
    }
    const canManageUsers = isCurrentAdminMaster();

    form.querySelectorAll('input, button').forEach(control => {
        control.disabled = !canManageUsers;
    });

    if (permissionNote) {
        permissionNote.textContent = canManageUsers
            ? 'Sesión maestra: gestión habilitada'
            : 'Solo lectura: requiere la cuenta maestra';
        permissionNote.classList.toggle('is-readonly', !canManageUsers);
    }

    tableBody.replaceChildren();

    users.forEach(user => {
        const row = document.createElement('tr');
        row.dataset.email = user.email;
        row.dataset.uid = user.id;

        const emailCell = document.createElement('td');
        const emailText = document.createElement('strong');
        emailText.textContent = user.email;
        emailCell.appendChild(emailText);

        const roleCell = document.createElement('td');
        const roleBadge = document.createElement('span');
        roleBadge.className = user.role === 'master' ? 'badge-gold' : 'badge-status completed';
        roleBadge.textContent = user.role === 'master' ? 'Maestro' : 'Administrador';
        roleCell.appendChild(roleBadge);

        const passwordCell = document.createElement('td');
        const actionsCell = document.createElement('td');

        if (canManageUsers) {
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.className = 'form-control form-control-sm admin-user-password-input';
            passwordInput.placeholder = 'Nueva clave';
            passwordInput.minLength = 6;
            passwordInput.autocomplete = 'new-password';
            passwordInput.setAttribute('aria-label', `Nueva contraseña para ${user.email}`);
            passwordCell.appendChild(passwordInput);

            const changeButton = document.createElement('button');
            changeButton.type = 'button';
            changeButton.className = 'btn btn-outline-sm btn-change-admin-password';
            changeButton.innerHTML = '<i class="fa-solid fa-key"></i> Cambiar';
            actionsCell.appendChild(changeButton);

            if (user.role !== 'master') {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn btn-danger-sm btn-delete-admin-user';
                deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i> Eliminar';
                actionsCell.appendChild(deleteButton);
            }
        } else {
            passwordCell.textContent = '••••••••';
            actionsCell.textContent = 'Solo usuario maestro';
        }

        row.append(emailCell, roleCell, passwordCell, actionsCell);
        tableBody.appendChild(row);
    });
}

function initDateDisplay() {
    const display = document.getElementById('current-date-display');
    if (display) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        display.textContent = new Date().toLocaleDateString('es-ES', options);
    }

    const dateFilter = document.getElementById('admin-date-filter');
    if (dateFilter) {
        const todayStr = window.BarberDB ? window.BarberDB.getLocalDateStr() : new Date().toISOString().split('T')[0];
        dateFilter.value = todayStr;
        dateFilter.addEventListener('change', () => loadAppointmentsTab());
    }

    const clearDateBtn = document.getElementById('btn-clear-date-filter');
    if (clearDateBtn) {
        clearDateBtn.addEventListener('click', () => {
            dateFilter.value = '';
            loadAppointmentsTab();
        });
    }

    const barberFilter = document.getElementById('admin-barber-filter');
    if (barberFilter) {
        barberFilter.addEventListener('change', () => loadAppointmentsTab());
    }
}

async function initBarberFilterOptions() {
    try {
        const barbers = await window.BarberDB.getBarbers();
        const selectFilter = document.getElementById('admin-barber-filter');
        const modalSelect = document.getElementById('admin-new-barber');
        const services = await window.BarberDB.getServices();
        const modalServiceSelect = document.getElementById('admin-new-service');

        if (selectFilter) {
            selectFilter.innerHTML = '<option value="all">Todos los Barberos</option>' +
                barbers.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }

        if (modalSelect) {
            modalSelect.innerHTML = barbers.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }

        if (modalServiceSelect) {
            modalServiceSelect.innerHTML = services.map(s => `<option value="${s.id}" data-name="${s.name}" data-price="${s.price}">${s.name} ($${s.price})</option>`).join('');
        }
    } catch (err) {
        console.error('Error inicializando selectores:', err);
    }
}

/* ==========================================================================
   MÓDULO 1: GESTIÓN DE TURNOS
   ========================================================================== */
async function loadAppointmentsTab() {
    const dateVal = document.getElementById('admin-date-filter').value;
    const barberVal = document.getElementById('admin-barber-filter').value;
    const tbody = document.getElementById('appointments-tbody');

    try {
        const barbers = await window.BarberDB.getBarbers();
        const barberMap = Object.fromEntries(barbers.map(b => [b.id, b.name]));

        const appointments = await window.BarberDB.getAppointments(dateVal, barberVal);

        document.getElementById('stat-total-today').textContent = appointments.length;
        document.getElementById('stat-pending-today').textContent = appointments.filter(a => a.status === 'pending').length;
        document.getElementById('stat-completed-today').textContent = appointments.filter(a => a.status === 'completed').length;
        document.getElementById('stat-cancelled-today').textContent = appointments.filter(a => a.status === 'cancelled').length;

        if (appointments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center">No hay turnos registrados para el filtro seleccionado.</td></tr>`;
            return;
        }

        tbody.innerHTML = appointments.map(a => `
            <tr>
                <td><strong>${a.date}</strong></td>
                <td>${a.time} hs</td>
                <td>${a.customerName}</td>
                <td><a href="tel:${a.customerPhone}" style="color: var(--accent-gold);">${a.customerPhone}</a></td>
                <td>${a.serviceName}</td>
                <td>${barberMap[a.barberId] || a.barberId}</td>
                <td><strong>$${a.price.toLocaleString()}</strong></td>
                <td><span class="badge-status ${a.status}">${a.status === 'pending' ? 'Pendiente' : (a.status === 'completed' ? 'Realizado/Cobrado' : 'Cancelado')}</span></td>
                <td>
                    ${a.status === 'pending' ? `
                        <button class="btn btn-outline-sm btn-action-cobrar" data-id="${a.id}" title="Cobrar Turno">
                            <i class="fa-solid fa-cash-register gold-text"></i> Cobrar
                        </button>
                        <button class="btn btn-outline-sm btn-action-cancel" data-id="${a.id}" title="Cancelar Turno" style="color: #ef4444;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    ` : `
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${a.paymentMethod ? 'Pago: ' + a.paymentMethod : '-'}</span>
                    `}
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.btn-action-cobrar').forEach(btn => {
            btn.addEventListener('click', () => {
                const aptId = btn.dataset.id;
                document.querySelector('.sidebar-nav [data-tab="cash-tab"]').click();
                setTimeout(() => {
                    const cashSelect = document.getElementById('cash-appointment-select');
                    if (cashSelect) {
                        cashSelect.value = aptId;
                        cashSelect.dispatchEvent(new Event('change'));
                    }
                }, 100);
            });
        });

        tbody.querySelectorAll('.btn-action-cancel').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('¿Estás seguro de cancelar este turno?')) {
                    await window.BarberDB.updateAppointmentStatus(btn.dataset.id, 'cancelled');
                    showToast('Turno cancelado correctamente.', 'info');
                    loadAppointmentsTab();
                }
            });
        });

    } catch (err) {
        console.error('Error cargando turnos:', err);
    }
}

/* ==========================================================================
   MÓDULO 2: CAJA (POS)
   ========================================================================== */
function escapeCashHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[character]);
}

function formatCashCurrency(value) {
    const amount = Number(value) || 0;
    return `$${amount.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

function normalizeCashPaymentMethod(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return normalizedValue.includes('efect') || normalizedValue === 'cash'
        ? 'Efectivo'
        : 'Transferencia/MP';
}

async function getCashSalesByDate(date) {
    return window.BarberDB.getSalesByDate(date);
}
async function updateCashSaleRecord(saleId, updates) {
    return window.BarberDB.updateSale(saleId, updates);
}

function getCashSaleServiceName(sale) {
    const serviceItem = Array.isArray(sale.items)
        ? sale.items.find(item => item.type === 'service') || sale.items[0]
        : null;
    return String(sale.serviceName || serviceItem?.name || 'Servicio')
        .replace(/^Servicio:\s*/i, '');
}

function getCashSaleServiceId(sale) {
    const serviceItem = Array.isArray(sale.items)
        ? sale.items.find(item => item.type === 'service') || sale.items[0]
        : null;
    return sale.serviceId || serviceItem?.serviceId || serviceItem?.id || '';
}

function getCashSaleDetailLabel(sale) {
    if (!Array.isArray(sale.items) || sale.items.length === 0) {
        return getCashSaleServiceName(sale);
    }

    return sale.items
        .map(item => String(item.name || '').replace(/^(Servicio|Producto):\s*/i, ''))
        .filter(Boolean)
        .join(' + ');
}

function populateCashServiceSelect(select, services, placeholder = '-- Seleccionar Servicio --') {
    if (!select) return;
    select.replaceChildren(new Option(placeholder, ''));
    services.forEach(service => {
        const option = new Option(`${service.name} — ${formatCashCurrency(service.price)}`, service.id);
        option.dataset.name = service.name;
        option.dataset.price = Number(service.price) || 0;
        select.appendChild(option);
    });
}

function normalizeCustomerPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

async function createManualCustomerRecord(data) {
    return window.BarberDB.createCustomer(data);
}

function closeCashCustomerDropdown() {
    const input = document.getElementById('buscar-cliente-input');
    const dropdown = document.getElementById('clientes-dropdown');
    if (!input || !dropdown) return;
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
}

function validateCashCustomerSelection() {
    const input = document.getElementById('buscar-cliente-input');
    if (!input) return;
    const customer = cashAvailableCustomers.find(item => item.id === cashSelectedCustomerId);
    const selected = customer && input.value === customer.name;
    input.setCustomValidity(!input.disabled && !selected
        ? 'Seleccioná un cliente de la lista o creá uno con + Nuevo Cliente.'
        : '');
}

function selectCashCustomer(customer) {
    const input = document.getElementById('buscar-cliente-input');
    cashSelectedCustomerId = customer.id;
    input.value = customer.name;
    validateCashCustomerSelection();
    closeCashCustomerDropdown();
}

function renderCashCustomerDropdown() {
    const input = document.getElementById('buscar-cliente-input');
    const dropdown = document.getElementById('clientes-dropdown');
    if (!input || !dropdown || input.disabled) return;
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const query = cashSelectedCustomerId === null ? normalize(input.value) : '';
    const phoneQuery = normalizeCustomerPhone(query);
    const customers = cashAvailableCustomers.filter(customer => (
        normalize(customer.name).includes(query) || normalize(customer.phone).includes(query) ||
        (phoneQuery && normalizeCustomerPhone(customer.phone).includes(phoneQuery))
    ));

    dropdown.innerHTML = customers.map((customer, index) => `
        <li id="cash-customer-option-${index}" class="cash-customer-option" role="option"
            aria-selected="${customer.id === cashSelectedCustomerId}" data-customer-id="${escapeCashHTML(customer.id)}">
            <span class="cash-customer-option-name">${escapeCashHTML(customer.name)}</span>
            <span class="cash-customer-option-phone">${escapeCashHTML(customer.phone)}</span>
        </li>
    `).join('') + (!customers.length ? '<li class="cash-customer-empty" role="presentation">No se encontraron clientes.</li>' : '') + `
        <li id="cash-customer-option-new" class="cash-customer-option cash-customer-option-new" role="option"
            aria-selected="false" data-new-customer="true">+ Nuevo Cliente</li>
    `;
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
}

function setupCashCustomerAutocomplete() {
    const input = document.getElementById('buscar-cliente-input');
    const dropdown = document.getElementById('clientes-dropdown');
    const container = input?.closest('.cash-customer-autocomplete');
    if (!input || !dropdown || !container || input.dataset.initialized) return;
    input.dataset.initialized = 'true';

    const chooseOption = option => {
        if (option.dataset.newCustomer) {
            const prefill = cashSelectedCustomerId === null ? input.value.trim() : '';
            closeCashCustomerDropdown();
            openManualCustomerModal({ fromCash: true, prefill });
        } else {
            const customer = cashAvailableCustomers.find(item => String(item.id) === option.dataset.customerId);
            if (customer) selectCashCustomer(customer);
        }
    };

    input.addEventListener('focus', renderCashCustomerDropdown);
    input.addEventListener('click', renderCashCustomerDropdown);
    input.addEventListener('input', () => {
        cashSelectedCustomerId = null;
        validateCashCustomerSelection();
        renderCashCustomerDropdown();
    });
    // Keep focus on the combobox while mouse users choose an option.
    dropdown.addEventListener('mousedown', event => event.preventDefault());
    dropdown.addEventListener('click', event => {
        const option = event.target.closest('[role="option"]');
        if (option && dropdown.contains(option)) chooseOption(option);
    });
    input.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape' && !dropdown.hidden) event.preventDefault();
            closeCashCustomerDropdown();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (dropdown.hidden) renderCashCustomerDropdown();
            const options = [...dropdown.querySelectorAll('[role="option"]')];
            const currentIndex = options.findIndex(option => option.id === input.getAttribute('aria-activedescendant'));
            const nextIndex = event.key === 'ArrowDown'
                ? (currentIndex + 1) % options.length
                : (currentIndex <= 0 ? options.length - 1 : currentIndex - 1);
            options.forEach((option, index) => option.classList.toggle('is-active', index === nextIndex));
            input.setAttribute('aria-activedescendant', options[nextIndex].id);
            options[nextIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && !dropdown.hidden) {
            event.preventDefault();
            const activeId = input.getAttribute('aria-activedescendant');
            const option = [...dropdown.querySelectorAll('[role="option"]')].find(item => item.id === activeId);
            if (option) chooseOption(option);
        }
    });
    document.addEventListener('pointerdown', event => {
        if (!container.contains(event.target)) closeCashCustomerDropdown();
    });
    container.addEventListener('focusout', event => {
        if (!container.contains(event.relatedTarget)) closeCashCustomerDropdown();
    });
}

function populateCashProductSelect(select, products) {
    if (!select) return;
    select.replaceChildren(new Option('-- Sin producto adicional --', ''));
    products.forEach(product => {
        const option = new Option(product.name, product.id);
        option.dataset.name = product.name;
        select.appendChild(option);
    });
}

async function loadCashModule() {
    try {
        const today = window.BarberDB ? window.BarberDB.getLocalDateStr() : new Date().toISOString().split('T')[0];
        const [appointmentsToday, services, products, customers] = await Promise.all([
            window.BarberDB.getAppointments(today),
            window.BarberDB.getServices(),
            window.BarberDB.getProducts(),
            window.BarberDB.getCustomers()
        ]);
        const pendingAppointments = appointmentsToday.filter(a => a.status === 'pending');
        const aptSelect = document.getElementById('cash-appointment-select');
        const serviceSelect = document.getElementById('cash-service-select');
        const productSelect = document.getElementById('cash-product-select');
        const reportDateInput = document.getElementById('sales-date-filter');

        cashAvailableServices = services;
        cashAvailableProducts = products;
        cashAvailableCustomers = customers;

        aptSelect.replaceChildren(new Option('-- Seleccionar turno pendiente --', ''));
        pendingAppointments.forEach(appointment => {
            const linkedCustomer = customers.find(customer => (
                customer.id === appointment.customerId ||
                (appointment.customerPhone && normalizeCustomerPhone(customer.phone) === normalizeCustomerPhone(appointment.customerPhone))
            ));
            const option = new Option(
                `${appointment.time} hs — ${appointment.customerName} (${appointment.serviceName})`,
                appointment.id
            );
            option.dataset.customerName = appointment.customerName || 'Cliente';
            option.dataset.customerPhone = appointment.customerPhone || linkedCustomer?.phone || '';
            option.dataset.customerId = appointment.customerId || linkedCustomer?.id || '';
            option.dataset.serviceId = appointment.serviceId || '';
            option.dataset.serviceName = appointment.serviceName || '';
            option.dataset.price = Number(appointment.price) || 0;
            aptSelect.appendChild(option);
        });

        populateCashServiceSelect(serviceSelect, cashAvailableServices);
        populateCashProductSelect(productSelect, cashAvailableProducts);
        const selectedCustomer = customers.find(customer => customer.id === cashSelectedCustomerId);
        if (selectedCustomer) selectCashCustomer(selectedCustomer);
        else cashSelectedCustomerId = null;
        closeCashCustomerDropdown();

        if (!reportDateInput.value) reportDateInput.value = today;
        setupCashFormListeners();
        setupSaleEditModal();
        reportDateInput.onchange = () => renderDailySalesReport(reportDateInput.value);
        await renderDailySalesReport(reportDateInput.value);
    } catch (err) {
        console.error('Error cargando caja:', err);
        showToast('No se pudo cargar el módulo de caja.', 'error');
    }
}

function renderCashLiveSummary() {
    const summary = document.getElementById('cash-live-summary');
    const serviceSelect = document.getElementById('cash-service-select');
    const servicePriceInput = document.getElementById('cash-service-price');
    const productSelect = document.getElementById('cash-product-select');
    const productPriceInput = document.getElementById('cash-product-price');
    if (!summary || !serviceSelect || !servicePriceInput || !productSelect || !productPriceInput) return;

    const selectedService = serviceSelect.options[serviceSelect.selectedIndex];
    const selectedProduct = productSelect.options[productSelect.selectedIndex];
    const hasServicePrice = String(servicePriceInput.value).trim() !== '';
    const hasService = Boolean(serviceSelect.value && selectedService && hasServicePrice);
    const hasProduct = Boolean(productSelect.value && selectedProduct);
    const servicePrice = hasService ? Number(servicePriceInput.value) || 0 : 0;
    const productPrice = hasProduct ? Number(productPriceInput.value) || 0 : 0;
    const ticketItems = [];

    if (hasService) {
        ticketItems.push({
            type: 'service',
            typeLabel: 'Servicio',
            name: selectedService.dataset.name || selectedService.textContent.trim(),
            price: servicePrice
        });
    }

    if (hasProduct) {
        ticketItems.push({
            type: 'product',
            typeLabel: 'Producto',
            name: selectedProduct.dataset.name || selectedProduct.textContent.trim(),
            price: productPrice
        });
    }

    const itemsMarkup = ticketItems.length
        ? ticketItems.map(item => `
            <div class="cash-ticket-item" role="listitem">
                <div class="cash-ticket-item-info">
                    <span class="cash-ticket-item-type">${item.typeLabel}</span>
                    <span class="cash-ticket-item-name">${escapeCashHTML(item.name)}</span>
                </div>
                <div class="cash-ticket-item-actions">
                    <strong class="cash-ticket-item-price">${formatCashCurrency(item.price)}</strong>
                    <button
                        type="button"
                        class="cash-ticket-remove"
                        data-ticket-remove="${item.type}"
                        aria-label="Quitar ${escapeCashHTML(item.name)} del resumen"
                        title="Quitar ítem"
                    >
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `).join('')
        : `
            <div class="cash-ticket-empty">
                <i class="fa-solid fa-basket-shopping" aria-hidden="true"></i>
                <span>Seleccioná un servicio para comenzar el cobro.</span>
            </div>
        `;

    summary.innerHTML = `
        <div class="cash-ticket-items" role="list">${itemsMarkup}</div>
        <div class="cash-ticket-total-row">
            <span>Total a cobrar</span>
            <strong>${formatCashCurrency(servicePrice + productPrice)}</strong>
        </div>
    `;
}

function resetCashTicketItem(itemType) {
    const servicePriceInput = document.getElementById('cash-service-price');
    const productSelect = document.getElementById('cash-product-select');
    const productPriceInput = document.getElementById('cash-product-price');
    const productPriceGroup = document.getElementById('cash-product-price-group');

    if (itemType === 'service' && servicePriceInput) {
        servicePriceInput.value = '';
        renderCashLiveSummary();
        servicePriceInput.focus();
        return;
    }

    if (itemType === 'product' && productSelect && productPriceInput && productPriceGroup) {
        productSelect.value = '';
        productPriceInput.value = '';
        productPriceInput.disabled = true;
        productPriceInput.required = false;
        productPriceGroup.hidden = true;
        renderCashLiveSummary();
        productSelect.focus();
    }
}

function setupCashFormListeners() {
    const aptSelect = document.getElementById('cash-appointment-select');
    const serviceSelect = document.getElementById('cash-service-select');
    const servicePriceInput = document.getElementById('cash-service-price');
    const productSelect = document.getElementById('cash-product-select');
    const productPriceInput = document.getElementById('cash-product-price');
    const productPriceGroup = document.getElementById('cash-product-price-group');
    const customerInput = document.getElementById('buscar-cliente-input');
    const appointmentPanel = document.getElementById('cash-appointment-panel');
    const walkinPanel = document.getElementById('cash-walkin-panel');
    const originInputs = document.querySelectorAll('input[name="cash-sale-origin"]');
    const cashForm = document.getElementById('cash-form');
    const liveSummary = document.getElementById('cash-live-summary');

    const getSaleOrigin = () => (
        document.querySelector('input[name="cash-sale-origin"]:checked')?.value || 'appointment'
    );

    const syncSaleOrigin = () => {
        const isAppointment = getSaleOrigin() === 'appointment';
        appointmentPanel.hidden = !isAppointment;
        walkinPanel.hidden = isAppointment;
        aptSelect.required = isAppointment;
        aptSelect.disabled = !isAppointment;
        customerInput.required = !isAppointment;
        customerInput.disabled = isAppointment;
        validateCashCustomerSelection();
        closeCashCustomerDropdown();
    };

    originInputs.forEach(input => {
        input.onchange = syncSaleOrigin;
    });

    setupCashCustomerAutocomplete();

    serviceSelect.onchange = () => {
        const selectedService = serviceSelect.options[serviceSelect.selectedIndex];
        servicePriceInput.value = selectedService?.value ? selectedService.dataset.price : '';
        renderCashLiveSummary();
    };

    productSelect.onchange = () => {
        const hasProduct = Boolean(productSelect.value);
        productPriceGroup.hidden = !hasProduct;
        productPriceInput.disabled = !hasProduct;
        productPriceInput.required = hasProduct;
        if (!hasProduct) productPriceInput.value = '';
        renderCashLiveSummary();
    };

    servicePriceInput.oninput = renderCashLiveSummary;
    productPriceInput.oninput = renderCashLiveSummary;
    liveSummary.onclick = event => {
        const removeButton = event.target.closest('[data-ticket-remove]');
        if (!removeButton) return;
        resetCashTicketItem(removeButton.dataset.ticketRemove);
    };

    aptSelect.onchange = () => {
        const selectedAppointment = aptSelect.options[aptSelect.selectedIndex];
        if (!selectedAppointment?.value) {
            serviceSelect.value = '';
            servicePriceInput.value = '';
            renderCashLiveSummary();
            return;
        }

        let matchingService = [...serviceSelect.options].find(option => (
            option.value && option.value === selectedAppointment.dataset.serviceId
        ));

        if (!matchingService) {
            const reservedServiceName = selectedAppointment.dataset.serviceName.trim().toLowerCase();
            matchingService = [...serviceSelect.options].find(option => (
                option.dataset.name?.trim().toLowerCase() === reservedServiceName
            ));
        }

        if (matchingService) {
            serviceSelect.value = matchingService.value;
            serviceSelect.dispatchEvent(new Event('change'));
        } else {
            serviceSelect.value = '';
            servicePriceInput.value = selectedAppointment.dataset.price || '';
            renderCashLiveSummary();
        }
    };

    syncSaleOrigin();
    productSelect.dispatchEvent(new Event('change'));
    renderCashLiveSummary();

    cashForm.onsubmit = async (e) => {
        e.preventDefault();
        validateCashCustomerSelection();
        if (!cashForm.checkValidity()) {
            cashForm.reportValidity();
            return;
        }

        const selectedAppointment = aptSelect.options[aptSelect.selectedIndex];
        const selectedService = serviceSelect.options[serviceSelect.selectedIndex];
        const selectedProduct = productSelect.options[productSelect.selectedIndex];
        const servicePrice = Number(servicePriceInput.value);
        const productPrice = selectedProduct?.value ? Number(productPriceInput.value) : 0;
        const totalAmount = servicePrice + productPrice;
        const paymentMethod = document.getElementById('cash-payment-method').value;
        const submitButton = cashForm.querySelector('button[type="submit"]');

        if (!Number.isFinite(servicePrice) || servicePrice < 0) {
            showToast('Ingresá un precio válido para el servicio.', 'error');
            servicePriceInput.focus();
            return;
        }

        if (selectedProduct?.value && (!Number.isFinite(productPrice) || productPrice < 0)) {
            showToast('Ingresá un precio válido para el producto.', 'error');
            productPriceInput.focus();
            return;
        }

        try {
            submitButton.disabled = true;

            let customer;
            let appointmentId = null;
            const saleOrigin = getSaleOrigin();

            if (saleOrigin === 'appointment') {
                appointmentId = selectedAppointment.value;
                customer = {
                    id: selectedAppointment.dataset.customerId || null,
                    name: selectedAppointment.dataset.customerName || 'Cliente',
                    phone: selectedAppointment.dataset.customerPhone || ''
                };
            } else {
                customer = cashAvailableCustomers.find(item => item.id === cashSelectedCustomerId);
            }

            if (!customer) throw new Error('Cliente no encontrado');



            const saleItems = [{
                type: 'service',
                id: selectedService.value,
                serviceId: selectedService.value,
                name: selectedService.dataset.name,
                price: servicePrice,
                qty: 1
            }];

            if (selectedProduct?.value) {
                saleItems.push({
                    type: 'product',
                    id: selectedProduct.value,
                    productId: selectedProduct.value,
                    name: selectedProduct.dataset.name,
                    price: productPrice,
                    qty: 1
                });
            }

            await window.BarberDB.processSale({
                appointmentId,
                customerId: customer.id || null,
                customerName: customer.name,
                customerPhone: customer.phone || '',
                saleOrigin,
                type: selectedProduct?.value ? 'mixed' : 'service',
                serviceId: selectedService.value,
                serviceName: selectedService.dataset.name,
                productId: selectedProduct?.value || null,
                items: saleItems,
                total: totalAmount,
                paymentMethod: paymentMethod
            });

            showToast(`Cobro registrado con éxito. Total: ${formatCashCurrency(totalAmount)}`, 'success');
            cashForm.reset();
            cashSelectedCustomerId = null;
            await loadCashModule();
        } catch (err) {
            console.error('Error procesando cobro:', err);
            showToast(
                err.code === 'DUPLICATE_CUSTOMER'
                    ? 'Ya existe un cliente con ese teléfono. Seleccionalo desde el listado.'
                    : 'Error al registrar la venta.',
                'error'
            );
        } finally {
            submitButton.disabled = false;
        }
    };
}

async function renderDailySalesReport(date) {
    try {
        const sales = (await getCashSalesByDate(date))
            .sort((saleA, saleB) => new Date(saleB.timestamp) - new Date(saleA.timestamp));
        const tbody = document.getElementById('sales-tbody');
        const totalDisplay = document.getElementById('cash-summary-total');
        const cashDisplay = document.getElementById('cash-summary-cash');
        const transferDisplay = document.getElementById('cash-summary-transfer');

        const totalRevenue = sales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
        const cashRevenue = sales
            .filter(sale => normalizeCashPaymentMethod(sale.paymentMethod) === 'Efectivo')
            .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
        const transferRevenue = sales
            .filter(sale => normalizeCashPaymentMethod(sale.paymentMethod) === 'Transferencia/MP')
            .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);

        totalDisplay.textContent = formatCashCurrency(totalRevenue);
        cashDisplay.textContent = formatCashCurrency(cashRevenue);
        transferDisplay.textContent = formatCashCurrency(transferRevenue);

        if (sales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">No hay cobros registrados para esta fecha.</td></tr>`;
            return;
        }

        tbody.innerHTML = sales.map(s => {
            const timeStr = new Date(s.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const serviceName = getCashSaleDetailLabel(s);
            const paymentMethod = normalizeCashPaymentMethod(s.paymentMethod);
            return `
                <tr>
                    <td>${timeStr} hs</td>
                    <td>${escapeCashHTML(s.customerName || 'Venta mostrador')}</td>
                    <td><span class="badge-gold cash-service-badge">${escapeCashHTML(serviceName)}</span></td>
                    <td>${escapeCashHTML(paymentMethod)}</td>
                    <td><strong>${formatCashCurrency(s.total)}</strong></td>
                    <td>
                        <button type="button" class="btn btn-outline-sm btn-edit-sale" data-sale-id="${escapeCashHTML(s.id)}">
                            <i class="fa-solid fa-pen"></i> Editar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-edit-sale').forEach(button => {
            button.onclick = () => openSaleEditModal(button.dataset.saleId);
        });

    } catch (err) {
        console.error('Error cargando reporte diario:', err);
        showToast('No se pudo cargar el reporte diario.', 'error');
    }
}

function setupSaleEditModal() {
    const modal = document.getElementById('modal-sale-edit');
    const form = document.getElementById('sale-edit-form');
    const serviceSelect = document.getElementById('edit-sale-service');
    const totalInput = document.getElementById('edit-sale-total');
    const closeButton = modal?.querySelector('.sale-edit-modal-close');
    const cancelButton = modal?.querySelector('.sale-edit-modal-cancel');
    if (!modal || !form || !serviceSelect || !totalInput) return;

    populateCashServiceSelect(serviceSelect, cashAvailableServices);

    const closeModal = () => modal.classList.remove('active');
    if (closeButton) closeButton.onclick = closeModal;
    if (cancelButton) cancelButton.onclick = closeModal;
    modal.onclick = event => {
        if (event.target === modal) closeModal();
    };

    serviceSelect.onchange = () => {
        const selectedService = serviceSelect.options[serviceSelect.selectedIndex];
        const productTotal = Number(form.dataset.productTotal) || 0;
        if (selectedService?.value) {
            totalInput.value = (Number(selectedService.dataset.price) || 0) + productTotal;
        }
    };

    form.onsubmit = async event => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const saleId = document.getElementById('edit-sale-id').value;
        const selectedService = serviceSelect.options[serviceSelect.selectedIndex];
        const total = Number(totalInput.value);
        const paymentMethod = document.getElementById('edit-sale-payment-method').value;


        if (!Number.isFinite(total) || total < 0) {
            showToast('Ingresá un monto válido.', 'error');
            totalInput.focus();
            return;
        }

        try {
            const originalSale = await window.BarberDB.getSale(saleId);
            if (!originalSale) throw new Error('Cobro no encontrado');
            const preservedProducts = Array.isArray(originalSale?.items)
                ? originalSale.items.filter(item => item.type === 'product')
                : [];
            const productTotal = preservedProducts.reduce((sum, item) => (
                sum + ((Number(item.price) || 0) * (Number(item.qty) || 1))
            ), 0);
            if (total < productTotal) {
                showToast('El total no puede ser menor que el precio de los productos incluidos.', 'error');
                return;
            }
            const servicePrice = Math.round((total - productTotal) * 100) / 100;

            await updateCashSaleRecord(saleId, {
                serviceId: selectedService.value,
                serviceName: selectedService.dataset.name,
                items: [{
                    type: 'service',
                    id: selectedService.value,
                    serviceId: selectedService.value,
                    name: selectedService.dataset.name,
                    price: servicePrice,
                    qty: 1
                }, ...preservedProducts],
                type: preservedProducts.length ? 'mixed' : 'service',
                total,
                paymentMethod
            });



            closeModal();
            showToast('Cobro actualizado correctamente.', 'success');
            await renderDailySalesReport(document.getElementById('sales-date-filter').value);
        } catch (error) {
            console.error('Error actualizando cobro:', error);
            showToast('No se pudo actualizar el cobro.', 'error');
        }
    };
}

async function openSaleEditModal(saleId) {
    let sale;
    try { sale = await window.BarberDB.getSale(saleId); }
    catch (error) {
        showToast('No se pudo cargar el cobro.', 'error');
        return;
    }
    const modal = document.getElementById('modal-sale-edit');
    const serviceSelect = document.getElementById('edit-sale-service');
    if (!sale || !modal || !serviceSelect) {
        showToast('No se encontró el cobro seleccionado.', 'error');
        return;
    }

    populateCashServiceSelect(serviceSelect, cashAvailableServices);
    const serviceId = getCashSaleServiceId(sale);
    const serviceName = getCashSaleServiceName(sale).trim().toLowerCase();
    const matchingService = [...serviceSelect.options].find(option => (
        option.value && (option.value === serviceId || option.dataset.name?.trim().toLowerCase() === serviceName)
    ));

    document.getElementById('edit-sale-id').value = sale.id;
    const productTotal = Array.isArray(sale.items)
        ? sale.items
            .filter(item => item.type === 'product')
            .reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 1)), 0)
        : 0;
    document.getElementById('sale-edit-form').dataset.productTotal = productTotal;
    serviceSelect.value = matchingService?.value || '';
    document.getElementById('edit-sale-total').value = Number(sale.total) || 0;
    document.getElementById('edit-sale-payment-method').value = normalizeCashPaymentMethod(sale.paymentMethod);
    document.getElementById('edit-sale-context').textContent = `${sale.customerName || 'Venta mostrador'} · ${new Date(sale.timestamp).toLocaleString('es-AR')}`;

    modal.classList.add('active');
    requestAnimationFrame(() => serviceSelect.focus());
}

/* ==========================================================================
   MÓDULO 3: INVENTARIO (PRODUCTOS BASE64)
   ========================================================================== */
async function loadInventoryTab() {
    const tbody = document.getElementById('inventory-tbody');

    try {
        const products = await window.BarberDB.getProducts();

        if (products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">No hay productos en el inventario.</td></tr>`;
            return;
        }

        tbody.innerHTML = products.map(p => `
            <tr>
                <td><img src="${p.imageUrl}" alt="${p.name}" style="width: 50px; height: 50px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-color);"></td>
                <td><strong>${p.name}</strong></td>
                <td><span class="badge-gold" style="font-size: 0.75rem;">${p.category}</span></td>
                <td>${p.description}</td>
                <td>
                    <button class="btn btn-outline-sm btn-edit-prod" 
                        data-id="${p.id}" 
                        data-name="${p.name}" 
                        data-category="${p.category}" 
                        data-desc="${p.description || ''}"
                        data-image="${p.imageUrl || ''}"
                        title="Editar Producto" style="color: var(--accent-gold); border-color: var(--accent-gold); margin-right: 4px;">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                        <button class="btn btn-outline-sm btn-delete-prod" data-id="${p.id}" style="color: #ef4444;" title="Eliminar del Inventario">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.btn-edit-prod').forEach(btn => {
            btn.onclick = () => {
                const modalProd = document.getElementById('modal-product');
                const title = document.getElementById('modal-product-title');
                if (title) title.textContent = 'Editar Producto';

                document.getElementById('prod-id').value = btn.dataset.id;
                document.getElementById('prod-name').value = btn.dataset.name;
                document.getElementById('prod-category').value = btn.dataset.category;
                document.getElementById('prod-description').value = btn.dataset.desc;
                
                currentBase64ProductImage = btn.dataset.image;
                const previewImg = document.getElementById('prod-image-preview');
                if (currentBase64ProductImage && previewImg) {
                    previewImg.src = currentBase64ProductImage;
                    previewImg.style.display = "block";
                } else if (previewImg) {
                    previewImg.style.display = "none";
                }

                modalProd.classList.add('active');
            };
        });

        tbody.querySelectorAll('.btn-delete-prod').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('¿Eliminar este producto del inventario?')) {
                    await window.BarberDB.deleteProduct(btn.dataset.id);
                    showToast('Producto eliminado del inventario.', 'info');
                    loadInventoryTab();
                }
            };
        });

    } catch (err) {
        console.error('Error cargando inventario:', err);
    }
}

/* ==========================================================================
   MÓDULO 4: CRM
   ========================================================================== */
async function loadCRMTab(query = '') {
    const grid = document.getElementById('crm-results-grid');

    try {
        const customers = await window.BarberDB.getCustomers(query);

        if (customers.length === 0) {
            grid.innerHTML = `<div class="card" style="grid-column: 1/-1; text-align: center;"><p>No se encontraron fichas de clientes.</p></div>`;
            return;
        }

        grid.innerHTML = customers.map(c => `
            <div class="crm-card">
                <div class="crm-header">
                    <div>
                        <h3><span class="crm-customer-name-link" data-phone="${escapeCashHTML(c.phone)}" data-name="${escapeCashHTML(c.name)}" title="Ver Historial de Visitas">${escapeCashHTML(c.name)}</span></h3>
                        <span style="font-size: 0.85rem; color: var(--accent-gold);"><i class="fa-solid fa-phone"></i> ${escapeCashHTML(c.phone)}</span>
                    </div>
                    <span class="badge-gold">${c.totalVisits ?? 0} Visitas</span>
                </div>
                <div class="crm-details">
                    <p><i class="fa-regular fa-calendar"></i> Última Visita: <strong>${escapeCashHTML(c.lastVisit || 'Sin registro')}</strong></p>
                    <p><i class="fa-regular fa-note-sticky"></i> Notas / Preferencias (Editable):</p>
                     
                    <div class="crm-notes-form">
                        <textarea class="form-control crm-notes-input" data-id="${escapeCashHTML(c.id)}" rows="2">${escapeCashHTML(c.notes || '')}</textarea>
                        <button class="btn btn-outline-sm btn-save-notes" data-id="${escapeCashHTML(c.id)}" style="align-self: flex-end;">
                            <i class="fa-solid fa-floppy-disk"></i> Guardar Nota
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.crm-customer-name-link').forEach(link => {
            link.onclick = async () => {
                const phone = link.dataset.phone;
                const name = link.dataset.name;
                await openCustomerHistoryModal(phone, name);
            };
        });

        grid.querySelectorAll('.btn-save-notes').forEach(btn => {
            btn.onclick = async () => {
                const customerId = btn.dataset.id;
                const textarea = grid.querySelector(`textarea[data-id="${customerId}"]`);
                if (textarea) {
                    await window.BarberDB.updateCustomerNotes(customerId, textarea.value.trim());
                    showToast('Nota del cliente actualizada con éxito.', 'success');
                }
            };
        });

        const searchInput = document.getElementById('crm-search-input');
        if (searchInput && !searchInput.dataset.initialized) {
            searchInput.dataset.initialized = 'true';
            searchInput.addEventListener('input', (e) => {
                loadCRMTab(e.target.value.trim());
            });
        }

    } catch (err) {
        console.error('Error cargando CRM:', err);
    }
}

function openManualCustomerModal({ fromCash = false, prefill = '' } = {}) {
    const modal = document.getElementById('modal-customer-create');
    const form = document.getElementById('customer-create-form');
    form.reset();
    modal.dataset.fromCash = String(fromCash);
    document.getElementById('customer-create-name').value = prefill;
    modal.classList.add('active');
    requestAnimationFrame(() => document.getElementById('customer-create-name').focus());
}

function setupManualCustomerModal() {
    const modal = document.getElementById('modal-customer-create');
    const openButton = document.getElementById('btn-new-customer-modal');
    const closeButton = modal?.querySelector('.customer-create-modal-close');
    const cancelButton = modal?.querySelector('.customer-create-modal-cancel');
    const form = document.getElementById('customer-create-form');
    if (!modal || !openButton || !form) return;

    const closeModal = () => {
        const fromCash = modal.dataset.fromCash === 'true';
        modal.classList.remove('active');
        modal.dataset.fromCash = 'false';
        if (fromCash) {
            document.getElementById('buscar-cliente-input').focus();
            closeCashCustomerDropdown();
        } else {
            openButton.focus();
        }
    };

    openButton.onclick = () => openManualCustomerModal();
    if (closeButton) closeButton.onclick = closeModal;
    if (cancelButton) cancelButton.onclick = closeModal;
    modal.onclick = event => {
        if (event.target === modal) closeModal();
    };
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
        }
    });

    form.onsubmit = async event => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const nameInput = document.getElementById('customer-create-name');
        const phoneInput = document.getElementById('customer-create-phone');
        const notesInput = document.getElementById('customer-create-notes');
        const submitButton = form.querySelector('button[type="submit"]');

        if (normalizeCustomerPhone(phoneInput.value).length < 6) {
            showToast('Ingresá un teléfono válido.', 'error');
            phoneInput.focus();
            return;
        }

        try {
            submitButton.disabled = true;
            const customer = await createManualCustomerRecord({
                name: nameInput.value,
                phone: phoneInput.value,
                notes: notesInput.value
            });

            cashAvailableCustomers.push(customer);
            if (modal.dataset.fromCash === 'true') selectCashCustomer(customer);
            closeModal();
            const searchInput = document.getElementById('crm-search-input');
            if (searchInput) searchInput.value = '';
            await loadCRMTab();
            showToast('Cliente creado correctamente.', 'success');
        } catch (error) {
            console.error('Error creando cliente:', error);
            showToast(
                error.code === 'DUPLICATE_CUSTOMER'
                    ? 'Ya existe un cliente con ese teléfono.'
                    : 'No se pudo crear el cliente.',
                'error'
            );
        } finally {
            submitButton.disabled = false;
        }
    };
}

async function openCustomerHistoryModal(phone, name) {
    const modal = document.getElementById('modal-customer-history');
    const title = document.getElementById('modal-history-title');
    const tbody = document.getElementById('modal-history-tbody');

    title.textContent = `Historial de Visitas: ${name}`;
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Buscando historial...</td></tr>`;
    modal.classList.add('active');

    try {
        const history = await window.BarberDB.getCustomerVisitHistory(phone, name);

        if (history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">No se registraron visitas históricas anteriores.</td></tr>`;
            return;
        }

        tbody.innerHTML = history.map(h => `
            <tr>
                <td><strong>${h.date}</strong></td>
                <td>${h.time} hs</td>
                <td>${h.serviceName}</td>
                <td>${h.barberName}</td>
                <td>$${h.price.toLocaleString()}</td>
                <td><span class="badge-status ${h.status}">${h.status === 'pending' ? 'Pendiente' : (h.status === 'completed' ? 'Realizado' : 'Cancelado')}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error al cargar historial:', err);
    }
}

/* ==========================================================================
   MÓDULO 5: CONFIGURACIONES (BARBEROS RESTRINGIDOS A EDICIÓN ÚNICAMENTE)
   ========================================================================== */
async function loadConfigTab() {
    await loadConfigServices();
    await loadConfigBarbers();
    renderAdminUsers();
}

async function loadConfigServices() {
    const tbody = document.getElementById('config-services-tbody');
    try {
        const services = await window.BarberDB.getServices();

        tbody.innerHTML = services.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td><strong>$${s.price.toLocaleString()}</strong></td>
                <td>${s.durationMinutes} min</td>
                <td>
                    <button class="btn btn-outline-sm btn-edit-service" 
                        data-id="${s.id}" 
                        data-name="${s.name}" 
                        data-price="${s.price}" 
                        data-duration="${s.durationMinutes}"
                        data-desc="${s.description || ''}">
                        <i class="fa-solid fa-pen-to-square"></i> Editar
                    </button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.btn-edit-service').forEach(btn => {
            btn.onclick = () => {
                document.getElementById('modal-service-title').textContent = 'Editar Servicio';
                document.getElementById('srv-id').value = btn.dataset.id;
                document.getElementById('srv-name').value = btn.dataset.name;
                document.getElementById('srv-price').value = btn.dataset.price;
                document.getElementById('srv-duration').value = btn.dataset.duration;
                document.getElementById('srv-description').value = btn.dataset.desc;
                document.getElementById('modal-service').classList.add('active');
            };
        });

    } catch (err) {
        console.error('Error cargando configuraciones de servicios:', err);
    }
}

// Cargar equipo de barberos (Solo existentes - Únicamente opción Editar Nombre y Experiencia)
async function loadConfigBarbers() {
    const tbody = document.getElementById('config-barbers-tbody');
    try {
        const barbers = await window.BarberDB.getBarbers();

        tbody.innerHTML = barbers.map(b => `
            <tr>
                <td><strong>${b.name}</strong></td>
                <td>${b.experience || '-'}</td>
                <td>
                    ${(b.specialties || []).map(s => `<span class="badge-gold" style="font-size:0.75rem; margin-right:4px; display:inline-block; margin-bottom:2px;">${s}</span>`).join('')}
                </td>
                <td>
                    <button class="btn btn-outline-sm btn-edit-barber" data-id="${b.id}" data-name="${b.name}" data-exp="${b.experience || ''}" data-specs="${(b.specialties || []).join(', ')}">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.btn-edit-barber').forEach(btn => {
            btn.onclick = () => {
                document.getElementById('barber-id').value = btn.dataset.id;
                document.getElementById('barber-name').value = btn.dataset.name;
                document.getElementById('barber-experience').value = btn.dataset.exp;
                const specInput = document.getElementById('barber-specialties');
                if (specInput) specInput.value = btn.dataset.specs || '';
                document.getElementById('modal-barber').classList.add('active');
            };
        });

    } catch (err) {
        console.error('Error cargando configuraciones de barberos:', err);
    }
}

/* ==========================================================================
   MODALES Y FORMULARIOS
   ========================================================================== */
function setupAdminModalListeners() {
    const modalApt = document.getElementById('modal-appointment');
    const btnOpenApt = document.getElementById('btn-new-appointment-modal');
    const formApt = document.getElementById('admin-new-appointment-form');

    if (btnOpenApt) {
        btnOpenApt.onclick = () => {
            const dateInput = document.getElementById('admin-new-date');
            if (dateInput && window.BarberDB) {
                dateInput.value = window.BarberDB.getLocalDateStr();
            }
            modalApt.classList.add('active');
        };
    }

    // Modal Producto e Input de Archivo Local Base64
    const modalProd = document.getElementById('modal-product');
    const btnOpenProd = document.getElementById('btn-new-product-modal');
    const formProd = document.getElementById('admin-new-product-form');
    const fileInput = document.getElementById('prod-image-file');
    const previewImg = document.getElementById('prod-image-preview');

    if (btnOpenProd) {
        btnOpenProd.onclick = () => {
            formProd.reset();
            const title = document.getElementById('modal-product-title');
            if (title) title.textContent = 'Añadir Producto al Inventario';
            const prodIdInput = document.getElementById('prod-id');
            if (prodIdInput) prodIdInput.value = '';
            currentBase64ProductImage = "";
            previewImg.style.display = "none";
            previewImg.src = "";
            modalProd.classList.add('active');
        };
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentBase64ProductImage = event.target.result;
                    previewImg.src = currentBase64ProductImage;
                    previewImg.style.display = "block";
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Modal Editar Barbero (Restringido)
    const modalBarber = document.getElementById('modal-barber');
    const formBarber = document.getElementById('admin-barber-form');

    const modalSrv = document.getElementById('modal-service');
    const btnOpenSrv = document.getElementById('btn-add-service-modal');
    const formSrv = document.getElementById('admin-service-form');

    if (btnOpenSrv) {
        btnOpenSrv.onclick = () => {
            document.getElementById('modal-service-title').textContent = 'Nuevo Servicio';
            formSrv.reset();
            document.getElementById('srv-id').value = '';
            modalSrv.classList.add('active');
        };
    }

    const modalHistory = document.getElementById('modal-customer-history');

    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.onclick = () => {
            modalApt.classList.remove('active');
            modalProd.classList.remove('active');
            modalSrv.classList.remove('active');
            modalBarber.classList.remove('active');
            modalHistory.classList.remove('active');
        };
    });

    // Editar Barbero Existente (Restringido a Nombre, Experiencia y Especialidades)
    if (formBarber) {
        formBarber.onsubmit = async (e) => {
            e.preventDefault();
            const rawSpecs = document.getElementById('barber-specialties') ? document.getElementById('barber-specialties').value : '';
            const specialtiesArray = rawSpecs.split(',').map(s => s.trim()).filter(Boolean);

            const barberData = {
                id: document.getElementById('barber-id').value,
                name: document.getElementById('barber-name').value.trim(),
                experience: document.getElementById('barber-experience').value.trim(),
                specialties: specialtiesArray
            };

            try {
                await window.BarberDB.saveBarber(barberData);
                showToast('Datos del barbero actualizados correctamente.', 'success');
                modalBarber.classList.remove('active');
                loadConfigBarbers();
                initBarberFilterOptions();
            } catch (err) {
                console.error(err);
                showToast('Error al guardar barbero.', 'error');
            }
        };
    }

    // Guardar / Editar Servicio
    if (formSrv) {
        formSrv.onsubmit = async (e) => {
            e.preventDefault();
            const serviceData = {
                id: document.getElementById('srv-id').value,
                name: document.getElementById('srv-name').value.trim(),
                price: document.getElementById('srv-price').value,
                durationMinutes: document.getElementById('srv-duration').value,
                description: document.getElementById('srv-description').value.trim()
            };

            try {
                await window.BarberDB.saveService(serviceData);
                showToast('Servicio guardado exitosamente.', 'success');
                modalSrv.classList.remove('active');
                loadConfigServices();
                initBarberFilterOptions();
            } catch (err) {
                console.error(err);
                showToast('Error al guardar servicio.', 'error');
            }
        };
    }

    // Guardar / Editar Producto (Base64 o Conservar Existente)
    if (formProd) {
        formProd.onsubmit = async (e) => {
            e.preventDefault();

            const prodId = document.getElementById('prod-id') ? document.getElementById('prod-id').value : '';
            const imageToSave = currentBase64ProductImage || 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400';

            const prodData = {
                id: prodId || null,
                name: document.getElementById('prod-name').value.trim(),
                category: document.getElementById('prod-category').value,
                description: document.getElementById('prod-description').value.trim(),
                imageUrl: imageToSave
            };

            try {
                await window.BarberDB.saveProduct(prodData);
                const actionMsg = prodId ? 'actualizado' : 'añadido al inventario';
                showToast(`Producto "${prodData.name}" ${actionMsg} con éxito.`, 'success');
                modalProd.classList.remove('active');
                formProd.reset();
                currentBase64ProductImage = "";
                loadInventoryTab();
            } catch (err) {
                console.error(err);
                showToast('Error al guardar producto.', 'error');
            }
        };
    }

    // Nuevo Turno Manual
    if (formApt) {
        formApt.onsubmit = async (e) => {
            e.preventDefault();
            const serviceSelect = document.getElementById('admin-new-service');
            const optService = serviceSelect.options[serviceSelect.selectedIndex];

            const newApt = {
                customerName: document.getElementById('admin-new-name').value.trim(),
                customerPhone: document.getElementById('admin-new-phone').value.trim(),
                serviceId: serviceSelect.value,
                serviceName: optService.dataset.name,
                price: parseFloat(optService.dataset.price),
                barberId: document.getElementById('admin-new-barber').value,
                date: document.getElementById('admin-new-date').value,
                time: document.getElementById('admin-new-time').value
            };

            try {
                await window.BarberDB.createAppointment(newApt);
                showToast('Turno manual creado exitosamente.', 'success');
                modalApt.classList.remove('active');
                formApt.reset();
                loadAppointmentsTab();
            } catch (err) {
                console.error(err);
                showToast('Error al crear turno manual.', 'error');
            }
        };
    }
}
