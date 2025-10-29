/* ==========================================
   SYSTEM MONITORING
   ========================================== */

import { formatBytes, formatUptime } from './utils.js';
import { loadSystemData } from './api.js';

/**
 * Update system information display
 * @param {object} data - System data from API
 */
export function updateSystemDisplay(data) {
    document.getElementById('os-info').textContent = `${data.osInfo.distro} ${data.osInfo.release}`;
    document.getElementById('hostname').textContent = data.osInfo.hostname;

    // Format uptime
    const uptimeFormatted = formatUptime(data.osInfo.uptime);
    document.getElementById('uptime').textContent = uptimeFormatted;

    // Memory info
    const memUsed = formatBytes(data.memory.used);
    const memTotal = formatBytes(data.memory.total);
    const memFree = formatBytes(data.memory.total - data.memory.used);
    const memPercent = ((data.memory.used / data.memory.total) * 100).toFixed(1);

    document.getElementById('memory-used').textContent = memUsed;
    document.getElementById('memory-total').textContent = memTotal;
    document.getElementById('memory-free').textContent = memFree;
    document.getElementById('memory-progress').style.width = memPercent + '%';

    // Disk info
    if (data.disk.length > 0) {
        const disk = data.disk[0];
        const diskUsed = formatBytes(disk.used);
        const diskTotal = formatBytes(disk.size);
        const diskFree = formatBytes(disk.available);
        const diskPercent = ((disk.used / disk.size) * 100).toFixed(1);

        document.getElementById('disk-used').textContent = diskUsed;
        document.getElementById('disk-total').textContent = diskTotal;
        document.getElementById('disk-free').textContent = diskFree;
        document.getElementById('disk-progress').style.width = diskPercent + '%';
    }
}

/**
 * Handle real-time system updates from WebSocket
 * @param {object} data - System update data
 */
export function handleSystemUpdate(data) {
    try {
        // CPU usage - backend sends load.currentload (lowercase)
        if (data && data.load && data.load.currentload !== undefined) {
            const cpuPercent = parseFloat(data.load.currentload).toFixed(1);
            document.getElementById('cpu-usage').textContent = cpuPercent + '%';
            document.getElementById('cpu-progress').style.width = cpuPercent + '%';
        }

        // Load average - backend sends load.currentload_user
        if (data && data.load && data.load.currentload_user !== undefined) {
            const loadAvg = parseFloat(data.load.currentload_user).toFixed(2);
            document.getElementById('load-average').textContent = loadAvg;
        }

        // Memory usage - backend sends memory.total, memory.used, memory.free
        if (data && data.memory) {
            if (data.memory.used !== undefined && data.memory.total !== undefined) {
                const memPercent = ((data.memory.used / data.memory.total) * 100).toFixed(1);
                document.getElementById('memory-progress').style.width = memPercent + '%';

                // Update memory used
                const memUsed = formatBytes(data.memory.used);
                document.getElementById('memory-used').textContent = memUsed;

                // Calculate and update memory free as total - used
                const memFree = formatBytes(data.memory.total - data.memory.used);
                document.getElementById('memory-free').textContent = memFree;

                // Update memory total
                const memTotal = formatBytes(data.memory.total);
                document.getElementById('memory-total').textContent = memTotal;
            }
        }

        // Update uptime - backend sends uptime in seconds
        if (data && data.uptime !== undefined) {
            const uptimeFormatted = formatUptime(data.uptime);
            document.getElementById('uptime').textContent = uptimeFormatted;
        }
    } catch (error) {
        console.error('Error processing system update:', error);
    }
}

/**
 * Load and update system data
 */
export async function loadAndUpdateSystemData() {
    try {
        const data = await loadSystemData();
        updateSystemDisplay(data);
    } catch (error) {
        console.error('Error loading system data:', error);
    }
}

/**
 * Initialize system monitoring with periodic updates
 * @param {object} socket - Socket.IO instance
 * @param {number} interval - Update interval in milliseconds (default: 5000)
 */
export function initializeSystemMonitoring(socket, interval = 5000) {
    // Load initial data
    loadAndUpdateSystemData();

    // Set up periodic updates
    setInterval(loadAndUpdateSystemData, interval);

    // Set up real-time WebSocket updates
    socket.on('system:update', handleSystemUpdate);
}


