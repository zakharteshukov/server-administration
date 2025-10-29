/* ==========================================
   SECURITY DASHBOARD MANAGEMENT
   ========================================== */

import { authenticatedFetch } from './api.js';

let currentSecurityTab = 'ssh';

/**
 * Load security data for a specific tab
 * @param {string} tab - Tab name (ssh, openvpn, connections)
 */
export async function loadSecurityData(tab) {
    try {
        const container = document.getElementById('security-content');
        container.innerHTML = '<div style="padding: 2%; text-align: center; color: #888888;">Loading...</div>';
        
        let endpoint = '';
        if (tab === 'ssh') {
            endpoint = '/api/security/ssh';
        } else if (tab === 'openvpn') {
            endpoint = '/api/security/openvpn';
        } else if (tab === 'connections') {
            endpoint = '/api/security/connections';
        }
        
        const response = await authenticatedFetch(endpoint);
        const data = await response.json();
        
        updateSecurityDisplay(tab, data);
        
    } catch (error) {
        console.error('Error loading security data:', error);
        const container = document.getElementById('security-content');
        container.innerHTML = `<div style="padding: 2%; text-align: center; color: #ff6666;">Error: ${error.message}</div>`;
    }
}

/**
 * Update security display
 * @param {string} tab - Tab name
 * @param {object} data - Security data
 */
function updateSecurityDisplay(tab, data) {
    const container = document.getElementById('security-content');
    
    if (tab === 'ssh') {
        if (!data.sessions || data.sessions.length === 0) {
            container.innerHTML = '<div style="padding: 2%; text-align: center; color: #666666;">No active SSH sessions</div>';
            return;
        }
        
        const header = `
            <div class="security-header">
                <div>User</div>
                <div>IP Address</div>
                <div>Duration</div>
                <div>Actions</div>
            </div>
        `;
        
        const items = data.sessions.map(session => `
            <div class="security-item">
                <div class="security-value">${session.user}</div>
                <div class="security-value">${session.ip}</div>
                <div class="security-value">${session.sessionDuration}</div>
                <div>
                    <button class="security-terminate-btn" onclick="window.securityManager.terminateSSHSession('${session.user}', '${session.tty}')">Terminate</button>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = header + items;
        
    } else if (tab === 'openvpn') {
        if (!data.clients || data.clients.length === 0) {
            container.innerHTML = '<div style="padding: 2%; text-align: center; color: #666666;">No active OpenVPN clients</div>';
            return;
        }
        
        const header = `
            <div class="security-header">
                <div>Client</div>
                <div>IP Address</div>
                <div>Duration</div>
                <div>Actions</div>
            </div>
        `;
        
        const items = data.clients.map(client => {
            const clientName = client.clientName || 'Unknown';
            const ip = client.ip || 'Unknown';
            const duration = client.duration || 'Unknown';
            
            return `
                <div class="security-item">
                    <div class="security-value">${clientName}</div>
                    <div class="security-value">${ip}</div>
                    <div class="security-value">${duration}</div>
                    <div style="color: #888; font-size: 11px;">View only</div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = header + items;
        
    } else if (tab === 'connections') {
        if (data.connections.length === 0) {
            container.innerHTML = '<div style="padding: 2%; text-align: center; color: #666666;">No active connections</div>';
            return;
        }
        
        const header = `
            <div class="security-header">
                <div>Description</div>
                <div>Local</div>
                <div>Peer</div>
                <div>State</div>
            </div>
        `;
        
        const items = data.connections.map(conn => `
            <div class="security-item">
                <div class="security-value">${conn.description || 'Unknown'}</div>
                <div class="security-value">${conn.local}</div>
                <div class="security-value">${conn.peer || 'N/A'}</div>
                <div class="security-value">${conn.state}</div>
            </div>
        `).join('');
        
        container.innerHTML = header + items;
    }
}

/**
 * Switch security tab
 * @param {string} tab - Tab name
 */
export function switchSecurityTab(tab) {
    currentSecurityTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.security-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: activate the button with matching onclick attribute
        document.querySelectorAll('.security-tab').forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${tab}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    loadSecurityData(tab);
}

/**
 * Terminate SSH session
 * @param {string} user - Username
 * @param {string} tty - TTY name
 */
export async function terminateSSHSession(user, tty) {
    if (!confirm(`Terminate SSH session for user '${user}' on ${tty}?`)) {
        return;
    }
    
    const password = prompt('Enter password to terminate SSH session:');
    if (password === null) return;
    
    try {
        const response = await authenticatedFetch('/api/security/ssh/terminate', {
            method: 'POST',
            body: JSON.stringify({ user, tty, password })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            alert('SSH session terminated successfully.');
            loadSecurityData('ssh');
        } else {
            alert('Error: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to terminate SSH session.');
    }
}

/**
 * Initialize security monitoring
 * @param {number} interval - Update interval in milliseconds (default: 15000)
 */
export function initializeSecurityMonitoring(interval = 15000) {
    // Load initial data
    loadSecurityData(currentSecurityTab);
    
    // Set up periodic updates
    setInterval(() => loadSecurityData(currentSecurityTab), interval);
    
    // Expose functions globally for onclick handlers
    window.securityManager = {
        switchSecurityTab: switchSecurityTab,
        terminateSSHSession: terminateSSHSession
    };
    
    // Make switchSecurityTab available globally
    window.switchSecurityTab = switchSecurityTab;
}

