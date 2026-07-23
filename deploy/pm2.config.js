// pm2 запускает API-сервер.
// Переменные из /var/www/tajikmusic/.env подхватываем здесь сами —
// так API не зависит от того, унаследовал ли shell env от 2_deploy.sh.
const fs = require("fs");
const path = require("path");

const APP_DIR = process.env.APP_DIR || "/var/www/tajikmusic";
const envPath = path.join(APP_DIR, ".env");
const fileEnv = {};

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fileEnv[key] = value;
  }
}

module.exports = {
  apps: [
    {
      name: "tajikmusic-api",
      script: path.join(APP_DIR, "artifacts/api-server/dist/index.mjs"),
      cwd: path.join(APP_DIR, "artifacts/api-server"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        ...fileEnv,
        NODE_ENV: "production",
      },
      env_production: {
        ...fileEnv,
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "/var/log/tajikmusic/api-out.log",
      error_file: "/var/log/tajikmusic/api-error.log",
      merge_logs: true,
    },
  ],
};
