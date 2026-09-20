/* Firebase configuration is generated from Netlify environment variables at build time. */
if (!window.FIREBASE_CONFIG) {
    throw new Error('Firebase configuration is missing. Run the build step or configure Netlify environment variables.');
}

firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const database = firebase.database();
const releaseRef = database.ref('appUpdates/windows/latest');
const $ = (selector) => document.querySelector(selector);
const updateEndpoint = `${window.FIREBASE_CONFIG.databaseURL.replace(/\/$/, '')}/appUpdates/windows/latest.json`;

$('#endpoint').textContent = updateEndpoint;

function message(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle('error', error);
}

function renderRelease(release) {
    const target = $('#currentRelease');
    if (!release) { target.textContent = 'No Windows release has been published.'; return; }
    const date = release.publishedAt ? new Date(release.publishedAt).toLocaleString() : 'Unknown date';
    const checksum = release.sha512 ? `<br><small>SHA-512: ${release.sha512.substring(0, 32)}…</small>` : '';
    const size = release.size ? `<br><small>Size: ${(release.size / 1024 / 1024).toFixed(1)} MB</small>` : '';
    target.innerHTML = `<strong>v${release.version}</strong> · ${release.mandatory ? 'Required' : 'Optional'} update<br><small>Published ${date}</small><br><a href="${release.downloadUrl}" target="_blank" rel="noopener">Download installer</a>${checksum}${size}`;
}

releaseRef.on('value', snapshot => {
    renderRelease(snapshot.val());
    $('#connectionStatus').textContent = 'Update endpoint online';
});

$('#copyEndpoint').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#endpoint').textContent);
    $('#copyEndpoint').textContent = 'Copied';
    setTimeout(() => { $('#copyEndpoint').textContent = 'Copy endpoint'; }, 1500);
});

$('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    message($('#loginMessage'), 'Signing in…');
    try {
        await auth.signInWithEmailAndPassword($('#email').value.trim(), $('#password').value);
    } catch (error) {
        message($('#loginMessage'), `Sign-in failed: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
});

$('#signOut').addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        $('#loginCard').classList.remove('hidden');
        $('#publisherCard').classList.add('hidden');
        return;
    }

    try {
        const snapshot = await database.ref(`users/${user.uid}/isAdmin`).once('value');
        const isAdmin = snapshot.val() === true;
        $('#loginCard').classList.toggle('hidden', isAdmin);
        $('#publisherCard').classList.toggle('hidden', !isAdmin);
        if (isAdmin) $('#signedInEmail').textContent = user.email || user.uid;
        if (!isAdmin) message($('#loginMessage'), 'Signed in, but this account is not an update administrator. Add users/' + user.uid + '/isAdmin = true in Realtime Database.', true);
    } catch (error) {
        $('#loginCard').classList.remove('hidden');
        $('#publisherCard').classList.add('hidden');
        message($('#loginMessage'), `Signed in, but Firebase blocked the admin check: ${error.message}`, true);
    }
});

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
    try {
        releaseUrl = new URL(downloadUrl);
    } catch {
        return message(output, 'Enter a valid GitHub download URL.', true);
    }
    if (releaseUrl.protocol !== 'https:' || releaseUrl.hostname !== 'github.com') {
        return message(output, 'Use an HTTPS direct GitHub Release URL.', true);
    }

    let ymlUrl;
    try {
        ymlUrl = new URL(latestYmlUrl);
    } catch {
        return message(output, 'Enter a valid GitHub latest.yml URL.', true);
    }
    if (ymlUrl.protocol !== 'https:' || ymlUrl.hostname !== 'github.com') {
        return message(output, 'Use an HTTPS direct GitHub latest.yml URL.', true);
    }

    const admin = (await database.ref(`users/${user.uid}/isAdmin`).once('value')).val() === true;
    if (!admin) return message(output, 'Administrator permission is required.', true);

    const button = $('#publishButton');
    button.disabled = true; message(output, 'Publishing version to Firebase…');
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
        event.target.reset();
    } catch (error) { message(output, error.message, true); }
    finally { button.disabled = false; }
});
