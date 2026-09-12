import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const requiredKeys = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_APP_ID'
];

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
