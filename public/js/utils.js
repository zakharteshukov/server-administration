/* ==========================================
   UTILITY FUNCTIONS
   ========================================== */

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format uptime in seconds to human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted string (e.g., "5d 12h 30m")
 */
export function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists
 */
export function isAuthenticated() {
    return !!localStorage.getItem('adminToken');
}

/**
 * Get authentication token
 * @returns {string|null} Token or null
 */
export function getAuthToken() {
    return localStorage.getItem('adminToken');
}

/**
 * Remove authentication token and redirect to login
 */
export function logout() {
    const token = getAuthToken();
    if (token) {
        fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }).catch(error => {
            console.error('Logout error:', error);
        });
    }
    localStorage.removeItem('adminToken');
    window.location.href = '/login';
}


