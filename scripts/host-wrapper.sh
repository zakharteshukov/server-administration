#!/bin/bash
# Host system command wrapper
# This script allows access to host system commands through the container

# Function to execute host commands
host_cmd() {
    local cmd="$1"
    shift
    local args="$@"
    
    # Try to execute the command on the host system using chroot
    if [ -x "/host/usr/bin/$cmd" ]; then
        chroot /host /usr/bin/$cmd $args
    elif [ -x "/host/usr/sbin/$cmd" ]; then
        chroot /host /usr/sbin/$cmd $args
    elif [ -x "/host/bin/$cmd" ]; then
        chroot /host /bin/$cmd $args
    elif [ -x "/host/sbin/$cmd" ]; then
        chroot /host /sbin/$cmd $args
    else
        echo "Command '$cmd' not found on host system"
        return 1
    fi
}

# Common host system commands
case "$1" in
    "systemctl")
        host_cmd systemctl "$@"
        ;;
    "pacman")
        host_cmd pacman "$@"
        ;;
    "journalctl")
        host_cmd journalctl "$@"
        ;;
    "hostnamectl")
        host_cmd hostnamectl "$@"
        ;;
    "timedatectl")
        host_cmd timedatectl "$@"
        ;;
    "networkctl")
        host_cmd networkctl "$@"
        ;;
    "loginctl")
        host_cmd loginctl "$@"
        ;;
    "useradd"|"userdel"|"usermod")
        host_cmd "$1" "$@"
        ;;
    "groupadd"|"groupdel"|"groupmod")
        host_cmd "$1" "$@"
        ;;
    "passwd")
        host_cmd passwd "$@"
        ;;
    *)
        # For other commands, try to execute them normally
        exec "$@"
        ;;
esac
