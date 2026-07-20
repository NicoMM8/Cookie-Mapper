/**
 * @fileoverview Automatizador Legal RGPD.
 * Conecta con Neo4j para extraer la lista de empresas rastreadoras detectadas
 * y genera masivamente correos electrónicos legales exigiendo el Derecho de Supresión.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Cargar variables de entorno
const { getDriver, closeDriver } = require('../db/neo4j-client');

const https = require('https');

const CONFIG = {
    templatePath: path.join(__dirname, '../../plantilla_borrado_rgpd.md'),
    outputDir: path.join(__dirname, '../../output/cartas_rgpd'),
    // Leer datos del usuario desde .env o dejar por defecto
    userName: process.env.RGPD_USER_NAME || '[Tu Nombre]',
    cookieId: process.env.RGPD_COOKIE_ID || '[No proporcionado - Solicito borrado por Email/IP]',
    adId: process.env.RGPD_AD_ID || '[No proporcionado]',
    ip: process.env.RGPD_IP || 'auto',
    email: process.env.RGPD_EMAIL || '[No proporcionado]'
};

/**
 * Lee la plantilla base del sistema de archivos.
 */
function getTemplate() {
    if (!fs.existsSync(CONFIG.templatePath)) {
        throw new Error(`Plantilla no encontrada en: ${CONFIG.templatePath}`);
    }
    return fs.readFileSync(CONFIG.templatePath, 'utf8');
}

/**
 * Obtiene la IP pública automáticamente.
 */
function fetchPublicIP() {
    return new Promise((resolve) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', () => {
            console.warn('[RGPD] No se pudo automatizar la IP. Usando valor por defecto.');
            resolve('[No proporcionado]');
        });
    });
}

/**
 * Función principal generadora.
 */
async function generateLegalRequests() {
    console.log('[RGPD] Iniciando motor de automatización legal...');

    // Autocompletar la IP si está en modo automático
    if (CONFIG.ip === 'auto' || CONFIG.ip === '') {
        console.log('[RGPD] Automatizando detección de IP pública...');
        CONFIG.ip = await fetchPublicIP();
        console.log(`[RGPD] IP detectada automáticamente: ${CONFIG.ip}`);
    }
    
    // 1. Asegurar que el directorio de salida existe
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    const driver = getDriver();
    const session = driver.session();

    try {
        const template = getTemplate();
        const dateString = new Date().toLocaleDateString('es-ES');

        // 2. Extraer todos los rastreadores únicos que hemos mapeado en el grafo
        console.log('[RGPD] Consultando el grafo en Neo4j en busca de infractores...');
        const result = await session.run(`
            MATCH (v:Vendor)
            RETURN v.name AS vendorName, v.iabId AS vendorId
            ORDER BY v.name ASC
        `);

        const vendors = result.records.map(record => ({
            name: record.get('vendorName'),
            id: record.get('vendorId')
        }));

        console.log(`[RGPD] Se han detectado ${vendors.length} empresas de AdTech.`);

        // 3. Generar un documento legal personalizado para cada empresa
        let generatedCount = 0;
        
        for (const vendor of vendors) {
            const safeFileName = vendor.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            
            const personalizedLetter = template
                .replace(/\[EMPRESA\]/g, vendor.name)
                .replace(/\[USUARIO\]/g, CONFIG.userName)
                .replace(/\[FECHA\]/g, dateString)
                .replace(/\[Insertar ID de cookie extraído\]/g, CONFIG.cookieId)
                .replace(/\[Insertar ID de publicidad\]/g, CONFIG.adId)
                .replace(/\[Insertar IP\]/g, CONFIG.ip)
                .replace(/\[Insertar Email\]/g, CONFIG.email);

            const filePath = path.join(CONFIG.outputDir, `Supresion_Art17_${safeFileName}.md`);
            fs.writeFileSync(filePath, personalizedLetter, 'utf8');
            generatedCount++;
        }

        console.log(`[RGPD] ¡Éxito! Se han generado ${generatedCount} requerimientos legales de borrado.`);
        console.log(`[RGPD] Tus datos han sido inyectados de forma segura.`);
        console.log(`[RGPD] Puedes encontrar los archivos en la carpeta: ${CONFIG.outputDir}`);

    } catch (err) {
        console.error('[RGPD] Error durante la generación:', err.message);
    } finally {
        await session.close();
        await closeDriver();
    }
}

// Ejecutar el script
generateLegalRequests();
