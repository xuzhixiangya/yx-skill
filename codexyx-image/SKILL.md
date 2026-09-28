---
name: codexyx-image
description: 用公司 AI 网关（https://aiapi.yxrobot.com/v1）的图像接口生成或编辑图片。当用户说"生成图片/画一张图/文生图/做张配图/帮我画/搞个图/生成个 logo/create an image/generate image"，或"改图/图生图/编辑这张图/换背景/给图片加点东西/局部重绘/edit image"时使用本技能。它读取 YXROBOT_API_KEY 或 ~/.codex/.env，用 node 脚本调接口，Base64 结果自动解码落地、URL 结果自动下载。无需安装任何依赖。只要用户提到生成图片、画图、改图、图像编辑，也应优先考虑本技能。
allowed-tools: Bash(node *)
---

# 公司 AI 网关图片生成 / 编辑

通过 `/images/generations`（文生图）和 `/images/edits`（图生图 / 局部重绘）生成图片。脚本已处理鉴权、参数校验、Base64 解码、URL 下载和错误透传，**直接调用即可，不要自己写 curl 或重新实现**。

**调用脚本时一律用下面这个写法**。技能可能被解压在两个位置之一（Codex 在 `~/.agents/skills/`，Claude Code 在 `~/.claude/skills/`），这行会自动选中存在的那个，两种情况下都成立——**不要把它简化成某个固定的绝对路径**：

```bash
node "$(ls -d ~/.agents/skills/codexyx-image ~/.claude/skills/codexyx-image 2>/dev/null | head -1)/scripts/image.mjs" <子命令>
```

## ⚠️ 调用前必读：默认模型会花钱

默认模型 `openai/gpt-image-2.5-sunburst` 每次生成都会产生真实 API 费用。下面两个模型免费，只有用户明确要免费或省钱时才改用它们：

- `inclusionai/ming-image-0.1-design`
- `inclusionai/ming-image-0.1-design-layer`

- **`--n` 保持默认 1**，除非用户明确要求多张
- 不要为了"试试效果"反复重跑；先把提示词想清楚再调用一次
- 用户没要求就不要自作主张加大 `--size`，也不要擅自换成别的模型

## 工作流程

### 第 1 步：判断任务类型

- 用户只给了文字描述 → **generate**（文生图）
- 用户给了已有图片、想改它 → **edit**（图生图 / 编辑），把图片路径用 `--image` 传入

### 第 2 步：调用脚本

**文生图：**

```bash
node "$(ls -d ~/.agents/skills/codexyx-image ~/.claude/skills/codexyx-image 2>/dev/null | head -1)/scripts/image.mjs" generate \
  --prompt "一只戴贝雷帽、坐在木桌上的小水獭，柔和光线" \
  --size 1024x1024 --out ./otter.png
```

**图生图 / 编辑：**

```bash
node "$(ls -d ~/.agents/skills/codexyx-image ~/.claude/skills/codexyx-image 2>/dev/null | head -1)/scripts/image.mjs" edit \
  --prompt "把背景换成下雪的雪山" \
  --image ./otter.png --out ./otter-snow.png
```

**局部重绘**（只改指定区域，掩码的透明部分是要重绘的位置，必须与原图同尺寸的 PNG）：

```bash
node "$(ls -d ~/.agents/skills/codexyx-image ~/.claude/skills/codexyx-image 2>/dev/null | head -1)/scripts/image.mjs" edit \
  --prompt "把这块区域换成一盆绿植" \
  --image ./room.png --mask ./mask.png --out ./room-plant.png
```

`--image` 可以重复传多张。

### 第 3 步：报告结果

脚本成功时打印 `✅ 已保存：路径`。把路径告诉用户，并尽量直接展示图片。失败时脚本会打印服务端的原始错误并以非 0 退出——**不要把失败当成功，也不要把 0 字节文件当结果**（脚本已有非空校验）。

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--prompt` | — | 必填。图像描述，尽量把用户意图写具体 |
| `--model` | `openai/gpt-image-2.5-sunburst` | 见下方「图片模型」。用户没指定就用默认 |
| `--size` | `1024x1024` | gpt-image 还支持 `1536x1024`（横）、`1024x1536`（竖）、`auto` |
| `--n` | 1 | 生成数量。**保持 1，除非用户明确要多张** |
| `--quality` | 不发送 | 质量级别 |
| `--out` | `./image-<时间戳>.png` | 多张时自动追加 `_1`、`_2` |
| `--image` | — | edit 模式的输入图，可重复 |
| `--mask` | — | edit 模式的掩码 PNG，仅在"改某个局部"时才用 |

## 图片模型

用户没指定模型时用默认 `openai/gpt-image-2.5-sunburst`。常用名单：

| 模型 | 说明 |
|---|---|
| `openai/gpt-image-2.5-sunburst` | 默认 |
| `openai/gpt-image-2.5-flare` | |
| `gpt-image-2` | |
| `gpt-image-1` | |
| `inclusionai/ming-image-0.1-design` | 免费 |
| `inclusionai/ming-image-0.1-design-layer` | 免费 |

实时可用名单以网关 `GET /v1/models` 为准。不要自己写 curl，用脚本的 `models` 子命令（它会请求该接口，标出上面这些模型是否当前可用，并列出接口里其他名字带 image 的模型）：

```bash
node "$(ls -d ~/.agents/skills/codexyx-image ~/.claude/skills/codexyx-image 2>/dev/null | head -1)/scripts/image.mjs" models
```

## 模型限制

- **`dall-e-3` 不支持 edits**（只能文生图）。要做图生图请用上表里的模型，默认 `openai/gpt-image-2.5-sunburst`
- **`/images/variations` 上游未实现**，不要尝试调用这个端点
- 返回 `b64_json` 时脚本自动解码落地；返回 `url` 时立即下载（URL 通常有有效期）

## 配置

脚本按以下优先级找 API Key：

1. `YXROBOT_API_KEY` 环境变量
2. `~/.codex/.env` 里的 `YXROBOT_API_KEY`（和 Codex 客户端同一份）

**如果脚本报「未找到公司 AI 网关 API Key」**，引导用户设置 `export YXROBOT_API_KEY=sk-xxx`，或写入 `~/.codex/.env`。Key 需用户自行配置，**不要编造**。脚本所有输出只显示掩码后的 Key。

接口地址默认 `https://aiapi.yxrobot.com/v1`，可用 `YXROBOT_API_BASE_URL` 覆盖。

## 常见错误

| 报错 | 处理 |
|---|---|
| `未找到公司 AI 网关 API Key` | 引导用户配置，见上 |
| `无效的令牌` | Key 错了或已轮换，让用户重新配置 |
| 余额 / 额度不足 | 转述服务端原话 |
| `图片不存在` / `掩码文件不存在` | 路径错了，确认文件真实存在 |
| `请求超时` | 生图较慢（超时 120s），网络问题或服务端繁忙 |

退出码：`2` = 用法或配置错误，`1` = 运行时或接口错误。
