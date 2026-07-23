/**
 * @fileoverview Script utilitario para vaciar la base de datos Neo4j.
 * Elimina todos los nodos y relaciones para permitir ejecuciones limpias desde cero.
 */

require('dotenv').config();
const { getDriver, closeDriver } = require('./neo4j-client');

async function resetDatabase() {
    const driver = getDriver();
    const session = driver.session();

    try {
        console.log('[RESET] Limpiando toda la base de datos Neo4j...');
        await session.run('MATCH (n) DETACH DELETE n');
        console.log('[RESET EXITO] Base de datos vaciada por completo.');
    } catch (err) {
        console.error('[RESET ERROR] Fallo al vaciar la base de datos:', err.message);
    } finally {
        await session.close();
        await closeDriver();
    }
}

resetDatabase();
