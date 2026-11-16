import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'crm_activity.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB per file

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function rotateLogsIfNeeded() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size >= MAX_LOG_SIZE) {
                const backup1 = path.join(LOGS_DIR, 'crm_activity.log.1');
                const backup2 = path.join(LOGS_DIR, 'crm_activity.log.2');
                if (fs.existsSync(backup1)) {
                    try { fs.renameSync(backup1, backup2); } catch (_) {}
                }
                try { fs.renameSync(LOG_FILE, backup1); } catch (_) {}
            }
        }
    } catch (_) {}
}

function getTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isSignalInternalNoise(...args) {
    if (!args || args.length === 0) return false;
    const str = util.format(...args);
    return (
        str.includes('Bad MAC') ||
        str.includes('Failed to decrypt message with any known session') ||
        str.includes('Closing session:') ||
        str.includes('Opening session:') ||
        str.includes('Removing old closed session:') ||
        str.includes('Session already closed') ||
        str.includes('Session already open') ||
        str.includes('Decrypted message with closed session') ||
        str.includes('Closing open session in favor of') ||
        str.includes('SessionEntry {') ||
        str.includes('pendingPreKey:') ||
        str.includes('indexInfo:') ||
        str.includes('failed to decrypt message') ||
        str.includes('No matching sessions found for message')
    );
}

export function writeLog(level, ...args) {
    if (isSignalInternalNoise(...args)) return;
    try {
        rotateLogsIfNeeded();
        const formatted = util.format(...args);
        const line = `[${getTimestamp()}] [${level.toUpperCase()}] ${formatted}\n`;
        fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch (e) {
        process.stderr.write(`[Logger Write Error]: ${e.message}\n`);
    }
}

// Global hook for automatic capture of all console output
let isHooked = false;

export function initGlobalLogger() {
    if (isHooked) return;
    isHooked = true;

    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = function (...args) {
        if (isSignalInternalNoise(...args)) return;
        writeLog('INFO', ...args);
        originalLog.apply(console, args);
    };

    console.info = function (...args) {
        if (isSignalInternalNoise(...args)) return;
        writeLog('INFO', ...args);
        originalInfo.apply(console, args);
    };

    console.warn = function (...args) {
        if (isSignalInternalNoise(...args)) return;
        writeLog('WARN', ...args);
        originalWarn.apply(console, args);
    };

    console.error = function (...args) {
        if (isSignalInternalNoise(...args)) return;
        writeLog('ERROR', ...args);
        originalError.apply(console, args);
    };

    // Capture uncaught exceptions and unhandled rejections to log file
    process.on('uncaughtException', (err) => {
        writeLog('FATAL', `[Uncaught Exception]: ${err?.stack || err?.message || err}`);
    });

    process.on('unhandledRejection', (reason) => {
        writeLog('FATAL', `[Unhandled Rejection]: ${reason?.stack || reason?.message || reason}`);
    });

    writeLog('SYSTEM', '=======================================================');
    writeLog('SYSTEM', 'WhatsApp CRM Automation Engine Logger Initialized');
    writeLog('SYSTEM', `Log File: ${LOG_FILE}`);
    writeLog('SYSTEM', '=======================================================');
}

export function getRecentLogs(lines = 200) {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const allLines = content.split('\n').filter(Boolean);
        return allLines.slice(-lines);
    } catch (e) {
        return [`[Logger Error]: Failed to read log file: ${e.message}`];
    }
}

export function getLogFilePath() {
    return LOG_FILE;
}

export function clearAllLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            fs.writeFileSync(LOG_FILE, '', 'utf8');
        }
        const b1 = path.join(LOGS_DIR, 'crm_activity.log.1');
        const b2 = path.join(LOGS_DIR, 'crm_activity.log.2');
        if (fs.existsSync(b1)) { try { fs.unlinkSync(b1); } catch (_) {} }
        if (fs.existsSync(b2)) { try { fs.unlinkSync(b2); } catch (_) {} }

        writeLog('SYSTEM', '=======================================================');
        writeLog('SYSTEM', 'WhatsApp CRM Automation Engine Factory Reset Complete');
        writeLog('SYSTEM', 'Application reset to clean, brand new initial state.');
        writeLog('SYSTEM', '=======================================================');
    } catch (_) {}
}

export default {
    initGlobalLogger,
    writeLog,
    getRecentLogs,
    getLogFilePath,
    clearAllLogs
};
