edit seed json -> sam build -> sam local start-api --port 3001 -> refresh frontend”.

Voting (developer notes)
------------------------

This project now supports a frontend voting flow (frontend-only buffer + batch PATCH to the backend).

How it works
- The frontend collects votes in a buffer: { messageId: [color1, color2, ...] }.
- The app automatically aggregates and sends buffered votes to the backend every 8 seconds as a single PATCH request to /messages/votes.
- The backend exposes a VotesFunction (PATCH /messages/votes) which applies the votes to the messages file (S3 in prod or local /tmp in local mode).

Manual testing (local SAM)
1. Start SAM with warm containers so runtime /tmp state persists between invokes (recommended for local development):

   sam build
   sam local start-api --port 3001 --warm-containers LAZY

2. Run the frontend dev server and interact with the voting picker. Votes will be buffered and flushed automatically.

3. To manually inspect the runtime file (local mode) while SAM is running you can exec into the running Lambda container or examine the .aws-sam build artifacts; however the simplest test is to call the votes endpoint directly using curl:

   curl -X PATCH http://127.0.0.1:3001/messages/votes \
     -H 'Content-Type: application/json' \
     -d '{"votes":[{"id":"msg-123","color":"rgb(240,200,200)","count":1}]}'

Notes
- The votes API expects an array of { id, color, count } and will increment color-counts stored on each message under message.votes[color] = count.
- In local mode the system merges the repo seed file (lambda/local-data/microrager.local.seed.json) with runtime messages. The votes handler writes only to the runtime file in /tmp so your seed file remains unchanged.
- In production the backend writes to the S3 file for the day.

