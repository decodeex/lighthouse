import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import sites from '../sites.json' assert { type: 'json' };

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const resultsDir = path.resolve('docs', today);
await fs.ensureDir(resultsDir);

// Puppeteer 启动
const browser = await puppeteer.launch({ 
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const context = await browser.createBrowserContext();

for (const [siteName, { domain, path: paths }] of Object.entries(sites)) {
  const projectDir = path.join(resultsDir, siteName);
  await fs.ensureDir(projectDir);

  for (const pathname of paths) {
    const page = await context.newPage();
    const url = domain + pathname;
    console.log(`🔎 Running Lighthouse for ${siteName} - ${pathname} (${url})`);

    try {
      const wsEndpoint = browser.wsEndpoint();
      const port = Number(new URL(wsEndpoint).port);

      const runnerResult = await lighthouse(url, {
        port,
        output: ['html', 'json'],
        onlyCategories: ['performance'],
        logLevel: 'info',
        throttlingMethod: 'provided',
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1920, height: 1080, deviceScaleFactor: 1 },
      });

      if (!runnerResult?.report) {
        console.warn(`⚠️ Lighthouse returned undefined for ${url}`);
        await page.close();
        continue;
      }

      const safeName = pathname === '/' ? 'index' : pathname.replace(/^\//, '').replace(/\//g, '_');
      const htmlPath = path.join(projectDir, `${safeName}.html`);
      const jsonPath = path.join(projectDir, `${safeName}.json`);

      await fs.outputFile(htmlPath, runnerResult.report[0]);
      await fs.outputFile(jsonPath, runnerResult.report[1]);

      console.log(`✅ Saved report: ${siteName}/${safeName}.html & .json`);
      await page.close();
    } catch (err) {
      console.error(`❌ Failed for ${url}:`, err);
    }
  }

  // 🔹生成项目索引
  const projectFiles = (await fs.readdir(projectDir)).filter(f => f.endsWith('.html') && f !== 'root.html');
  const projectIndex = `
    <html><body>
    <h1>${siteName} Reports (${today})</h1>
    <ul>
      ${projectFiles.map(f => `<li><a href="./${f}">${f}</a></li>`).join('\n')}
    </ul>
    </body></html>
  `;
  await fs.outputFile(path.join(projectDir, 'root.html'), projectIndex);
}

// 🔹生成日期索引
const projectDirs = (await fs.readdir(resultsDir)).filter(f => fs.statSync(path.join(resultsDir, f)).isDirectory());
const dateIndex = `
  <html><body>
  <h1>Reports for ${today}</h1>
  <ul>
    ${projectDirs.map(d => `<li><a href="./${d}/root.html">${d}</a></li>`).join('\n')}
  </ul>
  </body></html>
`;
await fs.outputFile(path.join(resultsDir, 'root.html'), dateIndex);

// 🔹生成总索引
const allDates = (await fs.readdir('docs')).filter(f => fs.statSync(path.join('docs', f)).isDirectory());
const mainIndex = `
  <html><body>
  <h1>All Reports</h1>
  <ul>
    ${allDates.map(d => `<li><a href="./${d}/root.html">${d}</a></li>`).join('\n')}
  </ul>
  </body></html>
`;
await fs.outputFile(path.join('docs', 'index.html'), mainIndex);

await context.close();
await browser.close();
console.log('🎉 All audits finished and indexes generated!');
