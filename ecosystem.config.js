module.exports = {
  apps: [
    {
      name: 'chungsuclienquan',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
