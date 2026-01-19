'use strict';

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const BUCKET_NAME = process.env.BUCKET_NAME; // Set this env variable to your S3 bucket name
const MESSAGES_KEY = `${today}-microrager.json`;

exports.handler = async (event, context) => {
  const method = event.httpMethod;
  // Get source IP; adjust based on API Gateway version if necessary
  const ip = event.requestContext.identity.sourceIp;
  const today = new Date().toISOString().slice(0, 10);
  let messages = [];

  // Attempt to retrieve existing messages from S3
  try {
    const data = await s3.getObject({
      Bucket: BUCKET_NAME,
      Key: MESSAGES_KEY
    }).promise();
    messages = JSON.parse(data.Body.toString());
  } catch (err) {
    // If the messages file doesn't exist, start with an empty array
    if (err.code !== 'NoSuchKey') {
      console.error('Error fetching messages:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error reading messages' })
      };
    }
  }

  if (method === 'POST') {
    // Parse message from request body
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    if (!body.message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Message field is required' })
      };
    }

    // Enforce rate limit: one message per IP per day
    const alreadyPosted = messages.some(msg => msg.ip === ip && msg.date === today);
    if (alreadyPosted) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: 'Rate limit exceeded: Only one message per day allowed' })
      };
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

    // Write updated messages back to S3
    try {
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: MESSAGES_KEY,
        Body: JSON.stringify(messages),
        ContentType: 'application/json'
      }).promise();
    } catch (putError) {
      console.error('Error updating messages:', putError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error saving message' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message accepted' })
    };

  } else if (method === 'PATCH') {
  // Handle batch voting on messages
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (parseError) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON in request body' })
    };
  }
  
  // Expecting body.votes to be an array of vote objects: [{ id, emoji, count }]
  if (!body.votes || !Array.isArray(body.votes)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Votes array is required' })
    };
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
  
  // Write updated messages back to S3
  try {
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: MESSAGES_KEY,
      Body: JSON.stringify(messages),
      ContentType: 'application/json'
    }).promise();
  } catch (putError) {
    console.error('Error updating votes:', putError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error saving votes' })
    };
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Batch votes recorded' })
  };
} else if (method === 'GET') {
    // Return all messages
    return {
      statusCode: 200,
      body: JSON.stringify(messages)
    };

  } else {
    // Only GET and POST are allowed
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
};
