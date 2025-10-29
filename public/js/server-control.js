/* ==========================================
   SERVER CONTROL FUNCTIONS
   ========================================== */

import { shutdownServer, rebootServer } from './api.js';
import { logout } from './utils.js';

/**
 * Handle server shutdown
 */
export async function handleShutdown() {
    const password = prompt('Enter password to shutdown server:');
    if (password === null) return; // User cancelled

    try {
        const data = await shutdownServer(password);
        if (data.status === 'success') {
            alert('Server shutdown initiated successfully.');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to initiate shutdown.');
    }
}

/**
 * Handle server reboot
 */
export async function handleReboot() {
    const password = prompt('Enter password to reboot server:');
    if (password === null) return; // User cancelled

    try {
        const data = await rebootServer(password);
        if (data.status === 'success') {
            alert('Server reboot initiated successfully.');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to initiate reboot.');
    }
}

/**
 * Expose server control functions globally for onclick handlers
 */
export function initializeServerControls() {
    window.shutdownServer = handleShutdown;
    window.rebootServer = handleReboot;
    window.logout = logout;
}


