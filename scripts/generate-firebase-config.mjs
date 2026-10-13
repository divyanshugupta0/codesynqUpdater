import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Attempt to read local .env if present and environment variables are not set
try {
    const envContent = await readFile('.env', 'utf8');
    for (const rawLine of envContent.split(/\r?\n/)) {
        let line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        // strip trailing commas
        if (line.endsWith(',')) line = line.slice(0, -1).trim();

        // Match key and value loosely
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1) {
            let key = line.slice(0, eqIdx).replace(/["'\s]/g, '');
            let val = line.slice(eqIdx + 1).replace(/^["'\s]+|["'\s]+$/g, '');

            if (key && val) {
                const upperKey = key.toUpperCase();
                process.env[key] = val;
                process.env[upperKey] = val;
                process.env[`FIREBASE_${upperKey}`] = val;
            }
        }
    }
} catch {
    // .env is optional
}

const requiredKeys = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_APP_ID'
];

if (!process.env.FIREBASE_API_KEY && process.env.APIKEY) process.env.FIREBASE_API_KEY = process.env.APIKEY;
if (!process.env.FIREBASE_AUTH_DOMAIN && process.env.AUTHDOMAIN) process.env.FIREBASE_AUTH_DOMAIN = process.env.AUTHDOMAIN;
if (!process.env.FIREBASE_PROJECT_ID && process.env.PROJECTID) process.env.FIREBASE_PROJECT_ID = process.env.PROJECTID;
if (!process.env.FIREBASE_APP_ID && process.env.APPID) process.env.FIREBASE_APP_ID = process.env.APPID;
if (!process.env.FIREBASE_DATABASE_URL && process.env.DATABASEURL) {
    process.env.FIREBASE_DATABASE_URL = process.env.DATABASEURL;
}

const missingKeys = requiredKeys.filter((key) => !process.env[key]);
if (missingKeys.length) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(', ')}`);
}

const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL.replace(/\/$/, ''),
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID
};

const optionalMappings = {
    FIREBASE_STORAGE_BUCKET: 'storageBucket',
    FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
    FIREBASE_MEASUREMENT_ID: 'measurementId'
};
for (const [environmentKey, configKey] of Object.entries(optionalMappings)) {
    if (process.env[environmentKey]) config[configKey] = process.env[environmentKey];
}

const outputPath = resolve('firebase-config.js');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
    outputPath,
    `// Generated during deployment. Do not edit or commit.\nwindow.FIREBASE_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
    'utf8'
);
console.log(`Generated ${outputPath}`);
