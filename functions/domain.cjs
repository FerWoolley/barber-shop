const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const phoneKey = phone => hash(String(phone || '').replace(/\D/g, ''));
const phoneDigits = phone => String(phone || '').replace(/\D/g, '');
function businessDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    return ['year', 'month', 'day'].map(type => parts.find(item => item.type === type).value).join('-');
}
function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new Error('Monto inválido.');
    return Math.round(amount * 100) / 100;
}
module.exports = { hash, phoneKey, phoneDigits, businessDate, validDate, money };
