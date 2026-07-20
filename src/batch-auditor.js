/**
 * @fileoverview Orquestador Principal (Batch Auditor)
 * Lee un listado de URLs, extrae los consentimientos masivamente mediante el motor Crawler,
 * y los inyecta en el Motor de Grafos Neo4j.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const https = require('https');
const { GVL } = require('@iabtechlabtcf/core');
const { persistConsentGraph } = require('./mapper/graph-builder');
const { closeDriver } = require('./db/neo4j-client');

const CONFIG = {
    targetsFile: path.join(__dirname, '../targets.txt'),
    gvlEndpoint: 'https://vendor-list.consensu.org/v3/vendor-list.json',
    targetCookieNames: ['euconsent-v2', 'euconsent'],
    navigationTimeoutMs: 5000,
    interactionTimeoutMs: 3000,
    headlessBrowser: false // Cambiado a false para evitar que los anti-bots de Xataka/ElMundo nos bloqueen
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

/**
 * Descarga la Lista Global de Proveedores (GVL).
 */
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

/**
 * Extrae la carga útil (Payload) de una única URL.
 */
async function extractPayload(context, targetUrl) {
    const page = await context.newPage();
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
        } catch (e) {
            // Ignoramos errores de interacción explícitos para no frenar el batch
        }

        const cookies = await context.cookies();
        const consentCookie = cookies.find(c => CONFIG.targetCookieNames.includes(c.name));
        
        if (consentCookie) return consentCookie.value;

        const localStoragePayload = await page.evaluate(() => window.localStorage.getItem('euconsent-v2'));
        return localStoragePayload || null;

    } catch (err) {
        Logger.error(`Error procesando ${targetUrl}: ${err.message}`);
        return null;
    } finally {
        await page.close(); // Cerramos la pestaña, no el contexto entero
    }
}

/**
 * Función Principal de Orquestación.
 */
async function main() {
    Logger.info('Iniciando orquestador de lotes (Batch Auditor)...');
    
    // 1. Validar archivo de objetivos
    if (!fs.existsSync(CONFIG.targetsFile)) {
        Logger.error(`Archivo no encontrado: ${CONFIG.targetsFile}`);
        process.exit(1);
    }

    const urls = fs.readFileSync(CONFIG.targetsFile, 'utf8')
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0 && url.startsWith('http'));

    if (urls.length === 0) {
        Logger.warn('No hay URLs válidas en el archivo targets.txt.');
        process.exit(0);
    }

    Logger.info(`Se auditarán ${urls.length} dominios.`);

    // 2. Descargar catálogo central
    let gvl;
    try {
        gvl = await fetchGlobalVendorList();
    } catch (e) {
        Logger.error('Error fatal al descargar la GVL.', e);
        process.exit(1);
    }

    // 3. Inicializar Motor Crawler
    const browser = await chromium.launch({ headless: CONFIG.headlessBrowser });
    const context = await browser.newContext();

    try {
        for (const url of urls) {
            Logger.info('--------------------------------------------------');
            const payload = await extractPayload(context, url);
            
            if (payload) {
                Logger.info(`[EXITO] Carga útil obtenida para ${url}. Mapeando a Neo4j...`);
                // 4. Inyectar datos en la base de datos de grafos
                await persistConsentGraph(url, payload, gvl);
            } else {
                Logger.warn(`[FALLO] No se obtuvo consentimiento para ${url}.`);
            }
            // Limpiamos las cookies entre sitios para evitar contaminación cruzada
            await context.clearCookies();
        }
    } finally {
        Logger.info('Cerrando motores (Crawler y Base de Datos)...');
        await browser.close();
        await closeDriver(); // Cerramos el pool de Neo4j de forma limpia
    }
}

main();
