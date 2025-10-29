/* ==========================================
   CONTAINER PORT MAPPINGS CONFIGURATION
   ========================================== */

// Port mapping for docker containers
export const containerPortMapping = {
    'code-server': '8080',
    'grafana': '3030',
    'node-exporter': '9100',
    'cadvisor': '8081',
    'prometheus': '9090',
    'system-monitor': null,
    'OBFUSCATION': '3002',
    'frc10951-website': '3001',
    'pihole': '81',
    'autoheal': null,
    'ollama': '11434',
    'jellyfin': '8096'
};

// Server IP address for access URLs
export const SERVER_IP = '72.60.209.207';

// Update intervals (in milliseconds)
export const UPDATE_INTERVALS = {
    SYSTEM: 5000,      // Update system data every 5 seconds
    DOCKER: 10000,     // Update Docker data every 10 seconds
    SECURITY: 15000    // Update security data every 15 seconds
};


