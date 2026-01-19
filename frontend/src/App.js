import React, { useState, useEffect } from 'react';
import './App.css';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function App() {
  // State for messages fetched from the backend.
  const [messages, setMessages] = useState([]);

  // Generate dummy messages for design testing.
  useEffect(() => {
    const count = 18;

    // Stratified distribution across the screen (looks more uniformly spread than pure random)
    const lefts = shuffle(
      Array.from({ length: count }, (_, i) => `${((i + Math.random()) / count) * 100}%`)
    );

    const dummyMessages = Array.from({ length: count }, (_, i) => ({
      id: `dummy-${i}`,
      message: `Dummy message ${i + 1}`,
      left: lefts[i],
      // floatUp duration is 10s (see CSS). Negative delays make bubbles already mid-flight.
      delay: `-${(Math.random() * 10).toFixed(2)}s`,
      size: `${(70 + Math.random() * 80).toFixed(0)}px`,
      swayAmount: `${(10 + Math.random() * 40).toFixed(0)}px`,
      swayDuration: `${(3 + Math.random() * 3).toFixed(2)}s`
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
            style={{
              left: msg.left,
              '--delay': msg.delay,
              '--bubble-size': msg.size,
              '--sway-amount': msg.swayAmount,
              '--sway-duration': msg.swayDuration
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
