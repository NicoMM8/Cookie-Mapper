/**
 * @fileoverview Orquestador Principal (Batch Auditor)
 * Lee un listado de URLs, extrae los consentimientos masivamente mediante el motor Crawler,
 * intercepta la red con el Sniffer, y los inyecta en el Motor de Grafos Neo4j.
 */

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
    concurrency: 5 // 5 pestañas de navegador simultáneas en paralelo
};

const SELECTORS = {
    genericAccept: /Aceptar|Acepto|Accept|Agree/i,
    didomi: '#didomi-notice-agree-button',
    onetrust: '#onetrust-accept-btn-handler'
};

const Logger = {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err || '')
};

function fetchGlobalVendorList() {
    return new Promise((resolve, reject) => {
        Logger.info(`Descargando catálogo GVL...`);
        https.get(CONFIG.gvlEndpoint, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`Error HTTP: ${res.statusCode}`));
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(new GVL(JSON.parse(data))));
        }).on('error', reject);
    });
}

async function extractPayload(context, targetUrl) {
    const page = await context.newPage();
    const sniffer = new NetworkSniffer(page, targetUrl);
    
    try {
        try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        } catch (navErr) {
            // Intentar continuar de todos modos
        }
        await page.waitForTimeout(CONFIG.navigationTimeoutMs);

        try {
            const didomiBtn = await page.waitForSelector(SELECTORS.didomi, { state: 'visible', timeout: CONFIG.interactionTimeoutMs }).catch(() => null);
            if (didomiBtn) {
                await didomiBtn.click({ force: true });
            } else {
                const acceptBtn = await page.getByRole('button', { name: SELECTORS.genericAccept }).first();
                await acceptBtn.click({ force: true });
            }
            await page.waitForTimeout(CONFIG.interactionTimeoutMs);
        } catch (e) {}

        await sniffer.extractBids();
        const snifferReport = sniffer.getReport();

        const cookies = await context.cookies();
        const consentCookie = cookies.find(c => CONFIG.targetCookieNames.includes(c.name));
        
        let payload = null;
        if (consentCookie) {
            payload = consentCookie.value;
        } else {
            payload = await page.evaluate(() => window.localStorage.getItem('euconsent-v2')).catch(() => null);
        }

        return {
            tcString: payload,
            networkIntelligence: snifferReport
        };

    } catch (err) {
        return null;
    } finally {
        await page.close().catch(() => {});
    }
}

async function main() {
    Logger.info(`Iniciando orquestador de lotes a GRAN ESCALA (Concurrencia: ${CONFIG.concurrency} pestañas en paralelo)...`);
    
    if (!fs.existsSync(CONFIG.targetsFile)) {
        Logger.error(`Archivo no encontrado: ${CONFIG.targetsFile}`);
        process.exit(1);
    }

    const evidenceDir = path.join(__dirname, '../evidence');
    if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
        Logger.info(`Directorio de evidencias forenses creado: ${evidenceDir}`);
    }

    const urls = fs.readFileSync(CONFIG.targetsFile, 'utf8').split('\n').map(url => url.trim()).filter(url => url.length > 0 && url.startsWith('http'));

    if (urls.length === 0) {
        Logger.warn('No hay URLs válidas.');
        process.exit(0);
    }

    Logger.info(`Cargados ${urls.length} dominios para auditar.`);

    let gvl;
    try { gvl = await fetchGlobalVendorList(); } catch (e) { process.exit(1); }

    const browser = await chromium.launch({ headless: CONFIG.headlessBrowser });
    
    let processedCount = 0;
    let successCount = 0;

    const queue = [...urls];

    async function worker(workerId) {
        while (queue.length > 0) {
            const url = queue.shift();
            if (!url) break;

            const currentIdx = ++processedCount;
            let hostname = 'unknown';
            try { hostname = new URL(url).hostname; } catch(e) {}
            const timestamp = Date.now();
            const recordHarPath = path.join(__dirname, '../evidence', `${hostname}-${timestamp}.har`);

            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
                defaultBrowserType: 'chromium',
                recordHar: { path: recordHarPath }
            });

            let successData = null;

            try {
                Logger.info(`[Worker ${workerId}] [${currentIdx}/${urls.length}] Auditando: ${url}`);
                const data = await extractPayload(context, url);
                
                if (data && data.tcString) {
                    Logger.info(`[Worker ${workerId}] [EXITO] ${url} -> Guardando en Neo4j...`);
                    await persistConsentGraph(url, data.tcString, gvl, data.networkIntelligence);
                    successData = data;
                    successCount++;
                } else {
                    Logger.warn(`[Worker ${workerId}] [SIN CONSENTIMIENTO] ${url}`);
                }
            } catch (err) {
                Logger.error(`[Worker ${workerId}] Error en ${url}: ${err.message}`);
            } finally {
                await context.close().catch(() => {});
                
                if (successData) {
                    try {
                        let harHash = 'N/A';
                        if (fs.existsSync(recordHarPath)) {
                            const fileBuffer = fs.readFileSync(recordHarPath);
                            const hashSum = crypto.createHash('sha256');
                            hashSum.update(fileBuffer);
                            harHash = hashSum.digest('hex');
                        }
                        
                        const evidenceJsonPath = path.join(__dirname, '../evidence', `${hostname}-${timestamp}.json`);
                        fs.writeFileSync(evidenceJsonPath, JSON.stringify({ 
                            url, 
                            timestamp: new Date(timestamp).toISOString(), 
                            tcString: successData.tcString, 
                            harHash: harHash,
                            networkIntelligence: successData.networkIntelligence 
                        }, null, 2));
                        Logger.info(`[Worker ${workerId}] Evidencia firmada (SHA-256): ${harHash}`);
                    } catch(e) {
                        Logger.warn(`No se pudo generar firma pericial para ${url}: ${e.message}`);
                    }
                }
            }
        }
    }

    // Iniciar trabajadores en paralelo
    const workers = [];
    for (let i = 1; i <= CONFIG.concurrency; i++) {
        workers.push(worker(i));
    }

    await Promise.all(workers);

    Logger.info('================================================================');
    Logger.info(`[AUDITORIA COMPLETADA] ${successCount}/${urls.length} sitios auditados con éxito y mapeados en Neo4j.`);
    Logger.info('================================================================');

    await browser.close();
    await closeDriver();
}

main();
