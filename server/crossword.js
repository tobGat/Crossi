function generateCrossword(wordList) {
  const words = [...wordList]
    .filter(w => w.word && w.word.length > 1)
    .sort((a, b) => b.word.length - a.word.length)
    .map((w, i) => ({ ...w, word: w.word.toUpperCase().replace(/\s+/g, ''), id: i }));

  if (words.length === 0) return null;

  const grid = new Map(); // "r,c" -> letter
  const placed = [];

  function getCell(r, c) { return grid.get(`${r},${c}`) ?? null; }
  function setCell(r, c, letter) { grid.set(`${r},${c}`, letter); }

  function canPlace(word, row, col, dir) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;

    if (getCell(row - dr, col - dc) !== null) return false;
    if (getCell(row + dr * word.length, col + dc * word.length) !== null) return false;

    let hasIntersection = placed.length === 0;

    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = getCell(r, c);

      if (existing !== null) {
        if (existing !== word[i]) return false;
        hasIntersection = true;
      } else {
        // Check perpendicular sides for accidental word formation
        const s1 = getCell(r - dc, c - dr);
        const s2 = getCell(r + dc, c + dr);
        if (s1 !== null || s2 !== null) return false;
      }
    }
    return hasIntersection;
  }

  function doPlace(wordObj, row, col, dir) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    for (let i = 0; i < wordObj.word.length; i++) {
      setCell(row + dr * i, col + dc * i, wordObj.word[i]);
    }
    placed.push({ ...wordObj, row, col, direction: dir });
  }

  // Place first word
  doPlace(words[0], 0, 0, 'across');

  const remaining = [...words.slice(1)];
  let maxPasses = 3;

  while (remaining.length > 0 && maxPasses-- > 0) {
    const stillUnplaced = [];

    for (const wordObj of remaining) {
      let best = null;
      let bestScore = -Infinity;

      for (const p of placed) {
        const dir = p.direction === 'across' ? 'down' : 'across';
        const dr = dir === 'down' ? 1 : 0;
        const dc = dir === 'across' ? 1 : 0;
        const pdr = p.direction === 'down' ? 1 : 0;
        const pdc = p.direction === 'across' ? 1 : 0;

        for (let pi = 0; pi < p.word.length; pi++) {
          for (let wi = 0; wi < wordObj.word.length; wi++) {
            if (p.word[pi] !== wordObj.word[wi]) continue;

            const intR = p.row + pdr * pi;
            const intC = p.col + pdc * pi;
            const newRow = intR - dr * wi;
            const newCol = intC - dc * wi;

            if (canPlace(wordObj.word, newRow, newCol, dir)) {
              const centerDist = Math.abs(newRow) + Math.abs(newCol);
              const score = -centerDist;
              if (score > bestScore) {
                bestScore = score;
                best = { row: newRow, col: newCol, dir };
              }
            }
          }
        }
      }

      if (best) {
        doPlace(wordObj, best.row, best.col, best.dir);
      } else {
        stillUnplaced.push(wordObj);
      }
    }

    if (stillUnplaced.length === remaining.length) break;
    remaining.length = 0;
    remaining.push(...stillUnplaced);
  }

  // Normalize coordinates
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const [key] of grid) {
    const [r, c] = key.split(',').map(Number);
    minR = Math.min(minR, r); minC = Math.min(minC, c);
    maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
  }

  const normPlaced = placed.map(p => ({ ...p, row: p.row - minR, col: p.col - minC }));
  const normGrid = new Map();
  for (const [key, letter] of grid) {
    const [r, c] = key.split(',').map(Number);
    normGrid.set(`${r - minR},${c - minC}`, letter);
  }

  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  // Assign clue numbers (left-to-right, top-to-bottom)
  const clueNumbers = new Map();
  let num = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!normGrid.has(`${r},${c}`)) continue;
      const startsAcross = normPlaced.some(p => p.row === r && p.col === c && p.direction === 'across');
      const startsDown = normPlaced.some(p => p.row === r && p.col === c && p.direction === 'down');
      if (startsAcross || startsDown) clueNumbers.set(`${r},${c}`, num++);
    }
  }

  const numberedWords = normPlaced.map(p => ({
    ...p,
    number: clueNumbers.get(`${p.row},${p.col}`) ?? 0
  }));

  // Build grid array
  const finalGrid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const letter = normGrid.get(`${r},${c}`) ?? null;
      const number = clueNumbers.get(`${r},${c}`) ?? null;
      row.push({ letter, number });
    }
    finalGrid.push(row);
  }

  // Build a solution path for a candidate word:
  // Each letter of the word is matched to a cell in a DIFFERENT word (not the candidate itself).
  // Returns array of {row, col, wordId} or null if no valid path exists.
  function buildSolutionPath(target, allWords) {
    const tdr = target.direction === 'down' ? 1 : 0;
    const tdc = target.direction === 'across' ? 1 : 0;
    const targetCells = new Set();
    for (let i = 0; i < target.word.length; i++) {
      targetCells.add(`${target.row + tdr * i},${target.col + tdc * i}`);
    }

    const path = [];
    const usedCells = new Set();

    for (let i = 0; i < target.word.length; i++) {
      const letter = target.word[i];
      const candidates = [];

      for (const w of allWords) {
        if (w.id === target.id) continue;
        const wdr = w.direction === 'down' ? 1 : 0;
        const wdc = w.direction === 'across' ? 1 : 0;
        for (let j = 0; j < w.word.length; j++) {
          if (w.word[j] !== letter) continue;
          const r = w.row + wdr * j;
          const c = w.col + wdc * j;
          const key = `${r},${c}`;
          if (!usedCells.has(key) && !targetCells.has(key)) {
            candidates.push({ row: r, col: c, key, wordId: w.id });
          }
        }
      }

      if (candidates.length === 0) return null;

      // Prefer cells from words not yet used in the path (more diverse)
      const usedWordIds = new Set(path.map(p => p.wordId));
      const fresh = candidates.filter(c => !usedWordIds.has(c.wordId));
      const chosen = (fresh.length > 0 ? fresh : candidates)[0];

      path.push(chosen);
      usedCells.add(chosen.key);
    }
    return path;
  }

  // Pick the best solution word: most diverse path (letters from many different words)
  let solutionWordId = numberedWords[0]?.id ?? 0;
  let solutionPath = [];
  let bestScore = -1;

  for (const candidate of numberedWords) {
    if (candidate.word.length < 3) continue;
    const rawPath = buildSolutionPath(candidate, numberedWords);
    if (!rawPath) continue;

    const uniqueWords = new Set(rawPath.map(p => p.wordId)).size;
    const score = uniqueWords * 10 + candidate.word.length;

    if (score > bestScore) {
      bestScore = score;
      solutionWordId = candidate.id;
      solutionPath = rawPath.map(({ row, col }) => ({ row, col }));
    }
  }

  // Fallback: use the word's own cells if no valid cross-word path found
  if (solutionPath.length === 0 && numberedWords.length > 0) {
    const w = numberedWords.find(x => x.id === solutionWordId) || numberedWords[0];
    const dr = w.direction === 'down' ? 1 : 0;
    const dc = w.direction === 'across' ? 1 : 0;
    solutionWordId = w.id;
    solutionPath = Array.from({ length: w.word.length }, (_, i) => ({
      row: w.row + dr * i, col: w.col + dc * i
    }));
  }

  return {
    grid: finalGrid,
    words: numberedWords,
    rows,
    cols,
    unplacedCount: remaining.length,
    solutionWordId,
    solutionPath
  };
}

module.exports = { generateCrossword };
