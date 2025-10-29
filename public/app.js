// ==========================================
// GLOBAL VARIABLES & CONFIGURATION
// ==========================================
let currentPath = '/host/home/arch';
let currentSecurityTab = 'ssh';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// Check authentication on page load
window.addEventListener('load', function() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = '/login';
        return;
    }
    
    // Initialize Socket.IO connection with authentication
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
    
    initializeApp(socket);
    
    // Load initial data for file manager and security
    loadFileManager();
    loadSecurityData('ssh');
    
    // Set up periodic updates for file manager and security
    setInterval(loadFileManager, 30000); // Update file manager every 30 seconds
    setInterval(() => loadSecurityData(currentSecurityTab), 15000); // Update security every 15 seconds
});

function initializeApp(socket) {

// Terminal tabs management
let terminals = new Map();
let activeTabId = null;
let tabCounter = 1;
let terminalSessionCounter = 0;

// Create terminal tab
function createTerminalTab() {
    const tabId = `terminal-${tabCounter++}`;
    const tabNumber = tabCounter - 1;
    const sessionId = terminalSessionCounter++;
    
    // Create tab element
    const tabsContainer = document.getElementById('terminal-tabs');
    const tabElement = document.createElement('div');
    tabElement.className = 'terminal-tab active';
    tabElement.id = `tab-${tabId}`;
    tabElement.innerHTML = `
        <span class="tab-title">Terminal ${tabNumber}</span>
        <span class="terminal-tab-close" onclick="closeTab('${tabId}', event)">×</span>
    `;
    tabElement.onclick = (e) => {
        if (e.target.className !== 'terminal-tab-close') {
            switchTab(tabId);
        }
    };
    tabsContainer.appendChild(tabElement);
    
    // Create terminal instance
    const terminalDiv = document.createElement('div');
    terminalDiv.id = tabId;
    terminalDiv.style.display = activeTabId ? 'none' : 'block';
    
    const terminal = new Terminal({
        theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            selection: '#333333'
        },
        fontSize: 13,
        fontFamily: 'Courier New, Monaco, monospace',
        cols: 120,
        rows: 30,
        scrollback: 1000,
        allowTransparency: false,
        cursorBlink: true,
        cursorStyle: 'block'
    });
    
    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    
    document.getElementById('terminal-content').appendChild(terminalDiv);
    terminal.open(document.getElementById(tabId));
    fitAddon.fit();
    
    // Unique session data for this terminal
    let backendSessionConnected = false;
    let backendTerminalId = null;
    
    // Initialize backend session for THIS terminal
    socket.emit('terminal:create', { 
        cols: 120, 
        rows: 30,
        tabId: tabId,
        sessionId: sessionId
    });
    
    // Handle backend response
    socket.once('terminal:created', (data) => {
        if (data && data.tabId === tabId) {
            backendTerminalId = data.backendId || socket.id;
            backendSessionConnected = true;
            terminal.focus();
        }
    });
    
    // Terminal input handler - sends to this terminal's backend session
    terminal.onData(data => {
        if (backendSessionConnected) {
            socket.emit('terminal:input', {
                data: data,
                tabId: tabId,
                sessionId: sessionId
            });
        }
    });
    
    // Store terminal with session info
    terminals.set(tabId, { 
        terminal, 
        fitAddon, 
        tabElement, 
        tabId,
        sessionId: sessionId,
        backendTerminalId: backendTerminalId,
        connected: backendSessionConnected
    });
    
    if (!activeTabId) {
        activeTabId = tabId;
    }
    
    return tabId;
}

// Switch between tabs
window.switchTab = function(tabId) {
    const oldTab = terminals.get(activeTabId);
    const newTab = terminals.get(tabId);
    
    if (oldTab) {
        oldTab.tabElement.classList.remove('active');
        document.getElementById(activeTabId).style.display = 'none';
    }
    
    if (newTab) {
        newTab.tabElement.classList.add('active');
        document.getElementById(tabId).style.display = 'block';
        activeTabId = tabId;
        newTab.terminal.focus();
        
        // Trigger resize for proper rendering
        setTimeout(() => {
            newTab.fitAddon.fit();
            const { cols, rows } = newTab.terminal;
            socket.emit('terminal:resize', { cols, rows });
        }, 100);
    }
};

// Close a tab
window.closeTab = function(tabId, event) {
    event.stopPropagation();
    
    if (terminals.size <= 1) {
        return; // Don't close the last tab
    }
    
    const tab = terminals.get(tabId);
    if (!tab) return;
    
    // If closing active tab, switch to another
    if (activeTabId === tabId) {
        const otherTabs = Array.from(terminals.keys()).filter(id => id !== tabId);
        if (otherTabs.length > 0) {
            switchTab(otherTabs[0]);
        }
    }
    
    // Clean up
    tab.terminal.dispose();
    document.getElementById(tabId).remove();
    tab.tabElement.remove();
    terminals.delete(tabId);
};

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+T to create new tab
    if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        createTerminalTab();
    }
});

// Handle terminal resize for all terminals
window.addEventListener('resize', () => {
    terminals.forEach(({ terminal, fitAddon }) => {
        fitAddon.fit();
        const { cols, rows } = terminal;
        socket.emit('terminal:resize', { cols, rows });
    });
});

// Global function to create new terminal from button
window.createNewTerminal = function() {
    createTerminalTab();
};

// Global function to enter fullscreen terminal
window.enterFullscreenTerminal = function() {
    const token = localStorage.getItem('adminToken');
    if (token) {
        window.location.href = `/terminal-fullscreen?token=${token}`;
    } else {
        alert('Session expired. Please login again.');
        window.location.href = '/login';
    }
};


// Socket.IO event handlers - route data to specific terminals
socket.on('terminal:data', (message) => {
    // message should have tabId to route to correct terminal
    const tabId = message.tabId || activeTabId;
    if (tabId && terminals.has(tabId)) {
        const tab = terminals.get(tabId);
        tab.terminal.write(message.data);
    }
});

socket.on('terminal:created', (data) => {
    // Update the terminal's backend connection status
    const tabId = data.tabId;
    if (tabId && terminals.has(tabId)) {
        const tab = terminals.get(tabId);
        tab.backendTerminalId = data.backendId || socket.id;
        tab.connected = true;
        if (activeTabId === tabId) {
            tab.terminal.focus();
        }
    }
});

socket.on('terminal:exit', (message) => {
    const tabId = message.tabId || activeTabId;
    if (tabId && terminals.has(tabId)) {
        const tab = terminals.get(tabId);
        tab.terminal.write('\r\nTerminal session ended.\r\n');
        tab.connected = false;
    }
});

// Initialize first terminal
createTerminalTab();

// Load initial system data
async function loadSystemData() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/system', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = '/login';
            return;
        }
        
        const data = await response.json();
        
        document.getElementById('os-info').textContent = `${data.osInfo.distro} ${data.osInfo.release}`;
        document.getElementById('hostname').textContent = data.osInfo.hostname;
        
        // Format uptime
        const uptimeFormatted = formatUptime(data.osInfo.uptime);
        document.getElementById('uptime').textContent = uptimeFormatted;
        
        // Memory info
        const memUsed = formatBytes(data.memory.used);
        const memTotal = formatBytes(data.memory.total);
        // Calculate free memory as total - used
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
        
        
    } catch (error) {
        console.error('Error loading system data:', error);
    }
}

// Load Docker containers data
async function loadDockerData() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/docker', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = '/login';
            return;
        }
        
        const data = await response.json();
        
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

// Get access information for a container
function getAccessInfo(containerName, ports) {
    const accessMap = {
        'code-server': {
            web: 'http://192.168.255.1:8080',
            cli: 'docker exec -it code-server bash'
        },
        'jellyfin': {
            web: 'http://192.168.255.1:8096',
            cli: 'docker exec -it jellyfin bash'
        },
        'ollama': {
            web: 'http://192.168.255.1:11434',
            api: 'curl http://localhost:11434/api/tags',
            cli: 'docker exec -it ollama ollama run llama2'
        },
        'pihole': {
            web: 'http://192.168.255.1:81',
            cli: 'docker exec -it pihole bash'
        },
        'openvpn-server': {
            web: 'N/A',
            cli: 'docker exec -it openvpn-server bash'
        },
        'system-monitor': {
            web: 'http://192.168.255.1:3000',
            cli: 'docker exec -it system-monitor bash'
        },
        'FRC10951-SITE': {
            web: 'http://192.168.255.1:3001',
            cli: 'docker exec -it FRC10951-SITE bash'
        },
        'GENERAL-SITE': {
            web: 'http://192.168.255.1:3002',
            cli: 'docker exec -it GENERAL-SITE bash'
        },
        'obsidian-backup-server': {
            web: 'N/A',
            cli: 'docker start obsidian-backup-server'
        }
    };
    
    const accessInfo = accessMap[containerName] || {};
    let result = '<div style="font-size: 11px; line-height: 1.4;">';
    
    // Display web URL if available
    if (accessInfo.web) {
        if (accessInfo.web === 'N/A') {
            result += '<span style="color: #666;">No web access</span>';
        } else {
            result += `<a href="${accessInfo.web}" target="_blank" style="color: #4CAF50; text-decoration: none; word-break: break-all;">${accessInfo.web}</a>`;
        }
    }
    
    // Display CLI command
    if (accessInfo.cli) {
        result += `<br><span style="color: #999; font-family: monospace; font-size: 10px;">${accessInfo.cli}</span>`;
    } else if (accessInfo.api) {
        result += `<br><span style="color: #999; font-family: monospace; font-size: 10px;">${accessInfo.api}</span>`;
    }
    
    // If no specific mapping, show ports
    if (!accessInfo.web && !accessInfo.cli && ports && ports !== 'No ports') {
        result += `<span style="color: #888; font-family: monospace;">${ports.substring(0, 50)}</span>`;
    } else if (!accessInfo.web && !accessInfo.cli) {
        result += '<span style="color: #666;">No access info</span>';
    }
    
    result += '</div>';
    return result;
}

// Update Docker containers display
function updateDockerContainers(containers) {
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
        <div>Access</div>
        <div>Uptime</div>
        <div>Controls</div>
    `;
    
    // Create container rows
    const containerRows = containers.map(container => {
        // Show uptime if running, "Inactive" if stopped
        let uptimeDisplay = container.status.includes('Up') ? container.uptime : 'Inactive';
        // Remove health status from uptime display
        uptimeDisplay = uptimeDisplay.replace(/\s*\(healthy\).*/i, '');
        uptimeDisplay = uptimeDisplay.replace(/\s*\(unhealthy\).*/i, '');
        
        // Determine which buttons to show based on status
        const isRunning = container.status.includes('Up');
        let buttons = '';
        
        if (isRunning) {
            buttons = `
                <button class="docker-btn stop" onclick="controlContainer('${container.name}', 'stop', this)">Stop</button>
                <button class="docker-btn restart" onclick="controlContainer('${container.name}', 'restart', this)">Restart</button>
            `;
        } else {
            buttons = `
                <button class="docker-btn start" onclick="controlContainer('${container.name}', 'start', this)">Start</button>
            `;
        }
        
        // Get access info based on container name/ports
        const accessInfo = getAccessInfo(container.name, container.ports);
        
        return `
            <div class="docker-container">
                <div class="docker-name">${container.name}</div>
                <div class="docker-image">${accessInfo}</div>
                <div class="docker-uptime">${uptimeDisplay}</div>
                <div class="docker-controls">
                    ${buttons}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = header.outerHTML + containerRows;
}

// Real-time updates via WebSocket
socket.on('system:update', (data) => {
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
});

// Load initial data
loadSystemData();
loadDockerData();

// Set up periodic updates
setInterval(loadSystemData, 5000); // Update system data every 5 seconds
setInterval(loadDockerData, 10000); // Update Docker data every 10 seconds
}

// Container control function (global scope)
function controlContainer(containerName, action, btn) {
    const password = prompt(`Enter password to ${action} container '${containerName}':`);
    if (password === null) return; // User cancelled

    // Provide immediate UI feedback
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = action.charAt(0).toUpperCase() + action.slice(1) + '...';
    }

    const token = localStorage.getItem('adminToken');
    fetch(`/api/docker/${action}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            container: containerName,
            password: password
        })
    })
    .then(async (response) => {
        let data = null;
        try { data = await response.json(); } catch (e) {}
        if (!response.ok) {
            throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}`);
        }
        return data;
    })
    .then(data => {
        // Soft notification and refresh
        console.log(`Container '${containerName}' ${action} response:`, data);
        setTimeout(loadDockerData, 2000);
    })
    .catch(error => {
        console.error('Error:', error);
        alert(`Failed to ${action} container '${containerName}': ${error.message || error}`);
    })
    .finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText || btn.textContent;
        }
    });
}

// Server control functions (global scope)
function shutdownServer() {
    const password = prompt('Enter password to shutdown server:');
    if (password === null) return; // User cancelled
    
    const token = localStorage.getItem('adminToken');
    fetch('/api/shutdown', { 
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('Server shutdown initiated successfully.');
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to initiate shutdown.');
    });
}

function rebootServer() {
    const password = prompt('Enter password to reboot server:');
    if (password === null) return; // User cancelled
    
    const token = localStorage.getItem('adminToken');
    fetch('/api/reboot', { 
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('Server reboot initiated successfully.');
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to initiate reboot.');
    });
}

// Logout function (global scope)
function logout() {
    const token = localStorage.getItem('adminToken');
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

// File Manager functionality
async function loadFileManager() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = '/login';
            return;
        }
        
        const data = await response.json();
        updateFileManager(data);
        
    } catch (error) {
        console.error('Error loading file manager:', error);
    }
}

function updateFileManager(data) {
    const container = document.getElementById('file-manager-list');
    document.getElementById('file-manager-path').value = data.path;
    
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
        return `
            <div class="file-item" onclick="navigateFile('${file.path}', '${file.type}')">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${file.name}</div>
                <div class="file-size">${file.size}</div>
                <div class="file-type">${file.type}</div>
                <div class="file-owner">${file.owner}</div>
                <div class="file-modified">${file.modified}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = header + items;
}

function navigateFile(filePath, type) {
    if (type === 'directory') {
        currentPath = filePath;
        loadFileManager();
    } else if (type === 'file' || type === 'symlink') {
        const token = localStorage.getItem('adminToken');
        const url = `/api/files/download?filePath=${encodeURIComponent(filePath)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
        window.open(url, '_blank');
    }
}

function fileManagerNavigateUp() {
    const path = currentPath.split('/').slice(0, -1).join('/') || '/host';
    currentPath = path;
    loadFileManager();
}

function fileManagerRefresh() {
    loadFileManager();
}

function handlePathInput(event) {
    if (event.key === 'Enter') {
        const path = event.target.value;
        if (path) {
            currentPath = path;
            loadFileManager();
        }
    }
}

// Security Dashboard functionality
async function loadSecurityData(tab) {
    try {
        const container = document.getElementById('security-content');
        container.innerHTML = '<div style="padding: 2%; text-align: center; color: #888888;">Loading...</div>';
        
        const token = localStorage.getItem('adminToken');
        let response;
        
        if (tab === 'ssh') {
            response = await fetch('/api/security/ssh', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } else if (tab === 'openvpn') {
            response = await fetch('/api/security/openvpn', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } else if (tab === 'connections') {
            response = await fetch('/api/security/connections', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        
        if (!response.ok) {
            console.error(`Security API error: ${response.status} ${response.statusText}`);
            container.innerHTML = `<div style="padding: 2%; text-align: center; color: #ff6666;">Error loading data (${response.status})</div>`;
            return;
        }
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = '/login';
            return;
        }
        
        const data = await response.json();
        console.log(`Security data for ${tab}:`, data);
        
        // Additional debugging for OpenVPN
        if (tab === 'openvpn') {
            console.log('OpenVPN clients:', data.clients);
            console.log('Total clients:', data.total);
        }
        
        updateSecurityDisplay(tab, data);
        
    } catch (error) {
        console.error('Error loading security data:', error);
        const container = document.getElementById('security-content');
        container.innerHTML = `<div style="padding: 2%; text-align: center; color: #ff6666;">Error: ${error.message}</div>`;
    }
}

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
        
        const items = data.sessions.map((session, index) => `
            <div class="security-item">
                <div class="security-value">${session.user}</div>
                <div class="security-value">${session.ip}</div>
                <div class="security-value">${session.sessionDuration}</div>
                <div>
                    <button class="security-terminate-btn" onclick="terminateSSHSession('${session.user}', '${session.tty}')">Terminate</button>
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
            // Ensure client data is valid
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

function switchSecurityTab(tab) {
    currentSecurityTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.security-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    loadSecurityData(tab);
}

// Terminate SSH session
function terminateSSHSession(user, tty) {
    if (!confirm(`Terminate SSH session for user '${user}' on ${tty}?`)) {
        return;
    }
    
    const password = prompt('Enter password to terminate SSH session:');
    if (password === null) return;
    
    const token = localStorage.getItem('adminToken');
    fetch('/api/security/ssh/terminate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ user, tty, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('SSH session terminated successfully.');
            loadSecurityData('ssh');
        } else {
            alert('Error: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to terminate SSH session.');
    });
}

// Terminate OpenVPN client
function terminateOpenVPNClient(clientName) {
    if (!confirm(`Disconnect OpenVPN client '${clientName}'?`)) {
        return;
    }
    
    const password = prompt('Enter password to disconnect OpenVPN client:');
    if (password === null) return;
    
    const token = localStorage.getItem('adminToken');
    fetch('/api/security/openvpn/terminate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientName, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('OpenVPN client disconnected successfully.');
            loadSecurityData('openvpn');
        } else {
            alert('Error: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to disconnect OpenVPN client.');
    });
}


