const { ipcRenderer } = require('electron');

// Default fallback hosts if IPC fetch fails (must match main process allowedHosts)
const DEFAULT_ALLOWED_HOSTS = ['gemini.google.com', 'accounts.google.com'];

// Network status detection
function updateNetworkStatus() {
    ipcRenderer.send('network-status', navigator.onLine);
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// Listen for DOMContentLoaded event
window.addEventListener('DOMContentLoaded', async () => {
    // Wire up retry button on offline page
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            ipcRenderer.send('retry-connection');
        });
    } else {
        // Only send initial network status if NOT on offline page
        // to avoid triggering reload loops
        updateNetworkStatus();
    }

    // Fetch allowed hosts from main process (centralized source of truth)
    let allowedHosts;
    try {
        const allowedHostsArray = await ipcRenderer.invoke('get-allowed-hosts');
        allowedHosts = new Set(allowedHostsArray);
    } catch (e) {
        console.error('Failed to fetch allowed hosts from main process:', e);
        // Fallback to default hosts if IPC fails
        allowedHosts = new Set(DEFAULT_ALLOWED_HOSTS);
    }

    // Listen for click events and open non-allowed links externally
    document.addEventListener('click', (event) => {
        // Guard against non-Element targets (e.g., text nodes)
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const link = target.closest('a');
        if (link && link.href && link.href.startsWith('http')) {
                // Check if allowed host or Google auth domain
                const isAllowed = allowedHosts.has(hostname) ||
                    hostname === 'google.com' ||
                    hostname.endsWith('.google.com') ||
                    hostname.endsWith('.google.co.in') ||
                    hostname.endsWith('.googleapis.com') ||
                    hostname.endsWith('.gstatic.com');

                if (isAllowed) {
                    return; // Allow app + auth links to navigate in-app
                }
            } catch (e) {
                // If URL parsing fails, open externally as a safety measure
            }
            event.preventDefault();
            ipcRenderer.send('open-external-link', link.href);
        }
    });
});

// Handle keyboard shortcuts for zoom (fallback if window before-input-event misses it)
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd') {
            ipcRenderer.send('zoom-in');
        } else if (event.key === '-' || event.key === '_' || event.code === 'Minus' || event.code === 'NumpadSubtract') {
            ipcRenderer.send('zoom-out');
        } else if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') {
            ipcRenderer.send('zoom-reset');
        }
    }
});

// Handle mouse wheel zoom (Ctrl + scroll wheel)
document.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.deltaY < 0) {
            ipcRenderer.send('zoom-in');
        } else {
            ipcRenderer.send('zoom-out');
        }
    }
}, { passive: false });
