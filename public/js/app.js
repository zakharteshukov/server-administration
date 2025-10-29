/* ==========================================
   MAIN APPLICATION INITIALIZATION
   ========================================== */

import { isAuthenticated } from './utils.js';
import { TerminalManager } from './terminal.js';
import { initializeSystemMonitoring } from './system.js';
import { initializeDockerMonitoring } from './docker.js';
import { initializeServicesMonitoring } from './services.js';
import { initializeServerControls } from './server-control.js';
import { UPDATE_INTERVALS } from '../config/container-ports.js';

/**
 * Initialize the application
 * @param {object} socket - Socket.IO instance
 */
export function initializeApp(socket) {
    // Initialize terminal manager
    const terminalManager = new TerminalManager(socket);
    terminalManager.initialize();
    window.terminalManager = terminalManager;
    window.createNewTerminal = () => terminalManager.createNewTerminal();
    window.enterFullscreenTerminal = () => terminalManager.enterFullscreenTerminal();

    // Initialize system monitoring
    initializeSystemMonitoring(socket, UPDATE_INTERVALS.SYSTEM);

    // Initialize Docker monitoring
    initializeDockerMonitoring(UPDATE_INTERVALS.DOCKER);

    // Initialize services monitoring
    initializeServicesMonitoring(UPDATE_INTERVALS.SERVICES);

    // Initialize server controls
    initializeServerControls();
}

/**
 * Main entry point - called on page load
 */
export function main() {
    // Check authentication on page load
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Initialize Socket.IO connection with authentication
    const token = localStorage.getItem('adminToken');
    const socket = io({
        auth: {
            token: token
        }
    });

    // Handle authentication errors
    socket.on('connect_error', (error) => {
        if (error.message === 'Authentication failed') {
            localStorage.removeItem('adminToken');
            window.location.href = '/login';
        }
    });

    // Initialize app once socket is connected
    socket.on('connect', () => {
        initializeApp(socket);
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}


