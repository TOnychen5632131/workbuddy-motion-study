# motion.css / tokens.css —— 从 WorkBuddy 5.9.3 抄出来的最小动效库

两个文件、无依赖，直接放进项目：

~~~html
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="motion.css">
~~~

tokens.css 只有 CSS 变量（色板、圆角、字号、阴影、5 档时长、5 条曲线）；motion.css 只有 keyframes + 工具类，全部引用变量，改一处全局生效。

## 工具类 ↔ 真实实现对照

| 类 | 真机来源 | 参数 |
|---|---|---|
| .wb-press | .cr-send-button:active | scale(.93)，transform .1s |
| .wb-rotate-icon | .expert-selector__btn svg | .42s cubic-bezier(.25,.8,.3,1)，aria-expanded=true 时转 180 度 |
| .wb-scroll / .is-idle | .cr-message-list 滚动条 | thumb background-color .2s，空闲透明 |
| .wb-shining | .cb-shining-text | 110 度渐变 + background-clip:text，2.2s linear infinite |
| .wb-dots | .cb-loading-dots | content 步进，1s steps(4,end) infinite |
| .wb-fade-in | .cb-tip-fade-in | .32s（用 --wb-dur-gentle）ease-out |
| .wb-anim-banner | wb-error-banner-slide-in | .3s ease-out，translateY(-10px) |
| .wb-anim-overlay / .wb-anim-dialog | sc-dialog-overlay-in / sc-dialog-content-in | .2s，scale(.96) |
| .wb-anim-toast | scui-toast-slide-in-bottom | .22s cubic-bezier(.16,1,.3,1) |
| .wb-anim-chip | wb-connector-dep-chip-enter | .4s 超调 cubic-bezier(.34,1.56,.64,1) |
| .wb-anim-row | sc-search-replace-row-in | .16s，max-height + scaleY(.92) |
| .wb-anim-up / --delay | wb-home-enter-scene-row | .3s decelerate（delay .3s） |
| .wb-anim-down | wb-home-enter-query | .38s expo |
| .wb-skeleton | wb-home-skeleton-shimmer | 1.4s ease-in-out infinite |
| .wb-spin | wb-icon-spin | .7s linear infinite |

## 三条使用纪律（抄自真实产品，别破坏）

1. 状态切换只用 --wb-dur-fast(.15s) / --wb-dur-medium(.2s)；入场用 --wb-dur-gentle(.3s) 或 --wb-dur-slow(.4s)。
2. 只过渡 opacity / transform / background-color / box-shadow；尺寸变化不要写 transition，靠内容撑开。
3. 超调曲线 --wb-ease-overshoot 只给弹入类元素，状态切换一律 --wb-ease-std。

## 自测

verify.html 把每个类都挂到元素上，用 headless Chrome 打开可自检：

~~~
node ../tools/page-check.mjs "file:///<绝对路径>/kit/verify.html" "(()=>({anims:document.getAnimations().length}))()"
~~~

最近一次自检结果：10 个动画在跑、--wb-dur-fast=0.15s、--wb-ease-overshoot 正确、--wb-brand=#00c29a、无 JS 异常。
