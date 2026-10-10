import { defineConfig, devices } from '@playwright/test';

/**
 * 版式护栏（overview#526）：真浏览器里量阅读器几何。独立于根目录的 playwright.config.ts
 * （那份是 mobile／tablet 的手动 e2e，需要完整站点）。
 *   npx playwright test -c tests/layout/playwright.config.ts
 * 环境变量 CHROME 可指定浏览器可执行文件（沙箱里没有 playwright 自带的那个时用）。
 */
export default defineConfig({
    testDir: '.',
    testMatch: /.*\.spec\.ts/,
    outputDir: './test-results',
    timeout: 30_000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:5199',
        launchOptions: { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] },
    },
    webServer: {
        command: 'npx vite --port 5199',
        port: 5199,
        reuseExistingServer: true,
        timeout: 60_000,
        cwd: '../..',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 900 } } }],
});
