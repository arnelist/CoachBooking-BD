//45 -> 4500, 45.50 -> 4550, null if invalid
export function parsePriceToCents(input) {
    const normalized = input.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const cents = Math.round(parseFloat(normalized) * 100);
    return cents > 0 ? cents : null;
}

//4500 -> 45.00
export function formatPrice(cents) {
    return new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(cents / 100);
}