import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import sites from '../sites.json' assert { type: 'json' };

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const resultsDir = path.resolve('results', today);
await fs.ensureDir(resultsDir);

// Puppeteer 启动
const browser = await puppeteer.launch({ 
  headless: true, // 默认 headless
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
});

const context = await browser.createBrowserContext();

for (const [siteName, { domain, path: paths }] of Object.entries(sites)) {
  for (const pathname of paths) {
    const page = await context.newPage();
    const url = domain + pathname;
    console.log(`🔎 Running Lighthouse for ${siteName} - ${pathname} (${url})`);

    try {
      const wsEndpoint = browser.wsEndpoint();
      const port = Number(new URL(wsEndpoint).port);

      // Lighthouse 配置精简
      const runnerResult = await lighthouse(url, {
        port,
        output: ['html', 'json'],
        onlyCategories: ['performance'],
        logLevel: 'info',
        throttlingMethod: 'provided', // 不模拟慢网
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1920, height: 1080, deviceScaleFactor: 1 },
      });

      if (!runnerResult?.report) {
        console.warn(`⚠️ Lighthouse returned undefined for ${url}`);
        await page.close();
        continue;
      }

      const saveDir = path.join(resultsDir, siteName);
      await fs.ensureDir(saveDir);

      const safeName = pathname === '/' ? 'root' : pathname.replace(/^\//, '').replace(/\//g, '_');

      await fs.outputFile(path.join(saveDir, `${safeName}.html`), runnerResult.report[0]);
      await fs.outputFile(path.join(saveDir, `${safeName}.json`), runnerResult.report[1]);

      console.log(`✅ Saved report: ${siteName}/${safeName}.html & .json`);
      await page.close();
    } catch (err) {
      console.error(`❌ Failed for ${url}:`, err);
    }
  }
}

await context.close();
await browser.close();
console.log('🎉 All audits finished!');
