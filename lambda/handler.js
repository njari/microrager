'use strict';

const fs = require('fs/promises');
const path = require('path');

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({});

const BUCKET_NAME = "microrager"; // Set this env variable to your S3 bucket name

// Explicit switch:
//  - "local": uses a scratch json file (great for SAM local)
//  - "s3": uses S3 (real deployments)
const STORAGE_MODE = process.env.MICRORAGER_STORAGE_MODE || 's3';

const MAX_MESSAGE_LENGTH = 200;

// Local-mode files:
// - SEED file is in the repo (so you can edit it). SAM mounts code read-only, so we do NOT write to it at runtime.
// - RUNTIME file lives in /tmp inside the Lambda container (read/write). This persists for as long as the container stays warm.
const LOCAL_SEED_FILENAME = process.env.MICRORAGER_LOCAL_SEED_FILENAME || 'microrager.local.seed.json';
const LOCAL_SEED_PATH = path.join(__dirname, 'local-data', LOCAL_SEED_FILENAME);

async function readLocalJson(filePath, defaultValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // File doesn't exist or invalid JSON → start fresh
    return defaultValue;
  }
}

async function writeLocalJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

const { readMessagesForDate, writeMessagesForDate } = require('./lib/storage');

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

function getSourceIp(event) {
  return (
    event?.requestContext?.identity?.sourceIp ||
    event?.requestContext?.http?.sourceIp ||
    'local'
  );
}

exports.handler = async (event, context) => {
  const method = event.httpMethod;
  const today = new Date().toISOString().slice(0, 10);
  const MESSAGES_KEY = `${today}-microrager.json`;
  const LOCAL_RUNTIME_PATH = path.join('/tmp', MESSAGES_KEY);
  // Get source IP; adjust based on API Gateway version if necessary
  const ip = getSourceIp(event);
  let messages = [];

  if (method === 'OPTIONS') {
    // CORS preflight
    return jsonResponse(200, { ok: true });
  }

  // Attempt to retrieve existing messages (local scratch file OR S3)
  // Read existing messages (from consolidated storage helper)
  try {
    messages = await readMessagesForDate(today);
  } catch (err) {
    console.error('Error fetching messages:', err);
    return jsonResponse(500, { error: 'Error reading messages' });
  }

  if (method === 'POST') {
    // Parse message from request body
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      return jsonResponse(400, { error: 'Invalid JSON in request body' });
    }

    if (!body.message) {
      return jsonResponse(400, { error: 'Message field is required' });
    }

    if (typeof body.message !== 'string') {
      return jsonResponse(400, { error: 'Message must be a string' });
    }

    const trimmedMessage = body.message.trim();
    if (!trimmedMessage) {
      return jsonResponse(400, { error: 'Message must not be empty' });
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse(400, { error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` });
    }


    const newMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
      ip: ip,
      date: today,
      message: trimmedMessage,
      timestamp: new Date().toISOString(),
      votes: {}
    };
    messages.push(newMessage);

    // Write updated messages back (via storage helper)
    try {
      await writeMessagesForDate(today, messages);
    } catch (putError) {
      console.error('Error updating messages:', putError);
      return jsonResponse(500, { error: 'Error saving message' });
    }

    return jsonResponse(200, { message: 'Message accepted' });

  } else if (method === 'PATCH') {
  // Handle batch voting on messages
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (parseError) {
    return jsonResponse(400, { error: 'Invalid JSON in request body' });
  }
  
  // Expecting body.votes to be an array of vote objects: [{ id, emoji, count }]
  // Expecting body.votes to be an array of vote objects: [{ id, color, count }]
  if (!body.votes || !Array.isArray(body.votes)) {
    return jsonResponse(400, { error: 'Votes array is required' });
  }

  // Process each vote (color-based)
  for (const voteItem of body.votes) {
    const { id, color, count } = voteItem;
    if (!id || !color || typeof count !== 'number') {
      continue;
    }
    const messageToUpdate = messages.find(msg => msg.id === id);
    if (!messageToUpdate) {
      continue;
    }
    if (!messageToUpdate.votes) {
      messageToUpdate.votes = {};
    }
    if (messageToUpdate.votes[color]) {
      messageToUpdate.votes[color] += count;
    } else {
      messageToUpdate.votes[color] = count;
    }
  }
  
  // Write updated messages back (via storage helper)
  try {
    await writeMessagesForDate(today, messages);
  } catch (putError) {
    console.error('Error updating votes:', putError);
    return jsonResponse(500, { error: 'Error saving votes' });
  }
  
  return jsonResponse(200, { message: 'Batch votes recorded' });
} else if (method === 'GET') {
    // Return all messages
    return jsonResponse(200, messages);

  } else {
    // Only GET and POST are allowed
    return jsonResponse(405, { error: 'Method not allowed' });
  }
};
