import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  // State for messages fetched from the backend.
  const [messages, setMessages] = useState([]);

  // Generate dummy messages for design testing.
  useEffect(() => {
    const dummyMessages = Array.from({ length: 5 }, (_, i) => ({
      id: `dummy-${i}`,
      message: `Dummy message ${i + 1}`,
      left: `${Math.floor(Math.random() * 80)}%`,  // Random horizontal position
      delay: `-${Math.floor(Math.random() * 25)}s`  // Negative delay to start mid-cycle, matching animation duration
    }));
    setMessages(dummyMessages);
  }, []);
  
  return (
    <div className="App">
      <div className="background" />
      <div className="center-prompt">
        <input 
          className="prompt-input" 
          type="text" 
          placeholder="What's annoying you?" 
        />
      </div>
      <div className="bubbles-container">
        {messages.map((msg) => (
          <div
            className="bubble"
            key={msg.id}
            style={{ left: msg.left, animationDelay: msg.delay }}
          >
            <span className="bubble-text">{msg.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
