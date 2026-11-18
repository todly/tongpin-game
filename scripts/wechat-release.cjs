const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少配置 ${name}`);
  return value;
}

async function main() {
  const target = required('WECHAT_TARGET');
  if (target !== 'miniprogram' && target !== 'minigame') {
    throw new Error('WECHAT_TARGET 必须为 miniprogram 或 minigame');
  }

  const appid = required('WECHAT_APPID');
  const isGame = target === 'minigame';
  const appDir = path.join(root, 'apps', target);
  const command = process.argv[2];

  if (command === 'configure') {
    const env = required('WECHAT_CLOUD_ENV');
    const service = required('WECHAT_CLOUD_SERVICE');
    if (isGame) {
      const config = readJson(path.join(appDir, 'config.example.json'));
      writeJson(path.join(appDir, 'config.local.json'), { ...config, appid, mode: 'cloud', env, service });
    } else {
      const manifestPath = path.join(appDir, 'src', 'manifest.json');
      const manifest = readJson(manifestPath);
      manifest['mp-weixin'].appid = appid;
      writeJson(manifestPath, manifest);
      writeFileSync(path.join(appDir, '.env.production.local'), [
        'VITE_CONNECTION_MODE=cloud',
        `VITE_CLOUD_ENV=${JSON.stringify(env)}`,
        `VITE_CLOUD_SERVICE=${JSON.stringify(service)}`,
        '',
      ].join('\n'));
    }
    return;
  }

  if (command !== 'upload') throw new Error('命令必须为 configure 或 upload');

  const projectPath = path.join(appDir, isGame ? 'dist' : 'dist/build/mp-weixin');
  const projectConfig = readJson(path.join(projectPath, 'project.config.json'));
  if (projectConfig.appid !== appid || projectConfig.compileType !== (isGame ? 'game' : 'miniprogram')) {
    throw new Error('构建产物的 AppID 或项目类型与发布配置不一致');
  }

  const privateKey = required('WECHAT_UPLOAD_KEY');
  const ci = require(path.join(required('WECHAT_CI_DIR'), 'node_modules/miniprogram-ci'));
  const project = new ci.Project({
    appid,
    type: isGame ? 'miniGame' : 'miniProgram',
    projectPath,
    privateKey,
    ignores: isGame ? ['meta.json'] : [],
  });
  const version = `1.${required('GITHUB_RUN_NUMBER')}.${required('GITHUB_RUN_ATTEMPT')}`;
  const commit = required('WECHAT_BUILD_SHA').slice(0, 12);
  await ci.upload({
    project,
    version,
    desc: `GitHub Actions · ${commit}`,
    robot: 1,
    setting: { useProjectConfig: true },
  });
  console.log(`已上传微信开发版本 ${version} (${commit})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
