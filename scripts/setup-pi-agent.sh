#!/bin/bash
# 妙笔 Pi Agent 一键安装脚本 (Termux)
echo "🧠 妙笔 Pi Agent 安装"
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ]; then echo "❌ 需要 ARM64"; exit 1; fi
echo "✅ 架构: $ARCH"
pkg update -y 2>/dev/null && pkg install -y curl xz-utils 2>/dev/null
echo "⬇️ 下载 Pi Agent v0.3.0..."
curl -sL "https://github.com/Dicklesworthstone/pi_agent_rust/releases/download/v0.3.0/pi-linux-arm64.tar.xz" -o /tmp/pi.tar.xz
echo "⚠️  供应链提醒：第三方二进制无 SHA256 校验，请从可信源确认后安装"
echo "   (可先 sha256sum /tmp/pi.tar.xz 并对比上游 release 的 checksum)"
cd /tmp && tar xf pi.tar.xz && cp pi-0.3.0-aarch64-unknown-linux-gnu/pi ~/pi && chmod +x ~/pi
echo "✅ 安装完成！运行 ~/pi 启动"
