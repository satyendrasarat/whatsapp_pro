import parsePhoneNumber from 'libphonenumber-js';
import { settingsDao, sessionsDao } from './db.js';

export function getSessionDefaultCountry() {
    try {
        const settings = settingsDao.getAll();
        if (settings.default_country) return settings.default_country;
        
        const allSessions = sessionsDao.getAll();
        const connected = allSessions.find(s => s.status === 'connected' && s.phone_number);
        if (connected) {
            const phone = connected.phone_number.replace(/\D/g, '');
            if (phone.startsWith('91')) return 'IN';
            if (phone.startsWith('1')) return 'US';
            if (phone.startsWith('44')) return 'GB';
            if (phone.startsWith('971')) return 'AE';
        }
    } catch (e) {}
    return 'IN';
}

export function standardizePhone(raw, defaultCountry = null) {
    if (!raw) return null;
    let str = String(raw).trim();
    if (str.includes('@')) return str; // JID directly

    const country = defaultCountry || getSessionDefaultCountry();

    // If starts with +, parse directly
    if (str.startsWith('+')) {
        try {
            const parsed = parsePhoneNumber(str);
            if (parsed && parsed.isValid()) {
                return parsed.number.replace('+', '');
            }
        } catch (e) {}
    }

    // Otherwise try parsing with default country
    try {
        const parsed = parsePhoneNumber(str, country);
        if (parsed && parsed.isValid()) {
            return parsed.number.replace('+', '');
        }
    } catch (e) {}

    // Fallback logic for Indian numbers
    const digits = str.replace(/\D/g, '');
    if (digits.length === 10 && country === 'IN' && /^[6-9]/.test(digits)) {
        return `91${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('0') && country === 'IN') {
        return `91${digits.slice(1)}`;
    }

    return digits;
}

