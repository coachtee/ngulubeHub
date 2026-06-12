// ecosystem.config.cjs — pm2 process manager config
// Run: pm2 start ecosystem.config.cjs
// Save: pm2 save && pm2 startup
const path = require('path');

module.exports = {
  apps: [{
    name: 'ngulubehub',
    script: 'server.js',
    cwd: __dirname,  // critical: ensures node_modules + db paths resolve correctly
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0',
    },
  }],
};
