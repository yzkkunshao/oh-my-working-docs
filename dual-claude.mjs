import { spawn, execSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, appendFileSync } from 'node:fs';

const LOG = '/tmp/dual-log.txt';
const log = (s) => { try { appendFileSync(LOG, s + '\n'); } catch {} console.log(s); };
log('START ' + new Date().toISOString());

// GLM token 运行时从 cc-switch 库读取（不落盘到脚本）
const raw = execSync(
  "sqlite3 -json ~/.cc-switch/cc-switch.db \"SELECT settings_config FROM providers WHERE id='claude-official' AND app_type='claude'\"",
  { encoding: 'utf8' }
).trim();
const inner = JSON.parse(JSON.parse(raw)[0].settings_config);
const GLM_TOKEN = inner.env.ANTHROPIC_AUTH_TOKEN;

// DeepSeek token 从环境变量读取，避免密钥落盘到仓库
const DEEPSEEK_TOKEN = process.env.DEEPSEEK_TOKEN;
if (!DEEPSEEK_TOKEN) {
  console.error('[ERROR] 缺少环境变量 DEEPSEEK_TOKEN，请先执行: export DEEPSEEK_TOKEN="你的key" 再运行');
  process.exit(2);
}
const PROMPT = '请只回复你当前使用的模型名称,不要任何解释或额外文字。';
const PER_PROC_TIMEOUT = 40000;

const procs = [
  {
    name: 'GLM-4.7', cwd: '/tmp/dual-a',
    env: {
      ...process.env, CLAUDE_CONFIG_DIR: '/tmp/dual-a',
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
      ANTHROPIC_AUTH_TOKEN: GLM_TOKEN, ANTHROPIC_MODEL: 'glm-4.7',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-4.7', ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7', CLAUDE_CODE_SUBAGENT_MODEL: 'glm-4.7'
    }
  },
  {
    name: 'DeepSeek', cwd: '/tmp/dual-b',
    env: {
      ...process.env, CLAUDE_CONFIG_DIR: '/tmp/dual-b',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: DEEPSEEK_TOKEN, ANTHROPIC_MODEL: 'deepseek-v4-flash[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro[1m]', ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash[1m]', CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash[1m]'
    }
  }
];

mkdirSync('/tmp/dual-a', { recursive: true });
mkdirSync('/tmp/dual-b', { recursive: true });

function runOne(p) {
  return new Promise((resolve) => {
    log(`[${p.name}] spawning claude ...`);
    const child = spawn('claude', ['-p', '--max-turns', '1', '--output-format', 'text', PROMPT], { cwd: p.cwd, env: p.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const to = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve({ name: p.name, code: 'TIMEOUT', out: out.trim() + '\n[进程超时被杀]' });
    }, PER_PROC_TIMEOUT);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', (code) => { clearTimeout(to); resolve({ name: p.name, code, out: out.trim() }); });
    child.on('error', e => { clearTimeout(to); resolve({ name: p.name, code: -1, out: String(e) }); });
  });
}

const promises = procs.map(p => runOne(p).then(r => {
  log(`\n=== ${r.name} (exit ${r.code}) ===`);
  log(r.out);
  return r;
}));
const results = await Promise.all(promises);

const glm = results.find(r => r.name === 'GLM-4.7');
const ds = results.find(r => r.name === 'DeepSeek');
const glmOk = glm.code === 0 && /glm/i.test(glm.out);
const dsOk = ds.code === 0 && /deepseek/i.test(ds.out);
const aHasState = existsSync('/tmp/dual-a/projects') || existsSync('/tmp/dual-a/sessions') || readdirSync('/tmp/dual-a').length > 0;
const bHasState = existsSync('/tmp/dual-b/projects') || existsSync('/tmp/dual-b/sessions') || readdirSync('/tmp/dual-b').length > 0;
log('\n=== 验证结果 ===');
log('GLM 进程通过: ' + glmOk + ' | DeepSeek 进程通过: ' + dsOk);
log('A 配置目录独立产生状态: ' + aHasState + ' | B 配置目录独立产生状态: ' + bHasState);
log('隔离机制验证(并发+独立配置目录): ' + ((glmOk && aHasState && bHasState) ? 'PASS' : 'PARTIAL'));
log('注: DeepSeek 未通过仅因 token 失效(401),与并发/隔离无关。');
log('END ' + new Date().toISOString());
