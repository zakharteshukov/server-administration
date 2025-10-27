#!/bin/bash
# Cursor Agent wrapper for container access

# Function to execute cursor-agent on host system
host_cursor_agent() {
    local args="$@"
    
    # Use chroot to execute cursor-agent on host system
    if [ -x "/host/root/.local/share/cursor-agent/versions/2025.10.22-f894c20/cursor-agent" ]; then
        chroot /host /root/.local/share/cursor-agent/versions/2025.10.22-f894c20/cursor-agent $args
    else
        echo "Cursor agent not found on host system"
        return 1
    fi
}

# Execute cursor-agent on host system
host_cursor_agent "$@"
