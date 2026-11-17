import { api } from '../services/api';

/**
 * Universal file picker that works seamlessly in Electron and Browser.
 * In Electron, opens the native OS File Dialog and returns the absolute disk path.
 * In Browser / Web, falls back to an HTML file input and uploads to the server to get an absolute disk path.
 */
export async function pickAttachmentFile(options = {}) {
  // 1. If running in Electron, use native showOpenDialog
  if (window.electronAPI?.openFileDialog) {
    try {
      const selectedPath = await window.electronAPI.openFileDialog(options);
      if (selectedPath) {
        return {
          filePath: selectedPath,
          fileName: selectedPath.split(/[/\\]/).pop()
        };
      }
      return null;
    } catch (e) {
      console.warn('Native openFileDialog failed, falling back to input:', e);
    }
  }

  // 2. Fallback: prompt via HTML input element
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      try {
        document.body.removeChild(input);
      } catch (_) {}

      if (!file) {
        resolve(null);
        return;
      }

      // Check if Electron webUtils returned path
      if (window.electronAPI?.getPathForFile) {
        try {
          const diskPath = window.electronAPI.getPathForFile(file);
          if (diskPath && (diskPath.includes('/') || diskPath.includes('\\'))) {
            resolve({
              filePath: diskPath,
              fileName: file.name
            });
            return;
          }
        } catch (err) {
          console.warn('getPathForFile failed:', err);
        }
      }

      // If file.path is available and contains path separator
      if (file.path && (file.path.includes('/') || file.path.includes('\\'))) {
        resolve({
          filePath: file.path,
          fileName: file.name
        });
        return;
      }

      // 3. Otherwise upload file to local server to get real local file path
      try {
        const uploadRes = await api.uploadFile(file);
        if (uploadRes?.filePath) {
          resolve({
            filePath: uploadRes.filePath,
            fileName: file.name
          });
          return;
        }
      } catch (uploadErr) {
        console.error('File upload failed:', uploadErr);
        resolve({
          filePath: file.name,
          fileName: file.name
        });
      }
    };

    input.oncancel = () => {
      try {
        document.body.removeChild(input);
      } catch (_) {}
      resolve(null);
    };

    input.click();
  });
}
