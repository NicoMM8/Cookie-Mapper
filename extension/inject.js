/**
 * @fileoverview Carga Útil Envenenada (Poisoned Payload).
 * Se inyecta en el contexto principal del navegador y secuestra de forma
 * destructiva la API oficial de la industria publicitaria (IAB TCF v2).
 */

(function() {
    // Cadena TCString válida criptográficamente pero que rechaza ABSOLUTAMENTE TODO.
    // Propósitos permitidos: 0. Proveedores autorizados: 0. Interés legítimo: 0.
    const NULL_CONSENT_PAYLOAD = "CPwvwMAPwvwMAO3AAAENCZCAAAAAAAAAAAAAAAAAAAAA";

    // Objeto genérico de respuesta para la API __tcfapi
    const tcDataResponse = {
        tcString: NULL_CONSENT_PAYLOAD,
        tcfPolicyVersion: 2,
        cmpId: 1, // ID ficticio
        cmpVersion: 1,
        gdprApplies: true,
        eventStatus: 'tcloaded', // Simulamos que el usuario ya gestionó sus opciones
        cmpStatus: 'loaded',
        listenerId: null,
        isServiceSpecific: true,
        useNonStandardStacks: false,
        publisherCC: 'ES',
        purposeOneTreatment: false,
        purpose: {
            consents: {}, // Todo denegado
            legitimateInterests: {} // Todo denegado
        },
        vendor: {
            consents: {}, // Todo denegado
            legitimateInterests: {} // Todo denegado
        },
        specialFeatureOptins: {},
        publisher: {
            consents: {},
            legitimateInterests: {},
            customPurpose: {
                consents: {},
                legitimateInterests: {}
            }
        }
    };

    /**
     * Motor de secuestro. Atrapa todas las peticiones de los Vendors y Prebid.js
     * y las responde asíncronamente con nuestra carga útil de rechazo.
     */
    function hijackedTcfApi(command, version, callback, parameter) {
        if (typeof callback !== 'function') return;

        console.info(`🛡️ [Cookie-Mapper] API Secuestrada. Vendor bloqueado solicitando: ${command}`);

        if (command === 'getTCData' || command === 'addEventListener') {
            const response = Object.assign({}, tcDataResponse);
            
            if (command === 'addEventListener') {
                response.listenerId = Math.random().toString(36).substring(2);
            }
            
            // Responder asíncronamente es obligatorio según el estándar IAB
            setTimeout(() => callback(response, true), 0);
        } else if (command === 'removeEventListener') {
            setTimeout(() => callback(true), 0);
        } else if (command === 'ping') {
            setTimeout(() => callback({
                gdprApplies: true,
                cmpLoaded: true,
                cmpStatus: 'loaded',
                displayStatus: 'hidden', // Ocultamos el banner real si existe
                apiVersion: '2.0',
                cmpVersion: 1,
                cmpId: 1
            }, true), 0);
        }
    }

    // --- PROTECCIÓN TÁCTICA DEL SECUESTRO ---
    // Si la web intenta definir su propio __tcfapi después de nosotros, fallará
    // porque bloqueamos la variable usando Object.defineProperty
    try {
        Object.defineProperty(window, '__tcfapi', {
            value: hijackedTcfApi,
            writable: false,     // Inmutable
            configurable: false  // Imborrable
        });
        console.info('🛡️ [Cookie-Mapper] Escudo activado. Rastreo neutralizado.');
    } catch (e) {
        console.warn('⚠️ [Cookie-Mapper] No se pudo asegurar el secuestro de la API.', e);
    }
})();
