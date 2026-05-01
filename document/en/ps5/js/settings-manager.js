// @ts-check

/**
 * Payload visibility settings (payloadId → boolean).
 * @type {Object<string, boolean>}
 */
let payloadVisibility = {};

/**
 * Payload version overrides (payloadId → versionString).
 * @type {Object<string, string>}
 */
let payloadVersions = {};

/**
 * Load settings from localStorage.
 */
function loadSettings() {
    try {
        const visibility = localStorage.getItem(window.SETTINGS_PAYLOAD_VISIBILITY);
        const versions = localStorage.getItem(window.SETTINGS_PAYLOAD_VERSIONS);
        payloadVisibility = visibility ? JSON.parse(visibility) : {};
        payloadVersions = versions ? JSON.parse(versions) : {};
    } catch (e) {
        console.error("Error loading settings:", e);
        payloadVisibility = {};
        payloadVersions = {};
    }
}

/**
 * Save settings to localStorage.
 */
function saveSettings() {
    try {
        localStorage.setItem(window.SETTINGS_PAYLOAD_VISIBILITY, JSON.stringify(payloadVisibility));
        localStorage.setItem(window.SETTINGS_PAYLOAD_VERSIONS, JSON.stringify(payloadVersions));
    } catch (e) {
        console.error("Error saving settings:", e);
    }
}

/**
 * Check if a payload is visible.
 * Developer mode override allows showing all payloads.
 * @param {string} payloadId
 * @returns {boolean}
 */
function isPayloadVisible(payloadId) {
    if (window.devOptions.showAllPayloads) {
        return true;
    }
    return payloadVisibility[payloadId] !== false;
}

/**
 * Set payload visibility.
 * @param {string} payloadId
 * @param {boolean} visible
 */
function setPayloadVisible(payloadId, visible) {
    payloadVisibility[payloadId] = visible;
    saveSettings();
}

/**
 * Get selected version for a payload.
 * @param {string} payloadId
 * @returns {string|null}
 */
function getSelectedVersion(payloadId) {
    return payloadVersions[payloadId] || null;
}

/**
 * Set selected version for a payload.
 * @param {string} payloadId
 * @param {string} version
 */
function setSelectedVersion(payloadId, version) {
    if (version) {
        payloadVersions[payloadId] = version;
    } else {
        // Clear stale selection by removing the key entirely
        delete payloadVersions[payloadId];
    }
    saveSettings();
}

/**
 * Resolve the active version info for a payload.
 * Returns filePath (new v2 format) with fallback to fileName (legacy).
 * @param {Object} payload
 * @returns {{version: string, fileName: string, filePath: string}}
 */
function resolveActiveVersion(payload) {
    if (payload.versions && payload.versions.length > 0) {
        const selectedVer = getSelectedVersion(payload.id);
        let verData = null;

        if (selectedVer) {
            verData = payload.versions.find(v => v.version === selectedVer);
        }

        if (!verData) {
            verData = payload.versions.find(v => v.isDefault) || payload.versions[0];
        }

        if (verData) {
            // v2 format: use filePath; fallback to "payloads/" + fileName for legacy
            const filePath = verData.filePath || ("payloads/" + verData.fileName);
            return {
                version: verData.version,
                fileName: verData.fileName,
                filePath: filePath
            };
        }
    }

    // Legacy fallback (should not happen with v2 payload_map.js)
    return {
        version: payload.version || "",
        fileName: payload.fileName || "",
        filePath: payload.fileName ? ("payloads/" + payload.fileName) : ""
    };
}

/**
 * Get the map of pre-fetched payload versions ("payloadId@version" → timestamp).
 * Used to avoid redundant fetches and to drive the "Cached*" badge in the
 * version-selection UI.
 * @returns {Object<string, number>}
 */
function getPrefetchedVersions() {
    try {
        const raw = localStorage.getItem(window.LOCALSTORE_PREFETCHED_VERSIONS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

/**
 * Mark a (payloadId, version) pair as having been pre-fetched.
 * @param {string} payloadId
 * @param {string} version
 */
function markVersionPrefetched(payloadId, version) {
    try {
        const map = getPrefetchedVersions();
        map[payloadId + "@" + version] = Date.now();
        localStorage.setItem(window.LOCALSTORE_PREFETCHED_VERSIONS_KEY, JSON.stringify(map));
    } catch (e) {
        // localStorage quota exceeded or other I/O error — ignore
    }
}

/**
 * Forget all pre-fetched markers. Used by Dev Options "Clear All Cache".
 */
function clearPrefetchedVersions() {
    try {
        localStorage.removeItem(window.LOCALSTORE_PREFETCHED_VERSIONS_KEY);
    } catch (e) { /* ignore */ }
}

// Export to global scope
window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
window.isPayloadVisible = isPayloadVisible;
window.setPayloadVisible = setPayloadVisible;
window.getSelectedVersion = getSelectedVersion;
window.setSelectedVersion = setSelectedVersion;
window.resolveActiveVersion = resolveActiveVersion;
window.getPrefetchedVersions = getPrefetchedVersions;
window.markVersionPrefetched = markVersionPrefetched;
window.clearPrefetchedVersions = clearPrefetchedVersions;

// Load settings on script init
loadSettings();
