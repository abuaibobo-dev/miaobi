# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 版本管理规则（强制）

每次功能/修复变更提交前，必须同步 bump 版本号（patch 或 minor），保证每次 Release 可区分：

1. `package.json` 的 `version` 字段
2. `app.json` 的 `version` 字段

两处必须一致递增（如 2.5.40 → 2.5.41）。构建产物会以新版本 tag 发布（v2.5.41），旧版本 Release 保持可下载。

CI 的 Typecheck + Test（vitest 37 用例）必须在构建前通过。
