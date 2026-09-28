// 公司 AI 网关配置解析。生图走 OpenAI 兼容的 /images/* 接口。
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 公司 AI 网关：生图、改图等模型调用 */
export const DEFAULT_API_BASE_URL = 'https://token.yxrobot.com/v1';

/** Codex 客户端的 .env，只读复用 YXROBOT_API_KEY（绝不写入） */
const CODEX_ENV_FILE = join(homedir(), '.codex', '.env');

/**
 * 掩码 API Key，用于任何面向终端 / Agent 的输出。
 * 完整 Key 绝不能进入 stdout/stderr，否则会落入对话上下文和终端历史。
 */
export function maskKey(key) {
  if (!key || typeof key !== 'string') return '(未配置)';
  if (key.length <= 12) return `${key.slice(0, 4)}...`;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

/**
 * 解析 key=value 形式的 .env。
 * 注意：~/.codex/.env 实测没有尾换行，最后一行必须照样解析出来。
 */
export function parseEnvText(text) {
  const result = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^["'](.*)["']$/, '$1');
    if (name) result[name] = value;
  }
  return result;
}

function readEnvFile(path) {
  try {
    if (!existsSync(path)) return {};
    return parseEnvText(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/** 从 ~/.codex/.env 读取公司网关 Key，和 Codex 客户端用的是同一份。 */
function readCodexEnvFallback() {
  const env = readEnvFile(CODEX_ENV_FILE);
  const key = env.YXROBOT_API_KEY || env.yxrobot_api_key;
  return { apiKey: key || null };
}

function trimUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

/**
 * 解析配置。
 * @returns {{ apiKey: string|null, apiBaseUrl: string, source: string }}
 *   apiBaseUrl 生图等模型调用用（https://token.yxrobot.com/v1）
 */
export function resolveConfig() {
  const codexEnv = readCodexEnvFallback();

  let apiKey = null;
  let source = '';

  const envKey = process.env.YXROBOT_API_KEY?.trim();
  if (envKey) {
    apiKey = envKey;
    source = 'YXROBOT_API_KEY 环境变量';
  } else if (codexEnv.apiKey) {
    apiKey = codexEnv.apiKey;
    source = '~/.codex/.env 的 YXROBOT_API_KEY';
  }

  const apiBaseUrl =
    trimUrl(process.env.YXROBOT_API_BASE_URL) ||
    DEFAULT_API_BASE_URL;

  return { apiKey, apiBaseUrl, source: source || '(未找到)' };
}
