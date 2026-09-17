const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineBoolean } = require('firebase-functions/params');
const { hash, phoneKey, phoneDigits, businessDate, validDate, money } = require('./domain.cjs');

initializeApp();
const db = getFirestore();
const auth = getAuth();
const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: false });
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 5 });
const fail = (code, message) => { throw new HttpsError(code, message); };
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function id(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail('invalid-argument', 'Identificador inválido.');
    return value;
}
function customerData(data) {
    const name = text(data.name);
    const phone = text(data.phone, 40);
    if (!name || phoneDigits(phone).length < 6 || phoneDigits(phone).length > 18) fail('invalid-argument', 'Nombre o teléfono inválido.');
    return { name, phone, notes: text(data.notes, 5000) };
}
async function requireAdmin(request, master = false) {
    if (!request.auth) fail('unauthenticated', 'Iniciá sesión.');
    const snapshot = await db.doc('administrators/' + request.auth.uid).get();
    const profile = snapshot.data();
    if (!profile?.active || !['admin', 'master'].includes(profile.role) || (master && profile.role !== 'master')) fail('permission-denied', 'Acceso no autorizado.');
    return { ...profile, id: snapshot.id };
}
async function optionalAdmin(request) {
    if (!request.auth) return false;
    const profile = (await db.doc('administrators/' + request.auth.uid).get()).data();
    return profile?.active === true && ['admin', 'master'].includes(profile.role);
}
const staff = handler => onCall(async request => {
    const actor = await requireAdmin(request);
    try { return await handler(request.data || {}, actor, request); }
    catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('Operación administrativa fallida', error.code || error.name);
        fail('internal', 'No se pudo completar la operación.');
    }
});
const now = () => FieldValue.serverTimestamp();

exports.manageAdministrator = onCall(async request => {
    await requireAdmin(request, true);
    const data = request.data || {};
    if (data.action === 'create') {
        const email = text(data.email, 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof data.password !== 'string' || data.password.length < 6)
            fail('invalid-argument', 'Email o contraseña inválidos.');
        let user;
        try {
            user = await auth.createUser({ email, password: data.password, disabled: true });
            await db.doc('administrators/' + user.uid).create({ email, role: 'admin', active: true, createdAt: now() });
            await auth.updateUser(user.uid, { disabled: false });
            return { id: user.uid, email };
        } catch (error) {
            if (user) {
                await db.doc('administrators/' + user.uid).delete();
                await auth.deleteUser(user.uid);
            }
            if (error.code === 'auth/email-already-exists') fail('already-exists', 'Ya existe un administrador con ese email.');
            fail('internal', 'No se pudo crear el administrador.');
        }
    }
    const uid = id(data.uid);
    const target = await db.doc('administrators/' + uid).get();
    if (!target.exists) fail('not-found', 'Administrador no encontrado.');
    if (data.action === 'password') {
        if (typeof data.password !== 'string' || data.password.length < 6) fail('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
        await auth.updateUser(uid, { password: data.password });
        await auth.revokeRefreshTokens(uid);
        await target.ref.update({ updatedAt: now() });
        return { id: uid };
    }
    if (data.action === 'delete') {
        if (target.data().role === 'master' || uid === request.auth.uid) fail('failed-precondition', 'La cuenta maestra no se puede eliminar.');
        // Revoke Firestore access immediately, even while an old ID token remains valid.
        await target.ref.update({ active: false, updatedAt: now() });
        try { await auth.deleteUser(uid); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        await target.ref.delete();
        return { id: uid };
    }
    fail('invalid-argument', 'Acción desconocida.');
});

exports.createCustomer = staff(async data => {
    const values = customerData(data);
    const customerRef = db.collection('customers').doc();
    const indexRef = db.doc('customerPhones/' + phoneKey(values.phone));
    return db.runTransaction(async tx => {
        if ((await tx.get(indexRef)).exists) fail('already-exists', 'Ya existe un cliente con ese teléfono.');
        const customer = { ...values, email: '', createdAt: businessDate(), totalVisits: 0, lastVisit: '' };
        tx.create(customerRef, customer);
        tx.create(indexRef, { customerId: customerRef.id });
        return { ...customer, id: customerRef.id };
    });
});
exports.updateCustomer = staff(async data => {
    const ref = db.doc('customers/' + id(data.id));
    const values = customerData(data);
    return db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (!existing.exists) fail('not-found', 'Cliente no encontrado.');
        const oldIndex = db.doc('customerPhones/' + phoneKey(existing.data().phone));
        const newIndex = db.doc('customerPhones/' + phoneKey(values.phone));
        const taken = await tx.get(newIndex);
        if (taken.exists && taken.data().customerId !== ref.id) fail('already-exists', 'Ese teléfono pertenece a otro cliente.');
        if (oldIndex.path !== newIndex.path) tx.delete(oldIndex);
        tx.set(newIndex, { customerId: ref.id });
        tx.update(ref, { ...values, updatedAt: now() });
        return { ...values, id: ref.id };
    });
});
exports.deleteCustomer = staff(async data => {
    const ref = db.doc('customers/' + id(data.id));
    await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (!existing.exists) fail('not-found', 'Cliente no encontrado.');
        tx.delete(db.doc('customerPhones/' + phoneKey(existing.data().phone)));
        tx.delete(ref);
    });
    return { id: ref.id };
});
exports.toggleBarberActive = staff(async data => {
    const ref = db.doc('barbers/' + id(data.id));
    return db.runTransaction(async tx => {
        const record = await tx.get(ref);
        if (!record.exists) fail('not-found', 'Barbero no encontrado.');
        const isActive = record.data().isActive === false;
        tx.update(ref, { isActive, updatedAt: now() });
        return { id: ref.id, isActive };
    });
});

exports.createAppointment = onCall({ enforceAppCheck }, async request => {
    const data = request.data || {};
    const admin = await optionalAdmin(request);
    const values = customerData({ name: data.customerName, phone: data.customerPhone });
    const barberId = id(data.barberId);
    const serviceId = id(data.serviceId);
    const requestId = id(data.requestId);
    if (!validDate(data.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time || '')) fail('invalid-argument', 'Fecha u hora inválidas.');
    const day = new Date(data.date + 'T12:00:00-03:00').getUTCDay();
    const start = Number(data.time.slice(0, 2)) * 60 + Number(data.time.slice(3));
    if (!admin && (day === 0 || start < 540 || start > 960 || start % 30 !== 0 ||
        Date.parse(data.date + 'T' + data.time + ':00-03:00') <= Date.now())) fail('invalid-argument', 'Ese horario no está disponible.');
    const fingerprint = hash(JSON.stringify([barberId, serviceId, data.date, data.time, values.name, values.phone]));
    const appointmentRef = db.doc('appointments/' + requestId);
    const scheduleRef = db.doc('availability/' + barberId + '_' + data.date);
    const phoneRef = db.doc('customerPhones/' + phoneKey(values.phone));
    const rateRef = db.doc('bookingLimits/' + hash(request.rawRequest.ip || 'unknown') + '_' + Math.floor(Date.now() / 3600000));
    return db.runTransaction(async tx => {
        const [existing, barber, service, schedule, phone, rate] = await Promise.all([
            tx.get(appointmentRef), tx.get(db.doc('barbers/' + barberId)), tx.get(db.doc('services/' + serviceId)),
            tx.get(scheduleRef), tx.get(phoneRef), tx.get(rateRef)
        ]);
        if (existing.exists) {
            if (existing.data().requestFingerprint !== fingerprint) fail('already-exists', 'La solicitud ya fue utilizada.');
            return { id: existing.id };
        }
        if (!barber.exists || barber.data().isActive === false || !service.exists) fail('failed-precondition', 'Servicio o barbero no disponible.');
        const slots = { ...(schedule.data()?.slots || {}) };
        if (slots[data.time]) fail('already-exists', 'Ese horario acaba de reservarse. Elegí otro.');
        if (!admin && (rate.data()?.count || 0) >= 12) fail('resource-exhausted', 'Demasiadas reservas. Intentá más tarde.');
        const customerRef = phone.exists ? db.doc('customers/' + phone.data().customerId) : db.collection('customers').doc();
        const customer = await tx.get(customerRef);
        if (!customer.exists) {
            tx.set(customerRef, { ...values, email: '', createdAt: businessDate(), totalVisits: 1, lastVisit: data.date, notes: 'Nuevo cliente registrado vía reserva.' });
            tx.set(phoneRef, { customerId: customerRef.id });
        } else {
            tx.update(customerRef, { totalVisits: (customer.data().totalVisits || 0) + 1, lastVisit: data.date });
        }
        slots[data.time] = appointmentRef.id;
        tx.set(scheduleRef, { date: data.date, barberId, slots });
        tx.create(appointmentRef, {
            customerId: customerRef.id, customerName: values.name, customerPhone: values.phone,
            serviceId, serviceName: service.data().name, price: Number(service.data().price),
            barberId, date: data.date, time: data.time, status: 'pending', paymentMethod: null,
            createdAt: now(), requestFingerprint: fingerprint
        });
        if (!admin) tx.set(rateRef, { count: (rate.data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
        return { id: appointmentRef.id };
    });
});

async function changeAppointment(data, remove) {
    const ref = db.doc('appointments/' + id(data.id));
    return db.runTransaction(async tx => {
        const record = await tx.get(ref);
        if (!record.exists) fail('not-found', 'Turno no encontrado.');
        const old = record.data();
        if (old.saleId) fail('failed-precondition', 'El turno tiene un cobro registrado.');
        const scheduleRef = db.doc('availability/' + old.barberId + '_' + old.date);
        const schedule = await tx.get(scheduleRef);
        const slots = { ...(schedule.data()?.slots || {}) };
        if (remove || data.status === 'cancelled') {
            if (slots[old.time] === ref.id) delete slots[old.time];
        } else {
            if (slots[old.time] && slots[old.time] !== ref.id) fail('already-exists', 'Horario ocupado.');
            slots[old.time] = ref.id;
        }
        tx.set(scheduleRef, { date: old.date, barberId: old.barberId, slots });
        if (remove) tx.delete(ref);
        else tx.update(ref, { status: data.status, ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}), updatedAt: now() });
        return { id: ref.id };
    });
}
exports.updateAppointmentStatus = staff(async data => {
    if (!['pending', 'completed', 'cancelled'].includes(data.status)) fail('invalid-argument', 'Estado inválido.');
    return changeAppointment(data, false);
});
exports.deleteAppointment = staff(data => changeAppointment(data, true));

function saleValues(data) {
    if (!['Efectivo', 'Transferencia/MP'].includes(data.paymentMethod)) fail('invalid-argument', 'Medio de pago inválido.');
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 30) fail('invalid-argument', 'Detalle de venta inválido.');
    let items;
    try {
        items = data.items.map(item => {
            if (!['service', 'product'].includes(item.type)) throw new Error('Tipo inválido');
            const qty = Number(item.qty) || 1;
            if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error('Cantidad inválida');
            return { type: item.type, id: id(item.id), name: text(item.name), price: money(item.price), qty };
        });
        const total = money(data.total);
        const sum = money(items.reduce((value, item) => value + item.price * item.qty, 0));
        if (total !== sum) fail('invalid-argument', 'El total debe coincidir con el detalle.');
        return { items, total, paymentMethod: data.paymentMethod };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        fail('invalid-argument', 'Importes inválidos.');
    }
}
exports.processSale = staff(async (data, actor) => {
    const values = saleValues(data);
    const appointmentId = data.appointmentId ? id(data.appointmentId) : null;
    const ref = db.doc('sales/' + (appointmentId ? 'appointment_' + appointmentId : id(data.requestId)));
    const customerRef = db.doc('customers/' + id(data.customerId));
    const appointmentRef = appointmentId ? db.doc('appointments/' + appointmentId) : null;
    const requestFingerprint = hash(JSON.stringify([values, data.customerId, appointmentId]));
    return db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) {
            if (existing.data().requestFingerprint !== requestFingerprint) fail('already-exists', 'Ese turno ya tiene un cobro registrado.');
            return { id: ref.id };
        }
        const customer = await tx.get(customerRef);
        const appointment = appointmentRef ? await tx.get(appointmentRef) : null;
        if (!customer.exists) fail('not-found', 'Cliente no encontrado.');
        if (appointmentRef && (!appointment.exists || appointment.data().status !== 'pending' || appointment.data().saleId))
            fail('failed-precondition', 'El turno ya fue cobrado o cancelado.');
        if (appointment && appointment.data().customerId !== customerRef.id) fail('invalid-argument', 'El cliente no corresponde al turno.');
        const service = values.items.find(item => item.type === 'service');
        const product = values.items.find(item => item.type === 'product');
        tx.create(ref, {
            ...values, appointmentId, customerId: customerRef.id, customerName: customer.data().name, customerPhone: customer.data().phone,
            saleOrigin: appointmentId ? 'appointment' : 'walkin', type: product ? 'mixed' : 'service',
            serviceId: service?.id || '', serviceName: service?.name || '', productId: product?.id || null,
            timestamp: now(), date: businessDate(), createdBy: actor.id, requestFingerprint
        });
        if (appointmentRef) tx.update(appointmentRef, { status: 'completed', paymentMethod: values.paymentMethod, saleId: ref.id });
        return { id: ref.id };
    });
});
exports.updateSale = staff(async (data, actor) => {
    const ref = db.doc('sales/' + id(data.id));
    const values = saleValues(data.updates || {});
    return db.runTransaction(async tx => {
        const original = await tx.get(ref);
        if (!original.exists) fail('not-found', 'Cobro no encontrado.');
        const service = values.items.find(item => item.type === 'service');
        tx.update(ref, { ...values, serviceId: service?.id || '', serviceName: service?.name || '',
            type: values.items.some(item => item.type === 'product') ? 'mixed' : 'service', updatedAt: now(), updatedBy: actor.id });
        if (original.data().appointmentId) tx.update(db.doc('appointments/' + original.data().appointmentId), { paymentMethod: values.paymentMethod });
        return { id: ref.id };
    });
});
exports.deleteSale = staff(async data => {
    const ref = db.doc('sales/' + id(data.id));
    await db.runTransaction(async tx => {
        const sale = await tx.get(ref);
        if (!sale.exists) fail('not-found', 'Cobro no encontrado.');
        if (sale.data().appointmentId) fail('failed-precondition', 'No se puede eliminar un cobro vinculado a un turno.');
        tx.delete(ref);
    });
    return { id: ref.id };
});
