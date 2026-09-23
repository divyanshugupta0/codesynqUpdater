/* Firebase configuration is generated from Netlify environment variables at build time. */
if (!window.FIREBASE_CONFIG) {
    throw new Error('Firebase configuration is missing. Run the build step or configure Netlify environment variables.');
}

firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const database = firebase.database();
const releaseRef = database.ref('appUpdates/windows/latest');
const historyRef = database.ref('appUpdates/windows/history');
const $ = (selector) => document.querySelector(selector);
const updateEndpoint = `${window.FIREBASE_CONFIG.databaseURL.replace(/\/$/, '')}/appUpdates/windows/latest.json`;


/* Toast notification */
function showToast(text, error = false) {
    const toast = $('#endpointToast');
    toast.textContent = text;
    toast.classList.toggle('error', error);
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function message(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle('error', error);
}

function setLoading(btn, loading) {
    btn.disabled = loading;
    const spinner = $('#publishSpinner');
    spinner.classList.toggle('hidden', !loading);
}

/* Render current release */
function renderRelease(release) {
    const target = $('#currentRelease');
    if (!release) { target.innerHTML = 'No Windows release has been published.'; return; }
    const date = release.publishedAt ? new Date(release.publishedAt).toLocaleString() : 'Unknown date';
    const size = release.size ? `<br><small>Size: ${(release.size / 1024 / 1024).toFixed(1)} MB</small>` : '';
    target.innerHTML = `<strong>v${escapeHtml(release.version)}</strong> · ${release.mandatory ? 'Required' : 'Optional'} update<br><small>Published ${date}</small>${size}<br><a href="${escapeHtml(release.downloadUrl)}" target="_blank" rel="noopener">Download installer</a>`;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/* Render release history */
function renderHistory(snapshot) {
    const card = $('#historyCard');
    const container = $('#releaseHistory');
    const data = snapshot.val();
    if (!data) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const entries = Object.entries(data).sort((a, b) => (b[1].publishedAt || 0) - (a[1].publishedAt || 0));
    container.innerHTML = entries.map(([key, r]) => {
        const date = r.publishedAt ? new Date(r.publishedAt).toLocaleString() : 'Unknown';
        return `<div class="history-item">
            <div><span class="ver">v${escapeHtml(r.version || key)}</span> <span class="meta">· ${date}</span></div>
            <button data-key="${key}" aria-label="Delete release ${r.version || key}">Delete</button>
        </div>`;
    }).join('');
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Delete this release from history?')) historyRef.child(btn.dataset.key).remove();
        });
    });
}

/* Security posture */
function renderSecurity(snapshot) {
    const card = $('#securityCard');
    const container = $('#securityStatus');
    const data = snapshot.val();
    card.classList.remove('hidden');
    const checks = [
        { label: 'Latest release', value: data ? `v${data.version}` : 'None', ok: !!data },
        { label: 'HTTPS download', value: data?.downloadUrl?.startsWith('https:') ? 'Yes' : 'No', ok: data?.downloadUrl?.startsWith('https:') },
        { label: 'SHA-512 present', value: data?.sha512 ? 'Yes' : 'No', ok: !!data?.sha512 },
        { label: 'Release notes', value: data?.releaseNotes ? 'Yes' : 'No', ok: !!data?.releaseNotes },
    ];
    container.innerHTML = checks.map(c => `
        <div class="security-row">
            <span class="label">${c.label}</span>
            <span class="value ${c.ok ? 'ok' : 'bad'}">${c.value}</span>
        </div>`).join('');
}

/* Live listeners */
releaseRef.on('value', snapshot => {
    renderRelease(snapshot.val());
    const el = $('#connectionStatus');
    el.classList.add('online');
    el.innerHTML = '<span class="status-dot"></span> Update endpoint online';
});

historyRef.on('value', renderHistory);
releaseRef.on('value', renderSecurity);

/* Refresh */
$('#refreshBtn').addEventListener('click', () => {
    releaseRef.once('value').catch(() => {});
    historyRef.once('value').catch(() => {});
});


/* Sign in */
$('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    message($('#loginMessage'), 'Signing in…');
    try {
        await auth.signInWithEmailAndPassword($('#email').value.trim(), $('#password').value);
        message($('#loginMessage'), '');
    } catch (error) {
        message($('#loginMessage'), `Sign-in failed: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
});

/* Sign out */
$('#signOut').addEventListener('click', () => auth.signOut());

/* Auth state */
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        $('#loginCard').classList.remove('hidden');
        $('#publisherCard').classList.add('hidden');
        $('#historyCard').classList.add('hidden');
        $('#securityCard').classList.add('hidden');
        return;
    }

    try {
        const snapshot = await database.ref(`users/${user.uid}/isAdmin`).once('value');
        const isAdmin = snapshot.val() === true;
        $('#loginCard').classList.toggle('hidden', isAdmin);
        $('#publisherCard').classList.toggle('hidden', !isAdmin);
        $('#historyCard').classList.toggle('hidden', !isAdmin);
        $('#securityCard').classList.toggle('hidden', !isAdmin);
        if (isAdmin) $('#signedInEmail').textContent = user.email || user.uid;
        if (!isAdmin) message($('#loginMessage'), 'Signed in, but this account is not an update administrator. Add users/' + user.uid + '/isAdmin = true in Realtime Database.', true);
    } catch (error) {
        $('#loginCard').classList.remove('hidden');
        $('#publisherCard').classList.add('hidden');
        message($('#loginMessage'), `Signed in, but Firebase blocked the admin check: ${error.message}`, true);
    }
});

/* Publish release */
$('#releaseForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = auth.currentUser;
    const version = $('#version').value.trim();
    const downloadUrl = $('#downloadUrl').value.trim();
    const latestYmlUrl = $('#latestYmlUrl').value.trim();
    const sha512 = $('#sha512').value.trim();
    const fileSize = $('#fileSize').value.trim();
    const output = $('#publishMessage');
    if (!user || !downloadUrl || !latestYmlUrl || !sha512) return;

    let releaseUrl;
    try { releaseUrl = new URL(downloadUrl); } catch { return message(output, 'Enter a valid GitHub download URL.', true); }
    if (releaseUrl.protocol !== 'https:' || releaseUrl.hostname !== 'github.com') {
        return message(output, 'Use an HTTPS direct GitHub Release URL.', true);
    }

    let ymlUrl;
    try { ymlUrl = new URL(latestYmlUrl); } catch { return message(output, 'Enter a valid GitHub latest.yml URL.', true); }
    if (ymlUrl.protocol !== 'https:' || ymlUrl.hostname !== 'github.com') {
        return message(output, 'Use an HTTPS direct GitHub latest.yml URL.', true);
    }

    const admin = (await database.ref(`users/${user.uid}/isAdmin`).once('value')).val() === true;
    if (!admin) return message(output, 'Administrator permission is required.', true);

    const button = $('#publishButton');
    setLoading(button, true);
    message(output, 'Publishing version to Firebase…');

    try {
        const fileName = decodeURIComponent(releaseUrl.pathname.split('/').pop() || 'CodeSynq-Setup.exe');
        await releaseRef.set({
            version, downloadUrl: releaseUrl.href, latestYmlUrl: ymlUrl.href, fileName,
            sha512,
            size: fileSize ? Number(fileSize) : null,
            mandatory: $('#mandatory').value === 'true',
            releaseNotes: $('#releaseNotes').value.trim(),
            publishedAt: firebase.database.ServerValue.TIMESTAMP,
            publishedBy: user.uid
        });
        message(output, `Version ${version} is now live at the update endpoint.`);
        showToast(`v${version} published.`);
        event.target.reset();
    } catch (error) {
        message(output, error.message, true);
    } finally {
        setLoading(button, false);
    }
});
