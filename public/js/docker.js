/* ==========================================
   DOCKER CONTAINER MANAGEMENT
   ========================================== */

import { loadDockerData, controlContainer } from './api.js';
import { containerPortMapping, SERVER_IP } from '../config/container-ports.js';

/**
 * Update Docker containers display
 * @param {Array} containers - Array of container objects
 */
export function updateDockerContainers(containers) {
    const container = document.getElementById('docker-containers');

    if (containers.length === 0) {
        container.innerHTML = '<div style="padding: 2%; text-align: center; color: #666666;">No Docker containers found</div>';
        return;
    }

    // Create header
    const header = document.createElement('div');
    header.className = 'docker-header';
    header.innerHTML = `
        <div>Name</div>
        <div>Image</div>
        <div>Uptime</div>
        <div>Access</div>
        <div>Controls</div>
    `;

    // Create container rows
    const containerRows = containers.map(container => {
        // Show uptime if running, "Inactive" if stopped
        const uptimeDisplay = container.status.includes('Up') ? container.uptime : 'Inactive';

        // Get port for this container
        const port = containerPortMapping[container.name] || null;

        // Format access information with http link and docker exec command
        let accessDisplay = '';
        if (port) {
            accessDisplay = `http://${SERVER_IP}:${port}<br>docker exec -it ${container.name} bash`;
        } else {
            accessDisplay = `docker exec -it ${container.name} bash`;
        }

        // Determine which button to show based on status
        const isRunning = container.status.includes('Up');
        const buttonClass = isRunning ? 'stop' : 'start';
        const buttonText = isRunning ? 'Stop' : 'Start';
        const buttonAction = isRunning ? 'stop' : 'start';

        return `
            <div class="docker-container">
                <div class="docker-name">${container.name}</div>
                <div class="docker-image">${container.image}</div>
                <div class="docker-uptime">${uptimeDisplay}</div>
                <div class="docker-access">${accessDisplay}</div>
                <div class="docker-controls">
                    <button class="docker-btn ${buttonClass}" onclick="window.dockerManager.controlContainer('${container.name}', '${buttonAction}')">${buttonText}</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = header.outerHTML + containerRows;
}

/**
 * Load and update Docker containers
 */
export async function loadAndUpdateDockerData() {
    try {
        const data = await loadDockerData();

        // Update summary metrics
        document.getElementById('total-containers').textContent = data.totalContainers;
        document.getElementById('running-containers').textContent = data.runningContainers;
        document.getElementById('stopped-containers').textContent = data.stoppedContainers;

        // Update containers list
        updateDockerContainers(data.containers);
    } catch (error) {
        console.error('Error loading Docker data:', error);
    }
}

/**
 * Control container (start/stop)
 * @param {string} containerName - Container name
 * @param {string} action - Action (start/stop)
 */
export async function handleContainerControl(containerName, action) {
    const password = prompt(`Enter password to ${action} container '${containerName}':`);
    if (password === null) return; // User cancelled

    try {
        const data = await controlContainer(containerName, action, password);
        if (data.status === 'success') {
            alert(`Container '${containerName}' ${action} initiated successfully.`);
            // Refresh Docker data after a short delay
            setTimeout(loadAndUpdateDockerData, 2000);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert(`Failed to ${action} container.`);
    }
}

/**
 * Initialize Docker monitoring with periodic updates
 * @param {number} interval - Update interval in milliseconds (default: 10000)
 */
export function initializeDockerMonitoring(interval = 10000) {
    // Load initial data
    loadAndUpdateDockerData();

    // Set up periodic updates
    setInterval(loadAndUpdateDockerData, interval);

    // Expose control function globally for onclick handlers
    window.dockerManager = {
        controlContainer: handleContainerControl
    };
}


