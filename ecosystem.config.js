module.exports = {
  apps: [
    {
      name: "phubai-erp",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: "D:\\actions-runner\\_work\\phubai-products\\phubai-products", // <--- CẬP NHẬT DÒNG NÀY
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
