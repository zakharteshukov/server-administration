/* ==========================================
   SYSTEM SERVICES MANAGEMENT
   ========================================== */

import { loadServicesData, controlService } from './api.js';

/**
 * Update services list display
 * @param {Array} services - Array of service objects
 */
export function updateServicesList(services) {
    const container = document.getElementById('services-list');

    // Filter out services that are just bullet points or have no proper name
    const filteredServices = services.filter(service => {
        if (!service.name || service.name.trim() === '') return false;

        // Remove services with special characters or dots as the name
        const cleanName = service.name.trim();
        if (cleanName === '●' || cleanName === '•' || cleanName === '.' || cleanName === '·') return false;
        if (cleanName.startsWith('●') || cleanName.startsWith('•') || cleanName.startsWith('·')) return false;
        if (cleanName.length < 2) return false;
        if (cleanName === 'UNIT' || cleanName === 'LOAD' || cleanName === 'ACTIVE' || cleanName === 'SUB') return false;

        // Additional filtering for minimalistic display
        // Exclude some system-level services for cleaner view
        const excludedPatterns = [
            /^systemd/,
            /^dbus\.org/,
            /^user@\d+/,
            /^session-\d+/,
            /^getty@/,
            /^systemd-logind/,
            /^systemd-networkd/,
            /^systemd-resolved/,
            /^dev-/
        ];

        for (const pattern of excludedPatterns) {
            if (pattern.test(cleanName)) {
                return false;
            }
        }

        return true;
    });

    if (filteredServices.length === 0) {
        container.innerHTML = '<div style="padding: 2%; text-align: center; color: #666666;">No system services found</div>';
        return;
    }

    // Sort services: active first, then inactive
    filteredServices.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return a.name.localeCompare(b.name); // Alphabetical within each group
    });

    // Create header
    const header = document.createElement('div');
    header.className = 'service-header';
    header.innerHTML = `
        <div>Service</div>
        <div>Controls</div>
    `;

    // Create service rows
    const serviceRows = filteredServices.map(service => {
        const isActive = service.status === 'active';

        // Escape service name for use in onclick attribute
        const escapedServiceName = service.name.replace(/'/g, "\\'");

        // Determine which buttons to show based on status
        let buttons = '';
        if (isActive) {
            buttons = `
                <button class="service-btn stop" onclick="window.servicesManager.controlService('${escapedServiceName}', 'stop')">Stop</button>
                <button class="service-btn restart" onclick="window.servicesManager.controlService('${escapedServiceName}', 'restart')">Restart</button>
            `;
        } else {
            buttons = `
                <button class="service-btn start" onclick="window.servicesManager.controlService('${escapedServiceName}', 'start')">Start</button>
            `;
        }

        // Format uptime display
        let uptimeDisplay = service.uptime;
        if (service.status === 'active' && service.uptime === 'Running') {
            uptimeDisplay = 'Active';
        } else if (service.status === 'inactive') {
            uptimeDisplay = 'Inactive';
        }

        const description = service.description ? `<div class="service-description">${service.description}</div>` : '';

        return `
            <div class="service-item">
                <div class="service-name-container">
                    <div class="service-name">${service.name}</div>
                    ${description}
                </div>
                <div class="service-controls">
                    ${buttons}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = header.outerHTML + serviceRows;
}

/**
 * Load and update system services
 */
export async function loadAndUpdateServicesData() {
    try {
        const data = await loadServicesData();

        // Update summary metrics
        document.getElementById('total-services').textContent = data.totalServices;
        document.getElementById('active-services').textContent = data.activeServices;
        document.getElementById('inactive-services').textContent = data.inactiveServices;

        // Update services list
        updateServicesList(data.services);
    } catch (error) {
        console.error('Error loading services data:', error);
    }
}

/**
 * Control service (start/stop/restart)
 * @param {string} serviceName - Service name
 * @param {string} action - Action (start/stop/restart)
 */
export async function handleServiceControl(serviceName, action) {
    const password = prompt(`Enter password to ${action} service '${serviceName}':`);
    if (password === null) return; // User cancelled

    try {
        const data = await controlService(serviceName, action, password);
        if (data.status === 'success') {
            alert(`Service '${serviceName}' ${action} initiated successfully.`);
            // Refresh services data after a short delay
            setTimeout(loadAndUpdateServicesData, 2000);
        } else {
            alert('Error: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert(`Failed to ${action} service.`);
    }
}

/**
 * Initialize services monitoring with periodic updates
 * @param {number} interval - Update interval in milliseconds (default: 15000)
 */
export function initializeServicesMonitoring(interval = 15000) {
    // Load initial data
    loadAndUpdateServicesData();

    // Set up periodic updates
    setInterval(loadAndUpdateServicesData, interval);

    // Expose control function globally for onclick handlers
    window.servicesManager = {
        controlService: handleServiceControl
    };
}


