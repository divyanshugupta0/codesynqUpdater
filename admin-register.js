if (!window.FIREBASE_CONFIG) {
    throw new Error('Firebase configuration is missing. Run the Netlify build with the required environment variables.');
}

firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const database = firebase.database();
const $ = (selector) => document.querySelector(selector);

function setMessage(text, isError = false) {
    const target = $('#registerMessage');
    target.textContent = text;
    target.classList.toggle('error', isError);
}

$('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#registerButton');
    const name = $('#name').value.trim();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    button.disabled = true;
    setMessage('Creating account…');

    try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        const user = credential.user;
        await user.updateProfile({ displayName: name });
        await database.ref(`adminRegistrationRequests/${user.uid}`).set({
            name,
            email: user.email,
            requestedAt: firebase.database.ServerValue.TIMESTAMP,
            status: 'pending'
        });
        setMessage('Request sent. Ask an existing administrator to approve your account in Firebase Realtime Database.');
        event.target.reset();
    } catch (error) {
        setMessage(`Unable to submit request: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
});
