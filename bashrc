# Simple bash configuration for terminal
export HOSTNAME=srv1042867
export TERM=xterm-256color
export PS1='\[\033[01;32m\]root@srv1042867\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

# Set PATH to include host system commands
export PATH="/host/root/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"