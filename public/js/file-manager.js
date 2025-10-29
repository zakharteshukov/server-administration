/* ==========================================
   FILE MANAGER FUNCTIONALITY
   ========================================== */

import { authenticatedFetch } from './api.js';

let currentPath = '/host/home/arch';

/**
 * Load file manager data
 */
export async function loadFileManager() {
    try {
        const response = await authenticatedFetch(`/api/files?path=${encodeURIComponent(currentPath)}`);
        const data = await response.json();
        updateFileManager(data);
    } catch (error) {
        console.error('Error loading file manager:', error);
        const container = document.getElementById('file-manager-list');
        container.innerHTML = `<div style="padding: 2%; text-align: center; color: #ff6666;">Error loading files</div>`;
    }
}

/**
 * Update file manager display
 * @param {object} data - File manager data
 */
function updateFileManager(data) {
    const container = document.getElementById('file-manager-list');
    const pathInput = document.getElementById('file-manager-path');
    if (pathInput) {
        pathInput.value = data.path;
    }
    
    if (data.files.length === 0) {
        container.innerHTML = '<div style="padding: 2%; text-align: center; color: #666666;">Directory is empty</div>';
        return;
    }
    
    const header = `
        <div class="file-header">
            <div>Type</div>
            <div>Name</div>
            <div>Size</div>
            <div>Type</div>
            <div>Owner</div>
            <div>Modified</div>
        </div>
    `;
    
    const items = data.files.map(file => {
        const icon = file.type === 'directory' ? '📁' : '📄';
        const escapedPath = (file.path || '').replace(/'/g, "\\'");
        const escapedType = (file.type || '').replace(/'/g, "\\'");
        return `
            <div class="file-item" onclick="window.fileManagerManager.navigateFile('${escapedPath}', '${escapedType}')">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${file.name || ''}</div>
                <div class="file-size">${file.size || ''}</div>
                <div class="file-type">${file.type || ''}</div>
                <div class="file-owner">${file.owner || ''}</div>
                <div class="file-modified">${file.modified || ''}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = header + items;
}

/**
 * Navigate to a file or directory
 * @param {string} filePath - Path to navigate to
 * @param {string} type - Type (directory or file)
 */
export function navigateFile(filePath, type) {
    if (type === 'directory') {
        currentPath = filePath;
        loadFileManager();
    }
}

/**
 * Navigate up one directory
 */
export function fileManagerNavigateUp() {
    const path = currentPath.split('/').slice(0, -1).join('/') || '/host';
    currentPath = path;
    loadFileManager();
}

/**
 * Refresh file manager
 */
export function fileManagerRefresh() {
    loadFileManager();
}

/**
 * Handle path input
 * @param {Event} event - Keyboard event
 */
export function handlePathInput(event) {
    if (event.key === 'Enter') {
        const path = event.target.value;
        if (path) {
            currentPath = path;
            loadFileManager();
        }
    }
}

/**
 * Initialize file manager
 * @param {number} interval - Update interval in milliseconds (default: 30000)
 */
export function initializeFileManager(interval = 30000) {
    // Load initial data
    loadFileManager();
    
    // Set up periodic updates
    setInterval(loadFileManager, interval);
    
    // Expose functions globally for onclick handlers
    window.fileManagerManager = {
        navigateFile: navigateFile,
        fileManagerNavigateUp: fileManagerNavigateUp,
        fileManagerRefresh: fileManagerRefresh,
        handlePathInput: handlePathInput
    };
    
    // Make functions available globally
    window.fileManagerNavigateUp = fileManagerNavigateUp;
    window.fileManagerRefresh = fileManagerRefresh;
    window.handlePathInput = handlePathInput;
    window.navigateFile = navigateFile;
}

