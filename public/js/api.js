/* ==========================================
   API UTILITIES
   ========================================== */

import { getAuthToken, logout } from './utils.js';

/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authenticatedFetch(endpoint, options = {}) {
    const token = getAuthToken();
    
    if (!token) {
        window.location.href = '/login';
        return Promise.reject(new Error('Not authenticated'));
    }
    
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    const response = await fetch(endpoint, {
        ...options,
        ...defaultOptions,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    });
    
    if (response.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.href = '/login';
        return Promise.reject(new Error('Authentication failed'));
    }
    
    return response;
}

/**
 * Load system data from API
 * @returns {Promise<object>} System data
 */
export async function loadSystemData() {
    try {
        const response = await authenticatedFetch('/api/system');
        return await response.json();
    } catch (error) {
        console.error('Error loading system data:', error);
        throw error;
    }
}

/**
 * Load Docker containers data from API
 * @returns {Promise<object>} Docker data
 */
export async function loadDockerData() {
    try {
        const response = await authenticatedFetch('/api/docker');
        return await response.json();
    } catch (error) {
        console.error('Error loading Docker data:', error);
        throw error;
    }
}

/**
 * Load system services data from API
 * @returns {Promise<object>} Services data
 */
export async function loadServicesData() {
    try {
        const response = await authenticatedFetch('/api/services');
        return await response.json();
    } catch (error) {
        console.error('Error loading services data:', error);
        throw error;
    }
}

/**
 * Control Docker container
 * @param {string} containerName - Container name
 * @param {string} action - Action (start/stop)
 * @param {string} password - Password for action
 * @returns {Promise<object>} Response data
 */
export async function controlContainer(containerName, action, password) {
    const response = await authenticatedFetch(`/api/docker/${action}`, {
        method: 'POST',
        body: JSON.stringify({
            container: containerName,
            password: password
        })
    });
    return await response.json();
}

/**
 * Control system service
 * @param {string} serviceName - Service name
 * @param {string} action - Action (start/stop/restart)
 * @param {string} password - Password for action
 * @returns {Promise<object>} Response data
 */
export async function controlService(serviceName, action, password) {
    const response = await authenticatedFetch(`/api/services/${action}`, {
        method: 'POST',
        body: JSON.stringify({
            service: serviceName,
            password: password
        })
    });
    
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Shutdown server
 * @param {string} password - Password for shutdown
 * @returns {Promise<object>} Response data
 */
export async function shutdownServer(password) {
    const response = await authenticatedFetch('/api/shutdown', {
        method: 'POST',
        body: JSON.stringify({ password: password })
    });
    return await response.json();
}

/**
 * Reboot server
 * @param {string} password - Password for reboot
 * @returns {Promise<object>} Response data
 */
export async function rebootServer(password) {
    const response = await authenticatedFetch('/api/reboot', {
        method: 'POST',
        body: JSON.stringify({ password: password })
    });
    return await response.json();
}


