import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    outputDir: './tests/test-results',
    snapshotDir: './tests/screenshots',
    timeout: 30_000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:5173',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: true,
        timeout: 15_000,
    },
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile',
            use: {
                ...devices['iPhone SE'],
                defaultBrowserType: 'chromium',
            },
        },
        {
            name: 'tablet',
            use: {
                ...devices['iPad Mini'],
                defaultBrowserType: 'chromium',
            },
        },
    ],
});
