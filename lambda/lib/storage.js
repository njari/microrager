const fs = require('fs/promises');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({});

const BUCKET_NAME = process.env.BUCKET_NAME;
const STORAGE_MODE = process.env.MICRORAGER_STORAGE_MODE || 's3';
const LOCAL_SEED_FILENAME = process.env.MICRORAGER_LOCAL_SEED_FILENAME || 'microrager.local.seed.json';
const LOCAL_SEED_PATH = path.join(__dirname, '..', 'local-data', LOCAL_SEED_FILENAME);

async function readLocalJson(filePath, defaultValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultValue;
  }
}

async function writeLocalJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function readMessagesForDate(dateKey) {
  const key = `${dateKey}-microrager.json`;
  const runtimePath = path.join('/tmp', key);
  if (STORAGE_MODE === 'local') {
    const seed = await readLocalJson(LOCAL_SEED_PATH, []);
    const runtime = await readLocalJson(runtimePath, []);
    return [...seed, ...runtime];
  }
  try {
    const data = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    const bodyStr = await streamToString(data.Body);
    return JSON.parse(bodyStr);
  } catch (err) {
    const code = err?.name || err?.Code || err?.code;
    if (code === 'NoSuchKey' || code === 'NotFound') return [];
    throw err;
  }
}

async function writeMessagesForDate(dateKey, messages) {
  const key = `${dateKey}-microrager.json`;
  const runtimePath = path.join('/tmp', key);
  if (STORAGE_MODE === 'local') {
    // keep seed file intact; write only runtime messages (those without seed IDs)
    const seed = await readLocalJson(LOCAL_SEED_PATH, []);
    const seedIds = new Set(seed.map((m) => m?.id).filter(Boolean));
    const runtimeOnly = messages.filter((m) => !m?.id || !seedIds.has(m.id));
    await writeLocalJson(runtimePath, runtimeOnly);
    return;
  }
  await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, Body: JSON.stringify(messages), ContentType: 'application/json' }));
}

module.exports = {
  readMessagesForDate,
  writeMessagesForDate
};
