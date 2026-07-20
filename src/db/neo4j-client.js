/**
 * @fileoverview Cliente Singleton para gestionar la conexión del pool con Neo4j.
 */

const neo4j = require('neo4j-driver');
require('dotenv').config();

const uri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

let driver;

/**
 * Inicializa y devuelve la conexión al driver de Neo4j.
 * @returns {neo4j.Driver} Instancia del driver de Neo4j.
 */
function getDriver() {
    if (!driver) {
        driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    }
    return driver;
}

/**
 * Cierra la conexión de forma segura, liberando los recursos de red.
 */
async function closeDriver() {
    if (driver) {
        await driver.close();
        driver = null;
    }
}

module.exports = {
    getDriver,
    closeDriver
};
