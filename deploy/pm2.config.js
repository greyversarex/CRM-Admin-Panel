module.exports = {
  apps: [
    {
      name: "tajikmusic-api",
      script: "/var/www/tajikmusic/artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/tajikmusic/artifacts/api-server",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "/var/log/tajikmusic/api-out.log",
      error_file: "/var/log/tajikmusic/api-error.log",
      merge_logs: true,
    },
  ],
};
