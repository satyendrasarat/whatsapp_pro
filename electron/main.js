import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;

function startBackendServer() {
    const serverScript = path.join(__dirname, '..', 'server', 'index.js');
    serverProcess = fork(serverScript, [], {
        env: { ...process.env, PORT: '3001' },
        stdio: 'inherit'
    });

    serverProcess.on('error', (err) => {
        console.error('Failed to start backend server subprocess:', err);
    });

    serverProcess.on('exit', (code, signal) => {
        console.log(`Backend server exited with code ${code} and signal ${signal}`);
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

    const isDev = process.env.NODE_ENV !== 'production';
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

app.whenReady().then(() => {
    // Start backend server if not running externally
    startBackendServer();
    createWindow();

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

