import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Trash2, Power } from 'lucide-react';

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const COMMAND_PATTERNS = [
  { re: /^(remember|note|save)\s+(?:that\s+)?(.+)/i, type: 'remember' },
  { re: /^(what do you (?:know|remember) about|recall|tell me about)\s+(.+)/i, type: 'recall' },
  { re: /^(forget|delete|remove)\s+(.+)/i, type: 'forget' },
  { re: /^(list|show)\s+(memory|memories|notes)/i, type: 'listmemory' },
  { re: /^set (?:a )?timer for\s+(\d+)\s*(second|minute|hour)s?/i, type: 'timer' },
  { re: /^(remind me to)\s+(.+?)\s+in\s+(\d+)\s*(second|minute|hour)s?/i, type: 'reminder' },
  { re: /^(what'?s the time|what time is it|current time)/i, type: 'time' },
  { re: /^(what'?s the date|today'?s date|what day is it)/i, type: 'date' },
  { re: /^(calculate|compute|what is|what'?s)\s+([\d\s()+\-*/.x×÷]+)$/i, type: 'calc' },
  { re: /^(clear|reset) (memory|everything|all)/i, type: 'clearall' },
];

function normalizeMathExpr(expr) {
  return expr.replace(/x|×/gi, '*').replace(/÷/g, '/').trim();
}

function safeEval(expr) {
  try {
    const clean = normalizeMathExpr(expr);
    if (!/^[\d\s+\-*/().]+$/.test(clean)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${clean})`)();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// Mock storage for local development
const mockStorage = {
  data: {},
  async get(key) {
    return { value: this.data[key] };
  },
  async set(key, value) {
    this.data[key] = value;
  }
};

// Use mock storage if window.storage doesn't exist
if (!window.storage) {
  window.storage = mockStorage;
}

// ---------- Main Component ----------
export default function Jarvis() {
  const [listening, setListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [log, setLog] = useState([]); // {id, role, text, time}
  const [memory, setMemory] = useState({}); // key -> value
  const [status, setStatus] = useState('STANDBY');
  const [supported, setSupported] = useState(true);
  const [thinking, setThinking] = useState(false);

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const logEndRef = useRef(null);
  const timersRef = useRef({});

  // ---------- Load memory & log from storage ----------
  useEffect(() => {
    (async () => {
      try {
        const mem = await window.storage.get('jarvis:memory');
        if (mem?.value) setMemory(JSON.parse(mem.value));
      } catch {}
      try {
        const lg = await window.storage.get('jarvis:log');
        if (lg?.value) setLog(JSON.parse(lg.value));
      } catch {}
    })();
  }, []);

  // ---------- Persist memory ----------
  useEffect(() => {
    (async () => {
      try {
        await window.storage.set('jarvis:memory', JSON.stringify(memory));
      } catch {}
    })();
  }, [memory]);

  useEffect(() => {
    (async () => {
      try {
        await window.storage.set('jarvis:log', JSON.stringify(log.slice(-100)));
      } catch {}
    })();
  }, [log]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // ---------- Speech recognition setup ----------
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) {
        setTranscript('');
        handleCommand(final.trim());
      } else {
        setTranscript(interim);
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setStatus('MIC ACCESS DENIED');
        setListening(false);
      }
    };

    rec.onend = () => {
      // restart if still supposed to be listening (continuous mode)
      if (listening) {
        try { rec.start(); } catch {}
      } else {
        setStatus('STANDBY');
      }
    };

    recognitionRef.current = rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      setStatus('LISTENING');
      try { rec.start(); } catch {}
    } else {
      try { rec.stop(); } catch {}
    }
  }, [listening]);

  // ---------- Speak ----------
  const speak = useCallback((text) => {
    if (!speechEnabled || !synthRef.current) return;
    try {
      synthRef.current.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 0.85;
      u.volume = 1;
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(v => /male|en-GB|en-US/i.test(v.name)) || voices[0];
      if (preferred) u.voice = preferred;
      synthRef.current.speak(u);
    } catch {}
  }, [speechEnabled]);

  const addLog = useCallback((role, text) => {
    setLog(prev => [...prev, { id: uid(), role, text, time: Date.now() }]);
  }, []);

  // ---------- Command handling ----------
  const handleCommand = useCallback(async (text) => {
    if (!text) return;
    addLog('user', text);
    setStatus('PROCESSING');

    for (const { re, type } of COMMAND_PATTERNS) {
      const m = text.match(re);
      if (!m) continue;

      switch (type) {
        case 'remember': {
          const content = m[2].trim();
          const keyMatch = content.match(/^(.+?)\s+is\s+(.+)$/i);
          let key, value;
          if (keyMatch) {
            key = keyMatch[1].trim().toLowerCase();
            value = keyMatch[2].trim();
          } else {
            key = `note_${Date.now()}`;
            value = content;
          }
          setMemory(prev => ({ ...prev, [key]: value }));
          respond(`Noted. I'll remember that ${keyMatch ? `${key} is ${value}` : value}.`);
          return;
        }
        case 'recall': {
          const query = m[2].trim().toLowerCase();
          const entries = Object.entries(memory);
          const direct = entries.find(([k]) => k === query);
          if (direct) {
            respond(`${query} is ${direct[1]}.`);
            return;
          }
          const matches = entries.filter(([k, v]) =>
            k.includes(query) || String(v).toLowerCase().includes(query)
          );
          if (matches.length) {
            respond(matches.map(([k, v]) => `${k}: ${v}`).join('. '));
          } else {
            respond(`I don't have anything stored about ${query}.`);
          }
          return;
        }
        case 'forget': {
          const query = m[2].trim().toLowerCase();
          const entries = Object.entries(memory);
          const matchKey = entries.find(([k]) => k === query || k.includes(query))?.[0];
          if (matchKey) {
            setMemory(prev => {
              const next = { ...prev };
              delete next[matchKey];
              return next;
            });
            respond(`Forgotten: ${matchKey}.`);
          } else {
            respond(`Nothing matching ${query} found in memory.`);
          }
          return;
        }
        case 'listmemory': {
          const entries = Object.entries(memory);
          if (!entries.length) {
            respond('Memory is empty.');
          } else {
            respond(`I'm storing ${entries.length} item${entries.length === 1 ? '' : 's'}: ${entries.map(([k]) => k).join(', ')}.`);
          }
          return;
        }
        case 'clearall': {
          setMemory({});
          respond('All memory cleared.');
          return;
        }
        case 'timer': {
          const amount = parseInt(m[1], 10);
          const unit = m[2].toLowerCase();
          const ms = amount * (unit === 'hour' ? 3600000 : unit === 'minute' ? 60000 : 1000);
          const id = uid();
          timersRef.current[id] = setTimeout(() => {
            respond(`Timer done: ${amount} ${unit}${amount === 1 ? '' : 's'}.`);
            delete timersRef.current[id];
          }, ms);
          respond(`Timer set for ${amount} ${unit}${amount === 1 ? '' : 's'}.`);
          return;
        }
        case 'reminder': {
          const task = m[2].trim();
          const amount = parseInt(m[3], 10);
          const unit = m[4].toLowerCase();
          const ms = amount * (unit === 'hour' ? 3600000 : unit === 'minute' ? 60000 : 1000);
          const id = uid();
          timersRef.current[id] = setTimeout(() => {
            respond(`Reminder: ${task}.`);
            delete timersRef.current[id];
          }, ms);
          respond(`I'll remind you to ${task} in ${amount} ${unit}${amount === 1 ? '' : 's'}.`);
          return;
        }
        case 'time': {
          respond(`It's ${new Date().toLocaleTimeString()}.`);
          return;
        }
        case 'date': {
          respond(`Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);
          return;
        }
        case 'calc': {
          const result = safeEval(m[2]);
          if (result === null) {
            respond("I couldn't compute that.");
          } else {
            respond(`That equals ${result}.`);
          }
          return;
        }
        default:
          break;
      }
    }

    // Fallback: simple echo for demo
    respond(`I heard: "${text}"`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory, log]);

  const respond = useCallback((text) => {
    addLog('jarvis', text);
    speak(text);
    setStatus(listening ? 'LISTENING' : 'STANDBY');
  }, [addLog, speak, listening]);

  // ---------- Manual text input fallback ----------
  const [manualInput, setManualInput] = useState('');
  const submitManual = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleCommand(manualInput.trim());
    setManualInput('');
  };

  const toggleListen = () => {
    if (!supported) return;
    setListening(l => !l);
  };

  return (
    <div className="min-h-screen w-full bg-[#05070a] text-cyan-100 flex flex-col items-center font-mono relative overflow-hidden">
      {/* Ambient grid background */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Header */}
      <div className="w-full max-w-2xl px-4 pt-6 pb-2 flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.3em] text-cyan-300" style={{ textShadow: '0 0 12px rgba(34,211,238,0.6)' }}>J.A.R.V.I.S.</h1>
          <p className="text-[10px] tracking-widest text-cyan-500/70 mt-1">
            {thinking ? 'ACCESSING REASONING CORE' : status}
          </p>
        </div>
        <button
          onClick={() => setSpeechEnabled(s => !s)}
          className="p-2 rounded-full border border-cyan-500/30 hover:border-cyan-400/60 transition-colors"
          aria-label="Toggle voice output"
        >
          {speechEnabled ? <Volume2 size={18} className="text-cyan-300" /> : <VolumeX size={18} className="text-cyan-700" />}
        </button>
      </div>

      {/* Arc Reactor / Core visualizer */}
      <div className="relative z-10 my-6 flex items-center justify-center">
        <div className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500 ${listening ? 'scale-105' : 'scale-100'}`}>
          {/* outer rings */}
          <div className={`absolute inset-0 rounded-full border-2 border-cyan-400/30 ${listening ? 'animate-ping' : ''}`} />
          <div className="absolute inset-2 rounded-full border border-cyan-400/20" />
          <div className="absolute inset-4 rounded-full border border-cyan-300/40" style={{ boxShadow: '0 0 30px rgba(34,211,238,0.35) inset' }} />
          {/* core */}
          <div
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              thinking ? 'bg-amber-400/20 border-amber-300' : listening ? 'bg-cyan-400/20 border-cyan-300' : 'bg-cyan-900/30 border-cyan-700'
            } border-2`}
            style={{ boxShadow: thinking ? '0 0 40px rgba(251,191,36,0.5)' : listening ? '0 0 40px rgba(34,211,238,0.5)' : '0 0 15px rgba(34,211,238,0.2)' }}
          >
            <button
              onClick={toggleListen}
              className="w-full h-full flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              aria-label={listening ? 'Stop listening' : 'Start listening'}
            >
              {listening ? <Mic size={28} className="text-cyan-200" /> : <MicOff size={28} className="text-cyan-600" />}
            </button>
          </div>
        </div>
      </div>

      {!supported && (
        <p className="text-amber-400 text-xs px-4 text-center mb-2">
          Voice recognition isn't supported in this browser. Use text input below.
        </p>
      )}

      {/* Live transcript */}
      <div className="h-6 text-xs text-cyan-400/70 px-4 italic">
        {transcript && `"${transcript}"`}
      </div>

      {/* Conversation log */}
      <div className="flex-1 w-full max-w-2xl px-4 overflow-y-auto relative z-10" style={{ maxHeight: '38vh' }}>
        <div className="flex flex-col gap-2 pb-2">
          {log.length === 0 && (
            <p className="text-cyan-600/50 text-xs text-center mt-8">
              Tap the core or type below. Try: "remember my favorite color is teal", "set timer for 2 minutes", "what time is it".
            </p>
          )}
          {log.map(entry => (
            <div key={entry.id} className={`text-sm px-3 py-2 rounded-lg border max-w-[85%] ${
              entry.role === 'user'
                ? 'self-end bg-cyan-950/40 border-cyan-700/40 text-cyan-100'
                : 'self-start bg-cyan-400/5 border-cyan-400/20 text-cyan-200'
            }`}>
              <span className="block text-[9px] uppercase tracking-widest text-cyan-500/50 mb-1">
                {entry.role === 'user' ? 'You' : 'Jarvis'}
              </span>
              {entry.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <form onSubmit={submitManual} className="w-full max-w-2xl px-4 py-4 flex gap-2 relative z-10">
        <input
          type="text"
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          placeholder="Type a command..."
          className="flex-1 bg-cyan-950/30 border border-cyan-500/30 rounded-lg px-3 py-2 text-sm text-cyan-100 placeholder-cyan-600/50 focus:outline-none focus:border-cyan-400/60"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 text-sm hover:bg-cyan-400/10 transition-colors"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => { setLog([]); setMemory({}); }}
          className="p-2 rounded-lg border border-red-500/30 text-red-400/70 hover:bg-red-500/10 transition-colors"
          aria-label="Clear all data"
        >
          <Trash2 size={16} />
        </button>
      </form>

      <p className="text-[9px] text-cyan-700/50 pb-3 px-4 text-center relative z-10">
        Memory & log stored locally. Voice recognition requires browser support.
      </p>
    </div>
  );
}
