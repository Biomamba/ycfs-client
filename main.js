'use strict';
// 言出法随生信APP 桌面客户端 —— 主进程
// 封装线上平台 https://www.biomamba.cn/YCFS_APP/，适配语音通话麦克风、
// TTS 自动播放、文件直传下载与站外链接跳转。

const { app, BrowserWindow, Menu, session, shell, ipcMain, dialog, Notification, net } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_TITLE = '言出法随生信APP';
const DEFAULT_SERVER = 'https://www.biomamba.cn/YCFS_APP/';
const UPDATE_URL = 'https://www.biomamba.cn/YCFS_APP/client-update.json';
// 允许在窗口内打开的域名：主站 + 文件直传子域
const IN_APP_HOSTS = new Set(['www.biomamba.cn', 'ycfs-files.biomamba.cn']);

// 语音播报（TTS）不依赖用户手势即可播放
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

let mainWindow = null;
let settingsWindow = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (_) {
    return {};
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}
function serverUrl() {
  const cfg = loadConfig();
  const u = typeof cfg.serverUrl === 'string' ? cfg.serverUrl.trim() : '';
  return /^https?:\/\//i.test(u) ? u : DEFAULT_SERVER;
}

function isInternalUrl(raw) {
  try {
    return IN_APP_HOSTS.has(new URL(raw).hostname);
  } catch (_) {
    return false;
  }
}

function applySessionPolicies(sess) {
  // 麦克风（语音通话/音色采集）、通知、剪贴板写入等按需放行，其余拒绝
  sess.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'media') return callback(true);
    if (permission === 'notifications') return callback(true);
    if (permission === 'clipboard-sanitized-write') return callback(true);
    if (permission === 'fullscreen') return callback(true);
    if (permission === 'pointerLock') return callback(true);
    return callback(false);
  });
  sess.setPermissionCheckHandler((wc, permission) => {
    if (['media', 'mediaKeySystem', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock'].includes(permission)) {
      return true;
    }
    return false;
  });
  // 去掉 UA 里的 Electron 标记，避免站点按浏览器兼容性误判
  sess.setUserAgent(sess.getUserAgent().replace(/\sElectron\/\S+/, ''));
}

// 站内弹窗（官网登录、微信登录等）在应用内开子窗口，与主窗口共享登录会话。
// 登录在子窗口完成后，平台自身的会话轮询（10 秒/聚焦即查）会让主窗口自动进入界面。
function createChildWindow(url) {
  const child = new BrowserWindow({
    width: 1020,
    height: 780,
    parent: mainWindow || undefined,
    title: APP_TITLE,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  child.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u) && isInternalUrl(u)) {
      createChildWindow(u);
      return { action: 'deny' };
    }
    if (/^https?:/i.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  // 子窗口回跳 APP 内部页（登录成功的自动返回）时聚焦主窗口，触发立即会话检查
  child.webContents.on('will-navigate', (event, u) => {
    try {
      if (typeof u === 'string' && u.indexOf('/YCFS_APP') >= 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
      }
    } catch (_) { /* 主窗口可能已关闭 */ }
  });
  child.loadURL(url);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 980,
    minHeight: 640,
    title: APP_TITLE,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0d6550',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 站内新窗口留在应用内（共享会话）；站外链接交给系统默认浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && isInternalUrl(url)) {
      createChildWindow(url);
      return { action: 'deny' };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // 加载失败（断网 / 服务器维护）→ 本地错误页，可重试
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED：跳转被打断，不是错误
    const from = typeof validatedURL === 'string' && /^https?:/i.test(validatedURL) ? validatedURL : '';
    mainWindow.loadFile(path.join(__dirname, 'pages', 'error.html'), {
      query: {
        from: from,
        err: errorDescription || ('错误码 ' + errorCode)
      }
    });
  });

  // 下载保持系统保存框，完成后通知
  mainWindow.webContents.session.on('will-download', (event, item) => {
    item.once('done', (e, state) => {
      try {
        if (state === 'completed' && Notification.isSupported()) {
          new Notification({ title: APP_TITLE, body: '下载完成：' + item.getFilename() }).show();
        }
      } catch (_) { /* 通知失败不影响下载 */ }
    });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(serverUrl());
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 260,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '服务器设置',
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadFile(path.join(__dirname, 'pages', 'settings.html'));
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '服务器地址…', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新（忽略缓存）' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '检查更新…', click: () => checkForUpdates(false) },
        { label: '打开官网 biomamba.cn', click: () => shell.openExternal('https://www.biomamba.cn/') },
        { type: 'separator' },
        {
          label: '关于 ' + APP_TITLE,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于',
              message: APP_TITLE,
              detail: '版本 ' + app.getVersion() + '\n服务器：' + serverUrl() + '\n\n生信智能分析平台桌面客户端',
              buttons: ['确定']
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC（preload 暴露给本地页面） ----------
ipcMain.handle('ycfs:get-config', () => loadConfig());
ipcMain.handle('ycfs:set-config', (event, cfg) => {
  if (cfg && typeof cfg === 'object') saveConfig(cfg);
});
ipcMain.handle('ycfs:retry', (event, from) => {
  const url = typeof from === 'string' && /^https?:/i.test(from) ? from : serverUrl();
  if (mainWindow) mainWindow.loadURL(url);
});
ipcMain.handle('ycfs:open-external', (event, url) => {
  if (typeof url === 'string' && /^https?:/i.test(url)) shell.openExternal(url);
});
ipcMain.on('ycfs:close-settings', () => {
  if (settingsWindow) settingsWindow.close();
});

// ---------- 更新检查 ----------
// 版本清单格式（部署到 UPDATE_URL 即生效）：
//   { "version": "1.0.2", "notes": "更新说明", "downloadUrl": "https://…/新版本下载地址" }
function isNewerVersion(latest, current) {
  const p = (v) => String(v).trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = p(latest), b = p(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdates(silent) {
  try {
    const res = await net.fetch(UPDATE_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('http ' + res.status);
    const info = await res.json();
    const latest = String(info.version || '').trim();
    if (latest && isNewerVersion(latest, app.getVersion())) {
      const r = await dialog.showMessageBox({
        type: 'info',
        title: '发现新版本',
        message: '发现新版本 v' + latest + '（当前 v' + app.getVersion() + '）',
        detail: info.notes || '',
        buttons: ['前往下载', '以后再说'],
        defaultId: 0
      });
      if (r.response === 0 && typeof info.downloadUrl === 'string' && /^https?:/i.test(info.downloadUrl)) {
        shell.openExternal(info.downloadUrl);
      }
    } else if (!silent) {
      dialog.showMessageBox({ type: 'info', title: '检查更新', message: '当前已是最新版本 v' + app.getVersion() + '。' });
    }
  } catch (e) {
    if (!silent) {
      dialog.showMessageBox({ type: 'info', title: '检查更新', message: '暂时无法获取更新信息，请稍后再试。' });
    }
  }
}

app.whenReady().then(() => {
  applySessionPolicies(session.defaultSession);
  buildMenu();
  createMainWindow();
  // 启动 8 秒后静默检查一次更新
  setTimeout(() => checkForUpdates(true), 8000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
