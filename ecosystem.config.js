module.exports = {
  apps: [
    {
      name: "phubai-erp",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: "D:\\phubai-products",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
