import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// h in [0, 360), s/l in [0, 100]
function hslToRgb(h, s, l) {
  const _s = s / 100;
  const _l = l / 100;
  const c = (1 - Math.abs(2 * _l - 1)) * _s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = _l - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (0 <= h && h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (60 <= h && h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (120 <= h && h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (180 <= h && h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (240 <= h && h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
}

function pastelFromPoint({ x01, y01 }) {
  // Pastel constraint: high lightness, moderate/low saturation.
  // We also quantize hue into ~10 buckets so the palette feels intentionally varied,
  // while still spanning the full 0..360 degrees (reds/yellows/greens/cyans/blues/purples).
  const rawHue = clamp(x01, 0, 1) * 360;
  const bucketCount = 10;
  const bucketSize = 360 / bucketCount; // 36deg
  const bucketIdx = Math.floor(rawHue / bucketSize);
  // Center of the bucket with a little intra-bucket jitter (from y) to keep it organic.
  const jitter = (clamp(1 - y01, 0, 1) - 0.5) * 10; // -5..+5 deg
  const hue = (bucketIdx * bucketSize + bucketSize / 2 + jitter + 360) % 360;

  const sat = 38 + clamp(1 - y01, 0, 1) * 18; // 38..56
  const light = 78 + clamp(y01, 0, 1) * 9; // 78..87
  const { r, g, b } = hslToRgb(hue, sat, light);
  return { r, g, b, css: `rgb(${r}, ${g}, ${b})` };
}

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

function Bubble({ msg, voteCount, onVote }) {
  const [isVoting, setIsVoting] = useState(false);
  const [preview, setPreview] = useState({ css: 'rgb(255,255,255)', x: 0.5, y: 0.5, r: 255, g: 255, b: 255 });
  const [pulse, setPulse] = useState(0);
  const releaseTimerRef = useRef(null);

  function handleBubbleClick(e) {
    e.stopPropagation();
    setIsVoting((v) => {
      const nv = !v;
      // if we're entering voting mode, start the auto-release timer
      if (nv) {
        if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = setTimeout(() => {
          setIsVoting(false);
        }, 3000);
      } else {
        // leaving voting mode, clear timer
        if (releaseTimerRef.current) {
          clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = null;
        }
      }
      return nv;
    });
  }

  function handleCloudMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x01 = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y01 = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const p = pastelFromPoint({ x01, y01 });
    setPreview({ css: p.css, x: x01, y: y01, r: p.r, g: p.g, b: p.b });
  }

  function handleCloudClick(e) {
    e.stopPropagation();
    onVote(msg.id, preview.css);

    // a selection was made — clear the auto-release timer so voting stays open until user closes
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    // Haptic feedback on supported devices.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }

    // Visual pulse feedback (works everywhere)
    setPulse((p) => p + 1);
  }

  // Build a pastel conic-gradient tinge from message.votes (object { 'rgb(r,g,b)': count })
  function parseRgbString(s) {
    // expect 'rgb(r, g, b)'
    const m = /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i.exec(s);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h = h * 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function toPastelCssFromRgbString(s) {
    const rgb = parseRgbString(s);
    if (!rgb) return 'rgba(255,255,255,0)';
    const { h } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    // pastel constraints: medium-low sat, high lightness
    const sat = 40; const light = 82; const alpha = 0.85;
    return `hsla(${Math.round(h)}, ${sat}%, ${light}%, ${alpha})`;
  }

  function buildTingeStyle(votesObj) {
    if (!votesObj || Object.keys(votesObj).length === 0) return null;
    const entries = Object.entries(votesObj);
    const total = entries.reduce((s, [, c]) => s + (Number(c) || 0), 0) || 1;
    // create color stops proportionally
    let angle = 0;
    const stops = [];
    for (const [rgbStr, count] of entries) {
      const portion = (Number(count) || 0) / total;
      const deg = Math.max(1, Math.round(portion * 360));
      const color = toPastelCssFromRgbString(rgbStr);
      const start = angle;
      const end = angle + deg;
      stops.push(`${color} ${start}deg ${end}deg`);
      angle = end;
    }
    const bg = `conic-gradient(${stops.join(', ')})`;
    return { background: bg };
  }

  const tingeStyle = buildTingeStyle(msg.votes);

  return (
    <div
      className={`bubble ${isVoting ? 'bubble--voting' : ''}`}
      onClick={handleBubbleClick}
      style={{
        left: msg.left,
        '--delay': msg.delay,
        '--bubble-size': msg.size,
        '--sway-amount': msg.swayAmount,
        '--sway-duration': msg.swayDuration
      }}
    >
      {tingeStyle && <div className="bubble-tinge" style={tingeStyle} aria-hidden="true" />}
      <span className="bubble-droplets" aria-hidden="true" />
      <span className="bubble-text">{msg.message}</span>

      {voteCount > 0 && (
        <span className="bubble-vote-badge" aria-label={`${voteCount} votes`}>{voteCount}</span>
      )}

      {isVoting && (
        <div
          className="vote-cloud"
          role="application"
          aria-label="Pick a pastel color to vote"
          onMouseMove={handleCloudMove}
          onClick={handleCloudClick}
        >
          <div
            className="vote-cloud__preview"
            style={{
              background: preview.css,
              left: `${preview.x * 100}%`,
              top: `${preview.y * 100}%`
            }}
          />
        </div>
      )}
      {isVoting && (
        <div
          key={pulse}
          className="vote-cloud__picker"
          style={{
            left: `${preview.x * 100}%`,
            top: `${preview.y * 100}%`,
            color: preview.css
          }}
        >
          <span className="vote-cloud__swatch" style={{ background: preview.css }} />
          <span className="vote-cloud__rgb" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');

  // Frontend-only votes: { [messageId]: [{ rgb: "rgb(...)" , ts: number }] }
  const [votesByMessageId, setVotesByMessageId] = useState({});
  // Buffer of votes to be flushed to backend: { messageId: [rgbCss, ...] }
  const [voteBuffer, setVoteBuffer] = useState({});

  // Persist buffer to localStorage so votes survive reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem('microrager_vote_buffer');
      if (raw) setVoteBuffer(JSON.parse(raw));
    } catch (err) {
      console.warn('Could not read vote buffer from localStorage', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('microrager_vote_buffer', JSON.stringify(voteBuffer));
    } catch (err) {
      console.warn('Could not write vote buffer to localStorage', err);
    }
  }, [voteBuffer]);

  // API base URL is injected at build/runtime. Set REACT_APP_API_BASE_URL in your env or GitHub Actions.
  // Defaults to local SAM when not provided.
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:3001';

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

  function handleVote(messageId, rgbCss) {
    setVotesByMessageId((prev) => {
      const existing = prev[messageId] || [];
      return {
        ...prev,
        [messageId]: [...existing, { rgb: rgbCss, ts: Date.now() }]
      };
    });
    // add to buffer
    setVoteBuffer((b) => {
      const arr = b[messageId] || [];
      return { ...b, [messageId]: [...arr, rgbCss] };
    });
  }

  // Flush buffered votes to backend (patch)
  async function flushVotes() {
    const entries = Object.entries(voteBuffer);
    if (!entries.length) return;
    const votes = [];
    for (const [id, colors] of entries) {
      // aggregate counts by color
      const counts = {};
      for (const c of colors) counts[c] = (counts[c] || 0) + 1;
      for (const [color, count] of Object.entries(counts)) {
        votes.push({ id, color, count });
      }
    }
    try {
      await fetch(`${API_BASE_URL}/messages/votes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votes })
      });
      // clear buffer on success
      setVoteBuffer({});
    } catch (err) {
      console.error('Error flushing votes:', err);
    }
  }

  // Periodically flush votes (every 8s)
  useEffect(() => {
    const t = setInterval(() => {
      flushVotes();
    }, 5000);
    return () => clearInterval(t);
  }, [voteBuffer]);

  return (
    <div className="App">
      <div className="background" />
      <div className="center-prompt">
        <form onSubmit={handleSubmit}>
          <input
            className="prompt-input"
            type="text"
            placeholder="Log your emotional pulse"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </form>
      </div>
      <div className="bubbles-container">
        {messages.map((msg) => (
          <Bubble
            key={msg.id}
            msg={msg}
            voteCount={(votesByMessageId[msg.id] || []).length}
            onVote={handleVote}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
