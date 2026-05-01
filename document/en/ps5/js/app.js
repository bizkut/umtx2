// @ts-check

/**
 * App entry point - initialization and event handlers.
 * This file should be loaded LAST (after all other modules).
 * Depends on: all other modules
 */

// =====================================================
// === PS5 CLOCK ===
// =====================================================

function updateClock() {
    var clock = document.getElementById('ps5-clock');
    if (clock) {
        var now = new Date();
        var hours = String(now.getHours()).padStart(2, '0');
        var minutes = String(now.getMinutes()).padStart(2, '0');
        clock.textContent = hours + ':' + minutes;
    }
}

// Update every 60 seconds
setInterval(updateClock, 60000);
// Initial call
updateClock();

// =====================================================
// === RUN / EXPLOIT ENTRY POINT ===
// =====================================================

/**
 * Read the current retry count from sessionStorage. Resets to 0 when the
 * tab is closed, so a fresh manual launch always starts the budget over.
 */
function getExploitRetryCount() {
    try {
        return parseInt(sessionStorage.getItem(window.SESSIONSTORE_EXPLOIT_RETRY_KEY) || "0", 10) || 0;
    } catch (e) { return 0; }
}

function setExploitRetryCount(n) {
    try {
        if (n <= 0) sessionStorage.removeItem(window.SESSIONSTORE_EXPLOIT_RETRY_KEY);
        else sessionStorage.setItem(window.SESSIONSTORE_EXPLOIT_RETRY_KEY, String(n));
    } catch (e) { /* ignore */ }
}

async function run(wkonly, animate) {
    if (wkonly === undefined) wkonly = false;
    if (animate === undefined) animate = true;

    if (window.exploitStarted) {
        return;
    }
    window.exploitStarted = true;

    await switchPage("console-view", animate);

    var maxRetries = window.MAX_EXPLOIT_RETRIES || 5;
    var retryCount = getExploitRetryCount();

    // not setting it in the catch since we want to retry both on a handled error and on a browser crash
    sessionStorage.setItem(SESSIONSTORE_ON_LOAD_AUTORUN_KEY, wkonly ? "wkonly" : "kernel");

    try {
        if (!animate) {
            // hack but waiting a bit seems to help
            // this only gets hit when auto-running on page load
            await new Promise(function (resolve) { setTimeout(resolve, 100); });
        }
        await run_psfree(fw_str);

    } catch (error) {
        log("Webkit exploit failed: " + error, LogLevel.ERROR);

        if (retryCount >= maxRetries) {
            log("Max retries (" + maxRetries + ") reached. Auto-retry stopped.", LogLevel.ERROR);
            log("Tap Jailbreak again to retry manually.", LogLevel.LOG);
            sessionStorage.removeItem(SESSIONSTORE_ON_LOAD_AUTORUN_KEY);
            setExploitRetryCount(0);
            window.exploitStarted = false;
            return;
        }

        setExploitRetryCount(retryCount + 1);
        log("Retrying in 2 seconds... (attempt " + (retryCount + 1) + "/" + maxRetries + ")", LogLevel.LOG);
        await new Promise(function (resolve) { setTimeout(resolve, 2000); });
        window.location.reload();
        return; // this is necessary
    }

    // Webkit stage cleared — reset the retry counter so a later kernel
    // failure doesn't share budget with earlier webkit failures.
    setExploitRetryCount(0);

    try {
        await main(window.p, wkonly); // if all goes well, this should block forever
    } catch (error) {
        log("Kernel exploit/main() failed: " + error, LogLevel.ERROR);
        // p.write8(new int64(0,0), 0); // crash
    }

    log("Retrying in 4 seconds...", LogLevel.LOG);
    await new Promise(function (resolve) { setTimeout(resolve, 4000); });
    window.location.reload();
}


// =====================================================
// === EVENT HANDLERS ===
// =====================================================

/**
 * Append an entry to the AppCache debug log in localStorage. Capped at 50
 * entries (FIFO). Surfaced via Dev Options → "View AppCache Log" so users
 * can paste it into bug reports when something goes wrong.
 */
function logAppCacheEvent(name, detail) {
    try {
        var key = window.LOCALSTORE_APPCACHE_DEBUG_KEY || "appcache_debug_log";
        var raw = localStorage.getItem(key);
        var entries = raw ? JSON.parse(raw) : [];
        entries.push({ t: Date.now(), name: name, detail: detail || null, online: navigator.onLine });
        while (entries.length > 50) entries.shift();
        localStorage.setItem(key, JSON.stringify(entries));
    } catch (e) { /* localStorage full or unavailable — ignore */ }
}

function registerAppCacheEventHandlers() {
    var appCache = window.applicationCache;
    if (!appCache) return; // Browser without AppCache support; nothing to wire up

    var toast;
    var toastTimeout; // Track the timeout ID

    function createOrUpdateAppCacheToast(message, timeout) {
        if (timeout === undefined) timeout = -1;

        if (!toast) {
            toast = showToast(message, timeout);
        } else {
            updateToastMessage(toast, message);
        }

        // Clear any existing timeout before setting a new one
        if (toastTimeout) {
            clearTimeout(toastTimeout);
            toastTimeout = null;
        }

        if (timeout > 0) {
            toastTimeout = setTimeout(function () {
                removeToast(toast);
                toast = null;
                toastTimeout = null;
            }, timeout);
        }
    }

    /** Dismiss the current cache toast with a final message, then auto-remove. */
    function finishAppCacheToast(message, delay) {
        if (delay === undefined) delay = 2000;
        createOrUpdateAppCacheToast(message, delay);
    }

    if (document.documentElement.hasAttribute("manifest")) {
        if (!navigator.onLine) {
            createOrUpdateAppCacheToast('Offline.', 2000);
        }
    }

    appCache.addEventListener('cached', function (e) {
        logAppCacheEvent('cached');
        finishAppCacheToast('Finished caching site.', 2000);
    }, false);

    appCache.addEventListener('checking', function (e) {
        logAppCacheEvent('checking');
        createOrUpdateAppCacheToast("Checking for updates...");
    }, false);

    appCache.addEventListener('downloading', function (e) {
        logAppCacheEvent('downloading');
        createOrUpdateAppCacheToast('Downloading new cache...');
    }, false);

    appCache.addEventListener('error', function (e) {
        logAppCacheEvent('error', { online: navigator.onLine });
        if (navigator.onLine) {
            finishAppCacheToast('Error while caching site.', 5000);
        } else {
            finishAppCacheToast('Offline.', 2000);
        }
    }, false);

    appCache.addEventListener('noupdate', function (e) {
        logAppCacheEvent('noupdate');
        finishAppCacheToast('Cache is up-to-date.', 1500);
    }, false);

    appCache.addEventListener('obsolete', function (e) {
        // The manifest was removed or returned 404. The browser will use
        // the cached copy until reload; auto-reload after a short delay so
        // the user gets a fresh state instead of stale forever.
        logAppCacheEvent('obsolete');
        finishAppCacheToast('Site is obsolete. Reloading...', 3000);
        setTimeout(function () { window.location.reload(); }, 3000);
    }, false);

    appCache.addEventListener('progress', function (e) {
        var percentage = Math.round((e.loaded / e.total) * 100);

        if (e.loaded == e.total) {
            // Download complete, dismiss toast — remaining processing is background work
            finishAppCacheToast('Cache downloaded successfully.', 2000);
        } else {
            createOrUpdateAppCacheToast('Downloading new cache... ' + percentage + '%');
        }
    }, false);

    appCache.addEventListener('updateready', function (e) {
        logAppCacheEvent('updateready');
        if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
            finishAppCacheToast('The site was updated. Reloading in 10s...', 10000);
            // Auto-reload after the toast so the user picks up the new
            // cache without having to manually refresh. Skip if they've
            // already started the exploit chain.
            setTimeout(function () {
                if (!window.exploitStarted &&
                    window.applicationCache.status == window.applicationCache.UPDATEREADY) {
                    window.location.reload();
                }
            }, 10000);
        }
    }, false);
}

function registerL2ButtonHandler() {
    document.addEventListener("keydown", async function (event) {
        // Circle button (keyCode 1) - Go back (context-aware)
        if (event.keyCode === 1) {
            var versionView = document.getElementById('version-selection-view');
            if (versionView && versionView.classList.contains('selected')) {
                event.preventDefault();
                if (window.settingsMode) {
                    // In settings mode: version-selection → settings-view
                    populateSettingsGrid();
                    await switchPage("settings-view");
                } else {
                    // In post-JB mode: version-selection → payloads-view
                    await switchPage("payloads-view");
                }
                return;
            }

            // If on settings view, go back to pre-jb
            var settingsView = document.getElementById('settings-view');
            if (settingsView && settingsView.classList.contains('selected')) {
                event.preventDefault();
                closeSettings();
                return;
            }
        }

        // L2 button (keyCode 118) - Redirect.
        // Scheme allowlist: only accept http(s) URLs that parse cleanly,
        // so a `javascript:` paste cannot self-XSS into the same origin.
        if (event.keyCode === 118) {
            var lastRedirectorValue = localStorage.getItem(LOCALSTORE_REDIRECTOR_LAST_URL_KEY) || "http://";
            var redirectorValue = prompt("Enter url", lastRedirectorValue);

            if (redirectorValue && redirectorValue !== "http://") {
                var safeUrl = null;
                try {
                    var parsed = new URL(redirectorValue);
                    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                        safeUrl = parsed.toString();
                    }
                } catch (e) { /* malformed URL — falls through */ }
                if (!safeUrl) {
                    showToast("Only http(s) URLs are allowed", TOAST_ERROR_TIMEOUT);
                    return;
                }
                localStorage.setItem(LOCALSTORE_REDIRECTOR_LAST_URL_KEY, safeUrl);
                window.location.href = safeUrl;
            }
        }

        // R2 button (keyCode 119) - Licences modal toggle
        if (event.keyCode === 119) {
            event.preventDefault();

            // Visual feedback on the licences button
            var licensesBtn = document.querySelector('.licenses-btn');
            if (licensesBtn) {
                licensesBtn.classList.add('pressed');
                setTimeout(function () {
                    licensesBtn.classList.remove('pressed');
                }, 200);
            }

            // Toggle licenses modal
            var licensesModal = document.getElementById('licenses-modal');
            if (licensesModal && licensesModal.classList.contains('show')) {
                closeLicenses();
            } else {
                openLicenses();
            }
            return;
        }
    });
}

// Export to global scope
window.run = run;
window.registerAppCacheEventHandlers = registerAppCacheEventHandlers;
window.registerL2ButtonHandler = registerL2ButtonHandler;
