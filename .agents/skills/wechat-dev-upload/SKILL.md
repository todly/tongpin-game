---
name: wechat-dev-upload
description: 为 todly/tongpin-game 的已推送分支手动触发 GitHub Actions 云端构建并上传微信小程序或小游戏开发版。用户要求“把远端 develop 打包上传到微信开发版，等结果并输出”或类似请求时使用，跟进到完成并报告版本号、构建提交和运行链接。
---

# 微信开发版上传

在 `todly/tongpin-game` 手动运行 `.github/workflows/wechat-upload.yml`（**Upload WeChat development build**）。用户要求上传开发版即授权本次触发。用户只询问步骤时，提供操作说明。

1. 确认目标分支存在于远端，记录当前分支提交。用户指定分支时按其指定执行，仅在用户未指定分支且未指向本地工作区时使用默认 `main`。本地改动需要先有明确的推送授权并推送到目标分支。目标必须是可信分支，因为 Actions 会执行其中的构建代码。仓库变量 `WECHAT_TARGET` 决定客户端类型。
2. 发现可用的 GitHub Actions 触发能力并使用已授权的会话。工作流的 ref 固定为 `main`，目标分支通过 `build_branch` 输入传递，只填分支名。已登录且具备运行权限的 GitHub CLI 示例：

   ```bash
   build_branch=develop
   gh workflow run wechat-upload.yml --repo todly/tongpin-game \
     --ref main --raw-field "build_branch=$build_branch"
   ```

   若 CLI 或连接器无法触发，使用已登录且有权限的浏览器打开 [微信上传工作流](https://github.com/todly/tongpin-game/actions/workflows/wechat-upload.yml)，点击 **Run workflow**，**Use workflow from** 选 `main`，**Branch to build and upload** 填目标分支并提交。密钥通过 Actions Secret 自动注入。没有可用的已授权渠道时，报告需要哪项登录或权限。
3. 记录触发返回的运行 ID 或链接。若尚未返回，按触发时间、操作者和手动触发事件定位对应运行。CLI 可用 `gh run list --repo todly/tongpin-game --workflow wechat-upload.yml --event workflow_dispatch` 辅助定位。遇到超时或响应不明确，先检查是否已创建运行，避免重复上传。GitHub 的运行分支通常显示 `main`，实际构建分支由输入决定。
4. 跟进该运行直到结束。用 Actions 页面、连接器，或 `gh run watch RUN_ID --repo todly/tongpin-game --exit-status` 检查状态。用 `gh run view RUN_ID --repo todly/tongpin-game --log` 或对应步骤日志核验 **Upload development version** 成功，并找到 `已上传微信开发版本 <版本号> (<实际构建提交号>)`。若失败，查看失败步骤和日志，定位可恢复故障。只有确认已有运行没有完成上传且故障已解决时才重试，避免重复上传。
5. 输出目标分支、实际构建提交号、微信开发版本号和 Actions 链接。失败时说明失败步骤、错误及是否到达上传阶段。范围到微信开发版本为止。体验版、提审与正式发布由另外的用户指令启动。
