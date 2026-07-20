/**
 * @fileoverview Auditor automatizado para validación de cumplimiento IAB TCF v2 y extracción de cargas útiles.
 * Interactúa con Plataformas de Gestión de Consentimiento (CMPs) a través de Playwright para extraer
 * y decodificar la carga útil euconsent-v2.
 */

const { chromium } = require('playwright');
const https = require('https');
const { TCString, GVL } = require('@iabtechlabtcf/core');

const CONFIG = {
    gvlEndpoint: 'https://vendor-list.consensu.org/v3/vendor-list.json',
    targetCookieNames: ['euconsent-v2', 'euconsent'],
    navigationTimeoutMs: 5000,
    interactionTimeoutMs: 3000,
    headlessBrowser: false
};

const SELECTORS = {
    didomi: '#didomi-notice-agree-button',
    onetrust: '#onetrust-accept-btn-handler',
    genericAccept: /Aceptar|Acepto|Accept/i
};

/**
 * Utilidad de registro estandarizado (Logging).
 */
const Logger = {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err || '')
};

/**
 * Descarga la Lista Global de Proveedores (GVL) desde el endpoint oficial de la IAB.
 * @returns {Promise<GVL>} Instancia inicializada de GVL.
 */
function fetchGlobalVendorList() {
    return new Promise((resolve, reject) => {
        Logger.info(`Descargando GVL desde ${CONFIG.gvlEndpoint}`);
        https.get(CONFIG.gvlEndpoint, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Fallo al descargar la GVL. Código HTTP: ${res.statusCode}`));
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    const gvl = new GVL(parsedData);
                    Logger.info(`GVL cargada correctamente. Versión: ${parsedData.vendorListVersion}`);
                    resolve(gvl);
                } catch (err) {
                    reject(new Error(`Fallo al analizar la respuesta JSON de la GVL: ${err.message}`));
                }
            });
        }).on('error', (err) => {
            reject(new Error(`Error de red al intentar descargar la GVL: ${err.message}`));
        });
    });
}

/**
 * Automatiza la interacción con la CMP y extrae la carga útil de consentimiento.
 * @param {string} targetUrl URL objetivo a auditar.
 * @returns {Promise<string|null>} Carga útil TCString codificada en Base64Url, o null si no se encuentra.
 */
async function extractConsentPayload(targetUrl) {
    Logger.info(`Inicializando motor Chromium (headless: ${CONFIG.headlessBrowser})`);
    const browser = await chromium.launch({ headless: CONFIG.headlessBrowser });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        Logger.info(`Navegando a ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        
        // Tiempo de espera para la inyección asíncrona del script de la CMP
        await page.waitForTimeout(CONFIG.navigationTimeoutMs);

        Logger.info('Intentando interacción DOM para la aceptación en la CMP...');
        try {
            const didomiBtn = await page.waitForSelector(SELECTORS.didomi, { state: 'visible', timeout: CONFIG.interactionTimeoutMs }).catch(() => null);
            
            if (didomiBtn) {
                Logger.info('CMP Didomi detectada. Despachando evento de clic.');
                await didomiBtn.click({ force: true });
            } else {
                Logger.info('Aplicando heurística de respaldo para botones genéricos.');
                const acceptBtn = await page.getByRole('button', { name: SELECTORS.genericAccept }).first();
                await acceptBtn.click({ force: true });
            }
            
            // Tiempo para asegurar la persistencia del estado en la capa de almacenamiento
            await page.waitForTimeout(CONFIG.interactionTimeoutMs);
        } catch (interactionError) {
            Logger.warn(`Fallo en la interacción DOM o banner CMP ausente. Razón: ${interactionError.message}`);
        }

        // Recuperar la carga útil del almacén de cookies
        const cookies = await context.cookies();
        const consentCookie = cookies.find(c => CONFIG.targetCookieNames.includes(c.name));
        
        if (consentCookie) {
            Logger.info('Carga útil de consentimiento identificada en el almacén de Cookies.');
            return consentCookie.value;
        }

        // Alternativa: inspeccionar LocalStorage
        const localStoragePayload = await page.evaluate(() => window.localStorage.getItem('euconsent-v2'));
        if (localStoragePayload) {
            Logger.info('Carga útil de consentimiento identificada en LocalStorage.');
            return localStoragePayload;
        }

        Logger.warn('No se localizó una carga útil TCString válida en el contexto objetivo.');
        return null;

    } finally {
        await browser.close();
        Logger.info('Contexto del navegador terminado y memoria liberada.');
    }
}

/**
 * Analiza el TCModel decodificado y genera un reporte de auditoría en la salida estándar.
 * @param {string} tcString Cadena TCF codificada en Base64Url.
 * @param {GVL} gvl Instancia de la Global Vendor List.
 * @param {string} targetUrl URL auditada.
 */
function generateAuditReport(tcString, gvl, targetUrl) {
    let decodedModel;
    try {
        decodedModel = TCString.decode(tcString);
    } catch (err) {
        Logger.error('Fallo al decodificar la carga útil TCString.', err);
        return;
    }

    const maxVendorId = decodedModel.vendorConsents.maxId || 3000;
    const authorizedVendors = [];

    for (let id = 1; id <= maxVendorId; id++) {
        if (decodedModel.vendorConsents.has(id)) {
            const vendorName = gvl.vendors[id] ? gvl.vendors[id].name : 'Proveedor Desconocido (Fuera de GVL)';
            authorizedVendors.push({ id, name: vendorName });
        }
    }

    console.log('\n--- REPORTE DE AUDITORÍA TCF v2 ---');
    console.log(`URL Objetivo: ${targetUrl}`);
    console.log(`Timestamp de Auditoría: ${new Date().toISOString()}`);
    console.log(`ID de la CMP: ${decodedModel.cmpId}`);
    console.log(`Versión de Políticas: ${decodedModel.policyVersion}`);
    console.log('-----------------------------------');
    console.log(`Total de Proveedores Autorizados: ${authorizedVendors.length}`);
    
    if (authorizedVendors.length > 0) {
        console.log('\nMuestra de Proveedores Autorizados (Top 20):');
        authorizedVendors.slice(0, 20).forEach(vendor => {
            console.log(` - [ID: ${vendor.id.toString().padStart(4, '0')}] ${vendor.name}`);
        });
        
        if (authorizedVendors.length > 20) {
            console.log(`\n... y ${authorizedVendors.length - 20} proveedores adicionales.`);
        }
    }
    console.log('-----------------------------------\n');
}

/**
 * Punto de entrada principal de la aplicación.
 */
async function main() {
    const targetUrl = process.argv[2] || 'https://www.xataka.com';
    
    try {
        const consentPayload = await extractConsentPayload(targetUrl);
        if (!consentPayload) {
            process.exit(1);
        }

        const gvl = await fetchGlobalVendorList();
        generateAuditReport(consentPayload, gvl, targetUrl);
        
    } catch (err) {
        Logger.error('Error fatal durante la ejecución del proceso.', err);
        process.exit(1);
    }
}

// Ejecutar inicializador
main();
