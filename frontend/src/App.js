import React, { useState, useEffect } from 'react';
import './App.css';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper function to generate bubble styling
function generateBubbleProps(index, total) {
  // Create a stratified x-axis position
  const leftPercentage = ((index + Math.random()) / total) * 100;
  
  // random size in px
  const size = (70 + Math.random() * 80).toFixed(0) + 'px';
  // random intangible sway
  const swayAmount = (10 + Math.random() * 40).toFixed(0) + 'px';
  const swayDuration = (3 + Math.random() * 3).toFixed(2) + 's';
  // negative delay sets the bubble mid-flight
  const delay = `-${(Math.random() * 10).toFixed(2)}s`;

  return {
    left: leftPercentage + '%',
    size,
    swayAmount,
    swayDuration,
    delay
  };
}

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');

  // For local dev:
  // - React dev server typically runs on http://localhost:3000
  // - SAM local start-api defaults to http://127.0.0.1:3000, so we move it to 3001.
  const API_BASE_URL = 'https://dma4usozxcquqpg7mewa7uvujy0sbhdx.lambda-url.us-east-1.on.aws';

  // Fetch messages from backend and transform them into bubble style
  function fetchMessages() {
    fetch(`${API_BASE_URL}/messages`)
      .then((res) => res.json())
      .then((data) => {
        // If you want to shuffle the resulting array before styling:
        shuffle(data);
        const styled = data.map((msg, i) => {
          const props = generateBubbleProps(i, data.length);
          return {
            ...msg,
            left: props.left,
            size: props.size,
            swayAmount: props.swayAmount,
            swayDuration: props.swayDuration,
            delay: props.delay
          };
        });
        setMessages(styled);
      })
      .catch((err) => {
        console.error('Error fetching messages:', err);
      });
  }

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
  }, []);

  // POST a new message
  function handleSubmit(e) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: inputValue.trim() })
    })
      .then(() => {
        setInputValue('');
        // After posting, reload messages
        fetchMessages();
      })
      .catch((err) => {
        console.error('Error posting message:', err);
      });
  }

  return (
    <div className="App">
      <div className="background" />
      <div className="center-prompt">
        <form onSubmit={handleSubmit}>
          <input
            className="prompt-input"
            type="text"
            placeholder="What's annoying you?"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </form>
      </div>
      <div className="bubbles-container">
        {messages.map((msg) => (
          <div
            className="bubble"
            key={msg.id}
            style={{
              left: msg.left,
              '--bubble-size': msg.size,
              '--sway-amount': msg.swayAmount,
              '--sway-duration': msg.swayDuration,
              '--delay': msg.delay
            }}
          >
            <span className="bubble-droplets" aria-hidden="true" />
            <span className="bubble-text">{msg.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
