# Claude Code VS Code 中文化补丁

这是一个非官方中文化补丁仓库，用于给本机已安装的 Anthropic Claude Code VS Code 扩展打中文界面补丁。

本仓库不包含 Anthropic 扩展源码、打包产物或任何插件本体文件，只包含：

- `patch/apply-zh-cn-patch.mjs`：补丁脚本
- `patch/translations.zh-CN.json`：翻译表
- `README.md`：使用说明

当前翻译表按 `anthropic.claude-code` `2.1.145` 版本整理，已在 Linux x64 的 VS Code Server 扩展目录上验证。

## 使用方法

先安装 Claude Code VS Code 扩展，然后运行补丁脚本：

```bash
node patch/apply-zh-cn-patch.mjs
```

脚本会自动查找这些目录下最新的 Claude Code 扩展：

- `~/.vscode-server/extensions`
- `~/.vscode/extensions`
- `~/.cursor-server/extensions`
- `~/.cursor/extensions`

也可以显式指定扩展目录：

```bash
node patch/apply-zh-cn-patch.mjs --extension-dir ~/.vscode-server/extensions/anthropic.claude-code-2.1.145-linux-x64
```

先预览不写入：

```bash
node patch/apply-zh-cn-patch.mjs --dry-run
```

如果扩展版本不是翻译表标注版本，但你仍要尝试：

```bash
node patch/apply-zh-cn-patch.mjs --force --extension-dir <Claude Code 扩展目录>
```

## 生效方式

补丁完成后，执行 VS Code 的 `Developer: Reload Window`，或者重启 VS Code / VS Code Server。

Claude Code 扩展升级后，官方扩展文件可能会被覆盖，需要重新运行补丁。

## 备份与恢复

默认会在首次修改前为目标文件创建同目录备份：

```text
文件名.zh-cn-patch-backup
```

恢复时把对应备份文件复制回原文件即可。若不想创建备份，可传入：

```bash
node patch/apply-zh-cn-patch.mjs --no-backup
```

## 注意

- 这是非官方补丁，不隶属于 Anthropic。
- 补丁通过精确字符串替换和 `package.json` 字段更新实现，不重新分发原始扩展文件。
- 如果官方扩展调整了前端打包内容，部分翻译项可能匹配不到。可以更新 `patch/translations.zh-CN.json` 后重新运行。
