'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const backdrop = document.getElementById('backdrop');
  const navButtons = Array.from(document.querySelectorAll('.nav-item'));
  const tabSections = Array.from(document.querySelectorAll('.tab-content'));
  const restartBanner = document.getElementById('restart-banner');

  const toggleAutostart = document.getElementById('toggle-autostart');
  const toggleCloseToTray = document.getElementById('toggle-close-to-tray');
  const toggleStartInTray = document.getElementById('toggle-start-in-tray');
  const toggleNotifyTurn = document.getElementById('toggle-notify-turn');
  const toggleAutoUpdates = document.getElementById('toggle-auto-updates');
  const selectFrameStyle = document.getElementById('select-frame-style');
  const selectZoom = document.getElementById('select-zoom');

  const permSelects = {
    media: document.getElementById('perm-media'),
    camera: document.getElementById('perm-camera'),
    geolocation: document.getElementById('perm-geolocation'),
    notifications: document.getElementById('perm-notifications'),
    clipboard: document.getElementById('perm-clipboard'),
  };

  const updateStatusEl = document.getElementById('update-status');
  const openReleaseBtn = document.getElementById('btn-open-release');
  const logsPanel = document.getElementById('logs-panel');
  const logsPre = document.getElementById('logs-pre');

  let initialFrameStyle = null;
  let currentReleaseUrl = '';

  function activateTab(tabName) {
    for (const btn of navButtons) {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    }
    for (const section of tabSections) {
      section.classList.toggle('active', section.id === `tab-${tabName}`);
    }
  }

  for (const btn of navButtons) {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  }

  function applyUpdateResult(result) {
    if (!updateStatusEl) return;
    if (openReleaseBtn) openReleaseBtn.style.display = 'none';
    if (!result) {
      updateStatusEl.textContent = '';
      return;
    }
    if (result.status === 'available') {
      updateStatusEl.textContent = `Update available: v${result.latestVersion} (current v${result.currentVersion})`;
      currentReleaseUrl = result.releaseUrl || '';
      if (openReleaseBtn && currentReleaseUrl) {
        openReleaseBtn.style.display = 'inline-flex';
      }
    } else if (result.status === 'up_to_date') {
      updateStatusEl.textContent = `Gemini is up to date (v${result.currentVersion}).`;
    } else if (result.status === 'error') {
      updateStatusEl.textContent = `Update check failed: ${result.error || 'Network unavailable'}`;
    }
  }

  async function refreshAll() {
    const data = await window.settingsApi?.getAll();
    if (!data) return;

    const s = data.settings || {};
    if (initialFrameStyle === null) {
      initialFrameStyle = s.frameStyle || 'custom';
    }

    if (toggleAutostart) toggleAutostart.checked = Boolean(s.openAtLogin);
    if (toggleCloseToTray) toggleCloseToTray.checked = Boolean(s.closeToTray);
    if (toggleStartInTray) toggleStartInTray.checked = Boolean(s.startInTray);
    if (toggleNotifyTurn) toggleNotifyTurn.checked = Boolean(s.notifyOnTurnComplete);
    if (toggleAutoUpdates) toggleAutoUpdates.checked = Boolean(s.autoCheckUpdates);
    if (selectFrameStyle) selectFrameStyle.value = s.frameStyle || 'custom';
    if (selectZoom) {
      const targetVal = String(Math.round((s.zoomLevel || 0) * 2) / 2);
      if (Array.from(selectZoom.options).some((o) => o.value === targetVal)) {
        selectZoom.value = targetVal;
      }
    }

    for (const [cap, el] of Object.entries(permSelects)) {
      if (el && s.permissions?.[cap]) {
        el.value = s.permissions[cap];
      }
    }

    const meta = data.meta || {};

    const aboutVersion = document.getElementById('about-version');
    const aboutRuntime = document.getElementById('about-runtime');
    const aboutSession = document.getElementById('about-session');
    if (aboutVersion) aboutVersion.textContent = `v${meta.appVersion || '1.0.0'} (${meta.license || 'GPL-3.0'})`;
    if (aboutRuntime) aboutRuntime.textContent = `Electron ${meta.electronVersion || '-'} / Chrome ${meta.chromeVersion || '-'}`;
    if (aboutSession) aboutSession.textContent = (meta.sessionType || 'unknown').toUpperCase();
  }

  toggleAutostart?.addEventListener('change', () => {
    window.settingsApi?.update({ openAtLogin: toggleAutostart.checked });
  });
  toggleCloseToTray?.addEventListener('change', () => {
    window.settingsApi?.update({ closeToTray: toggleCloseToTray.checked });
  });
  toggleStartInTray?.addEventListener('change', () => {
    window.settingsApi?.update({ startInTray: toggleStartInTray.checked });
  });
  toggleNotifyTurn?.addEventListener('change', () => {
    window.settingsApi?.update({ notifyOnTurnComplete: toggleNotifyTurn.checked });
  });
  toggleAutoUpdates?.addEventListener('change', () => {
    window.settingsApi?.update({ autoCheckUpdates: toggleAutoUpdates.checked });
  });
  selectFrameStyle?.addEventListener('change', async () => {
    await window.settingsApi?.update({ frameStyle: selectFrameStyle.value });
    restartBanner?.classList.toggle('visible', selectFrameStyle.value !== initialFrameStyle);
  });
  selectZoom?.addEventListener('change', () => {
    window.settingsApi?.update({ zoomLevel: Number(selectZoom.value) });
  });

  for (const [cap, el] of Object.entries(permSelects)) {
    el?.addEventListener('change', async () => {
      await window.settingsApi?.update({ permissions: { [cap]: el.value } });
    });
  }

  async function writeClipboardText(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (window.settingsApi?.copyText) {
        return Boolean(await window.settingsApi.copyText(value));
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }


  document.getElementById('btn-reset-permissions')?.addEventListener('click', async () => {
    await window.settingsApi?.resetPermissions();
    await refreshAll();
  });

  document.getElementById('btn-switch-account')?.addEventListener('click', () => {
    window.settingsApi?.switchAccount();
  });
  document.getElementById('btn-sign-out')?.addEventListener('click', (event) => {
    const btn = event.currentTarget;
    if (btn && btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'Confirm Sign Out';
      setTimeout(() => {
        btn.dataset.armed = '0';
        btn.textContent = 'Sign Out';
      }, 4000);
      return;
    }
    window.settingsApi?.signOut();
  });

  document.getElementById('btn-toggle-logs')?.addEventListener('click', async () => {
    if (!logsPanel || !logsPre) return;
    const willOpen = !logsPanel.classList.contains('visible');
    if (willOpen) {
      const text = await window.settingsApi?.getLogs();
      logsPre.textContent = text || 'No logs recorded yet.';
    }
    logsPanel.classList.toggle('visible', willOpen);
  });

  document.getElementById('btn-copy-logs')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    const text = await window.settingsApi?.getLogs();
    if (text && (await writeClipboardText(text))) {
      if (btn) btn.textContent = 'Copied!';
      setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 1500);
    }
  });

  document.getElementById('btn-check-updates')?.addEventListener('click', async () => {
    if (updateStatusEl) updateStatusEl.textContent = 'Checking GitHub Releases...';
    const res = await window.settingsApi?.checkForUpdates();
    applyUpdateResult(res);
  });

  openReleaseBtn?.addEventListener('click', () => {
    if (currentReleaseUrl) {
      window.settingsApi?.openExternal(currentReleaseUrl);
    }
  });

  document.getElementById('btn-open-repo')?.addEventListener('click', () => {
    window.settingsApi?.openExternal('https://github.com/vish-1109/gemini-desktop');
  });
  document.getElementById('btn-open-issues')?.addEventListener('click', () => {
    window.settingsApi?.openExternal('https://github.com/vish-1109/gemini-desktop/issues');
  });
  document.getElementById('btn-restart-now')?.addEventListener('click', () => {
    window.settingsApi?.restartApp();
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    window.settingsApi?.close();
  });
  for (const doneBtn of document.querySelectorAll('.btn-done')) {
    doneBtn.addEventListener('click', () => window.settingsApi?.close());
  }
  backdrop?.addEventListener('click', (event) => {
    if (event.target === backdrop) window.settingsApi?.close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      window.settingsApi?.close();
    }
  });

  window.settingsApi?.onOpened((payload) => {
    if (payload?.tab) activateTab(payload.tab);
    refreshAll();
  });
  window.settingsApi?.onUpdateResult(applyUpdateResult);

  refreshAll().finally(() => {
    window.settingsApi?.notifyReady();
  });
});
