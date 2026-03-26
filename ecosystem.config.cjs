module.exports = {
  apps: [
    {
      name: 'file-exchange',
      script: 'src/server.js',
      node_args: '--env-file=.env',
      instances: 1,
      max_memory_restart: '256M',
      watch: ['src'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'uploads', '*.log'],
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
