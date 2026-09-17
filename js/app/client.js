import '../services/db.js';

/* ==========================================================================
   CLIENT APP LOGIC (Vanilla JS)
   96 Barber Shop - General Belgrano (Calle El Maestro 636)
   ========================================================================== */

async function initClientApp() {
    initSplashScreen();
    initMobileMenu();
    initBookingConfirmationModal();
    initMinDateFilter();
    await loadServices();
    await loadBarbers();
    await loadProductsShowcase();
    setupBookingFormListeners();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initClientApp, { once: true });
else initClientApp();

let bookingConfirmationCleanup = null;
let bookingConfirmationHideTimer = null;

function formatBookingDate(dateValue) {
    const [year, month, day] = String(dateValue).split('-').map(Number);
    const localDate = new Date(year, month - 1, day);

    if (Number.isNaN(localDate.getTime())) return dateValue;

    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(localDate);
}

function openBookingConfirmationModal({ barberName, date, time }, onClose) {
    const modal = document.getElementById('booking-confirmation-modal');
    const summary = document.getElementById('booking-confirmation-summary');
    const closeButton = document.getElementById('booking-confirmation-close');
    if (!modal || !summary || !closeButton) {
        showToast('El turno fue confirmado correctamente.', 'success');
        if (typeof onClose === 'function') onClose();
        return;
    }

    clearTimeout(bookingConfirmationHideTimer);
    bookingConfirmationCleanup = typeof onClose === 'function' ? onClose : null;
    summary.textContent = `Reservaste con ${barberName} para el día ${formatBookingDate(date)} a las ${time}.`;

    modal.hidden = false;
    document.body.classList.add('booking-confirmation-open');

    requestAnimationFrame(() => {
        modal.classList.add('is-visible');
        closeButton.focus();
    });
}

function closeBookingConfirmationModal() {
    const modal = document.getElementById('booking-confirmation-modal');
    if (!modal || modal.hidden) return;

    modal.classList.remove('is-visible');
    document.body.classList.remove('booking-confirmation-open');

    const cleanup = bookingConfirmationCleanup;
    bookingConfirmationCleanup = null;
    if (cleanup) cleanup();

    bookingConfirmationHideTimer = setTimeout(() => {
        modal.hidden = true;
        document.getElementById('booking-name')?.focus();
    }, 220);
}

function initBookingConfirmationModal() {
    const modal = document.getElementById('booking-confirmation-modal');
    const closeButton = document.getElementById('booking-confirmation-close');
    if (!modal || !closeButton) return;

    closeButton.addEventListener('click', closeBookingConfirmationModal);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) {
            event.preventDefault();
            closeBookingConfirmationModal();
        }
    });
}

// Lógica de Menú Hamburguesa en Dispositivos Móviles
function initMobileMenu() {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const navLinks = document.getElementById('nav-links');
    if (toggleBtn && navLinks) {
        toggleBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                if (navLinks.classList.contains('active')) {
                    icon.className = 'fa-solid fa-xmark';
                } else {
                    icon.className = 'fa-solid fa-bars';
                }
            }
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = toggleBtn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-bars';
            });
        });
    }
}

// Lógica de Splash Screen (Pantalla de carga inicial de 2.5s)
function initSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('fade-out');
        }, 2500); // 2.5 segundos de presentación premium
    }
}

// Toast notification helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// 1. Cargar servicios (sin ícono genérico de tijeras)
async function loadServices() {
    try {
        const services = await window.BarberDB.getServices();
        const grid = document.getElementById('services-grid');
        const select = document.getElementById('booking-service');

        if (grid) {
            grid.innerHTML = services.map(s => `
                <div class="service-card">
                    <h3>${s.name}</h3>
                    <p class="service-price">$${s.price.toLocaleString()}</p>
                    <p class="service-duration"><i class="fa-regular fa-clock"></i> ${s.durationMinutes} minutos</p>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 10px;">${s.description}</p>
                </div>
            `).join('');
        }

        if (select) {
            select.innerHTML = '<option value="">-- Seleccionar Servicio --</option>' + 
                services.map(s => `<option value="${s.id}" data-price="${s.price}" data-name="${s.name}">${s.name} ($${s.price.toLocaleString()})</option>`).join('');
        }
    } catch (err) {
        console.error('Error cargando servicios:', err);
    }
}

// 2. Cargar equipo de barberos (mostrando foto Unsplash y campo de Experiencia)
async function loadBarbers() {
    try {
        const barbers = await window.BarberDB.getActiveBarbers();
        const grid = document.getElementById('barbers-grid');
        const select = document.getElementById('booking-barber');

        if (grid) {
            grid.innerHTML = barbers.map(b => `
                <div class="barber-card">
                    <img src="${b.photoUrl}" alt="${b.name}" class="barber-img">
                    <div class="barber-info">
                        <h3>${b.name}</h3>
                        <p class="barber-experience"><i class="fa-solid fa-award gold-text"></i> ${b.experience || 'Barbero Profesional'}</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 5px;">${b.bio || ''}</p>
                        <div class="barber-specialties">
                            ${b.specialties ? b.specialties.map(spec => `<span class="chip">${spec}</span>`).join('') : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        if (select) {
            select.innerHTML = '<option value="">-- Seleccionar Barbero --</option>' +
                barbers.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }
    } catch (err) {
        console.error('Error cargando barberos:', err);
    }
}

// 3. Cargar Vitrina de Productos (SOLO FOTO, NOMBRE, DESCRIPCIÓN Y ETIQUETA)
async function loadProductsShowcase() {
    try {
        const products = await window.BarberDB.getProducts();
        const grid = document.getElementById('products-grid');

        if (grid) {
            grid.innerHTML = products.map(p => `
                <div class="product-card">
                    <img src="${p.imageUrl}" alt="${p.name}" class="product-img">
                    <div class="product-body">
                        <span class="badge-gold" style="align-self: flex-start; font-size: 0.7rem; margin-bottom: 8px;">${p.category}</span>
                        <h3 class="product-title">${p.name}</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); flex-grow: 1; margin-bottom: 15px;">${p.description}</p>
                        <div class="product-footer-clean">
                            <span class="badge-encargo">
                                <i class="fa-solid fa-store gold-text"></i> Disponible para encargo en el local
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Error cargando productos:', err);
    }
}

// 4. Configurar restricciones de fecha (Hoy en adelante)
function initMinDateFilter() {
    const dateInput = document.getElementById('booking-date');
    if (dateInput) {
        const today = window.BarberDB ? window.BarberDB.getLocalDateStr() : new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }
}

// 5. Configurar Listeners del Formulario de Reserva (Lunes a Sábados 09:00 a 16:00 hs)
function setupBookingFormListeners() {
    const form = document.getElementById('booking-form');
    const barberSelect = document.getElementById('booking-barber');
    const dateInput = document.getElementById('booking-date');
    const timeSelect = document.getElementById('booking-time');

    const updateAvailableSlots = async () => {
        const barberId = barberSelect.value;
        const dateVal = dateInput.value;

        if (!barberId || !dateVal) {
            timeSelect.disabled = true;
            timeSelect.innerHTML = '<option value="">Selecciona fecha y barbero...</option>';
            return;
        }

        const dateParts = dateVal.split('-');
        const chosenDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const dayOfWeek = chosenDate.getDay();

        if (dayOfWeek === 0) { // Domingo
            timeSelect.disabled = true;
            timeSelect.innerHTML = '<option value="">La barbería permanece cerrada los domingos</option>';
            return;
        }

        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="">Cargando horarios libres...</option>';

        try {
            const bookedTimes = await window.BarberDB.getBookedTimes(dateVal, barberId);

            const allowedSlots = [
                "09:00", "09:30",
                "10:00", "10:30",
                "11:00", "11:30",
                "12:00", "12:30",
                "13:00", "13:30",
                "14:00", "14:30",
                "15:00", "15:30",
                "16:00"
            ];

            const freeSlots = allowedSlots.filter(s => !bookedTimes.includes(s));

            if (freeSlots.length === 0) {
                timeSelect.innerHTML = '<option value="">Sin turnos con cita previa disponibles hoy</option>';
            } else {
                timeSelect.innerHTML = '<option value="">-- Seleccionar Hora (Cita Previa) --</option>' +
                    freeSlots.map(s => `<option value="${s}">${s} hs</option>`).join('');
                timeSelect.disabled = false;
            }
        } catch (err) {
            console.error('Error calculando horarios:', err);
        }
    };

    if (barberSelect) barberSelect.addEventListener('change', updateAvailableSlots);
    if (dateInput) dateInput.addEventListener('change', updateAvailableSlots);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const serviceSelect = document.getElementById('booking-service');
            const selectedServiceOpt = serviceSelect.options[serviceSelect.selectedIndex];
            const selectedBarberOpt = barberSelect.options[barberSelect.selectedIndex];
            const selectedBarberName = selectedBarberOpt?.textContent.trim() || 'tu barbero';
            const btn = document.getElementById('btn-submit-booking');

            const appointmentData = {
                serviceId: serviceSelect.value,
                serviceName: selectedServiceOpt.dataset.name,
                price: parseFloat(selectedServiceOpt.dataset.price),
                barberId: barberSelect.value,
                date: dateInput.value,
                time: timeSelect.value,
                customerName: document.getElementById('booking-name').value.trim(),
                customerPhone: document.getElementById('booking-phone').value.trim()
            };

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando reserva...';

                await window.BarberDB.createAppointment(appointmentData);

                openBookingConfirmationModal({
                    barberName: selectedBarberName,
                    date: appointmentData.date,
                    time: appointmentData.time
                }, () => {
                    form.reset();
                    timeSelect.disabled = true;
                    timeSelect.innerHTML = '<option value="">Selecciona fecha y barbero...</option>';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Reserva';
                });
            } catch (err) {
                console.error('Error guardando reserva:', err);
                showToast(err.code === 'functions/already-exists' ? 'Ese horario acaba de reservarse. Elegí otro.' : 'Ocurrió un error al registrar el turno.', 'error');
                await updateAvailableSlots();
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Reserva';
            }
        });
    }
}
