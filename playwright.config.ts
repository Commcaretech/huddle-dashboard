import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  use:{baseURL:'http://127.0.0.1:4173'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'node server/index.js',url:'http://127.0.0.1:4173/healthz',
    env:{PORT:'4173',APP_URL:'http://127.0.0.1:4173',HUB_MODE:'demo',HUB_DEMO_MEMORY:'true'}
  }
});
