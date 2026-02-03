'use strict';

const fs = require('fs/promises');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({});

const BUCKET_NAME = process.env.BUCKET_NAME;
const STORAGE_MODE = process.env.MICRORAGER_STORAGE_MODE || 's3';
const LOCAL_SEED_FILENAME = process.env.MICRORAGER_LOCAL_SEED_FILENAME || 'microrager.local.seed.json';
const LOCAL_SEED_PATH = path.join(__dirname, 'local-data', LOCAL_SEED_FILENAME);

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

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method === 'OPTIONS') return jsonResponse(200, { ok: true });

  const today = new Date().toISOString().slice(0, 10);
  const MESSAGES_KEY = `${today}-microrager.json`;
  const LOCAL_RUNTIME_PATH = path.join('/tmp', MESSAGES_KEY);

  // read existing messages
  let messages = [];
  if (STORAGE_MODE === 'local') {
    const seed = await readLocalJson(LOCAL_SEED_PATH, []);
    const runtime = await readLocalJson(LOCAL_RUNTIME_PATH, []);
    messages = [...seed, ...runtime];
  } else {
    try {
      const data = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: MESSAGES_KEY }));
      const bodyStr = await streamToString(data.Body);
      messages = JSON.parse(bodyStr);
    } catch (err) {
      const code = err?.name || err?.Code || err?.code;
      if (code !== 'NoSuchKey' && code !== 'NotFound') {
        console.error('Error reading messages for votes:', err);
        return jsonResponse(500, { error: 'Error reading messages' });
      }
    }
  }

  if (method !== 'PATCH') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return jsonResponse(400, { error: 'Invalid JSON in request body' });
  }

  if (!body.votes || !Array.isArray(body.votes)) {
    return jsonResponse(400, { error: 'Votes array is required' });
  }

  // expected vote: { id, color, count }
  for (const v of body.votes) {
    const { id, color, count } = v;
    if (!id || !color) continue;
    const message = messages.find((m) => m.id === id);
    if (!message) continue;
    if (!message.votes) message.votes = {};
    // use color string as key
    const existing = message.votes[color] || 0;
    const add = typeof count === 'number' ? count : 1;
    message.votes[color] = existing + add;
  }

  // write back
  try {
    if (STORAGE_MODE === 'local') {
      // split seed vs runtime: don't overwrite seed. keep runtime only (messages without seed ids)
      const seed = await readLocalJson(LOCAL_SEED_PATH, []);
      const seedIds = new Set(seed.map((m) => m?.id).filter(Boolean));
      const runtimeOnly = messages.filter((m) => !m?.id || !seedIds.has(m.id));
      await writeLocalJson(LOCAL_RUNTIME_PATH, runtimeOnly);
    } else {
      await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: MESSAGES_KEY, Body: JSON.stringify(messages), ContentType: 'application/json' }));
    }
  } catch (err) {
    console.error('Error saving votes:', err);
    return jsonResponse(500, { error: 'Error saving votes' });
  }

  return jsonResponse(200, { message: 'Votes recorded' });
};
