module.exports = {
  apps: [
    {
      name: 'file-exchange',
      script: 'src/server.js',
      node_args: '--env-file=.env',
      instances: 1,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
