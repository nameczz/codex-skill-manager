# Codex Skill Manager — 开源 + UI 现代化改造计划

## 项目现状

| 项目 | 现状 | 问题 |
|------|------|------|
| App.tsx | 3215 行单文件 | 不可维护，需拆分 |
| styles.css | 2422 行手写 CSS | 不可维护，缺动画/过渡 |
| UI 组件 | 9 个手写组件 | 无键盘交互/焦点管理/动画 |
| 设计 token | oklch 色彩体系 ✅ | 已有，质量好 |
| 暗色模式 | data-theme="dark" ✅ | 已有 |
| README | 96 行纯文字 | 无截图/徽章/架构图 |
| 开源文件 | 仅 LICENSE ✅ | 缺 CONTRIBUTING/CODE_OF_CONDUCT/CI 等 |

---

## Phase 1：开源基础设施（优先级最高）

> 目标：让项目达到「可以公开」的标准

### 1.1 README.md 重写
- [ ] 添加项目徽章（build status / license / npm version）
- [ ] 添加产品截图（light + dark 模式）
- [ ] 添加快速开始指南（Prerequisites → Install → Run）
- [ ] 添加架构概览图
- [ ] 添加目录结构说明
- [ ] 添加 FAQ / 故障排查
- [ ] 添加贡献指引链接

### 1.2 社区文件
- [ ] 创建 `CONTRIBUTING.md`（开发环境搭建、PR 流程、代码规范）
- [ ] 创建 `CODE_OF_CONDUCT.md`（采用 Contributor Covenant）
- [ ] 创建 `SECURITY.md`（安全漏洞报告指引）
- [ ] 创建 `CHANGELOG.md`（初始版本记录）

### 1.3 GitHub 配置
- [ ] 创建 `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] 创建 `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] 创建 `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] 创建 `.github/workflows/ci.yml`（lint + typecheck + test + build）

---

## Phase 2：UI 技术栈迁移

> 目标：从手写 CSS + 手写组件 → Tailwind CSS + shadcn/ui

### 2.1 安装 Tailwind CSS v4
- [ ] `npm install -D tailwindcss @tailwindcss/vite`
- [ ] 配置 `vite.config.ts` 添加 Tailwind 插件
- [ ] 创建 `tailwind.config.ts`，将现有 oklch token 映射为 Tailwind 主题变量
- [ ] 在入口文件引入 Tailwind 指令
- [ ] 逐步迁移 `styles.css` 中的样式到 Tailwind 类名

**关键：保留现有 oklch 色彩 token 作为 Tailwind 自定义色**

```ts
// tailwind.config.ts 示例
colors: {
  surface: 'oklch(var(--surface) / <alpha-value>)',
  accent: 'oklch(var(--accent) / <alpha-value>)',
  // ...
}
```

### 2.2 安装 shadcn/ui
- [ ] `npx shadcn@latest init`（选择 New York 风格，与你 PRODUCT.md 的 "restrained, precise" 一致）
- [ ] 逐个替换手写组件：
  - `button.tsx` → shadcn Button
  - `card.tsx` → shadcn Card
  - `dialog.tsx` → shadcn Dialog（Radix 底层，焦点陷阱 + 动画）
  - `sheet.tsx` → shadcn Sheet（Radix 底层）
  - `input.tsx` → shadcn Input
  - `select.tsx` → shadcn Select
  - `textarea.tsx` → shadcn Textarea
  - `badge.tsx` → shadcn Badge
  - `checkbox.tsx` → shadcn Checkbox
- [ ] 额外引入的 shadcn 组件：
  - `Table` — 替换现有 div 模拟的表格
  - `Tooltip` — 替换手写 tooltip
  - `DropdownMenu` — 用于操作菜单
  - `Separator` — 替换手写分隔线
  - `Skeleton` — 替换手写骨架屏
  - `Tabs` — 如有需要

### 2.3 清理 styles.css
- [ ] 删除被 Tailwind/shadcn 替代的 CSS 规则
- [ ] 保留仅作为 CSS 变量定义的 `:root` / `[data-theme="dark"]` 块
- [ ] 最终 `styles.css` 应 < 100 行（仅变量 + 全局重置）

---

## Phase 3：App.tsx 拆分

> 目标：3215 行 → 每个文件 < 300 行

### 3.1 页面/视图级拆分
- [ ] `views/SkillListView.tsx` — 主列表视图
- [ ] `views/SettingsView.tsx` — 设置页
- [ ] `views/ArchiveView.tsx` — 归档页
- [ ] `views/SetupView.tsx` — 初始化引导页

### 3.2 业务组件拆分
- [ ] `components/SkillCard.tsx` — 单个 Skill 卡片
- [ ] `components/SkillTable.tsx` — 技能列表表格
- [ ] `components/SyncStatus.tsx` — 同步状态指示器
- [ ] `components/ConflictResolver.tsx` — 冲突解决对话框
- [ ] `components/SkillDetailSheet.tsx` — 技能详情抽屉
- [ ] `components/SearchFilter.tsx` — 搜索筛选栏

### 3.3 状态管理提取
- [ ] `hooks/useSkills.ts` — 技能数据 CRUD
- [ ] `hooks/useSync.ts` — 同步状态和操作
- [ ] `hooks/useSettings.ts` — 配置管理
- [ ] `hooks/useTheme.ts` — 主题切换

### 3.4 App.tsx 最终角色
- [ ] 仅保留顶层布局 + 路由 + Provider
- [ ] 目标 < 150 行

---

## Phase 4：UI 打磨（视觉效果提升）

> 目标：从「能用」到「好看」

### 4.1 动效系统
- [ ] 全局过渡动画（`transition-all duration-200`）
- [ ] Dialog/Sheet 入场动画（shadcn 自带 `data-[state=open]` 动画）
- [ ] 列表项 hover 效果
- [ ] 页面切换过渡
- [ ] 骨架屏 shimmer 动画优化

### 4.2 视觉细节
- [ ] 表格行加 hover 高亮和斑马纹
- [ ] 状态徽标（Status Badge）颜色对齐设计 token
- [ ] 空状态插图/文案
- [ ] 加载状态统一（Skeleton 替代文本 "Loading..."）
- [ ] 错误状态统一（ErrorBoundary + 友好提示）
- [ ] 操作按钮加确认弹窗（destructive 操作必须二次确认）

### 4.3 布局优化
- [ ] 响应式适配（当前似乎是固定宽度布局）
- [ ] 侧边栏可折叠
- [ ] 主内容区 min-width 处理

### 4.4 无障碍（WCAG AA）
- [ ] 所有交互元素键盘可访问（shadcn/Radix 自带）
- [ ] 焦点状态清晰可见
- [ ] 颜色对比度验证
- [ ] aria-label 补全
- [ ] 减少动效偏好支持 `prefers-reduced-motion`

---

## Phase 5：加分项（可选）

### 5.1 Command Palette
- [ ] 安装 `cmdk` 库
- [ ] 实现全局搜索 + 快捷操作面板（⌘K）
- [ ] 这是让你区别于普通开源项目的亮点

### 5.2 文档站
- [ ] 用 VitePress 搭建文档站
- [ ] 部署到 GitHub Pages
- [ ] 包含：快速开始、配置说明、架构设计、API 参考

---

## 执行优先级

```
Phase 1 (开源基础设施)    ████████ 必须先做，否则不能开源
Phase 2 (技术栈迁移)      ███████  核心改造，决定后续效率
Phase 3 (App.tsx 拆分)    ██████   配合 Phase 2 一起做
Phase 4 (UI 打磨)         █████    视觉效果，开源后可持续优化
Phase 5 (加分项)           ███      有余力再做
```

## 关键文件清单

| 文件路径 | 操作 |
|----------|------|
| `web/src/styles.css` | 大幅删减，保留变量定义 |
| `web/src/App.tsx` | 拆分为多个文件 |
| `web/src/components/ui/*.tsx` | 全部替换为 shadcn/ui |
| `web/vite.config.ts` | 添加 Tailwind 插件 |
| `web/tailwind.config.ts` | 新建 |
| `web/postcss.config.js` | 新建 |
| `README.md` | 重写 |
| `CONTRIBUTING.md` | 新建 |
| `CODE_OF_CONDUCT.md` | 新建 |
| `SECURITY.md` | 新建 |
| `CHANGELOG.md` | 新建 |
| `.github/workflows/ci.yml` | 新建 |
| `.github/ISSUE_TEMPLATE/*` | 新建 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 新建 |

## 预估工作量

| Phase | 预估时间 | 说明 |
|-------|---------|------|
| Phase 1 | 1-2 天 | 主要是写文档，自动化程度高 |
| Phase 2 + 3 | 3-5 天 | 技术迁移 + 重构，最核心的工作 |
| Phase 4 | 2-3 天 | UI 细节打磨，可迭代 |
| Phase 5 | 2-3 天 | 可选，按需安排 |
