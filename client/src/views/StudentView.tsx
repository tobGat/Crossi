import { useState, useEffect } from 'react';
import type { Crossword } from '../types';
import socket from '../socket';
import CrosswordGrid from '../components/CrosswordGrid';

type StudentStep = 'join' | 'play' | 'results';

interface Props { onBack: () => void; }

interface Results {
  results: Record<number, boolean>;
  correctCount: number;
  totalWords: number;
}

export default function StudentView({ onBack }: Props) {
  const [step, setStep] = useState<StudentStep>('join');
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [crossword, setCrossword] = useState<Crossword | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    socket.on('room-joined', ({ crossword: cw }) => {
      setCrossword(cw);
      // Restore saved answers from localStorage
      const saved = localStorage.getItem(`crossi-save-${roomCode.toUpperCase()}-${name.trim().toLowerCase()}`);
      if (saved) {
        try { setAnswers(JSON.parse(saved)); } catch {}
      }
      setStep('play');
      setConnecting(false);
    });
    socket.on('error', ({ message }) => {
      setError(message);
      setConnecting(false);
      socket.disconnect();
    });
    socket.on('answer-results', (r) => {
      setResults(r);
      // Clear saved progress on submit
      localStorage.removeItem(`crossi-save-${roomCode.toUpperCase()}-${name.trim().toLowerCase()}`);
      setStep('results');
    });
    return () => {
      socket.off('room-joined');
      socket.off('error');
      socket.off('answer-results');
      socket.disconnect();
    };
  }, [roomCode, name]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !name.trim()) return;
    setError('');
    setConnecting(true);
    const code = roomCode.trim().toUpperCase();
    const studentName = name.trim();
    const doJoin = () => socket.emit('join-room', { roomCode: code, studentName });
    if (socket.connected) {
      doJoin();
    } else {
      socket.once('connect', doJoin);
      socket.connect();
    }
  };

  const handleSubmit = () => {
    if (!crossword) return;
    const missing = crossword.words.filter(w => !answers[w.id]?.trim()).length;
    if (missing > 0 && !window.confirm(`Noch ${missing} Wort${missing !== 1 ? 'e' : ''} nicht ausgefüllt. Trotzdem abgeben?`)) return;
    socket.emit('submit-answers', { roomCode, answers });
  };

  /* ── Results ── */
  if (step === 'results' && results) {
    const pct = results.totalWords > 0 ? results.correctCount / results.totalWords : 0;
    return (
      <div className="results-view">
        <div className="results-card">
          <div className="results-trophy">
            {pct === 1 ? '🏆' : pct >= 0.5 ? '🌟' : '💪'}
          </div>
          <h2 className="results-title">Fertig, {name}!</h2>
          <div className="results-score">
            <span className="score-number">{results.correctCount}</span>
            <span className="score-divider">/</span>
            <span className="score-total">{results.totalWords}</span>
          </div>
          <p className="results-subtitle">richtige Antworten</p>

          {crossword && (
            <div className="results-detail">
              {crossword.words
                .sort((a, b) => a.number - b.number)
                .map(w => (
                  <div key={w.id} className={`result-item ${results.results[w.id] ? 'correct' : 'wrong'}`}>
                    <span className="result-icon">{results.results[w.id] ? '✓' : '✗'}</span>
                    <span className="result-clue">
                      <strong>{w.number}</strong> {w.direction === 'across' ? '→' : '↓'} {w.clue}
                    </span>
                    {!results.results[w.id] && (
                      <span className="correct-answer">{w.word}</span>
                    )}
                  </div>
                ))}
            </div>
          )}

          <button className="btn btn-primary btn-large"
            onClick={() => { setStep('join'); setAnswers({}); setResults(null); socket.disconnect(); }}>
            Nochmal spielen
          </button>
        </div>
      </div>
    );
  }

  /* ── Play ── */
  if (step === 'play' && crossword) {
    return (
      <div className="view play-view">
        <header className="play-header">
          <span className="play-room">Raum <strong>{roomCode}</strong></span>
          <span className="play-name">👤 {name}</span>
          <div className="play-actions">
            <button className="btn export-btn" onClick={() => window.print()}>⬇ PDF</button>
            <button className="btn submit-btn" onClick={handleSubmit}>Abgeben ✓</button>
          </div>
        </header>
        <div className="print-info">
          <strong>Crossi – Kreuzworträtsel</strong>
          <span>Raum: {roomCode}</span>
          <span>Name: {name}</span>
          <span>{new Date().toLocaleDateString('de-AT')}</span>
        </div>
        <CrosswordGrid crossword={crossword} answers={answers} onAnswerChange={newAnswers => {
          setAnswers(newAnswers);
          localStorage.setItem(`crossi-save-${roomCode.toUpperCase()}-${name.trim().toLowerCase()}`, JSON.stringify(newAnswers));
        }} />
      </div>
    );
  }

  /* ── Join ── */
  return (
    <div className="join-view">
      <div className="join-card">
        <button className="join-back" onClick={onBack}>← Zurück</button>
        <div className="join-header">
          <img src="/logo_crossi.png" alt="Crossi" className="join-logo" />
          <h1 className="join-title">Crossi</h1>
          <p className="join-subtitle">Gib deinen Raumcode und Namen ein</p>
        </div>
        {error && <div className="error-banner error-banner--inline">{error}</div>}
        <form className="join-form" onSubmit={handleJoin}>
          <div className="form-group">
            <label htmlFor="roomCode">Raumcode</label>
            <input id="roomCode" type="text" placeholder="z.B. AB1C2D"
              value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
              maxLength={8} autoComplete="off" autoCapitalize="characters" />
          </div>
          <div className="form-group">
            <label htmlFor="name">Dein Name</label>
            <input id="name" type="text" placeholder="z.B. Max Mustermann"
              value={name} onChange={e => setName(e.target.value)} maxLength={30} />
          </div>
          <button type="submit" className="btn btn-primary btn-large"
            disabled={connecting || !roomCode || !name}>
            {connecting ? 'Verbinde…' : 'Beitreten →'}
          </button>
        </form>
      </div>
    </div>
  );
}
