/* ==========================================
   TERMINAL MANAGEMENT
   ========================================== */

/**
 * Terminal Manager Class
 * Handles terminal tabs, terminal instances, and socket communication
 */
export class TerminalManager {
    constructor(socket) {
        this.socket = socket;
        this.terminals = new Map();
        this.activeTabId = null;
        this.tabCounter = 1;
        this.terminalSessionCounter = 0;
    }

    /**
     * Create a new terminal tab
     * @returns {string} Tab ID
     */
    createTerminalTab() {
        const tabId = `terminal-${this.tabCounter++}`;
        const tabNumber = this.tabCounter - 1;
        const sessionId = this.terminalSessionCounter++;

        // Create tab element
        const tabsContainer = document.getElementById('terminal-tabs');
        const tabElement = document.createElement('div');
        tabElement.className = 'terminal-tab active';
        tabElement.id = `tab-${tabId}`;
        tabElement.innerHTML = `
            <span class="tab-title">Terminal ${tabNumber}</span>
            <span class="terminal-tab-close" onclick="window.terminalManager.closeTab('${tabId}', event)">×</span>
        `;
        tabElement.onclick = (e) => {
            if (e.target.className !== 'terminal-tab-close') {
                this.switchTab(tabId);
            }
        };
        tabsContainer.appendChild(tabElement);

        // Create terminal instance
        const terminalDiv = document.createElement('div');
        terminalDiv.id = tabId;
        terminalDiv.style.display = this.activeTabId ? 'none' : 'block';

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
        this.socket.emit('terminal:create', {
            cols: 120,
            rows: 30,
            tabId: tabId,
            sessionId: sessionId
        });

        // Handle backend response
        this.socket.once('terminal:created', (data) => {
            if (data && data.tabId === tabId) {
                backendTerminalId = data.backendId || this.socket.id;
                backendSessionConnected = true;
                terminal.focus();
            }
        });

        // Terminal input handler - sends to this terminal's backend session
        terminal.onData(data => {
            if (backendSessionConnected) {
                this.socket.emit('terminal:input', {
                    data: data,
                    tabId: tabId,
                    sessionId: sessionId
                });
            }
        });

        // Store terminal with session info
        this.terminals.set(tabId, {
            terminal,
            fitAddon,
            tabElement,
            tabId,
            sessionId: sessionId,
            backendTerminalId: backendTerminalId,
            connected: backendSessionConnected
        });

        if (!this.activeTabId) {
            this.activeTabId = tabId;
        }

        return tabId;
    }

    /**
     * Switch between terminal tabs
     * @param {string} tabId - Tab ID to switch to
     */
    switchTab(tabId) {
        const oldTab = this.terminals.get(this.activeTabId);
        const newTab = this.terminals.get(tabId);

        if (oldTab) {
            oldTab.tabElement.classList.remove('active');
            document.getElementById(this.activeTabId).style.display = 'none';
        }

        if (newTab) {
            newTab.tabElement.classList.add('active');
            document.getElementById(tabId).style.display = 'block';
            this.activeTabId = tabId;
            newTab.terminal.focus();

            // Trigger resize for proper rendering
            setTimeout(() => {
                newTab.fitAddon.fit();
                const { cols, rows } = newTab.terminal;
                this.socket.emit('terminal:resize', { cols, rows });
            }, 100);
        }
    }

    /**
     * Close a terminal tab
     * @param {string} tabId - Tab ID to close
     * @param {Event} event - Click event
     */
    closeTab(tabId, event) {
        if (event) {
            event.stopPropagation();
        }

        if (this.terminals.size <= 1) {
            return; // Don't close the last tab
        }

        const tab = this.terminals.get(tabId);
        if (!tab) return;

        // If closing active tab, switch to another
        if (this.activeTabId === tabId) {
            const otherTabs = Array.from(this.terminals.keys()).filter(id => id !== tabId);
            if (otherTabs.length > 0) {
                this.switchTab(otherTabs[0]);
            }
        }

        // Clean up
        tab.terminal.dispose();
        document.getElementById(tabId).remove();
        tab.tabElement.remove();
        this.terminals.delete(tabId);
    }

    /**
     * Initialize socket event handlers
     */
    initializeSocketHandlers() {
        // Socket.IO event handlers - route data to specific terminals
        this.socket.on('terminal:data', (message) => {
            const tabId = message.tabId || this.activeTabId;
            if (tabId && this.terminals.has(tabId)) {
                const tab = this.terminals.get(tabId);
                tab.terminal.write(message.data);
            }
        });

        this.socket.on('terminal:created', (data) => {
            const tabId = data.tabId;
            if (tabId && this.terminals.has(tabId)) {
                const tab = this.terminals.get(tabId);
                tab.backendTerminalId = data.backendId || this.socket.id;
                tab.connected = true;
                if (this.activeTabId === tabId) {
                    tab.terminal.focus();
                }
            }
        });

        this.socket.on('terminal:exit', (message) => {
            const tabId = message.tabId || this.activeTabId;
            if (tabId && this.terminals.has(tabId)) {
                const tab = this.terminals.get(tabId);
                tab.terminal.write('\r\nTerminal session ended.\r\n');
                tab.connected = false;
            }
        });
    }

    /**
     * Initialize keyboard shortcuts and window resize handler
     */
    initializeEventHandlers() {
        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+T to create new tab
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.createTerminalTab();
            }
        });

        // Handle terminal resize for all terminals
        window.addEventListener('resize', () => {
            this.terminals.forEach(({ terminal, fitAddon }) => {
                fitAddon.fit();
                const { cols, rows } = terminal;
                this.socket.emit('terminal:resize', { cols, rows });
            });
        });
    }

    /**
     * Initialize first terminal tab
     */
    initialize() {
        this.createTerminalTab();
        this.initializeSocketHandlers();
        this.initializeEventHandlers();
    }

    /**
     * Global function to create new terminal from button
     */
    createNewTerminal() {
        this.createTerminalTab();
    }

    /**
     * Enter fullscreen terminal
     */
    enterFullscreenTerminal() {
        const token = localStorage.getItem('adminToken');
        if (token) {
            window.location.href = `/terminal-fullscreen?token=${token}`;
        } else {
            alert('Session expired. Please login again.');
            window.location.href = '/login';
        }
    }
}


