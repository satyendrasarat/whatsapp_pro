import { execSync } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import { settingsDao } from './db.js';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyZPxPbGGEjURaacex3yKAAu8N53QsodHM6RufsJgAan6bpV8OZP66Dj1HXac1TxBTA/exec';
const APP_VERSION = '1.0.0';
const OFFLINE_GRACE_HOURS = 48;

let cachedHwid = null;

export function getMachineHardwareId() {
    if (cachedHwid) return cachedHwid;
    try {
        if (process.platform === 'win32') {
            const out = execSync('reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
                timeout: 3000,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString();
            const match = out.match(/MachineGuid\s+REG_SZ\s+(.+)/i);
            if (match && match[1]) {
                cachedHwid = match[1].trim();
                return cachedHwid;
            }
        }
    } catch (_) {}

    // Fallback deterministic hardware fingerprint
    const raw = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || ''}`;
    cachedHwid = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
    return cachedHwid;
}

export const licenseService = {
    getHwid() {
        return getMachineHardwareId();
    },

    getStatus() {
        const allSettings = settingsDao.getAll();
        const mobile = allSettings.license_mobile || '';
        const name = allSettings.license_name || '';
        const validTill = allSettings.license_valid_till || '';
        const status = allSettings.license_status || '';
        const lastVerified = allSettings.license_last_verified || '';
        const hwid = getMachineHardwareId();

        if (!mobile) {
            return {
                isActivated: false,
                isValid: false,
                mobile: '',
                name: '',
                validTill: '',
                daysLeft: 0,
                machineId: hwid,
                message: 'No license registered on this computer. Please enter your mobile number.'
            };
        }

        // Check expiry date
        let isExpired = false;
        let daysLeft = 0;
        if (validTill && validTill !== 'Lifetime') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const exp = new Date(validTill);
            if (!isNaN(exp.getTime())) {
                daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                if (daysLeft < 0) {
                    isExpired = true;
                }
            }
        } else if (validTill === 'Lifetime') {
            daysLeft = 9999;
        }

        const isValid = (status === 'ACTIVE') && !isExpired;

        return {
            isActivated: true,
            isValid,
            isExpired,
            mobile,
            name,
            validTill,
            daysLeft: Math.max(0, daysLeft),
            machineId: hwid,
            status,
            lastVerified,
            message: isValid ? 'License is active' : isExpired ? 'License has expired' : 'License is not active'
        };
    },

    async verifyRemote(targetMobile = null) {
        const allSettings = settingsDao.getAll();
        const mobile = (targetMobile || allSettings.license_mobile || '').replace(/\D/g, '');
        const hwid = getMachineHardwareId();

        if (!mobile) {
            return {
                success: false,
                valid: false,
                error: 'Please enter a valid mobile number.'
            };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);

        try {
            const payload = {
                mobile,
                hwid,
                version: APP_VERSION,
                os: `${os.platform()} ${os.release()} (${os.arch()})`
            };

            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Google Apps Script responded with HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.valid) {
                // Update SQLite settings with verified credentials
                settingsDao.set('license_mobile', mobile);
                settingsDao.set('license_name', data.name || '');
                settingsDao.set('license_valid_till', data.validTill || '');
                settingsDao.set('license_days_left', String(data.daysLeft || 0));
                settingsDao.set('license_status', 'ACTIVE');
                settingsDao.set('license_last_verified', new Date().toISOString());
                settingsDao.set('license_machine_id', hwid);

                console.log(`[License Service] License verified successfully for ${mobile} (${data.name || 'User'}). Valid till: ${data.validTill}`);
                return {
                    success: true,
                    valid: true,
                    name: data.name,
                    mobile,
                    validTill: data.validTill,
                    daysLeft: data.daysLeft,
                    message: data.message || 'License verified successfully!'
                };
            } else {
                // Remote says invalid, suspended, or device limit reached
                settingsDao.set('license_status', data.expired ? 'EXPIRED' : 'INVALID');
                console.warn(`[License Service] Verification rejected for ${mobile}:`, data.error);
                return {
                    success: true,
                    valid: false,
                    error: data.error || 'License verification failed.'
                };
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[License Service] Remote verification network notice (${err.message}). Checking offline grace period...`);

            // Check offline grace period
            const lastVerified = allSettings.license_last_verified;
            const validTill = allSettings.license_valid_till;
            const status = allSettings.license_status;

            if (lastVerified && status === 'ACTIVE' && validTill) {
                const lastDate = new Date(lastVerified);
                const hoursSinceVerified = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);

                if (hoursSinceVerified <= OFFLINE_GRACE_HOURS) {
                    console.log(`[License Service] Operating in offline grace mode (${hoursSinceVerified.toFixed(1)}h / ${OFFLINE_GRACE_HOURS}h)`);
                    const currentStatus = this.getStatus();
                    return {
                        success: true,
                        valid: currentStatus.isValid,
                        isOfflineGrace: true,
                        name: currentStatus.name,
                        mobile: currentStatus.mobile,
                        validTill: currentStatus.validTill,
                        daysLeft: currentStatus.daysLeft,
                        message: `Offline mode active (${Math.round(OFFLINE_GRACE_HOURS - hoursSinceVerified)}h remaining)`
                    };
                }
            }

            return {
                success: false,
                valid: false,
                error: 'Could not connect to license server. Please verify your internet connection and try again.'
            };
        }
    },

    startHeartbeat() {
        // Initial non-blocking ping after 3 seconds
        setTimeout(() => {
            const status = this.getStatus();
            if (status.isActivated && status.mobile) {
                this.verifyRemote(status.mobile).catch(() => {});
            }
        }, 3000);

        // Periodic telemetry ping every 3 hours (10,800,000 ms)
        setInterval(() => {
            const status = this.getStatus();
            if (status.isActivated && status.mobile) {
                console.log('[License Heartbeat] Dispatching 3-hour telemetry update to Google Sheet...');
                this.verifyRemote(status.mobile).catch(() => {});
            }
        }, 3 * 60 * 60 * 1000);
    }
};

export default licenseService;
