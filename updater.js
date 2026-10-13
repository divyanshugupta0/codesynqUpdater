/**
 * CodeSynq Desktop Release & Update Orchestrator
 * Enterprise release management, real-time sync, cryptography studio, and simulator.
 */

(() => {
    'use strict';

    // Global selector helpers
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));

    // Firebase initialization with graceful fallback
    let auth = null;
    let database = null;
    let releaseRef = null;
    let historyRef = null;
    let isConnected = false;
    let currentReleaseData = null;
    let historyDataCache = {};

    const fbConfig = window.FIREBASE_CONFIG || {};

    try {
        if (typeof firebase !== 'undefined' && fbConfig.apiKey) {
            firebase.initializeApp(fbConfig);
            auth = firebase.auth();
            database = firebase.database();
            releaseRef = database.ref('appUpdates/windows/latest');
            historyRef = database.ref('appUpdates/windows/history');
        }
    } catch (e) {
        console.warn('Firebase initialization notice:', e);
    }

    const dbBaseUrl = (fbConfig.databaseURL || '').replace(/\/$/, '');
    const updateEndpoint = dbBaseUrl ? `${dbBaseUrl}/appUpdates/windows/latest.json` : 'Endpoint unconfigured';

    // Initialize UI endpoint displays
    const endpointEl = $('#endpoint');
    if (endpointEl) endpointEl.textContent = updateEndpoint;

    const openEndpointLink = $('#openEndpointLink');
    if (openEndpointLink) openEndpointLink.href = updateEndpoint;

    const curlSnippet = $('#curlSnippet');
    if (curlSnippet) {
        curlSnippet.textContent = `curl -s "${updateEndpoint}" | jq .`;
    }

    /* ==========================================================================
       Toast & Modal Notification System
       ========================================================================== */
    function showToast(message, type = 'info', duration = 3500) {
        const container = $('#toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        if (type === 'success') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        } else if (type === 'error') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        }

        toast.innerHTML = `
            ${iconSvg}
            <span style="flex: 1;">${escapeHtml(message)}</span>
            <button style="background: transparent; border: 0; color: #64748b; cursor: pointer; padding: 2px 6px; font-size: 14px;">✕</button>
        `;

        toast.querySelector('button').addEventListener('click', () => {
            toast.remove();
        });

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 250);
            }
        }, duration);
    }

    function confirmAction(title, message, isDanger = true) {
        return new Promise((resolve) => {
            const overlay = $('#confirmModalOverlay');
            const titleEl = $('#confirmModalTitle');
            const msgEl = $('#confirmModalMessage');
            const proceedBtn = $('#confirmProceedBtn');
            const cancelBtn = $('#confirmCancelBtn');
            const closeBtn = $('#closeConfirmModalBtn');

            if (!overlay) {
                resolve(window.confirm(message));
                return;
            }

            titleEl.textContent = title;
            msgEl.textContent = message;
            proceedBtn.className = `btn btn-sm ${isDanger ? 'btn-danger' : 'btn-primary'}`;
            overlay.classList.remove('hidden');

            const cleanup = (res) => {
                overlay.classList.add('hidden');
                proceedBtn.removeEventListener('click', onProceed);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                resolve(res);
            };

            const onProceed = () => cleanup(true);
            const onCancel = () => cleanup(false);

            proceedBtn.addEventListener('click', onProceed);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes)) return '--';
        const num = Number(bytes);
        if (num < 1024) return `${num} B`;
        if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
        return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    }

    function compareVersions(a, b) {
        const partsA = String(a || '').replace(/^[^\d]*/, '').split('.').map(Number);
        const partsB = String(b || '').replace(/^[^\d]*/, '').split('.').map(Number);
        const len = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < len; i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA > numB) return 1;
            if (numA < numB) return -1;
        }
        return 0;
    }

    /* ==========================================================================
       Tab Navigation System
       ========================================================================== */
    function switchTab(tabId) {
        $$('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        $$('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });

        const tabName = tabId.replace('tab-', '');
        window.location.hash = tabName;
    }

    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    if (window.location.hash) {
        const targetId = `tab-${window.location.hash.replace('#', '')}`;
        if ($(`#${targetId}`)) switchTab(targetId);
    }

    /* ==========================================================================
       AUTH GATE & ACCESS CONTROL
       Only reveal #appInterface upon successful administrator authentication
       ========================================================================== */
    const authGate = $('#authGate');
    const appInterface = $('#appInterface');
    const authMessage = $('#authGateMessage');
    const toggleGatePassword = $('#toggleGatePassword');
    const gatePasswordInput = $('#gatePassword');

    // Toggle password visibility on login gate
    toggleGatePassword?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!gatePasswordInput) return;
        const isPassword = gatePasswordInput.type === 'password';
        gatePasswordInput.type = isPassword ? 'text' : 'password';
        toggleGatePassword.textContent = isPassword ? 'Hide' : 'Show';
    });

    // Handle gate login submission
    $('#authLoginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#gateEmail')?.value.trim();
        const password = $('#gatePassword')?.value;
        const submitBtn = $('#gateLoginBtn');

        if (!email || !password) {
            if (authMessage) {
                authMessage.textContent = 'Please enter both administrator email and password.';
                authMessage.style.color = 'var(--status-danger)';
            }
            return;
        }

        if (!auth) {
            if (authMessage) {
                authMessage.textContent = 'Firebase authentication service is not initialized.';
                authMessage.style.color = 'var(--status-danger)';
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="status-dot"></span> Authenticating…';
        if (authMessage) {
            authMessage.textContent = 'Verifying credentials…';
            authMessage.style.color = 'var(--brand-navy)';
        }

        try {
            await auth.signInWithEmailAndPassword(email, password);
            if (authMessage) authMessage.textContent = '';
            showToast(`Signed in successfully as ${email}`, 'success');
        } catch (err) {
            if (authMessage) {
                authMessage.textContent = `Sign in error: ${err.message}`;
                authMessage.style.color = 'var(--status-danger)';
            }
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                Sign In to Console
            `;
        }
    });

    // Handle sign out
    $('#signOutBtn')?.addEventListener('click', () => {
        if (auth) auth.signOut();
        authGate?.classList.remove('hidden');
        appInterface?.classList.add('hidden');
        showToast('Signed out of administrator console', 'info');
    });

    // Live auth state listener
    if (auth) {
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                // Not logged in -> Show ONLY auth gate
                authGate?.classList.remove('hidden');
                appInterface?.classList.add('hidden');
                return;
            }

            const email = user.email || user.uid;
            const headerEmail = $('#headerUserEmail');
            const headerAvatar = $('#userAvatar');
            if (headerEmail) headerEmail.textContent = email;
            if (headerAvatar) headerAvatar.textContent = (email[0] || 'A').toUpperCase();

            // Verify admin privileges in Realtime Database
            try {
                if (database) {
                    const snap = await database.ref(`users/${user.uid}/isAdmin`).once('value');
                    const isAdmin = snap.val() === true;

                    if (isAdmin) {
                        // Authorized administrator -> REVEAL FULL INTERFACE
                        authGate?.classList.add('hidden');
                        appInterface?.classList.remove('hidden');
                        if (authMessage) authMessage.textContent = '';
                    } else {
                        // User exists but not marked admin
                        authGate?.classList.remove('hidden');
                        appInterface?.classList.add('hidden');
                        if (authMessage) {
                            authMessage.textContent = `Signed in as ${email}, but account does not have admin permissions (users/${user.uid}/isAdmin = true).`;
                            authMessage.style.color = 'var(--status-danger)';
                        }
                    }
                } else {
                    // Fallback if database not initialized
                    authGate?.classList.add('hidden');
                    appInterface?.classList.remove('hidden');
                }
            } catch (err) {
                console.warn('Admin check warning:', err);
                // Allow view if read rules are bypassed in development
                authGate?.classList.add('hidden');
                appInterface?.classList.remove('hidden');
            }
        });
    }

    /* ==========================================================================
       Rendering: Live Release Showcase & KPI
       ========================================================================== */
    function renderRelease(release) {
        currentReleaseData = release;
        const statusEl = $('#connectionStatus');
        const statusText = $('#statusText');
        
        if (statusEl && statusText) {
            statusEl.classList.remove('error');
            statusEl.classList.add('online');
            statusText.textContent = 'Firebase Connected';
        }

        if (!release) {
            $('#kpiVersion').textContent = 'v0.0.0';
            $('#kpiUpdateType').textContent = 'No active release';
            $('#kpiSize').textContent = '-- MB';
            $('#kpiFileName').textContent = 'None';
            $('#showcaseVersion').textContent = 'v0.0.0 (Unpublished)';
            $('#showcasePill').className = 'pill pill-optional';
            $('#showcasePill').textContent = 'Draft Mode';
            $('#showcaseDate').textContent = 'None';
            $('#showcaseFileName').textContent = 'None';
            $('#showcaseSize').textContent = '--';
            $('#showcaseSha512').textContent = '--';
            $('#showcaseNotes').textContent = 'No release has been published to the live endpoint yet.';
            $('#showcaseDownloadLink').classList.add('hidden');
            renderSecurity(null);
            return;
        }

        const isMandatory = release.mandatory === true;
        const versionStr = `v${release.version}`;
        const dateStr = release.publishedAt ? new Date(release.publishedAt).toLocaleString() : 'Unknown date';
        const sizeFormatted = release.size ? formatBytes(release.size) : '--';

        // Update KPIs
        $('#kpiVersion').textContent = versionStr;
        $('#kpiUpdateType').textContent = isMandatory ? 'Mandatory Patch' : 'Optional Update';
        $('#kpiSize').textContent = sizeFormatted;
        $('#kpiFileName').textContent = release.fileName || 'Setup.exe';

        // Update Showcase
        $('#showcaseVersion').textContent = versionStr;
        const showcasePill = $('#showcasePill');
        showcasePill.className = `pill ${isMandatory ? 'pill-mandatory' : 'pill-optional'}`;
        showcasePill.textContent = isMandatory ? 'Mandatory Patch' : 'Optional Update';

        $('#showcaseDate').textContent = dateStr;
        $('#showcaseFileName').textContent = release.fileName || 'CodeSynq-Setup.exe';
        $('#showcaseSize').textContent = release.size ? `${Number(release.size).toLocaleString()} bytes (${sizeFormatted})` : '--';
        $('#showcaseSha512').textContent = release.sha512 || '--';
        $('#showcaseNotes').textContent = release.releaseNotes || 'No changelog documented for this release.';

        const dlBtn = $('#showcaseDownloadLink');
        if (release.downloadUrl) {
            dlBtn.href = release.downloadUrl;
            dlBtn.classList.remove('hidden');
        } else {
            dlBtn.classList.add('hidden');
        }

        renderSecurity(release);
        updateSimClient();
    }

    /* ==========================================================================
       Rendering: Security & Integrity Audit
       ========================================================================== */
    function renderSecurity(release) {
        const grid = $('#securityAuditGrid');
        if (!grid) return;

        const isHttps = release?.downloadUrl?.startsWith('https:') && release?.latestYmlUrl?.startsWith('https:');
        const hasSha = !!release?.sha512 && release.sha512.length >= 20;
        const hasNotes = !!release?.releaseNotes && release.releaseNotes.trim().length > 0;
        const hasSize = !!release?.size && release.size > 0;
        const hasVersion = !!release?.version;

        const checks = [
            {
                title: 'Active Release Deployed',
                desc: 'Valid semantic version published to distribution feed',
                status: hasVersion ? 'ok' : 'bad',
                statusText: hasVersion ? 'Verified' : 'Missing'
            },
            {
                title: 'TLS/HTTPS Transport',
                desc: 'Installer & manifest served over encrypted connection',
                status: isHttps ? 'ok' : 'bad',
                statusText: isHttps ? 'HTTPS Enforced' : 'Insecure'
            },
            {
                title: 'SHA-512 Checksum Verified',
                desc: 'Base64 digest present for binary tamper validation',
                status: hasSha ? 'ok' : 'bad',
                statusText: hasSha ? 'Integrity OK' : 'Missing Hash'
            },
            {
                title: 'Changelog Documented',
                desc: 'Release notes available for client display',
                status: hasNotes ? 'ok' : 'warn',
                statusText: hasNotes ? 'Documented' : 'Empty Notes'
            },
            {
                title: 'Installer Footprint Audit',
                desc: 'Byte count declared for progress reporting',
                status: hasSize ? 'ok' : 'warn',
                statusText: hasSize ? 'Validated' : 'Size Unset'
            }
        ];

        let passed = checks.filter(c => c.status === 'ok').length;
        let score = Math.round((passed / checks.length) * 100);

        const scoreEl = $('#kpiScore');
        if (scoreEl) scoreEl.textContent = `${score}%`;

        const summaryEl = $('#kpiSecuritySummary');
        if (summaryEl) {
            summaryEl.textContent = score === 100 ? 'All Checks Passed' : `${passed} of ${checks.length} benchmarks met`;
        }

        const mandatoryNotice = $('#mandatoryNoticeBadge');
        if (mandatoryNotice && release) {
            mandatoryNotice.className = `pill ${release.mandatory ? 'pill-mandatory' : 'pill-optional'}`;
            mandatoryNotice.textContent = release.mandatory ? 'Critical Patch Channel' : 'Standard Channel';
        }

        grid.innerHTML = checks.map(c => `
            <div class="audit-card">
                <div class="audit-info">
                    <span class="audit-title">${escapeHtml(c.title)}</span>
                    <span class="audit-desc">${escapeHtml(c.desc)}</span>
                </div>
                <span class="audit-status-badge ${c.status}">${escapeHtml(c.statusText)}</span>
            </div>
        `).join('');
    }

    /* ==========================================================================
       Rendering: Release History Registry & Actions
       ========================================================================== */
    function renderHistory(snapshot) {
        const container = $('#releaseHistoryList');
        const badge = $('#historyCountBadge');
        const data = snapshot ? snapshot.val() : historyDataCache;
        historyDataCache = data || {};

        const entries = Object.entries(historyDataCache).sort((a, b) => {
            const timeA = a[1].publishedAt || 0;
            const timeB = b[1].publishedAt || 0;
            return timeB - timeA;
        });

        if (badge) badge.textContent = String(entries.length);

        if (!entries.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 48px 20px; color: var(--fg-muted);">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.6;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                    <p style="font-size: 15px; font-weight: 700; color: var(--brand-navy);">No Historical Releases Recorded</p>
                    <p style="font-size: 13px; margin-top: 4px;">Releases published through this dashboard will appear here with instant rollback capability.</p>
                </div>
            `;
            return;
        }

        const filterVal = $('#historyFilterSelect')?.value || 'all';
        const searchVal = ($('#historySearchInput')?.value || '').trim().toLowerCase();

        const filtered = entries.filter(([key, r]) => {
            if (filterVal === 'mandatory' && !r.mandatory) return false;
            if (filterVal === 'optional' && r.mandatory) return false;
            if (searchVal) {
                const combined = `${r.version || ''} ${r.fileName || ''} ${r.releaseNotes || ''}`.toLowerCase();
                return combined.includes(searchVal);
            }
            return true;
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 36px; color: var(--fg-muted);">
                    No releases match your search criteria.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(([key, r]) => {
            const isActive = currentReleaseData && currentReleaseData.version === r.version;
            const date = r.publishedAt ? new Date(r.publishedAt).toLocaleString() : 'Unknown date';
            const size = r.size ? formatBytes(r.size) : '';

            return `
                <div class="history-card ${isActive ? 'is-active-release' : ''}" data-key="${escapeHtml(key)}">
                    <div class="history-main-info">
                        <span class="history-version">v${escapeHtml(r.version || key)}</span>
                        <span class="pill ${r.mandatory ? 'pill-mandatory' : 'pill-optional'}">
                            ${r.mandatory ? 'Mandatory' : 'Optional'}
                        </span>
                        ${isActive ? '<span class="pill pill-channel" style="background: var(--brand-crimson-light); color: var(--brand-crimson);">Active Live</span>' : ''}
                        <div class="history-meta">
                            <span>${date}</span>
                            ${size ? `<span>· ${size}</span>` : ''}
                            ${r.fileName ? `<span class="font-mono">· ${escapeHtml(r.fileName)}</span>` : ''}
                        </div>
                    </div>
                    <div class="history-actions">
                        ${!isActive ? `
                            <button class="btn btn-secondary btn-sm rollback-btn" data-key="${escapeHtml(key)}" title="Promote this release to active">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                Rollback to this
                            </button>
                        ` : ''}
                        ${r.downloadUrl ? `
                            <a href="${escapeHtml(r.downloadUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" title="Download installer">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </a>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm copy-payload-btn" data-key="${escapeHtml(key)}" title="Copy release JSON">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="btn btn-danger btn-sm delete-history-btn" data-key="${escapeHtml(key)}" title="Delete from registry">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach listeners for card actions
        container.querySelectorAll('.rollback-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const key = btn.dataset.key;
                const target = historyDataCache[key];
                if (!target) return;

                const confirmed = await confirmAction(
                    `Promote v${target.version} to Live?`,
                    `This will overwrite the active live endpoint with version ${target.version}. All CodeSynq Desktop clients checking for updates will receive this version.`,
                    false
                );

                if (confirmed) {
                    try {
                        await releaseRef.set({
                            ...target,
                            promotedAt: firebase.database.ServerValue.TIMESTAMP
                        });
                        showToast(`v${target.version} is now the active live release!`, 'success');
                    } catch (err) {
                        showToast(`Rollback failed: ${err.message}`, 'error');
                    }
                }
            });
        });

        container.querySelectorAll('.copy-payload-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = historyDataCache[btn.dataset.key];
                if (target) {
                    navigator.clipboard.writeText(JSON.stringify(target, null, 2));
                    showToast('Release payload copied to clipboard', 'info');
                }
            });
        });

        container.querySelectorAll('.delete-history-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const key = btn.dataset.key;
                const target = historyDataCache[key];
                const confirmed = await confirmAction(
                    'Delete from Release Registry',
                    `Remove version ${target?.version || key} from history records? This cannot be undone.`
                );

                if (confirmed && historyRef) {
                    try {
                        await historyRef.child(key).remove();
                        showToast(`Removed v${target?.version || key} from registry`, 'info');
                    } catch (err) {
                        showToast(`Delete failed: ${err.message}`, 'error');
                    }
                }
            });
        });
    }

    // Filter and search history inputs
    $('#historySearchInput')?.addEventListener('input', () => renderHistory(null));
    $('#historyFilterSelect')?.addEventListener('change', () => renderHistory(null));

    // Export history
    $('#exportHistoryBtn')?.addEventListener('click', () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(historyDataCache, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `codesynq-release-registry-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        showToast('Release registry exported as JSON', 'success');
    });

    // Clear history
    $('#clearHistoryBtn')?.addEventListener('click', async () => {
        const confirmed = await confirmAction(
            'Clear Entire Release Registry',
            'Are you sure you want to delete ALL historical release entries? The active release will NOT be deleted.'
        );

        if (confirmed && historyRef) {
            try {
                await historyRef.remove();
                showToast('Release registry cleared', 'info');
            } catch (err) {
                showToast(`Clear failed: ${err.message}`, 'error');
            }
        }
    });

    /* ==========================================================================
       Live Database Listeners & Refresh
       ========================================================================== */
    if (releaseRef) {
        releaseRef.on('value', snapshot => {
            isConnected = true;
            renderRelease(snapshot.val());
        }, error => {
            console.error('Firebase read error:', error);
            const statusEl = $('#connectionStatus');
            const statusText = $('#statusText');
            if (statusEl && statusText) {
                statusEl.classList.add('error');
                statusText.textContent = 'Connection Blocked';
            }
        });
    }

    if (historyRef) {
        historyRef.on('value', renderHistory, error => {
            console.warn('History read notice:', error);
        });
    }

    // Refresh button
    $('#refreshBtn')?.addEventListener('click', async () => {
        const btn = $('#refreshBtn');
        btn.classList.add('spinning');
        btn.disabled = true;

        try {
            if (releaseRef) {
                const snap = await releaseRef.once('value');
                renderRelease(snap.val());
            }
            if (historyRef) {
                const histSnap = await historyRef.once('value');
                renderHistory(histSnap);
            }
            showToast('Release data synchronized', 'success');
        } catch (err) {
            showToast(`Sync notice: ${err.message}`, 'error');
        } finally {
            setTimeout(() => {
                btn.classList.remove('spinning');
                btn.disabled = false;
            }, 400);
        }
    });

    // Copy endpoint
    $('#copyEndpointBtn')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(updateEndpoint);
            showToast('Endpoint URL copied to clipboard', 'success');
        } catch {
            showToast('Failed to copy. Please select and copy manually.', 'error');
        }
    });

    /* ==========================================================================
       GitHub URL Fast-Fill & Sample Data Helpers
       ========================================================================== */
    $('#parseGithubBtn')?.addEventListener('click', () => {
        const urlInput = $('#githubAutoUrl');
        const rawUrl = (urlInput?.value || '').trim();
        if (!rawUrl) {
            showToast('Enter a GitHub release or asset URL first', 'error');
            return;
        }

        try {
            const parsed = new URL(rawUrl);
            if (!parsed.hostname.includes('github.com')) {
                showToast('URL must be on github.com', 'error');
                return;
            }

            const parts = parsed.pathname.split('/').filter(Boolean);
            const owner = parts[0];
            const repo = parts[1];

            let tag = '';
            if (parsed.pathname.includes('/releases/tag/')) {
                tag = parts[parts.indexOf('tag') + 1] || '';
            } else if (parsed.pathname.includes('/releases/download/')) {
                tag = parts[parts.indexOf('download') + 1] || '';
            }

            const cleanVersion = tag.replace(/^v/, '');
            if (cleanVersion) {
                $('#version').value = cleanVersion;
            }

            const assetName = `CodeSynq-Setup-${cleanVersion || '1.0.0'}.exe`;
            const baseDownload = `https://github.com/${owner}/${repo}/releases/download/${tag || 'v' + cleanVersion}`;
            
            $('#downloadUrl').value = `${baseDownload}/${assetName}`;
            $('#latestYmlUrl').value = `${baseDownload}/latest.yml`;

            showToast(`Auto-formatted for ${owner}/${repo} v${cleanVersion}`, 'success');
            updatePayloadPreview();
        } catch {
            showToast('Invalid GitHub URL format', 'error');
        }
    });

    $('#fillSampleBtn')?.addEventListener('click', () => {
        $('#version').value = '1.0.4';
        $('#downloadUrl').value = 'https://github.com/divyanshugupta0/codesynq/releases/download/v1.0.4/CodeSynq-Setup-1.0.4.exe';
        $('#latestYmlUrl').value = 'https://github.com/divyanshugupta0/codesynq/releases/download/v1.0.4/latest.yml';
        $('#sha512').value = 'y3uXk9P0oK8nQ+1bM7w4Z2dF9eH3rT1sV8aC6pL4mN2bV0xZ8qW6eR4tY2uI0oP8aS6dF4gH2jK0lZ8x==';
        $('#fileSize').value = '78543200';
        $('#releaseNotes').value = '### CodeSynq Desktop v1.0.4\n- Enhanced real-time synchronization with cloud runner\n- Cryptographic integrity checks on extension host\n- Memory optimization for active editor tabs';
        updatePayloadPreview();
        showToast('Sample template data populated', 'info');
    });

    // Real-time payload preview & size formatting
    function updatePayloadPreview() {
        const previewEl = $('#payloadPreview');
        if (!previewEl) return;

        const version = $('#version')?.value.trim() || '1.0.0';
        const downloadUrl = $('#downloadUrl')?.value.trim() || '';
        const latestYmlUrl = $('#latestYmlUrl')?.value.trim() || '';
        const sha512 = $('#sha512')?.value.trim() || '';
        const fileSize = $('#fileSize')?.value.trim();
        const mandatory = $('#mandatory')?.value === 'true';
        const releaseNotes = $('#releaseNotes')?.value.trim() || '';

        const fileName = downloadUrl ? decodeURIComponent(downloadUrl.split('/').pop() || 'CodeSynq-Setup.exe') : 'CodeSynq-Setup.exe';

        const payload = {
            version,
            downloadUrl,
            latestYmlUrl,
            fileName,
            sha512,
            size: fileSize ? Number(fileSize) : null,
            mandatory,
            releaseNotes,
            publishedAt: Date.now(),
            publishedBy: auth?.currentUser?.uid || 'admin'
        };

        previewEl.textContent = JSON.stringify(payload, null, 2);

        const sizeFormattedHint = $('#sizeFormattedHint');
        if (sizeFormattedHint) {
            sizeFormattedHint.textContent = fileSize ? formatBytes(fileSize) : 'Optional';
        }
    }

    ['version', 'downloadUrl', 'latestYmlUrl', 'sha512', 'fileSize', 'mandatory', 'releaseNotes'].forEach(id => {
        $(`#${id}`)?.addEventListener('input', updatePayloadPreview);
        $(`#${id}`)?.addEventListener('change', updatePayloadPreview);
    });

    /* ==========================================================================
       Publish Form Submission
       ========================================================================== */
    $('#releaseForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = $('#publishButton');

        if (!auth?.currentUser) {
            showToast('You must be signed in as an administrator to publish', 'error');
            return;
        }

        const version = $('#version').value.trim();
        const downloadUrl = $('#downloadUrl').value.trim();
        const latestYmlUrl = $('#latestYmlUrl').value.trim();
        const sha512 = $('#sha512').value.trim();
        const fileSize = $('#fileSize').value.trim();
        const mandatory = $('#mandatory').value === 'true';
        const releaseNotes = $('#releaseNotes').value.trim();

        if (!version || !downloadUrl || !latestYmlUrl || !sha512) {
            showToast('Please fill all required release fields', 'error');
            return;
        }

        let releaseUrl, ymlUrl;
        try {
            releaseUrl = new URL(downloadUrl);
            ymlUrl = new URL(latestYmlUrl);
        } catch {
            showToast('Invalid URL entered', 'error');
            return;
        }

        if (releaseUrl.protocol !== 'https:' || !releaseUrl.hostname.includes('github.com')) {
            showToast('Installer download must be an HTTPS GitHub release asset', 'error');
            return;
        }

        if (ymlUrl.protocol !== 'https:' || !ymlUrl.hostname.includes('github.com')) {
            showToast('latest.yml must be an HTTPS GitHub release asset', 'error');
            return;
        }

        button.disabled = true;
        button.innerHTML = '<span class="status-dot"></span> Publishing version to Firebase…';

        const fileName = decodeURIComponent(releaseUrl.pathname.split('/').pop() || 'CodeSynq-Setup.exe');
        const releasePayload = {
            version,
            downloadUrl: releaseUrl.href,
            latestYmlUrl: ymlUrl.href,
            fileName,
            sha512,
            size: fileSize ? Number(fileSize) : null,
            mandatory,
            releaseNotes,
            publishedAt: firebase.database.ServerValue.TIMESTAMP,
            publishedBy: auth.currentUser.uid
        };

        try {
            await releaseRef.set(releasePayload);

            const sanitizedKey = version.replace(/[.#$/[\]]/g, '_');
            if (historyRef) {
                try {
                    await historyRef.child(sanitizedKey).set({
                        ...releasePayload,
                        publishedAt: Date.now()
                    });
                } catch (histErr) {
                    console.warn('History archival notice:', histErr);
                }
            }

            showToast(`Release v${version} successfully published live!`, 'success');
            e.target.reset();
            updatePayloadPreview();
            switchTab('tab-overview');
        } catch (err) {
            showToast(`Publishing failed: ${err.message}`, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Publish Live Release to Firebase
            `;
        }
    });

    /* ==========================================================================
       SHA-512 & Manifest Studio (Client-Side Web Crypto)
       ========================================================================== */
    const dropzone = $('#hashDropzone');
    const fileInput = $('#hashFileInput');
    let lastComputedHashData = null;

    dropzone?.addEventListener('click', () => fileInput?.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone?.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone?.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone?.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileForHash(file);
    });

    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileForHash(file);
    });

    async function handleFileForHash(file) {
        const resultBox = $('#hashResultBox');
        const fileNameEl = $('#hashFileName');
        const fileSizeEl = $('#hashFileSize');
        const base64El = $('#hashBase64Output');
        const hexEl = $('#hashHexOutput');

        resultBox.classList.remove('hidden');
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = `${Number(file.size).toLocaleString()} Bytes (${formatBytes(file.size)})`;
        base64El.value = 'Calculating SHA-512 with Web Crypto API…';
        hexEl.value = 'Computing…';

        try {
            const buffer = await file.arrayBuffer();
            const digest = await crypto.subtle.digest('SHA-512', buffer);
            
            const bytes = new Uint8Array(digest);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

            base64El.value = base64;
            hexEl.value = hex;

            lastComputedHashData = {
                fileName: file.name,
                size: file.size,
                sha512Base64: base64,
                sha512Hex: hex
            };

            showToast('SHA-512 calculation complete!', 'success');
        } catch (err) {
            base64El.value = `Error: ${err.message}`;
            showToast(`Cryptography error: ${err.message}`, 'error');
        }
    }

    $('#copyHashBase64Btn')?.addEventListener('click', () => {
        const val = $('#hashBase64Output')?.value;
        if (val) {
            navigator.clipboard.writeText(val);
            showToast('Base64 hash copied', 'info');
        }
    });

    $('#copyHashHexBtn')?.addEventListener('click', () => {
        const val = $('#hashHexOutput')?.value;
        if (val) {
            navigator.clipboard.writeText(val);
            showToast('Hexadecimal hash copied', 'info');
        }
    });

    $('#applyHashToFormBtn')?.addEventListener('click', () => {
        if (!lastComputedHashData) return;
        $('#sha512').value = lastComputedHashData.sha512Base64;
        $('#fileSize').value = lastComputedHashData.size;
        updatePayloadPreview();
        switchTab('tab-publish');
        showToast('Hash & size applied to publish form', 'success');
    });

    $('#downloadLatestYmlBtn')?.addEventListener('click', () => {
        if (!lastComputedHashData) return;
        const version = $('#version')?.value.trim() || '1.0.0';
        const fileName = lastComputedHashData.fileName;
        const base64 = lastComputedHashData.sha512Base64;
        const size = lastComputedHashData.size;

        const ymlContent = [
            `version: ${version}`,
            `files:`,
            `  - url: ${fileName}`,
            `    sha512: ${base64}`,
            `    size: ${size}`,
            `path: ${fileName}`,
            `sha512: ${base64}`,
            `releaseDate: '${new Date().toISOString()}'`
        ].join('\n') + '\n';

        const blob = new Blob([ymlContent], { type: 'text/yaml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'latest.yml';
        a.click();
        showToast('Downloaded generated latest.yml', 'success');
    });

    $$('.use-hash-tool-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('tab-tools');
        });
    });

    /* ==========================================================================
       Desktop Client Simulator
       ========================================================================== */
    function updateSimClient() {
        const clientVer = ($('#simClientVersion')?.value || '').trim();
        const outcomeBadge = $('#simOutcomeBadge');
        const logEl = $('#simLog');

        if (!currentReleaseData) {
            if (outcomeBadge) {
                outcomeBadge.className = 'pill pill-optional';
                outcomeBadge.textContent = 'No Remote Release';
            }
            if (logEl) logEl.textContent = 'Endpoint returned no active release payload.';
            return;
        }

        const remoteVer = currentReleaseData.version;
        const comp = compareVersions(remoteVer, clientVer);

        let lines = [];
        lines.push(`[Client] Current Installed Version: ${clientVer}`);
        lines.push(`[Remote] Feed Available Version:   ${remoteVer}`);

        if (comp > 0) {
            const isMandatory = currentReleaseData.mandatory === true;
            outcomeBadge.className = `pill ${isMandatory ? 'pill-mandatory' : 'pill-channel'}`;
            outcomeBadge.textContent = isMandatory ? 'Mandatory Upgrade Triggered' : 'Update Available';

            lines.push(`[Decision] Remote version (${remoteVer}) > Client version (${clientVer})`);
            lines.push(`[Action] AutoUpdater event: "update-available"`);
            lines.push(`[Background] Downloading: ${currentReleaseData.downloadUrl}`);
            lines.push(`[Verification] Checking SHA-512 against local stream...`);
            if (isMandatory) {
                lines.push(`[Policy] MANDATORY: UI will enforce immediate restart after download.`);
            } else {
                lines.push(`[Policy] OPTIONAL: Client notified, user can install at convenience.`);
            }
        } else if (comp === 0) {
            outcomeBadge.className = 'pill pill-optional';
            outcomeBadge.textContent = 'Up to Date';
            lines.push(`[Decision] Client version matches remote version (${remoteVer})`);
            lines.push(`[Action] AutoUpdater event: "update-not-available"`);
            lines.push(`[Status] No action required. Running latest build.`);
        } else {
            outcomeBadge.className = 'pill pill-optional';
            outcomeBadge.textContent = 'Ahead of Remote';
            lines.push(`[Decision] Client version (${clientVer}) is newer than remote (${remoteVer})`);
            lines.push(`[Status] Developer or prerelease build detected.`);
        }

        if (logEl) logEl.innerHTML = lines.map(escapeHtml).join('<br>');
    }

    $('#runSimBtn')?.addEventListener('click', updateSimClient);
    $('#simClientVersion')?.addEventListener('input', updateSimClient);

})();
