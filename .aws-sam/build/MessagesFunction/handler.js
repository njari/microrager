'use strict';

const fs = require('fs/promises');
const path = require('path');

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({});

const BUCKET_NAME = process.env.BUCKET_NAME; // Set this env variable to your S3 bucket name

// Explicit switch:
//  - "local": uses a scratch json file (great for SAM local)
//  - "s3": uses S3 (real deployments)
const STORAGE_MODE = process.env.MICRORAGER_STORAGE_MODE || 's3';

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
      // Allow local dev (SAM local, CRA) and any deployed clients.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
    },
    body: JSON.stringify(bodyObj)
  };
}

function getSourceIp(event) {
  // API Gateway v1: event.requestContext.identity.sourceIp
  // API Gateway v2: event.requestContext.http.sourceIp
  // SAM local: requestContext may not exist.
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
  const LOCAL_MESSAGES_PATH = path.join('/tmp', MESSAGES_KEY);
  // Get source IP; adjust based on API Gateway version if necessary
  const ip = getSourceIp(event);
  let messages = [];

  if (method === 'OPTIONS') {
    // CORS preflight
    return jsonResponse(200, { ok: true });
  }

  // Attempt to retrieve existing messages (local scratch file OR S3)
  if (STORAGE_MODE === 'local') {
    messages = await readLocalJson(LOCAL_MESSAGES_PATH, []);
  } else {
    try {
      const data = await s3.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: MESSAGES_KEY
        })
      );
      const bodyStr = await streamToString(data.Body);
      messages = JSON.parse(bodyStr);
    } catch (err) {
      // If the messages file doesn't exist, start with an empty array
      const code = err?.name || err?.Code || err?.code;
      if (code !== 'NoSuchKey' && code !== 'NotFound') {
        console.error('Error fetching messages:', err);
        return jsonResponse(500, { error: 'Error reading messages' });
      }
    }
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

    // Enforce rate limit: one message per IP per day
    const alreadyPosted = messages.some(msg => msg.ip === ip && msg.date === today);
    if (alreadyPosted) {
      return jsonResponse(429, { error: 'Rate limit exceeded: Only one message per day allowed' });
    }

    // Append new message with unique ID and initial votes
    const newMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
      ip: ip,
      date: today,
      message: body.message,
      timestamp: new Date().toISOString(),
      votes: {}
    };
    messages.push(newMessage);

    // Write updated messages back (local scratch file OR S3)
    try {
      if (STORAGE_MODE === 'local') {
        await writeLocalJson(LOCAL_MESSAGES_PATH, messages);
      } else {
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: MESSAGES_KEY,
            Body: JSON.stringify(messages),
            ContentType: 'application/json'
          })
        );
      }
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
  if (!body.votes || !Array.isArray(body.votes)) {
    return jsonResponse(400, { error: 'Votes array is required' });
  }
  
  // Process each vote
  for (const voteItem of body.votes) {
    const { id, emoji, count } = voteItem;
    if (!id || !emoji || typeof count !== 'number') {
      continue;
    }
    const messageToUpdate = messages.find(msg => msg.id === id);
    if (!messageToUpdate) {
      continue;
    }
    if (!messageToUpdate.votes) {
      messageToUpdate.votes = {};
    }
    if (messageToUpdate.votes[emoji]) {
      messageToUpdate.votes[emoji] += count;
    } else {
      messageToUpdate.votes[emoji] = count;
    }
  }
  
  // Write updated messages back (local scratch file OR S3)
  try {
    if (STORAGE_MODE === 'local') {
      await writeLocalJson(LOCAL_MESSAGES_PATH, messages);
    } else {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: MESSAGES_KEY,
          Body: JSON.stringify(messages),
          ContentType: 'application/json'
        })
      );
    }
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
