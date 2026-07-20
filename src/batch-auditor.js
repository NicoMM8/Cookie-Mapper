/**
 * @fileoverview Orquestador Principal (Batch Auditor)
 * Lee un listado de URLs, extrae los consentimientos masivamente mediante el motor Crawler,
 * intercepta la red con el Sniffer, y los inyecta en el Motor de Grafos Neo4j.
 */

const fs = require('fs');
const path = require('path');
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
    navigationTimeoutMs: 5000,
    interactionTimeoutMs: 3000,
    headlessBrowser: false // Cambiado a false para evitar que los anti-bots nos bloqueen
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
    
    // 1. Inicializamos el sniffer forense de red ANTES de navegar para no perdernos nada
    const sniffer = new NetworkSniffer(page);
    
    try {
        Logger.info(`Navegando a: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

        // 2. Extraemos subastas RTB (Prebid) usando el sniffer
        await sniffer.extractBids();
        const snifferReport = sniffer.getReport();

        // 3. Extraemos el payload criptográfico legal (TCF)
        const cookies = await context.cookies();
        const consentCookie = cookies.find(c => CONFIG.targetCookieNames.includes(c.name));
        
        let payload = null;
        if (consentCookie) {
            payload = consentCookie.value;
        } else {
            payload = await page.evaluate(() => window.localStorage.getItem('euconsent-v2'));
        }

        return {
            tcString: payload,
            networkIntelligence: snifferReport
        };

    } catch (err) {
        Logger.error(`Error procesando ${targetUrl}: ${err.message}`);
        return null;
    } finally {
        await page.close();
    }
}

async function main() {
    Logger.info('Iniciando orquestador de lotes (Batch Auditor) con soporte RTB...');
    
    if (!fs.existsSync(CONFIG.targetsFile)) {
        Logger.error(`Archivo no encontrado: ${CONFIG.targetsFile}`);
        process.exit(1);
    }

    const urls = fs.readFileSync(CONFIG.targetsFile, 'utf8').split('\n').map(url => url.trim()).filter(url => url.length > 0 && url.startsWith('http'));

    if (urls.length === 0) {
        Logger.warn('No hay URLs válidas.');
        process.exit(0);
    }

    let gvl;
    try { gvl = await fetchGlobalVendorList(); } catch (e) { process.exit(1); }

    const browser = await chromium.launch({ headless: CONFIG.headlessBrowser });
    const context = await browser.newContext();

    try {
        for (const url of urls) {
            Logger.info('--------------------------------------------------');
            const data = await extractPayload(context, url);
            
            if (data && data.tcString) {
                Logger.info(`[EXITO] Carga legal y forense obtenida para ${url}. Mapeando a Neo4j...`);
                // Modificamos el pase de parámetros para inyectar la inteligencia de red
                await persistConsentGraph(url, data.tcString, gvl, data.networkIntelligence);
            } else {
                Logger.warn(`[FALLO] No se obtuvo consentimiento para ${url}.`);
            }
            await context.clearCookies();
        }
    } finally {
        Logger.info('Cerrando motores...');
        await browser.close();
        await closeDriver();
    }
}

main();
