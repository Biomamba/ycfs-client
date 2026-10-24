'use strict';
// 暴露给本地页面（错误页 / 设置页）的最小 IPC 接口
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ycfs', {
  defaultServer: 'https://www.biomamba.cn/YCFS_APP/',
  getConfig: () => ipcRenderer.invoke('ycfs:get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('ycfs:set-config', cfg),
  retry: (from) => ipcRenderer.invoke('ycfs:retry', from),
  openExternal: (url) => ipcRenderer.invoke('ycfs:open-external', url),
  closeSettings: () => ipcRenderer.send('ycfs:close-settings')
});
