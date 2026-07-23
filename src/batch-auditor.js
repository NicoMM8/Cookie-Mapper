const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const https = require('https');
const { GVL } = require('@iabtechlabtcf/core');
const { persistConsentGraph } = require('./mapper/graph-builder');
const { closeDriver } = require('./db/neo4j-client');
const NetworkSniffer = require('./crawler/network-sniffer');

const CONFIG = {
    targetsFile: path.join(__dirname, '../targets.txt'),
    gvlEndpoint: 'https://vendor-list.consensu.org/v3/vendor-list.json',
    targetCookieNames: ['euconsent-v2', 'euconsent'],
    navigationTimeoutMs: 4000,
    interactionTimeoutMs: 2500,
    headlessBrowser: false,
    concurrency: 5
};

const SELECTORS = {
    genericAccept: /Aceptar|Acepto|Accept|Agree/i,
    didomi: '#didomi-notice-agree-button',
    onetrust: '#onetrust-accept-btn-handler'
};

const Logger = {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err?.message || err || '')
};

function fetchGlobalVendorList() {
    return new Promise((resolve, reject) => {
        Logger.info('Fetching GVL catalog...');
        https.get(CONFIG.gvlEndpoint, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP Status: ${res.statusCode}`));
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                try {
                    resolve(new GVL(JSON.parse(rawData)));
                } catch (err) {
                    reject(new Error(`GVL parse error: ${err.message}`));
                }
            });
        }).on('error', reject);
    });
}

async function extractPayload(context, targetUrl) {
    const page = await context.newPage();
    const sniffer = new NetworkSniffer(page, targetUrl);
    
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {
            Logger.warn(`Timeout reaching ${targetUrl}, attempting extraction anyway.`);
        });
        
        await page.waitForTimeout(CONFIG.navigationTimeoutMs);

        const didomiBtn = await page.waitForSelector(SELECTORS.didomi, { state: 'visible', timeout: CONFIG.interactionTimeoutMs }).catch(() => null);
        if (didomiBtn) {
            await didomiBtn.click({ force: true });
        } else {
            try {
                const acceptBtn = page.getByRole('button', { name: SELECTORS.genericAccept }).first();
                await acceptBtn.click({ force: true, timeout: CONFIG.interactionTimeoutMs });
            } catch (err) {
                // Ignorar si no se encuentra un botón de aceptación genérico
            }
        }
        
        await page.waitForTimeout(CONFIG.interactionTimeoutMs);
        await sniffer.extractBids();
        
        const snifferReport = sniffer.getReport();
        const cookies = await context.cookies();
        const consentCookie = cookies.find(c => CONFIG.targetCookieNames.includes(c.name));
        
        const payload = consentCookie 
            ? consentCookie.value 
            : await page.evaluate(() => window.localStorage.getItem('euconsent-v2')).catch(() => null);

        return { tcString: payload, networkIntelligence: snifferReport };
    } catch (err) {
        Logger.error(`Failed payload extraction for ${targetUrl}`, err);
        return null;
    } finally {
        await page.close().catch(() => {});
    }
}

async function processQueue(urls, browser, gvl) {
    let successCount = 0;
    let processedCount = 0;
    const evidenceDir = path.join(__dirname, '../evidence');
    
    if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const workers = Array.from({ length: CONFIG.concurrency }, async (_, workerId) => {
        while (urls.length > 0) {
            const url = urls.shift();
            if (!url) break;

            const currentIdx = ++processedCount;
            let hostname = 'unknown';
            try { hostname = new URL(url).hostname; } catch(e) {}
            
            const timestamp = Date.now();
            const recordHarPath = path.join(evidenceDir, `${hostname}-${timestamp}.har`);

            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
                defaultBrowserType: 'chromium',
                recordHar: { path: recordHarPath }
            });

            let extractionData = null;

            try {
                Logger.info(`[W${workerId}] [${currentIdx}] Auditing: ${url}`);
                const data = await extractPayload(context, url);
                
                if (data?.tcString) {
                    await persistConsentGraph(url, data.tcString, gvl, data.networkIntelligence);
                    extractionData = data;
                    successCount++;
                } else {
                    Logger.warn(`[W${workerId}] No valid consent string found for ${url}`);
                }
            } catch (err) {
                Logger.error(`[W${workerId}] Processing failed for ${url}`, err);
            } finally {
                await context.close().catch(() => {});
                
                if (extractionData) {
                    try {
                        let harHash = 'N/A';
                        if (fs.existsSync(recordHarPath)) {
                            const fileBuffer = fs.readFileSync(recordHarPath);
                            harHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                        }
                        
                        const evidenceJsonPath = path.join(evidenceDir, `${hostname}-${timestamp}.json`);
                        fs.writeFileSync(evidenceJsonPath, JSON.stringify({ 
                            url, 
                            timestamp: new Date(timestamp).toISOString(), 
                            tcString: extractionData.tcString, 
                            harHash,
                            networkIntelligence: extractionData.networkIntelligence 
                        }, null, 2));
                        Logger.info(`[W${workerId}] Evidence signed (SHA-256): ${harHash}`);
                    } catch(e) {
                        Logger.warn(`[W${workerId}] Failed to write evidence for ${url}`);
                    }
                }
            }
        }
    });

    await Promise.all(workers);
    return successCount;
}

async function main() {
    if (!fs.existsSync(CONFIG.targetsFile)) {
        Logger.error(`Target file missing: ${CONFIG.targetsFile}`);
        process.exit(1);
    }

    const rawTargets = fs.readFileSync(CONFIG.targetsFile, 'utf8');
    const urls = rawTargets.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));

    if (!urls.length) {
        Logger.warn('No valid URLs found in target file.');
        process.exit(0);
    }

    Logger.info(`Bootstrapping large scale orchestrator. Concurrency: ${CONFIG.concurrency}`);
    Logger.info(`Loaded ${urls.length} targets.`);

    let gvl;
    try { 
        gvl = await fetchGlobalVendorList(); 
    } catch (e) { 
        Logger.error('Fatal: Could not fetch GVL framework', e);
        process.exit(1); 
    }

    const browser = await chromium.launch({ headless: CONFIG.headlessBrowser });
    const successCount = await processQueue([...urls], browser, gvl);

    Logger.info(`Audit complete. Successfully processed ${successCount}/${urls.length} targets.`);

    await browser.close();
    await closeDriver();
}

main().catch(err => {
    Logger.error('Unhandled fatal error', err);
    process.exit(1);
});
