'use strict';

const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ELECTRON_BIN = path.join(ROOT_DIR, 'node_modules', '.bin', 'electron');
const RUNNER_PATH = path.join(__dirname, 'electronRunner.js');

function buildIsolatedEnv(tempHome) {
  return {
    ...process.env,
    HOME: tempHome,
    XDG_CONFIG_HOME: path.join(tempHome, '.config'),
    XDG_CACHE_HOME: path.join(tempHome, '.cache'),
    XDG_DATA_HOME: path.join(tempHome, '.local/share'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  };
}

test('Electron BaseWindow + WebContentsView overlays + sandboxed app://bundle smoke test', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-home-'));
  try {
    const result = await new Promise((resolve, reject) => {
      execFile(
        ELECTRON_BIN,
        [RUNNER_PATH],
        {
          cwd: ROOT_DIR,
          env: buildIsolatedEnv(tempHome),
          timeout: 20000,
        },
        (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        },
      );
    });

    assert.equal(
      result.error,
      null,
      `Electron smoke runner failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
    assert.match(result.stdout, /ELECTRON_SMOKE_OK/);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test('Real app entrypoint starts cleanly in --tray and forwards --toggle via single-instance lock', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-app-'));
  const userDataDir = path.join(tempHome, 'userdata');
  const stderrLogPath = path.join(tempHome, 'primary-stderr.log');
  const env = buildIsolatedEnv(tempHome);

  const stderrFd = fs.openSync(stderrLogPath, 'w');
  let primaryProc = null;
  try {
    primaryProc = spawn(
      ELECTRON_BIN,
      [ROOT_DIR, '--tray', '--dev', `--user-data-dir=${userDataDir}`],
      {
        cwd: ROOT_DIR,
        env,
        detached: true,
        stdio: ['ignore', 'ignore', stderrFd],
      },
    );
    fs.closeSync(stderrFd);

    const readStderr = () => {
      try {
        return fs.readFileSync(stderrLogPath, 'utf8');
      } catch {
        return '';
      }
    };

    // Wait for startup log file to be created by main.js after app.whenReady()
    const logDir = path.join(userDataDir, 'logs');
    const deadline = Date.now() + 12000;
    let readyLogSeen = false;
    while (Date.now() < deadline) {
      if (primaryProc.exitCode !== null) {
        throw new Error(
          `Primary app exited early with code ${primaryProc.exitCode}. STDERR:\n${readStderr()}`,
        );
      }
      if (fs.existsSync(logDir) && fs.readdirSync(logDir).length > 0) {
        readyLogSeen = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.equal(
      readyLogSeen,
      true,
      `App did not write startup log in ${logDir}. STDERR:\n${readStderr()}`,
    );

    // Second instance with --toggle must forward to running instance and exit cleanly with code 0
    const secondExit = await new Promise((resolve, reject) => {
      execFile(
        ELECTRON_BIN,
        [ROOT_DIR, '--toggle', `--user-data-dir=${userDataDir}`],
        {
          cwd: ROOT_DIR,
          env,
          timeout: 10000,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Second instance --toggle failed: ${error.message}\n${stderr}`));
          } else {
            resolve({ code: 0, stdout, stderr });
          }
        },
      );
    });
    assert.equal(secondExit.code, 0);
  } finally {
    if (primaryProc && primaryProc.pid && primaryProc.exitCode === null) {
      const killGroup = (signal) => {
        try {
          process.kill(-primaryProc.pid, signal);
        } catch {
          try {
            primaryProc.kill(signal);
          } catch {
            // Already dead
          }
        }
      };
      killGroup('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          killGroup('SIGKILL');
          resolve();
        }, 3000);
        primaryProc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
