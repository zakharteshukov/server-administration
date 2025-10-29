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
        this.settings = this.loadSettings();
        this.searchOptions = { regex: false, caseSensitive: false };
        this._eventsInitialized = false;
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
        tabElement.setAttribute('draggable', 'true');
        tabElement.innerHTML = `
            <span class="tab-title">Terminal ${tabNumber}</span>
            <span class="pin-icon" title="Pin/unpin" onclick="window.terminalManager.togglePin('${tabId}', event)">📌</span>
            <span class="terminal-tab-close" onclick="window.terminalManager.closeTab('${tabId}', event)">×</span>
        `;
        tabElement.onclick = (e) => {
            if (e.target.className !== 'terminal-tab-close') {
                this.switchTab(tabId);
            }
        };
        // Drag & drop reorder
        tabElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', tabId);
        });
        tabElement.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        tabElement.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData('text/plain');
            if (!fromId || fromId === tabId) return;
            this.reorderTabs(fromId, tabId);
        });
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
            fontSize: this.settings.fontSize || 13,
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
        // Search addon
        if (window.SearchAddon) {
            const searchAddon = new window.SearchAddon.SearchAddon();
            terminal.loadAddon(searchAddon);
            // store on instance
            terminal.__searchAddon = searchAddon;
        }

        document.getElementById('terminal-content').appendChild(terminalDiv);
        terminal.open(document.getElementById(tabId));
        fitAddon.fit();

        // Apply settings
        this.applySettingsToTerminal(terminal);

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

        // Copy on select
        terminal.onSelectionChange && terminal.onSelectionChange(() => {
            if (!this.settings.copyOnSelect) return;
            const text = terminal.getSelection && terminal.getSelection();
            if (text) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).catch(() => {});
                }
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
            connected: backendSessionConnected,
            pinned: false,
            color: null
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

        const tabInfo = this.terminals.get(tabId);
        if (tabInfo && tabInfo.pinned) {
            return; // Do not close pinned tab
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
        if (this._eventsInitialized) return;
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
        this._eventsInitialized = true;
    }

    /**
     * Initialize first terminal tab
     */
    initialize() {
        if (this.terminals.size === 0) {
            this.createTerminalTab();
        }
        this.initializeSocketHandlers();
        this.initializeEventHandlers();
        // expose search/settings handlers
        window.terminalManager = this;
        // initialize toolbar controls from saved settings
        const themeSel = document.getElementById('terminal-theme-select');
        if (themeSel && this.settings.theme) themeSel.value = this.settings.theme;
        const copyChk = document.getElementById('terminal-copy-on-select');
        if (copyChk) copyChk.checked = !!this.settings.copyOnSelect;
        const pasteChk = document.getElementById('terminal-bracketed-paste');
        if (pasteChk) pasteChk.checked = !!this.settings.bracketedPaste;
    }

    updateSocket(newSocket) {
        if (this.socket === newSocket) return;
        this.socket = newSocket;
        this.initializeSocketHandlers();
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

    // -------- Tabs management extras --------
    togglePin(tabId, event) {
        if (event) event.stopPropagation();
        const info = this.terminals.get(tabId);
        if (!info) return;
        info.pinned = !info.pinned;
        info.tabElement.classList.toggle('pinned', info.pinned);
        this.sortTabsPinnedFirst();
    }

    sortTabsPinnedFirst() {
        const container = document.getElementById('terminal-tabs');
        const tabs = Array.from(this.terminals.values());
        tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        tabs.forEach(t => container.appendChild(t.tabElement));
    }

    reorderTabs(fromId, toId) {
        const container = document.getElementById('terminal-tabs');
        const from = this.terminals.get(fromId);
        const to = this.terminals.get(toId);
        if (!from || !to) return;
        if (from.pinned && !to.pinned) return; // keep pinned at left
        container.insertBefore(from.tabElement, to.tabElement);
    }

    cycleTabColor(tabId) {
        const info = this.terminals.get(tabId);
        if (!info) return;
        const colors = [null, 'red', 'green', 'blue', 'yellow'];
        const idx = colors.indexOf(info.color);
        const next = colors[(idx + 1) % colors.length];
        info.color = next;
        info.tabElement.classList.remove('color-red','color-green','color-blue','color-yellow');
        if (next) info.tabElement.classList.add(`color-${next}`);
    }

    // -------- Search --------
    setSearchRegex(enabled) { this.searchOptions.regex = !!enabled; }
    setSearchCaseSensitive(enabled) { this.searchOptions.caseSensitive = !!enabled; }

    searchNext() {
        const text = document.getElementById('terminal-search-input').value || '';
        if (!text) return;
        const active = this.terminals.get(this.activeTabId);
        if (active && active.terminal && active.terminal.__searchAddon) {
            active.terminal.__searchAddon.findNext(text, this.searchOptions);
        }
    }
    searchPrev() {
        const text = document.getElementById('terminal-search-input').value || '';
        if (!text) return;
        const active = this.terminals.get(this.activeTabId);
        if (active && active.terminal && active.terminal.__searchAddon) {
            active.terminal.__searchAddon.findPrevious(text, this.searchOptions);
        }
    }

    // -------- Settings --------
    loadSettings() {
        try { return JSON.parse(localStorage.getItem('terminalSettings')) || {}; } catch { return {}; }
    }
    saveSettings() {
        localStorage.setItem('terminalSettings', JSON.stringify(this.settings));
    }
    applySettingsToTerminal(terminal) {
        if (!terminal) return;
        if (this.settings.fontSize) terminal.options.fontSize = this.settings.fontSize;
        terminal.options.bracketedPaste = !!this.settings.bracketedPaste;
        // Theme
        if (this.settings.theme === 'high-contrast') {
            terminal.options.theme = { background: '#000000', foreground: '#ffffff', cursor: '#ffffff', selection: '#666666' };
        } else {
            terminal.options.theme = { background: '#000000', foreground: '#ffffff', cursor: '#ffffff', selection: '#333333' };
        }
    }
    updateAllTerminalsSettings() {
        this.terminals.forEach(({ terminal, fitAddon }) => {
            this.applySettingsToTerminal(terminal);
            fitAddon.fit();
        });
    }
    increaseFont() {
        this.settings.fontSize = Math.min((this.settings.fontSize || 13) + 1, 24);
        this.saveSettings();
        this.updateAllTerminalsSettings();
    }
    decreaseFont() {
        this.settings.fontSize = Math.max((this.settings.fontSize || 13) - 1, 8);
        this.saveSettings();
        this.updateAllTerminalsSettings();
    }
    setTheme(theme) {
        this.settings.theme = theme;
        this.saveSettings();
        this.updateAllTerminalsSettings();
    }
    setCopyOnSelect(enabled) {
        this.settings.copyOnSelect = !!enabled;
        this.saveSettings();
    }
    setBracketedPaste(enabled) {
        this.settings.bracketedPaste = !!enabled;
        this.saveSettings();
        this.updateAllTerminalsSettings();
    }
}


