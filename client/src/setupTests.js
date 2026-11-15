// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom has no matchMedia (used for phone / dark-mode detection)
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches : false, media : query, onchange : null,
    addEventListener : () => {}, removeEventListener : () => {}, addListener : () => {}, removeListener : () => {}, dispatchEvent : () => false,
  })
}

// jsdom has no WebCrypto subtle API / TextEncoder: use Node's (same standard API as browsers)
const nodeCrypto = require('crypto')
const util = require('util')
if (!window.crypto?.subtle) Object.defineProperty(window, 'crypto', { value : nodeCrypto.webcrypto, configurable : true })
if (typeof global.TextEncoder === 'undefined') { global.TextEncoder = util.TextEncoder; global.TextDecoder = util.TextDecoder }
