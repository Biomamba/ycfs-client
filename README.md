# 言出法随生信APP 桌面客户端

YCFS_APP 生信智能分析平台（「言出法随」）的 Windows / macOS 桌面客户端，基于 Electron 封装线上平台入口。**免安装、防篡改加固、登录凭据加密存储。**

- 默认服务器：`https://www.biomamba.cn/YCFS_APP/`
- 平台前端入口：YCFS 阿里云服务器（页面 HTTPS + 轻量控制请求转发）
- 平台后端/计算：Biomamba 服务器（应用、数据库、分析 worker、语音服务）
- 大文件直传：`https://ycfs-files.biomamba.cn:34080`（浏览器直连 Biomamba，不经过 YCFS）

## 交付产物（dist/，v1.0.1）

| 文件 | 平台 | 说明 |
|---|---|---|
| `言出法随生信APP-Portable-1.0.1.exe` | Windows x64 | **免安装便携版**，单文件，双击即用 |
| `言出法随生信APP-1.0.1-mac-x64.zip` | macOS Intel | 解压拖入「应用程序」即用 |
| `言出法随生信APP-1.0.1-mac-arm64.zip` | macOS Apple Silicon | 解压拖入「应用程序」即用 |

图标使用官方「Biomamba生信基地」品牌原图。

### macOS 首次打开（未签名包）

解压后若提示「无法验证开发者」：右键点 App →「打开」→ 再点「打开」；
或终端执行 `xattr -cr "/Applications/言出法随生信APP.app"` 后正常打开。

## 安全加固

全部用 `@electron/fuses` 工具验证过：

| 加固项 | Windows | macOS | 作用 |
|---|---|---|---|
| EmbeddedAsarIntegrityValidation | ✅ 启用 | ❌（需签名） | asar 被修改后应用拒绝启动（防改包） |
| EnableCookieEncryption | ✅ 启用 | ✅ 启用 | 登录凭据本机加密存储（DPAPI/钥匙串），防偷会话 |
| OnlyLoadAppFromAsar | ✅ | ✅ | 不允许指向外部脚本 |
| RunAsNode | ✅ 禁用 | ✅ 禁用 | 不能被当作 Node 运行时加载任意脚本 |
| NodeOptionsEnvironmentVariable | ✅ 禁用 | ✅ 禁用 | 阻断 NODE_OPTIONS 注入 |
| NodeCliInspectArguments | ✅ 禁用 | ✅ 禁用 | 阻断 --inspect 调试注入 |

客户端不含任何 API 密钥；模型渠道 Key 加密存于服务端数据库，业务防护（账号/计费/权限）全部在服务端。
macOS 的 asar 完整性校验需要代码签名配合（Apple 要求），未签名版暂不启用——其余加固不受影响。

## 自动更新

客户端启动 8 秒后静默检查更新，也可「帮助 → 检查更新…」。更新源：

```
https://www.biomamba.cn/YCFS_APP/client-update.json
```

发布新版本时，把下面的 JSON 放到该地址即可（内容自定）：

```json
{
  "version": "1.0.2",
  "notes": "本次更新说明",
  "downloadUrl": "https://…/言出法随生信APP-Portable-1.0.2.exe"
}
```

用户端会弹窗提示并引导到 `downloadUrl` 下载（便携版不覆盖自更新）。
该地址目前不存在，检查会静默失败，不影响使用；等正式分发时部署这一个文件即可。

## 功能特性

- **语音通话适配**：自动授予麦克风权限，TTS 播报无需用户手势
- **文件下载**：系统保存对话框 + 下载完成通知
- **站外链接**：外部网址自动用系统浏览器打开（微信支付等在系统浏览器完成）
- **断网/维护提示**：本地中文错误页，一键重试
- **服务器地址可配置**：菜单「文件 → 服务器地址…」（`Ctrl+,`）
- **单实例**：重复启动聚焦已有窗口；登录状态加密持久保存

## 开发与构建

依赖：Node.js ≥ 20。Windows 构建在本机；**macOS 构建在 Biomamba 服务器**
（electron-builder 不支持 Windows→macOS 交叉构建；Linux 可构建未签名 mac zip。
按项目约定，构建放「大机器」Biomamba，不碰官网面板服务器 YCFS）。

### Windows（本机）

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install --registry=https://registry.npmmirror.com
npm run dist:win    # dist/言出法随生信APP-Portable-<版本>.exe
```

### macOS（在 Biomamba 服务器上）

```bash
cd /data3/biomamba/analysis/ycfs-client-build   # 先把改动的源码/配置 scp 上去
export ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/          # 大文件走华为云镜像（npmmirror 到该机仅 65KB/s）
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac --config builder-mac-x64.json     # 只传 --mac，架构由配置文件决定
npx electron-builder --mac --config builder-mac-arm64.json
```

产物在 `dist-x64/`、`dist-arm64/`，scp 拉回本地 `dist/`。

### 本地试运行

`npm start`

版本：1.0.1（2026-10-24）
