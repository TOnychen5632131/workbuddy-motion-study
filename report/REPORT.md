# WorkBuddy 5.9.3 聊天界面 · 交互 · 动效 逆向报告

> 目标：搞清楚 WorkBuddy 桌面端「发出去之后到底发生了什么」，把 UI / 交互 / 动画的实现方式、精确参数、可复用模式整理出来，并给出可运行的复刻 Demo。
> 方法：安装包解包（NSIS → app-64.7z → app.asar → 渲染层产物）+ 运行期 CDP 实测（getComputedStyle / getAnimations / MutationObserver / 定时截图）。
> 所有结论都能在 analysis/ 下找到对应原始数据。

---

## 0. 一句话结论

WorkBuddy 的高级感不是靠某个炫酷动画库，而是靠一套完整的动效 token 体系 + 克制的短时长过渡 + 逐帧对齐的状态机：
一个 800px 宽的圆角输入框（24px 圆角、两层阴影、只过渡 box-shadow）、一个 32px 圆形发送按钮（只过渡 opacity/transform）、发送后先出现 shining-text 扫光「正在思考」+ 逐格省略号 + 轮播提示语，再把消息列表用带回弹的 0.32s 曲线揭示出来，流式输出时工具调用卡片各自带 loading shimmer。
全部动效都落在 100–400ms 区间，并且尊重 prefers-reduced-motion。

---

## 1. 技术栈（静态证据）

| 层 | 结论 | 证据 |
|---|---|---|
| 应用 | WorkBuddy 5.9.3，Electron 37.10.3 / Chromium 138.0.7204.251 | runtime/rec-meta.json 的 UA；app/WorkBuddy.exe |
| 打包 | NSIS 安装器内是 $PLUGINSDIR\app-64.7z，解出 resources/app.asar（173.6MB），另有 app.asar.unpacked | ~/.workbuddy/logs/installer.log；7-Zip 列表 |
| 渲染层 | React + Vite 哈希分包（renderer/assets 1766 个文件、150 个 CSS），CSS Modules（_xxx_hash_line 类名） | renderer/index.html；asar/renderer/assets |
| 样式体系 | 自研 --wb-* 设计变量 + TDesign（--td-*）+ 组件级 --cb-* / --cr-* | asar/renderer/assets/tokens-Df-i-zsO.css；analysis/tokens-root.txt |
| 动画实现 | 主要 CSS keyframes + transition；react-loading-skeleton；可用 document.getAnimations() 观测 | runtime/keyframes.json（429 条 @keyframes）、runtime/transitions.json |
| 无障碍 | 消息列表动效在 prefers-reduced-motion: reduce 下关闭 | src-B0vFhECH.css：.cr-message-list__content{transition:none} |

---

## 2. 设计变量：动效与视觉的底盘

来源：asar/renderer/assets/tokens-Df-i-zsO.css（完整导出见 analysis/tokens-root.txt，1442 行）。

**动效 token（这套最值得抄）**

```
--wb-motion-duration-instant: .1s;      --wb-motion-easing-decelerate: cubic-bezier(0, 0, .2, 1);
--wb-motion-duration-fast:    .15s;     --wb-motion-easing-accelerate: cubic-bezier(.4, 0, 1, 1);
--wb-motion-duration-medium:  .2s;      --wb-motion-easing-standard:   cubic-bezier(.4, 0, .2, 1);
--wb-motion-duration-gentle:  .3s;      --wb-motion-easing-emphasized: cubic-bezier(.2, 0, 0, 1);
--wb-motion-duration-slow:    .4s;      --wb-motion-easing-linear: linear;
```

**颜色 / 圆角 / 字号**

```
品牌色 --wb-palette-brand-8: #00c29a     头像底 --wb-palette-brand-1: #dff7f2
文字   --wb-color-text-primary #000 /-secondary #000000b3 /-tertiary #00000080
底色   --wb-color-bg-primary-default #f2f2f2（页面）/ -secondary-default #fff（卡片）
圆角   2 4 6 8 12 16 20 24 9999px（xs→full）
字号   8 10 12 13 14 16 18 20 24 28 32px；正文 15px，行高 26.25px（=1.75）
```

**暗色主题（[data-theme=dark] 段实测，可直接抄）**

~~~
文字   #fff / #ffffffa6 / #ffffff80
底色   gray-1 #141414  gray-2 #292929  gray-3 #1f1f1f（页面底）  gray-4 #242424  gray-5 #3a3a3a
品牌   brand-8 #4cf0ce（比亮色 #00c29a 更亮，保证暗底对比度），brand-1 #0e2520（暗底上的浅品牌底）
~~~
---

## 3. 输入区：全部实测数值（可直接照抄）

来源：analysis/runtime/composer-style.txt、runtime/rec-meta.json、runtime/css-send.txt。

```css
.cr-input-container {              /* 输入框外壳，实测 800x143.3 */
  width: 800px; min-height: 96px; border-radius: 24px;
  border: 0.667px solid rgba(0,0,0,.15);   /* 1px 在 1.5x DPR 下的实际值 */
  background: #fff;
  box-shadow: 0 16px 32px -8px rgba(0,0,0,.06), 0 2px 4px -4px rgba(0,0,0,.1);
  transition: box-shadow .15s;             /* 只动阴影，不动宽高 */
  padding: 12px 0 0;
}
.cr-input-editor-host {            /* 可编辑区 */
  padding: 0 16px; min-height: 74px; max-height: 252px;
  font-size: 15px; line-height: 26.25px; overflow-y: auto;
}
.cr-send-button {                  /* 发送按钮，实测 32x32 */
  width: 32px; height: 32px; border-radius: 50%; background: transparent;
  transition: opacity .15s, transform .1s;
}
/* 禁用态靠 class wb-button--disabled + cursor: not-allowed，不是整块置灰 */
```

**交互实测（rec-meta.json.meta）**

| 状态 | 输入框高度 | 发送按钮 |
|---|---|---|
| 初始 / 清空后（空文本） | 143.33px | wb-button--disabled，disabled=true，cursor: not-allowed |
| 输入 124 字后 | 153.46px（+10px，随内容长高） | disabled=false，cursor: pointer |
| 焦点态 | 加 --focused 修饰类，阴影加深 | — |

可抄的点：输入框长高不是 height 动画，而是内容撑开 + box-shadow 0.15s 过渡 —— 看不到高度跳变，只看到焦点光晕。

---

## 4. 发送之后：分阶段动效

运行期录了一整轮（runtime/rec-*.json；10 张定时截图在 analysis/runtime/shots/：01 输入长高 → 02 可发送 → 03 60ms → 04 150ms → 05 300ms → 06 550ms → 07 900ms → 08 1400ms → 09 2200ms → 10 3200ms）。

### 阶段 A — 点击瞬间（0–150ms）

**关于「消息气泡本身的入场动画」——已验证：没有。**
- 静态：把 renderer 的 150 个 CSS 全部按 cr-self-message / cr-assistant-message / cr-message-item 扫过，没有任何 animation 或 @keyframes 声明作用在消息元素上（唯一命中的是 opacity:.48 这类状态样式）。
- 运行时：一次完整发送的 document.getAnimations() 快照里，只有 react-loading-skeleton、cb-shining-text-sweep、wb-icon-spin 与 scrollbar / background / opacity 过渡，没有消息节点动画。
- 结论：气泡是瞬时插入的。「有反应」的观感来自 ① 列表容器 reveal（下面这条过渡）② 发送按钮与输入框的状态切换 ③ 等待指示器三件套。这反而说明：AI 聊天界面不需要给消息加花哨入场动画，加了容易显廉。
- 反例：每日签到奖励气泡确实有动画 daily-checkin-slide-in（.daily-checkin--bubble，opacity 过渡 .2s），可当「例外场景」参考。
用户消息入列、输入框清空回落、发送按钮立刻回到 disabled。消息列表容器走 reveal 过渡：

```css
.cr-message-list__content {
  transition: transform .32s cubic-bezier(.34,1.56,.64,1),   /* 带回弹的位移 */
              opacity   .3s  cubic-bezier(.4,0,.2,1);        /* 标准淡入 */
}
.cr-message-list__content--hydrating { opacity:0; visibility:hidden }  /* 首屏水合 */
.cr-message-list__content--revealed  { opacity:1; visibility:visible }
.cr-message-list--loading-more .cr-message-list__content { transform: translateY(40px) }
```

cubic-bezier(.34,1.56,.64,1) 是超调曲线（1.56 > 1），位移会过冲一点再回来 —— 这是列表动效有弹性的关键。

### 阶段 B — 等待响应（150ms 起）：三件套叠加

1) shining-text 扫光文字（真实类名 .cb-shining-text / ._loadingText_*）

```css
@keyframes cb-shining-text-sweep { 0%{background-position:200% 0} to{background-position:-200% 0} }
.cb-shining-text {
  background: linear-gradient(110deg,
      rgba(0,0,0,.26) 0%, rgba(0,0,0,.26) 35%, rgba(0,0,0,.55) 50%,
      rgba(0,0,0,.26) 65%, rgba(0,0,0,.26) 100%);
  background-size: 200% 100%;
  background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
  animation: cb-shining-text-sweep 2.2s linear infinite;
}
```

2) 逐格省略号（.cb-loading-dots）：content 从空 → . → .. → ...，1s steps(4,end) infinite。

3) 轮播提示语（LoadingTip 组件）：initialDelayMs = 4000，rotationIntervalMs = 10000（4 秒后才出现，之后每 10 秒换一条），
   提示文本 .tipText 用 .32s ease-out forwards 的 cb-tip-fade-in 淡入；提示语旁的关闭按钮用 opacity .16s ease-out 淡入。

### 阶段 C — 工具调用 / 流式输出

**流式输出实测（2026-11-16 早 补测）**

- 点击发送 → 首个可见 token：**≈3.7s**（一轮，受网络/模型负载影响，仅作量级参考）。
- 整轮完成：页面上标注 **已完成 33s**（同一轮里另一次短问答）。
- 文本不是逐字打出来的：采样到的是**块状跳跃**（约 4.6s 时一次性出现 37 字，5.7s 到 45 字），符合 markdown 块级渲染 + 模型 chunk 下发的特征。
- 采样陷阱（留给后来者）：不要用 .cr-document 的 innerText 长度当字符速率代理 —— 它是虚拟列表容器，长度会随"思考中/已完成"文案替换而回退（实测 123→222→160 反复跳）；要测需要锁定单条助手消息的正文容器。
- 脚本：tools/stream-probe4.mjs（时间/长度）、tools/stream-probe5.mjs（MutationObserver 逐块），原始数据 analysis/runtime/stream-timeline.json、stream-chunks.json。
- 代码侧证据（2026-11-16 下午补）：聊天分块里能定位到 useStreamingStick（ResizeObserver + 视口高度差判断是否贴底自动滚动）、useStreamingDurationMs / useTurnDurationMs（把本轮耗时显示成「已完成 33s」）、turnCollapsed / isCancelled 状态。**没有任何 typewriter / 逐字渲染的钩子** —— 与实测的块状跳跃一致：文本按块追加，界面只负责贴底滚动 + 计时。


工具调用按类型分发的 compact 渲染器，每种都有独立 loading 态类名：
write-file-compact__action--loading、execute-command-compact__command--loading、web-search-compact__action--loading、
unknown-tool-renderer .loading-text、single-line-tool-header .status-text.loading-text。

- 骨架屏用 react-loading-skeleton（捕获到 13 个实例），配 wb-card-skeleton-shimmer。
- 旋转图标：wb-icon-spin / wb-button-spin / wb-loading-rotate（0.7s 量级）。
- 思考过程折叠区：assistantReasoning 组件，用 streaming / complete 两个状态类控制展开与收起。

### 阶段 D — 停止 / 后续操作

- 停止按钮样式已导出：runtime/css-stop.txt。
- 悬浮操作条：.assistant-message-tools、.cr-message-bottom-toolbar（复制 / 重新生成 / 评分 _copyButton_*、_ratingButton_*），
  出现方式是 opacity + translateY 的短过渡（100–160ms）。

---

## 5. 其他可复用动效（从 429 条 keyframes 里挑出来的）

来源：runtime/keyframes.json、analysis/runtime/css-keyframes-picked.txt。

| 名称 | 用途 | 说明 |
|---|---|---|
| wb-message-enter | 顶部 toast（不是聊天消息） | .15s + decelerate，配 16px 位移；toast 另有 reposition .25s ease 的重排过渡 |
| wb-popover-fade-in | 气泡 / 菜单 | 短淡入 |
| wb-card-skeleton-shimmer | 卡片骨架 | 与 react-loading-skeleton 配合 |
| scui-toast-slide-in-* | 各类 toast | 方向化滑入 |
| sc-dialog-overlay-in / sc-dialog-content-in | 对话框 | 遮罩淡入 + 内容缩放位移 |
| sc-search-replace-row-in | 编辑器内行级插入 | 行高 / 位移组合 |
| sk-shimmer-move / sk-spin | 另一套组件库（编辑器侧） | 可直接借鉴的 shimmer 写法 |

---

## 6. 复刻要点（Demo 已按这些参数实现）

1. 动效全部 token 化：先定义 duration / easing 变量，组件里只引用变量，禁止裸写 0.3s ease。
2. 时长梯度：即时反馈 .1s（按下缩放）、状态切换 .15s（按钮 / 阴影）、内容出现 .2–.3s、面板揭示 .32s（带回弹）。
3. 只过渡该过渡的属性：输入框只过渡 box-shadow、按钮只过渡 opacity/transform、列表只过渡 transform/opacity —— 避免 layout 抖动。
4. 超调曲线只用于一次性内容揭示 cubic-bezier(.34,1.56,.64,1)；状态切换一律标准曲线 cubic-bezier(.4,0,.2,1)。
5. 等待态要有层次：扫光文字（2.2s 线性）+ 省略号（1s 步进）+ 4s 后才出现的提示语（.32s 淡入），三档时间尺度叠加，等待才不死板。
6. 尊重 prefers-reduced-motion，把位移 / 回弹降级为纯淡入。
7. 悬浮操作条用 opacity + translateY(-2px)，160ms 以内，不要用 display 切换。

---

## 7. 交付物

- demo/index.html —— 单文件可运行复刻：设计变量、亮/暗主题切换、输入框长高与 focus 光晕、发送按钮 ready/disabled 切换、shining-text 扫光思考、逐格省略号、轮播提示语（4s 延迟 / 10s 轮换 / .32s 淡入）、工具调用卡片（loading → done + 展开折叠）、流式打字机 + 光标、列表 reveal 回弹、悬浮操作条、0.25x–2x 速度回放。已用 headless Chrome + CDP 功能自测：无 JS 异常，各机制按预期触发。
- analysis/runtime/shots/*.png —— 真实发送流程 10 帧截图（给肉眼对比）。
- analysis/runtime/rec-*.json —— 原始采样（动画、DOM 变更、事件、逐帧几何）。
- analysis/runtime/keyframes.json、transitions.json、css-*.txt —— 从真实页面 dump 的样式证据。
- analysis/tokens-*.txt —— 完整设计变量表。
- demo/gallery.html —— 组件动效画廊：13 个可复用组件/交互（横幅、对话框、toast、chip、骨架屏、场景行、提问、行内插入、签到、进度横幅、按钮按压、箭头旋转、滚动条自动隐藏），每条都标真实参数并可重放、可切 0.25x–2x 速度。
- analysis/keyframes-ui.txt —— 从 569 段 @keyframes 里抽出的全量清单（名称 + 关键帧体）。
- kit/tokens.css + kit/motion.css —— 可直接引入项目的最小实现：设计变量 + 15 个动效工具类（按压、图标旋转、滚动条、扫光、省略号、横幅、对话框、toast、chip、行内插入、上滑、下滑、骨架屏、spin），带 prefers-reduced-motion 降级。kit/README.md 是「工具类 ↔ 真机来源」对照表，kit/verify.html 是自测页（headless 验证：10 个动画在跑、token 全部解析正确、无 JS 异常）。
- analysis/static/ —— 静态侧证据（打包分块、keyframes 抽取）。

## 8. 没做完 / 存疑

- 聊天消息气泡入场动画：已确认为「不存在」（静态 150 个 CSS + 运行时 getAnimations 双向验证）。
- 停止按钮点击后的动画未采集（只导出了样式）。
- 工具调用卡片展开 / 收起的时长未逐个测量。
- 流式回复节奏：实测一轮短问题从点击到页面标注「已完成 33s」，首 token 约 3.7s；逐块间隔分布的精确采样仍未完成（容器选择器未锁定）。
- 停止按钮 / 工具卡片实测（2026-11-16 下午 尝试补测，被环境卡住）：从解包目录启动 WorkBuddy 失败，进程以 0x80000003 立即退出；加 --no-sandbox 能起进程但无窗口、无 CDP 端口（9222 当时被用户的 Chrome 占用）。因此这两项仍只有静态证据：
  - 停止中状态图标：._statusIcon._statusIconSpin 使用 _spin 关键帧，animation 2s linear infinite（慢速旋转，不是 0.7s 的快转）；
  - 工具卡片：._toolCallHeader / _toolCallBody / _toolCallSection 均**没有** transition 声明，展开/收起是直接挂载/卸载，没有过渡动画 —— 与"App 端克制"的结论一致。
  - 排查建议：把提取的 app 目录恢复成正常安装（Program Files）或用安装包重装后再带 --remote-debugging-port 启动；确认 EDR（机器上装了 Sangfor 等）没有拦截从非安装目录启动的 Electron。
- 暗色主题（[data-theme=dark]）变量表已定位但未展开对比。


---

## 9. 附：官网 www.workbuddy.cn 的动效实现（另一套语言，可对照）

站点：https://www.workbuddy.cn （Vite SPA，CSS 变量前缀 --wb2-，全站平滑滚动用 **Lenis**；本次抓到 14 段 @keyframes、10 条 animation 声明，资产存放在 workbuddy/website/）。

**关键帧清单**

~~~
wb2-hero-rise          0%{opacity:0; translateY(38px); blur(10px)} → 100%{opacity:1; none; blur(0)}
wb2-hero-shot-in       0%{opacity:0; translateY(96px) scale(1.07) rotateX(15deg); blur(14px)} → 100%{opacity:1; none}
wb2-hero-veil-in       0%{opacity:0; scale(.55)} → 100%{opacity:.92; scale(1)}
wb2-hero-veil-breathe  0%,100%{opacity:.92; scale(1)} 50%{opacity:1; scale(1.05)}   ← 循环
wb2-hero-fade          0%{opacity:0} → 100%{opacity:1}
wb2-scene-copy-in      0%{opacity:0} → 100%{opacity:1}
wb2-scene-workspace-in 0%{opacity:0; translate3d(0,12px,0) scale(.992)} → 100%{opacity:1; none}
wb2-scene-output-in    0%{opacity:0; translate3d(12px,24px,0) scale(.975)} → 100%{opacity:1; none}
wb2-scene-soft-in      0%{opacity:0; translate3d(0,var(--wb2-layer-offset,10px),0)} → 100%{opacity:1}
wb2-scene-art-in-cover 0%{opacity:0; translateY(12px) scale(.99)} → 100%{opacity:1}
wb2-scene-art-float-cover 0%,100%{translateY(0) scale(1)} 50%{translateY(-4px) scale(1.004)}  ← 循环
wb2-eco-rays-breathe   0%,100%{opacity:.3; scale(1)} 50%{opacity:.42; scale(1.04)}  ← 循环
~~~

**时间参数（真实声明）**

~~~
wb2-hero-rise         .85s cubic-bezier(.16,1,.3,1)  .2s / .3s backwards
wb2-hero-shot-in      1.15s cubic-bezier(.16,1,.3,1) .34s backwards
wb2-hero-veil-in      1.15s cubic-bezier(.16,1,.3,1) both + breathe 5.5s ease-in-out infinite
wb2-hero-fade         .8s ease .5s backwards
wb2-scene-copy-in     .42s / .46s cubic-bezier(.16,1,.3,1)，第二条 70ms 延迟（错峰）
wb2-scene-art-in-cover .72s cubic-bezier(.22,1,.36,1) both + float 9s ease-in-out infinite
wb2-eco-rays-breathe  8s ease-in-out infinite
~~~

**和桌面端的差异（同样是"高级感"，两种思路）**

| 维度 | 桌面端 App | 官网 |
|---|---|---|
| 时长 | 100–400ms（即时反馈优先） | 420ms–1.15s（允许观众等待） |
| 缓动 | 标准/超调（.4,0,.2,1 / .34,1.56,.64,1） | 强烈的 easeOut 曲线（.16,1,.3,1 / .22,1,.36,1） |
| 手法 | 位移 + 透明度，几乎无模糊 | 位移 + 模糊 + 透视旋转（rotateX）+ 缩放一起上 |
| 循环动效 | 只有扫光/spin 这类"状态提示" | 大量长周期呼吸/漂浮（5.5s / 8s / 9s），幅度极小（scale 1→1.05、位移 4px） |
| 错峰 | 靠状态机（等到某步才出现） | 靠 animation-delay（70ms 起步的 stagger） |

**可直接抄的三条**

1. 官网式大入场：位移 + blur + scale 三者同时过渡，曲线一律 cubic-bezier(.16,1,.3,1)（近似 easeOutExpo），时长 .85–1.15s，配 .2–.35s 的延迟错峰。
2. 循环动效要"长周期 + 小幅度"：5–9 秒一轮、scale 只动 0.4–5%、位移不超过 4px，看起来才像呼吸而不是抖动。
3. 长列表/多元素入场用 70ms 的 animation-delay 步进，比 JS 里 setTimeout 更稳。
---

## 10. 组件级动效参数表（可直接抄，全部来自真实 CSS）

从 569 段 @keyframes 里挑出的、可直接复用到业务组件的一组。完整清单见 analysis/keyframes-ui.txt，可视化见 demo/gallery.html。

| 组件 | keyframes | 参数 | 变换 |
|---|---|---|---|
| 错误横幅 | wb-error-banner-slide-in | .3s ease-out | translateY(-10px) → 0，opacity 0 → 1 |
| 对话框遮罩 | sc-dialog-overlay-in | .2s | opacity 0 → 1 |
| 对话框内容 | sc-dialog-content-in | .2s | scale(.96) → 1 + opacity |
| Toast（底部） | scui-toast-slide-in-bottom | .22s cubic-bezier(.16,1,.3,1) | translateY(24px)+scale(.98) → 0 |
| 弹入 chip | wb-connector-dep-chip-enter | .4s cubic-bezier(.34,1.56,.64,1) | translateY(4px)+scale(.95) → 0（超调） |
| 技能推荐 chip | wb-skill-rec-chip-slide-in | .4s cubic-bezier(.34,1.56,.64,1) | translate(-12px)+scale(.92) → 0 |
| 骨架屏扫光 | wb-home-skeleton-shimmer | 1.4s ease-in-out infinite | translate(0) → translate(100%)，配白色渐变遮罩 |
| 首页场景行 | wb-home-enter-scene-row | .46s + delay .3s，backwards | translate(48px) → 0 |
| 首页提问 | wb-home-enter-query | .38s，backwards | translateY(-12px) → 0 |
| 推荐卡片 | wb-related-playbooks-card-enter | .32s cubic-bezier(.22,.61,.36,1) | translateY(8px)+scale(.98) → 0 |
| 行内插入 | sc-search-replace-row-in | .16s cubic-bezier(.16,1,.3,1) | max-height 0→60px + scaleY(.92) |
| 签到气泡 | daily-checkin-slide-in | .3s ease-out | translateY(6px) → 0 |
| 顶部进度横幅 | cb-top-progress-banner-slide-in | .2s ease-out | translate(-50%,-8px) → (-50%,0) |
| 提示语淡入 | cb-tip-fade-in | .32s ease-out forwards | opacity 0 → 1 |

规律（比单个数值更重要）：

1. **超调曲线只给"弹入类"**（chip、卡片）：cubic-bezier(.34,1.56,.64,1)，时长 .32–.4s。
2. **走"更快的 easeOut"**（.16,1,.3,1）给更"现代"的滑动：toast .22s、行内插入 .16s。
3. **纯 fade/slide 的提示类**一律 .2–.3s ease-out（横幅、签到、进度）。
4. **列表入场带 delay 步进**（场景行 .3s delay），而不是靠 JS 逐个 setTimeout。
5. 骨架屏扫光固定 **1.4s ease-in-out infinite**，渐变是"透明 → 白 75% → 透明"。
---

## 11. 全站过渡统计（1733 条 transition 规则聚合）

数据源：运行时从页面 dump 的全部 styleSheet 规则（analysis/runtime/transitions.json），抽 1733 条含 transition 的声明。

**时长分布（毫秒 : 出现次数）**

~~~
150ms : 747     200ms : 608     120ms : 185     100ms : 70     300ms : 56
180ms :  43     160ms :  35     280ms :  34     240ms :  19     250ms :  16
~~~

> 150ms + 200ms 占绝对多数（1355 / 1733 ≈ 78%）。这就是"响应快但不生硬"的数值来源：状态切换永远控制在两帧到四帧之间。

**过渡属性 Distribution**

~~~
background-color 350   opacity 345   color 326   background 263   transform 199
border-color 131       box-shadow 66  width 42    visibility 29
~~~

> 前四名全是"颜色 + 透明度"（这些属性只触发 paint，不触发 layout）；transform 199 次用于位移/缩放；width 只有 42 次、height 更少 —— 说明团队刻意避免过渡会触发 layout 的属性。

**可以直接抄的三条纪律**

1. 状态色/描边类交互统一 **150ms**；需要一点"从容感"的用 **200ms**；不要出现 400ms 以上的 hover。
2. 只用 opacity / transform / background-color / box-shadow 做过渡；换尺寸用"内容撑开 + 不写 transition"，靠布局自然发生。
3. 需要位移时优先 transform 而不是 top/left/width。
---

## 12. 状态类交互（hover / press / 展开 / 滚动条）

这一组不是入场动画，而是每时每刻都在发生的反馈，最容易做得廉价，也最容易做高级。

| 交互 | 选择器 | 参数 | 说明 |
|---|---|---|---|
| 发送按钮按下 | .cr-send-button:active:not(:disabled) | transform: scale(.93) | 配 transform .1s；按下去缩一点点，松开回弹 |
| 展开箭头旋转 | .expert-selector__btn .wb-button__content>svg:last-child | transition: transform .42s cubic-bezier(.25,.8,.3,1) | 展开态 aria-expanded=true 时旋转 180 度，曲线比常态慢、带回弹感 |
| 滚动条自动隐藏 | .cr-message-list--scrollbar-idle::-webkit-scrollbar-thumb | background-color .2s，空闲时 #0000 | 另有 --suppress-scrollbar（overflow:hidden）与 --scrollbar-idle 两个状态类 |
| 悬浮工具栏 | .cr-frame--right:hover .cr-toolbar | opacity 1 + pointer-events:auto，transition-delay 0s | 鼠标进入右侧帧才出现，离开用 delay 做消抖 |
| 输入框 focus | .cr-input-container--focused | box-shadow .15s 加深 | 不改变尺寸，只加深阴影 |

**规律**

1. 按压缩放统一在 .92–.93、时长 .1s；不要做 1.05 的放大按压，会显得廉价。
2. 图标旋转（展开/收起）用 .4s 级别的慢曲线 cubic-bezier(.25,.8,.3,1)——旋转比位移更需要回弹感，快了会像开关。
3. 滚动条不要常驻：.2s 淡出到全透明，鼠标滚轮时再回来，这一条对干净的观感贡献很大。
4. 悬浮工具栏用 opacity + pointer-events 而不是 display，配合 transition-delay 做进入/离开的不对称。