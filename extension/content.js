/**
 * @fileoverview Content Script (Isolated World)
 * Este script se ejecuta antes de que la página cargue ningún recurso (document_start).
 * Su única misión es inyectar el código de secuestro en el "Main World" (el DOM principal).
 */

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');

// Limpieza inmediata para no dejar rastros en el árbol DOM
script.onload = function() {
    this.remove();
};

// Se inyecta en el root documentElement para garantizar que entra
// incluso antes de que se haya parseado el <head> de la página web.
(document.head || document.documentElement).appendChild(script);
