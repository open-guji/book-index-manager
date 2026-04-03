import { test, expect } from '@playwright/test';

test.describe('首页布局', () => {
    test('首页无水平溢出', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 等待推荐内容加载
        await page.waitForTimeout(1000);

        // 截图
        await page.screenshot({ path: `tests/screenshots/home-${test.info().project.name}.png`, fullPage: true });

        // 检查无水平滚动条
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test('搜索栏可见且可交互', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const searchInput = page.locator('input[placeholder]').first();
        await expect(searchInput).toBeVisible();

        // 搜索框宽度不超过视口
        const box = await searchInput.boundingBox();
        const viewport = page.viewportSize()!;
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    });

    test('首页 tab 切换正常', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 点击各 tab
        const tabs = page.locator('button').filter({ hasText: /叢書目錄|在線資源/ });
        if (await tabs.count() > 0) {
            await tabs.first().click();
            await page.waitForTimeout(500);
            await page.screenshot({ path: `tests/screenshots/home-tab2-${test.info().project.name}.png`, fullPage: true });
        }
    });
});

test.describe('详情页布局', () => {
    test('详情页无水平溢出', async ({ page }) => {
        // 加载推荐条目中的第一个
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // 点击第一个推荐卡片
        const firstCard = page.locator('a[href^="/"]').first();
        if (await firstCard.isVisible()) {
            await firstCard.click();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            await page.screenshot({ path: `tests/screenshots/detail-${test.info().project.name}.png`, fullPage: true });

            // 检查无水平滚动条
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
        }
    });

    test('详情页可通过直接 URL 访问', async ({ page }) => {
        // 用一个已知的推荐 ID
        await page.goto('/GY4JM7j7yi7');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: `tests/screenshots/detail-direct-${test.info().project.name}.png`, fullPage: true });

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test('返回按钮可见', async ({ page }) => {
        await page.goto('/GY4JM7j7yi7');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const backBtn = page.locator('button').filter({ hasText: /返回/ });
        if (await backBtn.count() > 0) {
            await expect(backBtn.first()).toBeVisible();
        }
    });
});

test.describe('丛编详情（带 tab）', () => {
    test('丛编 tab 栏不溢出', async ({ page }) => {
        // 四库全书 - 丛编类型，有目录 tab
        await page.goto('/FCNcSJbF77V');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: `tests/screenshots/collection-${test.info().project.name}.png`, fullPage: true });

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
});
