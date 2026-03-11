import { useState, useEffect, useCallback } from 'react';
import type { WordDef, Crossword, StudentInfo } from '../types';
import socket from '../socket';
import CrosswordGrid from '../components/CrosswordGrid';
import StudentList from '../components/StudentList';

type TeacherStep = 'upload' | 'preview' | 'room';

interface Props { onBack: () => void; }

export default function TeacherView({ onBack }: Props) {
  const [step, setStep] = useState<TeacherStep>('upload');
  const [words, setWords] = useState<WordDef[]>([]);
  const [crossword, setCrossword] = useState<Crossword | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!roomCode) return;
    socket.connect();
    socket.emit('join-teacher', { roomCode });
    socket.on('room-state', ({ students: s }) => setStudents(s));
    socket.on('student-update', (update) => {
      if (update.event === 'left') {
        setStudents(prev => prev.filter(s => s.id !== update.id));
      } else if (update.event === 'joined') {
        setStudents(prev => {
          if (prev.find(s => s.id === update.id)) return prev;
          return [...prev, { id: update.id, name: update.name, correctCount: update.correctCount, totalWords: update.totalWords, submitted: update.submitted }];
        });
      } else if (update.event === 'submitted') {
        setStudents(prev => prev.map(s => s.id === update.id ? { ...s, correctCount: update.correctCount, submitted: true } : s));
      }
    });
    return () => {
      socket.off('room-state');
      socket.off('student-update');
      socket.disconnect();
    };
  }, [roomCode]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWords(data.words);
      setStep('preview');
    } catch (e: any) {
      setError(e.message || 'Fehler beim Hochladen');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCrossword(data.crossword);
      setRoomCode(data.code);
      setStep('room');
    } catch (e: any) {
      setError(e.message || 'Fehler beim Erstellen');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = useCallback(async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.crossi || !backup.crossword || !backup.words) throw new Error('Ungültige Sicherungsdatei');
      const res = await fetch('/api/room/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crossword: backup.crossword, words: backup.words, roomCode: backup.roomCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWords(backup.words);
      setCrossword(data.crossword);
      setRoomCode(data.code);
      setStep('room');
    } catch (e: any) {
      setError(e.message || 'Fehler beim Laden der Sicherung');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaveBackup = useCallback(() => {
    if (!crossword || !words.length) return;
    const backup = { crossi: true, version: 1, savedAt: new Date().toISOString(), roomCode, crossword, words };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crossi-raum-${roomCode}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [crossword, words, roomCode]);

  const longestWord = words.length ? Math.max(...words.map(w => w.word.length)) : 0;

  return (
    <div className="view">
      <header className="view-header">
        <button className="back-btn" onClick={onBack}>← Zurück</button>
        <span className="view-header__title">
          {step === 'upload' && 'Wörter importieren'}
          {step === 'preview' && 'Vorschau & Raumeinstellungen'}
          {step === 'room' && `Raum ${roomCode}`}
        </span>
        {step === 'room' && (
          <>
            <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '0.35rem 0.8rem' }} onClick={handleSaveBackup}>
              💾 Speichern
            </button>
            <div className="header-room-code">
              <span className="header-room-code__label">Code</span>
              <span className="header-room-code__value">{roomCode}</span>
            </div>
          </>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Upload ── */}
      {step === 'upload' && (
        <div className="upload-area">
          <div
            className={`drop-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="drop-icon">📄</div>
            <p className="drop-text">Excel- oder LibreOffice-Datei hier ablegen</p>
            <p className="drop-hint">
              Erste Zeile = Überschrift (wird ignoriert)
              <br />
              Spalte A: Wort &nbsp;·&nbsp; Spalte B: Hinweis/Frage
            </p>
            <div className="drop-actions">
              <label className="btn btn-primary">
                {loading ? 'Wird geladen…' : '📂 Datei auswählen'}
                <input type="file" accept=".xlsx,.xls,.ods,.csv" hidden
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
              <a className="btn btn-ghost" href="/api/template" download>
                ⬇ Vorlage herunterladen
              </a>
              <label className="btn btn-ghost">
                📂 Sicherung laden
                <input type="file" accept=".json" hidden
                  onChange={e => e.target.files?.[0] && handleRestoreBackup(e.target.files[0])} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {step === 'preview' && (
        <div className="preview-layout">
          <div className="preview-main">
            <h3 className="section-title">Importierte Wörter</h3>
            <div className="word-list">
              {words.map((w, i) => (
                <div key={i} className="word-item">
                  <span className="word-idx">{i + 1}</span>
                  <span className="word-text">{w.word}</span>
                  <span className="word-clue">{w.clue}</span>
                </div>
              ))}
            </div>
          </div>
          <aside className="preview-sidebar">
            <div className="stats-card">
              <h3 className="section-title">Statistik</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">{words.length}</span>
                  <span className="stat-label">Wörter</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{longestWord}</span>
                  <span className="stat-label">Max. Länge</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{Math.round(words.reduce((s, w) => s + w.word.length, 0) / words.length)}</span>
                  <span className="stat-label">Ø Länge</span>
                </div>
              </div>
            </div>
            <div className="preview-actions">
              <button className="btn btn-secondary" onClick={() => setStep('upload')}>↩ Andere Datei</button>
              <button className="btn btn-primary" onClick={handleCreateRoom} disabled={loading}>
                {loading ? 'Erstelle Raum…' : '🚀 Raum erstellen'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Room ── */}
      {step === 'room' && crossword && (
        <div className="room-layout">
          <div className="room-main">
            <CrosswordGrid crossword={crossword} readOnly />
          </div>
          <aside className="room-panel">
            <div className="room-code-card">
              <p className="room-code-label">Raumcode für Schüler:innen</p>
              <p className="room-code">{roomCode}</p>
              <p className="room-code-hint">Diesen Code im Browser auf <strong>localhost:3000</strong> eingeben</p>
            </div>
            <StudentList students={students} totalWords={crossword.words.length} />
          </aside>
        </div>
      )}
    </div>
  );
}
