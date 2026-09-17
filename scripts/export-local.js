// Run in DevTools on the OLD site's origin, before changing its URL/domain.
// Downloads business records, never administrator passwords. Does not delete data.
(() => {
    const collections = ['barbers', 'services', 'products', 'appointments', 'customers', 'sales'];
    const result = { format: 'barber-shop-local-v1', exportedAt: new Date().toISOString() };
    for (const name of collections) {
        const rows = JSON.parse(localStorage.getItem('barber_' + name) || '[]');
        if (!Array.isArray(rows)) throw new Error('Datos inválidos: ' + name);
        result[name] = rows;
    }
    result.administrators = JSON.parse(localStorage.getItem('barber96AdminUsers') || '[]')
        .map(user => ({ email: String(user.email || '').trim().toLowerCase() })).filter(user => user.email);
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'local-export-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.info('Exportación descargada. El almacenamiento local no fue modificado.');
})();
