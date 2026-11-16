# WorkBuddy 动效逆向研究 / WorkBuddy Motion Study

> 对一个 AI 办公桌面应用（WorkBuddy 5.9.3，Electron）聊天界面 UI / 交互 / 动画的**独立研究**：
> 拆包 → 量参数 → 复刻 Demo → 提炼成可直接用的 CSS 动效库。

本仓库**不包含**任何原产品的二进制、安装包、完整前端产物或官网镜像，只有研究结论、自行编写的复刻代码与工具脚本。

## 这里面有什么

| 目录 | 内容 |
|---|---|
| `report/REPORT.md` | 完整报告：技术栈、设计 token、输入框/发送按钮实测数值、发送后分阶段动效、官网对照、组件参数表、全站过渡统计、状态类交互、存疑清单 |
| `kit/tokens.css` | 设计变量：色板、圆角、字号、阴影、5 档时长、5 条缓动曲线 + 暗色主题 |
| `kit/motion.css` | 15 个动效工具类（按压、图标旋转、滚动条、扫光、省略号、横幅、对话框、toast、chip、行内插入、上滑、下滑、骨架屏、spin） |
| `kit/verify.html` | kit 的自测页：每个类都挂在元素上 |
| `demo/index.html` | 聊天界面复刻：输入框长高、发送按钮状态、思考扫光、流式输出、列表揭示、悬浮操作、亮暗主题、0.25x–2x 速度回放 |
| `demo/gallery.html` | 组件动效画廊：13 个可复用动效，每条标注真实参数 |
| `tools/*.mjs` | 采集与分析工具：CDP 客户端、CSS 规则提取、无头浏览器页面自测、流式测量 |

## 怎么用

**只想看效果**：浏览器直接打开 `demo/index.html` 或 `demo/gallery.html`（纯静态，无依赖、不联网）。

**想抄参数**：读 `report/REPORT.md` 第 10–12 节的参数表；每个值都标了它在原产品 CSS 里的来源类名。

**想直接用**：

```html
<link rel="stylesheet" href="kit/tokens.css">
<link rel="stylesheet" href="kit/motion.css">

<div class="wb-anim-chip">弹入</div>
<div class="wb-skeleton" style="width:200px;height:14px"></div>
<span class="wb-shining">正在思考</span><span class="wb-dots"></span>
```

## 几条结论（比参数更重要的部分）

1. 全站 1733 条 transition：**150ms 占 747 次、200ms 占 608 次**（合计 78%），几乎没有 400ms 以上的 hover。
2. 过渡属性集中在颜色与透明度；`width` 只有 42 次、`height` 更少 —— 刻意避免触发 layout 的属性。
3. 消息气泡**没有**入场动画（静态 CSS + 运行时 getAnimations 双向验证）；"发出去有反应"的观感来自等待态三件套 + 列表容器 reveal。
4. 等待态是**三档时间尺度叠加**：扫光文字 2.2s 线性 + 逐格省略号 1s 步进 + 4s 后才出现的轮播提示语（0.32s 淡入）。
5. 超调曲线 `cubic-bezier(.34,1.56,.64,1)` 只给"弹入类"元素；确定性的位移/揭示用标准曲线。

## 免责声明

见 [NOTICE.md](NOTICE.md)。本项目与原产品厂商无任何关联，仅用于学习 UI/动效实现；所有商标归其所有者。

## License

本仓库自行编写的代码以 MIT 发布；报告文字以 CC BY 4.0 提供。
