#!/usr/bin/env node
// 公司 AI 网关图片生成 / 编辑脚本
// 用法见同目录 SKILL.md。零依赖，仅需 Node 20+（原生 fetch / FormData / Blob）。
import { writeFileSync, renameSync, rmSync, existsSync, statSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { resolveConfig, maskKey } from './config.mjs';

const TIMEOUT_MS = 120_000;          // 生图比普通查询慢得多
const DEFAULT_MODEL = 'openai/gpt-image-2.5-sunburst';
const DEFAULT_SIZE = '1024x1024';

/**
 * 公司网关常用图片模型。实时可用名单以 GET /models 为准。
 * free: 不产生生图费用。
 */
const IMAGE_MODELS = [
  { id: 'openai/gpt-image-2.5-sunburst' },
  { id: 'openai/gpt-image-2.5-flare' },
  { id: 'gpt-image-2' },
  { id: 'gpt-image-1' },
  { id: 'inclusionai/ming-image-0.1-design', free: true },
  { id: 'inclusionai/ming-image-0.1-design-layer', free: true },
];

function formatModelList() {
  return IMAGE_MODELS.map((model) => {
    const tags = [];
    if (model.id === DEFAULT_MODEL) tags.push('默认');
    if (model.free) tags.push('免费');
    return tags.length ? `${model.id}（${tags.join('，')}）` : model.id;
  }).join('、');
}

/** 退出码 2：用法 / 配置错误（与原 bash 版一致） */
function usageError(message, hint) {
  process.stderr.write(`❌ ${message}\n`);
  if (hint) process.stderr.write(`   ${hint}\n`);
  process.exit(2);
}

/** 退出码 1：运行时 / API 错误（与原 bash 版一致） */
function runtimeError(message, detail) {
  process.stderr.write(`❌ ${message}\n`);
  if (detail) process.stderr.write(`${detail}\n`);
  process.exit(1);
}

/** 解析 --key=value 与 --key value 两种写法；--image 可重复 */
function parseArgs(argv) {
  const args = { _: [], images: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }

    const body = token.slice(2);
    const eq = body.indexOf('=');
    let name;
    let value;
    if (eq === -1) {
      name = body;
      const next = argv[i + 1];
      // 布尔开关后面不吃值；其余选项取下一个 token 作为值
      if (name === 'json' || name === 'help' || name === 'h') value = true;
      else if (next === undefined || next.startsWith('--')) {
        usageError(`选项 --${name} 缺少值。`);
      } else { value = next; i += 1; }
    } else {
      name = body.slice(0, eq);
      value = body.slice(eq + 1);
    }

    if (name === 'image') args.images.push(value);
    else args[name] = value;
  }
  return args;
}

/** 时间戳默认文件名，与原 bash 版格式一致：image-YYYYmmdd-HHMMSS.png */
function defaultOutPath() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `./image-${stamp}.png`;
}

/**
 * 多图输出路径，与原 bash 版 output_path_for_index 行为一致：
 * 第 0 张用 --out 原值；之后是 base_1.ext、base_2.ext。
 * 判断是否有扩展名看的是 basename（目录名里的点不算）。
 */
export function outputPathForIndex(out, index) {
  if (index === 0) return out;
  const name = basename(out);
  const ext = name.includes('.') ? extname(out) : '';
  const base = ext ? out.slice(0, out.length - ext.length) : out;
  return `${base}_${index}${ext}`;
}

/** 写临时同级文件再 rename，近原子替换；空内容视为失败 */
function commitImage(buffer, finalPath) {
  if (!buffer || buffer.length === 0) {
    runtimeError(`保存失败：生成的内容为空：${finalPath}`);
  }
  const dir = dirname(finalPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.${basename(finalPath)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmpPath, buffer);
    if (statSync(tmpPath).size === 0) {
      rmSync(tmpPath, { force: true });
      runtimeError(`保存失败：生成的文件为空：${finalPath}`);
    }
    renameSync(tmpPath, finalPath);
  } catch (error) {
    rmSync(tmpPath, { force: true });
    runtimeError(`保存失败：${finalPath}`, error?.message);
  }
  process.stdout.write(`✅ 已保存：${finalPath}\n`);
}

async function downloadTo(url, finalPath) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  } catch (error) {
    runtimeError(`URL 下载失败：${url}`, error?.message);
  }
  if (!response.ok) runtimeError(`URL 下载失败（HTTP ${response.status}）：${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  commitImage(buffer, finalPath);
}

/** 把服务端返回的错误原样透传（保留 bash 版行为，PS1 版会丢失这部分信息） */
function reportApiError(status, rawText) {
  process.stderr.write(`❌ 接口返回错误（HTTP ${status}），原始响应：\n`);
  process.stderr.write(`${rawText}\n`);
  process.exit(1);
}

async function callApi(url, init, apiKey) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { ...(init.headers || {}), Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError'
      ? `请求超时（${TIMEOUT_MS / 1000}s）`
      : `网络请求失败：${error?.message || error}`;
    runtimeError(reason, `接口地址：${url}`);
  }

  const rawText = await response.text();
  if (!response.ok) reportApiError(response.status, rawText);

  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    runtimeError('接口返回了非 JSON 内容，原始响应：', rawText);
  }
  if (body?.error) reportApiError(response.status, rawText);
  return body;
}

/** 遍历 data[]，b64_json 非空优先，否则回落下载 url（与原实现一致） */
async function saveResults(body, out) {
  const items = Array.isArray(body?.data) ? body.data : [];
  let saved = 0;
  for (const item of items) {
    const target = outputPathForIndex(out, saved);
    const b64 = typeof item?.b64_json === 'string' ? item.b64_json : '';
    if (b64) {
      commitImage(Buffer.from(b64, 'base64'), target);
      saved += 1;
      continue;
    }
    const url = typeof item?.url === 'string' ? item.url : '';
    if (url) {
      await downloadTo(url, target);
      saved += 1;
    }
  }
  if (saved === 0) {
    runtimeError('接口未返回任何图片，原始响应：', JSON.stringify(body, null, 2));
  }
  return saved;
}

/** 共用参数校验 */
function resolveCommonOptions(args) {
  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
  if (!prompt.trim()) usageError('缺少 --prompt。', '请提供图像描述，尽量具体。');

  const n = args.n === undefined ? 1 : Number(args.n);
  if (!Number.isInteger(n) || n < 1) {
    usageError('--n 必须是 >= 1 的整数。');
  }

  return {
    prompt,
    n,
    model: typeof args.model === 'string' && args.model ? args.model : DEFAULT_MODEL,
    size: typeof args.size === 'string' && args.size ? args.size : DEFAULT_SIZE,
    quality: typeof args.quality === 'string' && args.quality ? args.quality : '',
    out: typeof args.out === 'string' && args.out ? args.out : defaultOutPath(),
  };
}

/** 请求 GET /models，打印内置图片模型是否在线，并附上接口里其他图片模型 */
async function commandModels(config) {
  const body = await callApi(`${config.apiBaseUrl}/models`, { method: 'GET' }, config.apiKey);
  const live = new Set(
    (Array.isArray(body?.data) ? body.data : [])
      .map((item) => (typeof item?.id === 'string' ? item.id : ''))
      .filter(Boolean),
  );
  const known = new Set(IMAGE_MODELS.map((model) => model.id));

  process.stdout.write('图片模型：\n');
  for (const model of IMAGE_MODELS) {
    const tags = [];
    if (model.id === DEFAULT_MODEL) tags.push('默认');
    if (model.free) tags.push('免费');
    tags.push(live.has(model.id) ? '当前可用' : '当前 /models 未返回');
    process.stdout.write(`- ${model.id}（${tags.join('，')}）\n`);
  }

  const extras = [...live].filter((id) => /image/i.test(id) && !known.has(id)).sort();
  if (extras.length > 0) {
    process.stdout.write('\n/models 里还有这些图片模型：\n');
    for (const id of extras) process.stdout.write(`- ${id}\n`);
  }
}

async function commandGenerate(args, config) {
  const { prompt, n, model, size, quality, out } = resolveCommonOptions(args);

  // 请求体用 JSON.stringify 构造：原 bash 版把 n 未经校验直接插值，存在注入风险
  const payload = { model, prompt, n, size };
  if (quality) payload.quality = quality;

  const body = await callApi(
    `${config.apiBaseUrl}/images/generations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    config.apiKey,
  );
  await saveResults(body, out);
}

async function commandEdit(args, config) {
  const { prompt, n, model, size, quality, out } = resolveCommonOptions(args);

  if (args.images.length === 0) {
    usageError('edit 模式至少需要一个 --image。');
  }
  for (const image of args.images) {
    if (!existsSync(image)) usageError(`图片不存在：${image}`);
  }
  const mask = typeof args.mask === 'string' ? args.mask : '';
  if (mask && !existsSync(mask)) usageError(`掩码文件不存在：${mask}`);

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('n', String(n));
  form.append('size', size);
  if (quality) form.append('quality', quality);
  // 字段名沿用 image[]，与原 curl 行为一致（gpt-image 系列与 dall-e-2 都接受）
  for (const image of args.images) {
    form.append('image[]', new Blob([readFileSync(image)]), basename(image));
  }
  if (mask) {
    form.append('mask', new Blob([readFileSync(mask)]), basename(mask));
  }

  const body = await callApi(
    `${config.apiBaseUrl}/images/edits`,
    { method: 'POST', body: form },
    config.apiKey,
  );
  await saveResults(body, out);
}

const USAGE = `公司 AI 网关图片生成 / 编辑

  generate --prompt "描述" [选项]     文生图
  edit --prompt "描述" --image a.png [选项]   图生图 / 编辑
  models                                  查看图片模型（请求 GET /models）

选项：
  --prompt <text>    图像描述（必填）
  --model <name>     模型，默认 ${DEFAULT_MODEL}
                     常用：${formatModelList()}
  --size <WxH>       尺寸，默认 ${DEFAULT_SIZE}；gpt-image 还支持 1536x1024、1024x1536、auto
  --n <number>       生成数量，默认 1
  --quality <level>  质量，不传则不发送该参数
  --out <path>       保存路径，默认 ./image-<时间戳>.png；多张时追加 _1、_2
  --image <path>     edit 模式的输入图，可重复传多张
  --mask <path>      edit 模式的掩码 PNG，透明区域表示要重绘的位置

配置：读取 YXROBOT_API_KEY，或 ~/.codex/.env 里的 YXROBOT_API_KEY。
接口：默认 https://aiapi.yxrobot.com/v1，可用 YXROBOT_API_BASE_URL 覆盖。
注意：默认模型会花钱。免费模型只有 inclusionai/ming-image-0.1-design 和
inclusionai/ming-image-0.1-design-layer。请勿擅自批量生成。`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  const wantsHelp = args.help === true || args.h === true || command === 'help';
  if (wantsHelp || !command) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(wantsHelp ? 0 : 1);
  }

  if (command !== 'generate' && command !== 'edit' && command !== 'models') {
    usageError(`未知命令：${command}`, USAGE);
  }

  const config = resolveConfig();
  if (!config.apiKey) {
    usageError(
      '未找到公司 AI 网关 API Key。',
      '请设置环境变量 YXROBOT_API_KEY，或在 ~/.codex/.env 里写入 YXROBOT_API_KEY=sk-xxx。',
    );
  }

  if (command === 'models') return commandModels(config);
  if (command === 'generate') return commandGenerate(args, config);
  return commandEdit(args, config);
}

// 仅在被直接执行时运行，import 时（如单元测试）不触发。
// 必须两边都做 realpath：技能通过软链接分发，argv[1] 是用户输入的软链路径，
// 而 import.meta.url 已被解析成实体真实路径，直接比较会永远不相等。
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error) => runtimeError(`执行出错：${error?.message || error}`));
}
