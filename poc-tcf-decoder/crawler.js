/**
 * @fileoverview Módulo de rastreo independiente para la interacción automatizada con CMPs.
 * Utiliza Playwright para navegar por sitios web, interactuar con las Plataformas de Gestión de Consentimiento,
 * y extraer la carga útil euconsent-v2 de la capa de almacenamiento del navegador.
 */

const { chromium } = require('playwright');

const CONFIG = {
    targetUrl: process.argv[2] || 'https://www.xataka.com',
    targetCookieNames: ['euconsent-v2', 'euconsent'],
    navigationTimeoutMs: 4000,
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
 * Punto de entrada principal de la aplicación.
 */
async function main() {
    Logger.info(`Inicializando instancia del rastreador para el objetivo: ${CONFIG.targetUrl}`);
    const browser = await chromium.launch({ headless: CONFIG.headlessBrowser });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        Logger.info('Navegando a la URL objetivo...');
        await page.goto(CONFIG.targetUrl, { waitUntil: 'domcontentloaded' });
        
        // Espera para la inyección y renderizado del script de la CMP
        await page.waitForTimeout(CONFIG.navigationTimeoutMs); 

        Logger.info('Intentando interacción DOM para la aceptación en la CMP...');
        try {
            const didomiBtn = await page.waitForSelector(SELECTORS.didomi, { state: 'visible', timeout: CONFIG.interactionTimeoutMs }).catch(() => null);
            
            if (didomiBtn) {
                Logger.info('CMP detectada. Despachando evento de clic.');
                await didomiBtn.click({ force: true });
            } else {
                Logger.info('Selectores específicos de CMP no encontrados. Utilizando heurística de respaldo.');
                const acceptBtn = await page.getByRole('button', { name: SELECTORS.genericAccept }).first();
                await acceptBtn.click({ force: true });
            }
            
            // Permitir que el estado persista en la capa de almacenamiento
            await page.waitForTimeout(CONFIG.interactionTimeoutMs);

        } catch (interactionError) {
            Logger.warn(`Fallo en la interacción DOM. Procediendo a la extracción. Razón: ${interactionError.message}`);
        }

        Logger.info('Escaneando capas de almacenamiento en busca de la carga útil TCString...');
        
        const cookies = await context.cookies();
        const consentCookie = cookies.find(c => CONFIG.targetCookieNames.includes(c.name));
        
        const localStoragePayload = await page.evaluate(() => window.localStorage.getItem('euconsent-v2'));

        console.log('\n--- REPORTE DE EXTRACCIÓN DEL RASTREADOR ---');
        if (consentCookie) {
            console.log('Almacenamiento: Cookie');
            console.log(`Carga Útil: ${consentCookie.value}`);
        } else if (localStoragePayload) {
            console.log('Almacenamiento: LocalStorage');
            console.log(`Carga Útil: ${localStoragePayload}`);
        } else {
            console.log('Estado: FALLO - Carga útil no localizada.');
        }
        console.log('--------------------------------------------\n');

    } catch (err) {
        Logger.error('Error fatal durante la ejecución del proceso.', err);
        process.exit(1);
    } finally {
        await browser.close();
        Logger.info('Contexto del navegador terminado y memoria liberada.');
    }
}

// Ejecutar inicializador
main();
