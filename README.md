# yx-skill

公司 AI 网关的图片技能。装好之后直接说「帮我画一只戴帽子的水獭」或「把这张图的背景换成雪山」即可，不用记命令。

| 项目 | 内容 |
|---|---|
| 技能名 | `codexyx-image` |
| 接口 | `https://token.yxrobot.com/v1` |
| 能力 | 文生图、改图、局部重绘 |
| 默认模型 | `openai/gpt-image-2.5-sunburst`（会计费） |
| 免费模型 | `inclusionai/ming-image-0.1-design`（`design-layer` 不接受文生图接口） |
| 密钥 | `YXROBOT_API_KEY`，或 `~/.codex/.env` 里的同名项 |

需要 Node.js 20 或更新版本，不用安装别的依赖。

## 最省事：让 AI 自己装

把下面这段完整复制给 Codex 或 Claude Code：

```
帮我安装公司 AI 网关的图片技能 codexyx-image。说明在 https://github.com/xuzhixiangya/yx-skill

技能包下载地址：
- https://github.com/xuzhixiangya/yx-skill/archive/refs/heads/main.zip

请你：
1. 先判断我现在用的是哪个客户端。存在 ~/.codex 就是 Codex，技能目录是 ~/.agents/skills/；存在 ~/.claude 就是 Claude Code，技能目录是 ~/.claude/skills/。两个都在用就两边都装。目录不存在就创建。都判断不出来就停下来问我，不要猜。
2. 把压缩包下载到临时目录再解压。GitHub 的包会多一层 yx-skill-main/（或 yx-skill-<提交号>/）。只把里面的 codexyx-image 文件夹移到技能目录，然后删掉临时目录。如果目标里已经有同名技能，直接覆盖。装完必须是下面这样，不能多套一层：
   <技能目录>/codexyx-image/SKILL.md
   <技能目录>/codexyx-image/scripts/image.mjs
   <技能目录>/codexyx-image/scripts/config.mjs
3. 配置密钥。不要编造 API Key，也不要把占位符写进任何文件。
   - 如果 ~/.codex/.env 里已经有非空的 YXROBOT_API_KEY，跳过这步，并告诉我会自动复用。
   - 如果没有，不要创建配置、不要写入 sk- 占位符。只告诉我去 ~/.codex/.env 增加一行 YXROBOT_API_KEY=sk-在这里填你的密钥，然后执行 chmod 600 ~/.codex/.env。临时使用也可以 export YXROBOT_API_KEY=sk-在这里填你的密钥。
4. 用 ls 列出技能目录，确认上面三个文件都在。然后告诉我密钥填在哪里，以及必须重启客户端才生效。

注意：这是公司网关技能。不要安装 CodexZH，不要创建 ~/.codexzh/config.json，不要下载 codexzh.com 的压缩包。
```

AI 做完后，按它的提示填上你自己的密钥，再重启客户端。

## 自己动手安装

1. 下载 [main.zip](https://github.com/xuzhixiangya/yx-skill/archive/refs/heads/main.zip)。
2. 解压后进入 `yx-skill-main`，把里面的 `codexyx-image` 文件夹放进技能目录。

| 客户端 | 技能目录 |
|---|---|
| Codex | `~/.agents/skills/` |
| Claude Code | `~/.claude/skills/` |

Mac 可以在访达里按 Command + Shift + G，输入上面的路径。文件夹不存在就先建 `.agents`（或 `.claude`），再在里面建 `skills`。

正确结构：

```
~/.agents/skills/codexyx-image/
├── SKILL.md
└── scripts/
    ├── image.mjs
    └── config.mjs
```

如果变成 `skills/yx-skill-main/codexyx-image/SKILL.md`，或 `skills/codexyx-image/codexyx-image/SKILL.md`，客户端认不出这个技能。把 `codexyx-image` 挪到技能目录的第一层。

两个客户端都在用的话，两边各放一份。

命令行：

```bash
# Codex。Claude Code 把目标改成 ~/.claude/skills
tmp=$(mktemp -d)
curl -fsSL -o "$tmp/yx-skill.zip" https://github.com/xuzhixiangya/yx-skill/archive/refs/heads/main.zip
unzip -q "$tmp/yx-skill.zip" -d "$tmp"
mkdir -p ~/.agents/skills
rm -rf ~/.agents/skills/codexyx-image
mv "$tmp"/yx-skill-*/codexyx-image ~/.agents/skills/codexyx-image
rm -rf "$tmp"
test -f ~/.agents/skills/codexyx-image/SKILL.md && echo "安装完成"
```

## 配置密钥

技能按这个顺序找密钥：

1. 环境变量 `YXROBOT_API_KEY`
2. `~/.codex/.env` 里的 `YXROBOT_API_KEY`

已经在 `~/.codex/.env` 里配过的话，不用再配，技能会自动复用。

还没有的话，自己写上一行，把占位符换成真实密钥：

```
YXROBOT_API_KEY=sk-在这里填你的密钥
```

然后执行 `chmod 600 ~/.codex/.env`。不要把密钥截图或发到公开的地方。接口默认是 `https://token.yxrobot.com/v1`，一般不用改。

## 重启后试用

技能在客户端启动时加载，放好文件后要重启一次。

```
帮我画一只戴贝雷帽、坐在木桌上的小水獭，柔和光线
```

```
把这张图的背景换成下雪的雪山
```

默认模型 `openai/gpt-image-2.5-sunburst` 按次计费，通常要 60–90 秒。只有明确说免费或省钱时，才改用 `inclusionai/ming-image-0.1-design`。

想看当前网关里有哪些图片模型，可以说「列出可用的图片模型」。

接口必须用 `https://token.yxrobot.com/v1`。不要改成 `https://aiapi.yxrobot.com/v1`：那个域名前面有阿里云 ESA，回源超时默认 30 秒。`gpt-image-2.5-sunburst` 往往要 60–90 秒，会被掐成 HTTP 524，网关日志里却可能已经成功并计费。`token.yxrobot.com` 前面是 nginx，慢模型可以等到出图。

图片接口目前不支持流式。请求里带 `stream: true` 会直接返回 `OpenAI Images stream is not supported`。

不带 `openai/` 前缀的 `gpt-image-2`、`gpt-image-1` 当前没有可用渠道。在线的相近模型是 `openai/gpt-image-2` 和 `openai/gpt-image-1.5`。`inclusionai/ming-image-0.1-design-layer` 虽然在模型列表里，但不接受文生图接口。

Codex 沙盒如果是只读、不允许联网，生图会失败。生图前把权限开到可以访问网络。

## 更新

再执行一次上面的安装命令，或把同一段提示词再发给 AI。它会覆盖旧的 `codexyx-image`，覆盖后重启客户端。

## 常见问题

| 现象 | 处理 |
|---|---|
| 客户端里看不到技能 | 确认 `SKILL.md` 在 `codexyx-image/` 的第一层，然后重启 |
| 未找到公司 AI 网关 API Key | `~/.codex/.env` 里加上 `YXROBOT_API_KEY`，保存后重启 |
| 无效的令牌 | 密钥写错或已更换，重新复制，前后不要带空格 |
| 模型无可用渠道 | 用 `models` 子命令看当前在线模型，不要猜模型名 |
