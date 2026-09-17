// Trusted operator only. Uses Application Default Credentials, never the web API key.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFirebase = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { randomBytes, randomUUID } = require('node:crypto');
const { initializeApp, applicationDefault } = requireFirebase('firebase-admin/app');
const { getFirestore, Timestamp } = requireFirebase('firebase-admin/firestore');
const { getAuth } = requireFirebase('firebase-admin/auth');
const { getStorage } = requireFirebase('firebase-admin/storage');
const { phoneKey, phoneDigits, hash, businessDate, validDate } = require('../functions/domain.cjs');
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const apply = args.includes('--apply');
const filename = arg('--file');
const masterEmail = String(arg('--master') || '').trim().toLowerCase();
const projectId = arg('--project') || 'barber-shop-74019';
const credentialFile = path.resolve(arg('--credentials-out') || 'admin-credentials.json');
if (!masterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(masterEmail)) {
    console.error('Uso: node scripts/import-local.cjs --master email [--file local-export.json] [--apply] [--credentials-out admin-credentials.json]');
    process.exit(1);
}
const input = filename ? JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8')) : {};
if (filename && input.format !== 'barber-shop-local-v1') throw new Error('Formato de exportación no reconocido.');
const names = ['barbers', 'services', 'products', 'customers', 'appointments', 'sales', 'administrators'];
for (const name of names) {
    input[name] ||= [];
    if (!Array.isArray(input[name])) throw new Error('Colección inválida: ' + name);
}
const safeId = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('ID inválido: ' + value);
    return value;
};
const pick = (row, keys) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
const phoneMap = new Map();
for (const name of names.filter(name => name !== 'administrators')) {
    const ids = new Set();
    for (const row of input[name]) {
        safeId(row.id);
        if (ids.has(row.id)) throw new Error('ID duplicado en ' + name + ': ' + row.id);
        ids.add(row.id);
    }
}
for (const customer of input.customers) {
    if (!customer.name?.trim() || phoneDigits(customer.phone).length < 6) throw new Error('Cliente incompleto: ' + customer.id);
    const key = phoneKey(customer.phone);
    if (phoneMap.has(key)) throw new Error('Dos clientes comparten teléfono. Unificá sus IDs en el JSON antes de importar: ' + customer.id);
    phoneMap.set(key, customer.id);
}
for (const appointment of input.appointments) {
    const linked = phoneMap.get(phoneKey(appointment.customerPhone));
    appointment.customerId = linked || appointment.customerId;
    if (!appointment.customerId || !input.customers.some(row => row.id === appointment.customerId))
        throw new Error('Turno sin ficha de cliente: ' + appointment.id);
    if (!validDate(appointment.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(appointment.time || ''))
        throw new Error('Fecha/hora de turno inválida: ' + appointment.id);
}
const occupied = new Set();
for (const appointment of input.appointments.filter(row => row.status !== 'cancelled')) {
    const key = appointment.barberId + '_' + appointment.date + '_' + appointment.time;
    if (occupied.has(key)) throw new Error('Turnos superpuestos en la exportación: ' + key);
    occupied.add(key);
}
const emails = [...new Set([masterEmail, ...input.administrators.map(row => String(row.email || '').trim().toLowerCase())])];
console.log('Proyecto:', projectId);
for (const name of names) console.log(name + ':', input[name].length);
console.log('Cuenta maestra:', masterEmail);
if (!apply) {
    console.log('VALIDACIÓN LOCAL OK. Sin escrituras. Agregá --apply para importar con tus credenciales de Google Cloud.');
    process.exit(0);
}
initializeApp({ credential: applicationDefault(), projectId, storageBucket: projectId + '.firebasestorage.app' });
const db = getFirestore();
const auth = getAuth();
const bucket = getStorage().bucket();
let created = 0;
let skipped = 0;
async function createOnly(ref, data) {
    try { await ref.create(data); created++; return true; }
    catch (error) { if (error.code === 6 || error.code === 'already-exists') { skipped++; return false; } throw error; }
}
async function uploadImage(value, folder, id) {
    if (!value?.startsWith('data:')) return value || '';
    const match = value.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/);
    if (!match) throw new Error('Formato de imagen inválido: ' + id);
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 10 * 1024 * 1024) throw new Error('Imagen mayor a 10 MB: ' + id);
    const objectPath = folder + '/' + id + '-' + hash(value).slice(0, 16);
    const token = randomUUID();
    await bucket.file(objectPath).save(bytes, { resumable: false, metadata: { contentType: match[1], metadata: { firebaseStorageDownloadTokens: token } } });
    return 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name + '/o/' + encodeURIComponent(objectPath) + '?alt=media&token=' + token;
}
async function main() {
    // Preflight conflicting phones and occupied cloud slots before importing any rows.
    for (const customer of input.customers) {
        const index = await db.doc('customerPhones/' + phoneKey(customer.phone)).get();
        if (index.exists && index.data().customerId !== customer.id) throw new Error('Teléfono ya vinculado a otro ID en la nube: ' + customer.id);
    }
    for (const item of input.appointments.filter(row => row.status !== 'cancelled')) {
        const schedule = await db.doc('availability/' + item.barberId + '_' + item.date).get();
        const taken = schedule.data()?.slots?.[item.time];
        if (taken && taken !== item.id) throw new Error('Horario ya ocupado en la nube: ' + item.id);
    }
    const savedCredentials = fs.existsSync(credentialFile) ? JSON.parse(fs.readFileSync(credentialFile, 'utf8')) : [];
    for (const email of emails) {
        let user;
        try { user = await auth.getUserByEmail(email); }
        catch (error) {
            if (error.code !== 'auth/user-not-found') throw error;
            const password = randomBytes(18).toString('base64url') + '!aA1';
            // Persist generated credentials before account creation so interrupted runs are recoverable.
            savedCredentials.push({ email, password });
            fs.writeFileSync(credentialFile, JSON.stringify(savedCredentials, null, 2), { mode: 0o600 });
            user = await auth.createUser({ email, password });
        }
        const profileRef = db.doc('administrators/' + user.uid);
        const profile = await profileRef.get();
        if (profile.exists && email === masterEmail && profile.data().role !== 'master')
            throw new Error('La cuenta maestra elegida ya tiene otro rol. Revisá su perfil antes de continuar.');
        await createOnly(profileRef, { email, role: email === masterEmail ? 'master' : 'admin', active: true, createdAt: Timestamp.now() });
    }
    const fields = {
        barbers: ['name', 'experience', 'photoUrl', 'bio', 'specialties', 'isActive'],
        services: ['name', 'price', 'durationMinutes', 'description'],
        products: ['name', 'category', 'description', 'imageUrl']
    };
    for (const name of ['barbers', 'services', 'products']) {
        for (const row of input[name]) {
            const ref = db.doc(name + '/' + row.id);
            if ((await ref.get()).exists) { skipped++; continue; }
            const data = pick(row, fields[name]);
            if (name === 'barbers') {
                data.isActive = row.isActive !== false;
                data.specialties ||= [];
                data.photoUrl = await uploadImage(data.photoUrl, name, row.id);
            }
            if (name === 'products') data.imageUrl = await uploadImage(data.imageUrl, name, row.id);
            if (name === 'services') {
                data.price = Number(data.price);
                data.durationMinutes = Number(data.durationMinutes) || 30;
                if (!Number.isFinite(data.price) || data.price < 0) throw new Error('Precio inválido: ' + row.id);
            }
            await createOnly(ref, { ...data, createdAt: Timestamp.now() });
        }
    }
    for (const row of input.customers) {
        const ref = db.doc('customers/' + row.id);
        const indexRef = db.doc('customerPhones/' + phoneKey(row.phone));
        await db.runTransaction(async tx => {
            const [existing, index] = await Promise.all([tx.get(ref), tx.get(indexRef)]);
            if (index.exists && index.data().customerId !== row.id) throw new Error('Teléfono duplicado: ' + row.id);
            if (!existing.exists) tx.create(ref, { email: '', notes: '', totalVisits: 0, lastVisit: '', createdAt: businessDate(), ...pick(row, ['name', 'phone', 'email', 'notes', 'totalVisits', 'lastVisit', 'createdAt']) });
            // Do not recreate an old phone mapping if a cloud customer was already edited.
            if (!index.exists && (!existing.exists || phoneKey(existing.data().phone) === phoneKey(row.phone))) tx.create(indexRef, { customerId: row.id });
        });
    }
    for (const row of input.appointments) {
        const ref = db.doc('appointments/' + row.id);
        const scheduleRef = db.doc('availability/' + row.barberId + '_' + row.date);
        await db.runTransaction(async tx => {
            const [existing, schedule] = await Promise.all([tx.get(ref), tx.get(scheduleRef)]);
            if (existing.exists) return;
            const slots = { ...(schedule.data()?.slots || {}) };
            if (row.status !== 'cancelled') {
                if (slots[row.time] && slots[row.time] !== row.id) throw new Error('Horario ocupado: ' + row.id);
                slots[row.time] = row.id;
            }
            tx.create(ref, { ...pick(row, ['customerId', 'customerName', 'customerPhone', 'serviceId', 'serviceName', 'price', 'barberId', 'date', 'time', 'status', 'paymentMethod']), createdAt: row.createdAt || new Date().toISOString() });
            tx.set(scheduleRef, { date: row.date, barberId: row.barberId, slots });
        });
    }
    for (const row of input.sales) {
        const ref = db.doc('sales/' + row.id);
        const appointmentId = row.appointmentId || null;
        await db.runTransaction(async tx => {
            const existing = await tx.get(ref);
            const aptRef = appointmentId ? db.doc('appointments/' + safeId(appointmentId)) : null;
            const apt = aptRef ? await tx.get(aptRef) : null;
            if (existing.exists) return;
            if (apt?.data()?.saleId && apt.data().saleId !== row.id) throw new Error('Turno con otro cobro: ' + row.id);
            const timestamp = new Date(row.timestamp);
            if (Number.isNaN(timestamp.getTime())) throw new Error('Fecha de cobro inválida: ' + row.id);
            const paymentMethod = /efect|cash/i.test(row.paymentMethod || '') ? 'Efectivo' : 'Transferencia/MP';
            const items = (row.items || []).map(item => ({ ...item, type: item.type || 'service', id: item.id || item.serviceId || row.serviceId || input.services.find(service => service.name === String(item.name).replace(/^Servicio:\s*/i, ''))?.id || 'legacy', price: Number(item.price), qty: Number(item.qty) || 1 }));
            tx.create(ref, { ...pick(row, ['customerId', 'customerName', 'customerPhone', 'saleOrigin', 'type', 'serviceId', 'serviceName', 'productId']), appointmentId, items, total: Number(row.total), paymentMethod, timestamp: Timestamp.fromDate(timestamp), date: businessDate(timestamp) });
            if (apt?.exists) tx.update(aptRef, { saleId: row.id, status: 'completed', paymentMethod });
        });
    }
    console.log('Importación finalizada. Catálogo/accesos creados:', created, '; existentes conservados:', skipped);
    if (savedCredentials.length) console.log('Claves de cuentas nuevas guardadas en:', credentialFile, '(archivo privado; guardalo fuera del sitio).');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
