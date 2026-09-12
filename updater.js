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
    target.innerHTML = `<strong>v${release.version}</strong> · ${release.mandatory ? 'Required' : 'Optional'} update<br><small>Published ${date}</small><br><a href="${release.downloadUrl}" target="_blank" rel="noopener">Download installer</a>`;
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
    try {
        await auth.signInWithEmailAndPassword($('#email').value.trim(), $('#password').value);
        message($('#loginMessage'), '');
    } catch (error) { message($('#loginMessage'), error.message, true); }
});

$('#signOut').addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
    const isAdmin = user && (await database.ref(`users/${user.uid}/isAdmin`).once('value')).val() === true;
    $('#loginCard').classList.toggle('hidden', Boolean(isAdmin));
    $('#publisherCard').classList.toggle('hidden', !isAdmin);
    if (isAdmin) $('#signedInEmail').textContent = user.email || user.uid;
    if (user && !isAdmin) message($('#loginMessage'), 'This account is not an update administrator.', true);
});

$('#releaseForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = auth.currentUser;
    const version = $('#version').value.trim();
    const downloadUrl = $('#downloadUrl').value.trim();
    const output = $('#publishMessage');
    if (!user || !downloadUrl) return;

    let releaseUrl;
    try {
        releaseUrl = new URL(downloadUrl);
    } catch {
        return message(output, 'Enter a valid GitHub download URL.', true);
    }
    if (releaseUrl.protocol !== 'https:' || releaseUrl.hostname !== 'github.com') {
        return message(output, 'Use an HTTPS direct GitHub Release URL.', true);
    }

    const admin = (await database.ref(`users/${user.uid}/isAdmin`).once('value')).val() === true;
    if (!admin) return message(output, 'Administrator permission is required.', true);

    const button = $('#publishButton');
    button.disabled = true; message(output, 'Publishing version to Firebase…');
    try {
        const fileName = decodeURIComponent(releaseUrl.pathname.split('/').pop() || 'CodeSynq-Setup.exe');
        await releaseRef.set({
            version, downloadUrl: releaseUrl.href, fileName,
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
