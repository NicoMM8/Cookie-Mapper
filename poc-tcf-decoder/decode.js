/**
 * @fileoverview Generador y decodificador independiente de cargas útiles TCString.
 * Demuestra los mecanismos internos de una CMP para la construcción de cargas útiles y
 * su posterior decodificación criptográfica mediante la librería oficial IAB TCF core.
 */

const https = require('https');
const { TCModel, TCString, GVL } = require('@iabtechlabtcf/core');

const CONFIG = {
    gvlEndpoint: 'https://vendor-list.consensu.org/v3/vendor-list.json',
    mockCmpId: 123,
    mockConsentLanguage: 'ES',
    mockVendorConsents: [58, 75, 91], // ej., 33Across, Google, Criteo
    mockPurposeConsents: [1, 2, 3, 4, 5]
};

/**
 * Utilidad de registro estandarizado (Logging).
 */
const Logger = {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
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
 * Punto de entrada principal de la aplicación.
 */
async function main() {
    try {
        const gvl = await fetchGlobalVendorList();
        
        Logger.info('Fase 1: Serialización del TCModel (Simulación de CMP)');
        
        const tcModel = new TCModel(gvl);
        tcModel.cmpId = CONFIG.mockCmpId;
        tcModel.cmpVersion = 1;
        tcModel.consentScreen = 1;
        tcModel.consentLanguage = CONFIG.mockConsentLanguage;
        tcModel.isServiceSpecific = true;
        tcModel.useNonStandardTexts = false;
        
        tcModel.purposeConsents.set(CONFIG.mockPurposeConsents);
        tcModel.vendorConsents.set(CONFIG.mockVendorConsents);

        const encodedPayload = TCString.encode(tcModel);
        Logger.info(`Carga útil TCString generada: ${encodedPayload}`);

        Logger.info('Fase 2: Deserialización de TCString (Simulación del Auditor)');
        const decodedModel = TCString.decode(encodedPayload);
        
        console.log('\n--- REPORTE DE CARGA ÚTIL DECODIFICADA ---');
        console.log(`Fecha de Creación: ${decodedModel.created}`);
        console.log(`ID de la CMP: ${decodedModel.cmpId}`);
        
        console.log('\nPropósitos Autorizados:');
        for (let i = 1; i <= 24; i++) {
            if (decodedModel.purposeConsents.has(i)) {
                 console.log(` - ID de Propósito: ${i}`);
            }
        }

        console.log('\nProveedores Autorizados:');
        const maxVendorId = decodedModel.vendorConsents.maxId || 3000;
        for (let id = 1; id <= maxVendorId; id++) {
            if (decodedModel.vendorConsents.has(id)) {
                const vendorName = gvl.vendors[id] ? gvl.vendors[id].name : 'Proveedor Desconocido';
                console.log(` - [ID: ${id.toString().padStart(4, '0')}] ${vendorName}`);
            }
        }
        console.log('------------------------------------------\n');
        
    } catch (err) {
        Logger.error('Error fatal durante la ejecución del proceso.', err);
        process.exit(1);
    }
}

// Ejecutar inicializador
main();
