import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;

const isPackaged = app.isPackaged;
const isDev = !isPackaged && process.env.NODE_ENV !== 'production';

// User Data isolation:
// In dev: data is kept inside the local repository (d:\crmnewsarat - Copy)
// In production (.exe): data is kept safely in Windows %APPDATA%\whatsapp-crm-automation
const userDataDir = isDev ? path.join(__dirname, '..') : app.getPath('userData');

function checkServerListening(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1200, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function resolveServerScript() {
    if (isPackaged) {
        const unpackedScript = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'index.js');
        if (fs.existsSync(unpackedScript)) {
            return unpackedScript;
        }
        return path.join(process.resourcesPath, 'app', 'server', 'index.js');
    }
    return path.join(__dirname, '..', 'server', 'index.js');
}

async function startBackendServer() {
    // If running in development and an external dev server is already running, avoid duplicate fork
    if (isDev) {
        const alreadyRunning = await checkServerListening(3001);
        if (alreadyRunning) {
            console.log('[Electron] External backend server already running on port 3001.');
            return;
        }
    }

    const serverScript = resolveServerScript();
    console.log(`[Electron] Starting backend server process from: ${serverScript}`);

    serverProcess = fork(serverScript, [], {
        env: {
            ...process.env,
            PORT: '3001',
            CRM_USER_DATA_DIR: userDataDir,
            IS_ELECTRON: 'true',
            APP_VERSION: app.getVersion(),
            ELECTRON_RUN_AS_NODE: '1'
        },
        stdio: 'inherit'
    });

    serverProcess.on('error', (err) => {
        console.error('[Electron] Backend server process error:', err);
    });

    serverProcess.on('exit', (code, signal) => {
        console.log(`[Electron] Backend server exited with code ${code} and signal ${signal}`);
    });
}

function setupAutoUpdater() {
    if (!isPackaged) {
        console.log('[AutoUpdater] Development mode detected; auto-updater is paused.');
        return;
    }

    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates on GitHub Releases...');
        mainWindow?.webContents.send('update-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update found:', info.version);
        mainWindow?.webContents.send('update-status', {
            status: 'available',
            version: info.version,
            releaseDate: info.releaseDate
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('[AutoUpdater] App is up to date.');
        mainWindow?.webContents.send('update-status', {
            status: 'up-to-date',
            version: info.version
        });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow?.webContents.send('update-status', {
            status: 'downloading',
            percent: Math.round(progressObj.percent),
            bytesPerSecond: progressObj.bytesPerSecond,
            transferred: progressObj.transferred,
            total: progressObj.total
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded successfully:', info.version);
        mainWindow?.webContents.send('update-status', {
            status: 'downloaded',
            version: info.version
        });
    });

    autoUpdater.on('error', (err) => {
        console.warn('[AutoUpdater] Background update check error (non-fatal):', err.message);
        mainWindow?.webContents.send('update-status', {
            status: 'error',
            message: err.message
        });
    });

    // Check for updates 8 seconds after app boot
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            console.warn('[AutoUpdater] Initial check error:', err.message);
        });
    }, 8000);

    // Periodic check every 4 hours
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4 * 60 * 60 * 1000);
}

function registerIpcHandlers() {
    ipcMain.handle('check-for-updates', async () => {
        if (!isPackaged) {
            return { isDev: true, message: 'Running in development mode (updates disabled).' };
        }
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, versionInfo: result?.updateInfo };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('quit-and-install', () => {
        if (isPackaged) {
            autoUpdater.quitAndInstall();
        }
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1100,
        minHeight: 700,
        backgroundColor: '#0f172a',
        title: 'WhatsApp Automation & CRM Platform',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Remove default top menu for a modern app feel
    mainWindow.setMenuBarVisibility(false);

    const devUrl = 'http://localhost:5173';

    if (isDev) {
        mainWindow.loadURL(devUrl).catch(() => {
            console.log('Vite server not yet ready, will retry in 2 seconds...');
            setTimeout(() => mainWindow.loadURL(devUrl), 2000);
        });
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    registerIpcHandlers();
    await startBackendServer();
    createWindow();
    setupAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});
