import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
    query, where, serverTimestamp, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
    getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword,
    signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getStorage, ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { firebaseConfig, functionsRegion, appCheckSiteKey } from '../config.js';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, functionsRegion);
const storage = getStorage(app);
window.firebaseApp = app;
window.firestoreDB = db;

if (appCheckSiteKey) {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js');
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
const authReady = setPersistence(auth, browserSessionPersistence).then(() => auth.authStateReady());
authReady.catch(error => console.error('No se pudo inicializar la sesión de Firebase.', error));
const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;
const model = snapshot => {
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    for (const [key, value] of Object.entries(data)) {
        if (value?.toDate) data[key] = value.toDate().toISOString();
    }
    return { ...data, id: snapshot.id };
};
const list = async (name, ...filters) => (await getDocs(query(collection(db, name), ...filters))).docs.map(model);
const one = async (name, id) => model(await getDoc(doc(db, name, id)));
const clean = value => Object.fromEntries(Object.entries(value).filter(([key, item]) => key !== 'id' && item !== undefined));
const save = async (name, value) => {
    const data = { ...clean(value), updatedAt: serverTimestamp() };
    if (value.id) {
        await updateDoc(doc(db, name, value.id), data);
        return { ...value };
    }
    const result = await addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
    return { ...value, id: result.id };
};
function getLocalDateStr(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = type => parts.find(item => item.type === type).value;
    return part('year') + '-' + part('month') + '-' + part('day');
}
async function imageURL(value, folder) {
    if (!value?.startsWith('data:')) return value;
    const imageRef = ref(storage, folder + '/' + crypto.randomUUID());
    await uploadString(imageRef, value, 'data_url');
    return getDownloadURL(imageRef);
}
// Reuse request IDs after uncertain network results; no persistent client database.
const pendingRequests = new Map();
async function idempotentCall(name, data) {
    const key = name + JSON.stringify(data);
    const requestId = pendingRequests.get(key) || crypto.randomUUID();
    pendingRequests.set(key, requestId);
    const result = await call(name, { ...data, requestId });
    pendingRequests.delete(key);
    return result;
}
window.BarberAuth = {
    ready: authReady,
    async login(email, password) {
        await authReady;
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const profile = await one('administrators', credential.user.uid);
        if (!profile?.active) {
            await signOut(auth);
            throw new Error('Esta cuenta no tiene acceso administrativo.');
        }
        return profile;
    },
    logout: () => signOut(auth),
    observe(callback, onError) {
        let stopProfile;
        const stopAuth = onAuthStateChanged(auth, user => {
            stopProfile?.();
            if (!user) { callback(null); return; }
            stopProfile = onSnapshot(doc(db, 'administrators', user.uid), snapshot => {
                const profile = model(snapshot);
                callback(profile?.active ? profile : null);
            }, error => { callback(null); onError?.(error); });
        }, onError);
        return () => { stopAuth(); stopProfile?.(); };
    },
    getUsers: () => list('administrators'),
    createUser: (email, password) => call('manageAdministrator', { action: 'create', email, password }),
    changePassword: (uid, password) => call('manageAdministrator', { action: 'password', uid, password }),
    deleteUser: uid => call('manageAdministrator', { action: 'delete', uid })
};
window.BarberDB = {
    getLocalDateStr,
    getBarbers: () => list('barbers'),
    async getActiveBarbers() { return (await list('barbers')).filter(item => item.isActive !== false); },
    async saveBarber(data) {
        const photoUrl = await imageURL(data.photoUrl, 'barbers');
        return save('barbers', { ...(!data.id ? { isActive: true, specialties: [], bio: data.experience || '' } : {}), ...data, photoUrl });
    },
    toggleBarberActive: id => call('toggleBarberActive', { id }),
    deleteBarber: id => deleteDoc(doc(db, 'barbers', id)),
    getServices: () => list('services'),
    saveService: data => save('services', { ...data, price: Number(data.price), durationMinutes: Number(data.durationMinutes) || 30 }),
    deleteService: id => deleteDoc(doc(db, 'services', id)),
    getProducts: () => list('products'),
    async saveProduct(data) { return save('products', { ...data, imageUrl: await imageURL(data.imageUrl, 'products') }); },
    async addProduct(data) { return this.saveProduct(data); },
    deleteProduct: id => deleteDoc(doc(db, 'products', id)),
    async getAppointments(date = null, barberId = null) {
        const filters = [];
        if (date?.trim()) filters.push(where('date', '==', date.trim()));
        if (barberId && barberId !== 'all') filters.push(where('barberId', '==', barberId));
        return (await list('appointments', ...filters)).sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));
    },
    async getBookedTimes(date, barberId) {
        const schedule = await one('availability', barberId + '_' + date);
        return Object.keys(schedule?.slots || {});
    },
    createAppointment: data => idempotentCall('createAppointment', data),
    updateAppointmentStatus: (id, status, paymentMethod = null) => call('updateAppointmentStatus', { id, status, paymentMethod }),
    deleteAppointment: id => call('deleteAppointment', { id }),
    async getCustomers(search = '') {
        const customers = await list('customers');
        const term = search.toLowerCase();
        return customers.filter(customer => [customer.name, customer.phone, customer.email].some(value => String(value || '').toLowerCase().includes(term)));
    },
    async createCustomer(data) {
        try { return await call('createCustomer', data); }
        catch (error) {
            if (error.code === 'functions/already-exists') error.code = 'DUPLICATE_CUSTOMER';
            throw error;
        }
    },
    updateCustomer: data => call('updateCustomer', data),
    deleteCustomer: id => call('deleteCustomer', { id }),
    async updateCustomerNotes(id, notes) {
        await updateDoc(doc(db, 'customers', id), { notes, updatedAt: serverTimestamp() });
        return { id, notes };
    },
    async getCustomerVisitHistory(phone, name) {
        const [byPhone, byName, barbers] = await Promise.all([
            list('appointments', where('customerPhone', '==', phone)),
            list('appointments', where('customerName', '==', name)), list('barbers')
        ]);
        const appointments = [...new Map([...byPhone, ...byName].map(item => [item.id, item])).values()];
        return appointments.map(item => ({ ...item, barberName: barbers.find(barber => barber.id === item.barberId)?.name || 'Barbero' }))
            .sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));
    },
    processSale: data => idempotentCall('processSale', data),
    updateSale: (id, updates) => call('updateSale', { id, updates }),
    deleteSale: id => call('deleteSale', { id }),
    getSale: id => one('sales', id),
    getSalesByDate: date => list('sales', where('date', '==', date)),
    getSalesToday: () => list('sales', where('date', '==', getLocalDateStr()))
};
