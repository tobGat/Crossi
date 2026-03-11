const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const cors = require('cors');
const { generateCrossword } = require('./crossword');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve built client in production
app.use(express.static(path.join(__dirname, '../client/dist')));

// Persist rooms to disk so server restarts don't lose them
const fs = require('fs');
const ROOMS_FILE = path.join(__dirname, 'rooms.json');

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
      return new Map(Object.entries(data).map(([k, v]) => [k, { ...v, students: new Map() }]));
    }
  } catch {}
  return new Map();
}

function saveRooms() {
  try {
    const obj = {};
    for (const [k, v] of rooms) obj[k] = { code: v.code, crossword: v.crossword, createdAt: v.createdAt };
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(obj));
  } catch {}
}

const rooms = loadRooms();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Upload and parse file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const words = [];
    for (const row of data.slice(1)) {  // erste Zeile (Überschrift) überspringen
      if (!row[0]) continue;
      const word = String(row[0]).trim().toUpperCase().replace(/[^A-ZÄÖÜ]/g, '');
      const clue = row[1] ? String(row[1]).trim() : String(row[0]).trim();
      if (word.length > 1) words.push({ word, clue });
    }

    if (words.length === 0) return res.status(400).json({ error: 'Keine gültigen Wörter gefunden. Spalte A: Wort, Spalte B: Hinweis' });

    res.json({ words });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Fehler beim Lesen der Datei' });
  }
});

// Download template
app.get('/api/template', (req, res) => {
  const wb = xlsx.utils.book_new();
  const data = [
    ['Wort', 'Hinweis'],
    ['SCHULE', 'Gebäude zum Lernen'],
    ['LEHRER', 'Unterrichtet Kinder'],
    ['BUCH', 'Zum Lesen'],
    ['STIFT', 'Zum Schreiben'],
    ['TAFEL', 'Darauf schreibt die Lehrkraft'],
  ];
  const ws = xlsx.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 20 }, { wch: 35 }];
  xlsx.utils.book_append_sheet(wb, ws, 'Wörter');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="crossi-vorlage.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Restore room from a saved snapshot (pre-built crossword, skip generation)
app.post('/api/room/restore', (req, res) => {
  const { crossword, words, roomCode: requestedCode } = req.body;
  if (!crossword || !Array.isArray(words)) return res.status(400).json({ error: 'Ungültige Sicherungsdatei' });

  const code = (requestedCode && !rooms.has(requestedCode.toUpperCase()))
    ? requestedCode.toUpperCase()
    : generateCode();
  rooms.set(code, { code, crossword, students: new Map(), createdAt: new Date() });
  saveRooms();
  res.json({ code, crossword });
});

// Create room
app.post('/api/room/create', (req, res) => {
  const { words } = req.body;
  if (!words || words.length === 0) return res.status(400).json({ error: 'Keine Wörter angegeben' });

  const crossword = generateCrossword(words);
  if (!crossword) return res.status(400).json({ error: 'Kreuzworträtsel konnte nicht erstellt werden' });

  const code = generateCode();
  rooms.set(code, { code, crossword, students: new Map(), createdAt: new Date() });
  saveRooms();

  res.json({ code, crossword });
});

// Get room (teacher reconnect)
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });

  res.json({
    code: room.code,
    crossword: room.crossword,
    students: Array.from(room.students.values()).map(s => ({
      id: s.id, name: s.name, correctCount: s.correctCount,
      totalWords: room.crossword.words.length, submitted: s.submitted
    }))
  });
});

// Socket.io
io.on('connection', socket => {
  socket.on('join-room', ({ roomCode, studentName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { message: 'Raum nicht gefunden' }); return; }

    const student = { id: socket.id, name: studentName, answers: {}, correctCount: 0, submitted: false };
    room.students.set(socket.id, student);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('room-joined', { crossword: room.crossword });
    io.to(`teacher-${code}`).emit('student-update', {
      id: socket.id, name: studentName, correctCount: 0,
      totalWords: room.crossword.words.length, submitted: false, event: 'joined'
    });
  });

  socket.on('join-teacher', ({ roomCode }) => {
    const code = roomCode.toUpperCase();
    socket.join(`teacher-${code}`);
    socket.data.teacherRoom = code;

    const room = rooms.get(code);
    if (room) {
      socket.emit('room-state', {
        students: Array.from(room.students.values()).map(s => ({
          id: s.id, name: s.name, correctCount: s.correctCount,
          totalWords: room.crossword.words.length, submitted: s.submitted
        }))
      });
    }
  });

  socket.on('submit-answers', ({ roomCode, answers }) => {
    const code = (roomCode || socket.data.roomCode || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const student = room.students.get(socket.id);
    if (!student) return;

    let correctCount = 0;
    const results = {};

    for (const w of room.crossword.words) {
      const given = (answers[w.id] || '').toUpperCase().replace(/\s+/g, '');
      const correct = given === w.word;
      if (correct) correctCount++;
      results[w.id] = correct;
    }

    student.answers = answers;
    student.correctCount = correctCount;
    student.submitted = true;

    socket.emit('answer-results', { results, correctCount, totalWords: room.crossword.words.length });
    io.to(`teacher-${code}`).emit('student-update', {
      id: socket.id, name: student.name, correctCount,
      totalWords: room.crossword.words.length, submitted: true, event: 'submitted'
    });
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (code) {
      const room = rooms.get(code);
      if (room) {
        room.students.delete(socket.id);
        io.to(`teacher-${code}`).emit('student-update', { id: socket.id, event: 'left' });
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Crossi server running on http://localhost:${PORT}`));
