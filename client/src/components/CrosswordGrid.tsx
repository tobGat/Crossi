import { useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import type { Crossword, PlacedWord } from '../types';
import ClueList from './ClueList';

interface Props {
  crossword: Crossword;
  readOnly?: boolean;
  answers?: Record<number, string>;
  onAnswerChange?: (answers: Record<number, string>) => void;
}

const CLUE_W   = 320; // clue panel width
const GRID_PAD = 24;  // padding inside scrollable grid area

export default function CrosswordGrid({ crossword, readOnly = false, answers = {}, onAnswerChange }: Props) {
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [direction,    setDirection]    = useState<'across' | 'down'>('across');
  const [cellSize,     setCellSize]     = useState(40);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const layoutRef = useRef<HTMLDivElement>(null);

  /* ── Dynamic cell sizing via container measurement ───────── */
  useLayoutEffect(() => {
    const compute = () => {
      const el = layoutRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const isMobile = window.innerWidth < 640;

      if (readOnly) {
        const byW = Math.floor((w - 24) / crossword.cols);
        const byH = Math.floor((h - 24) / crossword.rows);
        setCellSize(Math.max(22, Math.min(58, Math.min(byW, byH))));
      } else if (isMobile) {
        const byW = Math.floor((w - 20) / crossword.cols);
        setCellSize(Math.max(26, Math.min(44, byW)));
      } else {
        // Desktop: width-based only — grid scrolls vertically, no height constraint
        const availW = w - CLUE_W - GRID_PAD * 2;
        const byW = Math.floor(availW / crossword.cols);
        setCellSize(Math.max(32, Math.min(56, byW)));
      }
    };

    compute();
    const ro = new ResizeObserver(compute);
    if (layoutRef.current) ro.observe(layoutRef.current);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [crossword.cols, crossword.rows, readOnly]);

  /* ── Solution word ───────────────────────────────────────── */
  const solutionWord = useMemo(() =>
    crossword.words.find(w => w.id === crossword.solutionWordId) ?? null,
    [crossword]
  );

  // Map "r,c" -> 1-based position index in the solution path
  const solutionCells = useMemo(() => {
    const map = new Map<string, number>();
    crossword.solutionPath.forEach(({ row, col }, i) => {
      map.set(`${row},${col}`, i + 1);
    });
    return map;
  }, [crossword.solutionPath]);

  /* ── Word helpers ────────────────────────────────────────── */
  const getWordForCell = useCallback((row: number, col: number, dir: 'across' | 'down'): PlacedWord | null => {
    return crossword.words.find(w => {
      if (w.direction !== dir) return false;
      const dr = dir === 'down' ? 1 : 0;
      const dc = dir === 'across' ? 1 : 0;
      for (let i = 0; i < w.word.length; i++) {
        if (w.row + dr * i === row && w.col + dc * i === col) return true;
      }
      return false;
    }) ?? null;
  }, [crossword]);

  const selectedWord = selectedCell
    ? getWordForCell(selectedCell[0], selectedCell[1], direction)
    : null;

  const getCellDisplayLetter = useCallback((row: number, col: number): string => {
    for (const w of crossword.words) {
      const dr = w.direction === 'down' ? 1 : 0;
      const dc = w.direction === 'across' ? 1 : 0;
      for (let i = 0; i < w.word.length; i++) {
        if (w.row + dr * i === row && w.col + dc * i === col) {
          return (answers[w.id]?.[i] ?? '').trim().toUpperCase();
        }
      }
    }
    return '';
  }, [crossword, answers]);

  /* ── Interaction ─────────────────────────────────────────── */
  const handleCellClick = (row: number, col: number) => {
    if (readOnly) return;
    if (selectedCell?.[0] === row && selectedCell?.[1] === col) {
      const newDir = direction === 'across' ? 'down' : 'across';
      if (getWordForCell(row, col, newDir)) setDirection(newDir);
    } else {
      setSelectedCell([row, col]);
      if (!getWordForCell(row, col, direction)) {
        const other = direction === 'across' ? 'down' : 'across';
        if (getWordForCell(row, col, other)) setDirection(other);
      }
    }
    inputRefs.current[`${row},${col}`]?.focus();
  };

  // Update all words that cover (row, col) — keeps intersection cells in sync across both directions
  const updateAnswer = useCallback((row: number, col: number, letter: string) => {
    if (!onAnswerChange) return;
    const newAnswers = { ...answers };
    for (const w of crossword.words) {
      const dr = w.direction === 'down' ? 1 : 0;
      const dc = w.direction === 'across' ? 1 : 0;
      for (let i = 0; i < w.word.length; i++) {
        if (w.row + dr * i === row && w.col + dc * i === col) {
          // Use ' ' (space) as placeholder for empty cells so the string length is preserved.
          // Without this, ''.join() collapses empty entries → wrong index on read-back.
          const stored = newAnswers[w.id] || ' '.repeat(w.word.length);
          const arr = stored.split('');
          while (arr.length < w.word.length) arr.push(' ');
          arr[i] = letter ? letter.toUpperCase() : ' ';
          newAnswers[w.id] = arr.join('');
          break;
        }
      }
    }
    onAnswerChange(newAnswers);
  }, [crossword, answers, onAnswerChange]);

  const moveToCell = (row: number, col: number, intendedDir?: 'across' | 'down') => {
    if (row >= 0 && row < crossword.rows && col >= 0 && col < crossword.cols
        && crossword.grid[row][col].letter !== null) {
      setSelectedCell([row, col]);
      // Auto-switch direction if the target cell has no word in the intended direction
      const targetDir = intendedDir ?? direction;
      if (!getWordForCell(row, col, targetDir)) {
        const other = targetDir === 'across' ? 'down' : 'across';
        if (getWordForCell(row, col, other)) setDirection(other);
      }
      inputRefs.current[`${row},${col}`]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if (readOnly) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setDirection('across'); moveToCell(row, col + 1, 'across'); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); setDirection('across'); moveToCell(row, col - 1, 'across'); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); setDirection('down');   moveToCell(row + 1, col, 'down'); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setDirection('down');   moveToCell(row - 1, col, 'down'); }
    else if (e.key === 'Backspace') {
      e.preventDefault();
      const word = getWordForCell(row, col, direction);
      if (!word) return;
      const dr = direction === 'down' ? 1 : 0;
      const dc = direction === 'across' ? 1 : 0;
      let idx = -1;
      for (let i = 0; i < word.word.length; i++) {
        if (word.row + dr * i === row && word.col + dc * i === col) { idx = i; break; }
      }
      if (idx < 0) return;
      if (getCellDisplayLetter(row, col)) {
        updateAnswer(row, col, '');
      } else if (idx > 0) {
        const pr = row - dr, pc = col - dc;
        setSelectedCell([pr, pc]);
        updateAnswer(pr, pc, '');
        inputRefs.current[`${pr},${pc}`]?.focus();
      }
    }
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>, row: number, col: number) => {
    if (readOnly) return;
    // Use InputEvent.data (exactly what was typed) to avoid cursor-position ambiguity.
    // Fallback to full value for browsers/keyboards that don't populate data (some mobile).
    const inputData = (e.nativeEvent as InputEvent).data ?? e.currentTarget.value;
    const value = inputData.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(-1).toUpperCase();
    e.currentTarget.value = '';
    if (!value) return;
    // Always save — updateAnswer finds all words at this cell regardless of direction
    updateAnswer(row, col, value);
    // Advance cursor to next cell in current direction (only if a word exists in that direction)
    const word = getWordForCell(row, col, direction);
    if (!word) return;
    const dr = direction === 'down' ? 1 : 0;
    const dc = direction === 'across' ? 1 : 0;
    for (let i = 0; i < word.word.length - 1; i++) {
      if (word.row + dr * i === row && word.col + dc * i === col) {
        if (crossword.grid[row + dr]?.[col + dc]?.letter !== null) {
          setSelectedCell([row + dr, col + dc]);
          setTimeout(() => inputRefs.current[`${row + dr},${col + dc}`]?.focus(), 0);
        }
        break;
      }
    }
  };

  const isCellInWord = (row: number, col: number, word: PlacedWord | null): boolean => {
    if (!word) return false;
    const dr = word.direction === 'down' ? 1 : 0;
    const dc = word.direction === 'across' ? 1 : 0;
    for (let i = 0; i < word.word.length; i++) {
      if (word.row + dr * i === row && word.col + dc * i === col) return true;
    }
    return false;
  };

  /* ── Render ──────────────────────────────────────────────── */
  if (readOnly) {
    return (
      <div ref={layoutRef} className="cw-readonly">
        <div className="cw-grid" style={{ gridTemplateColumns: `repeat(${crossword.cols}, ${cellSize}px)`, ['--cell-size' as any]: `${cellSize}px` }}>
          {crossword.grid.map((rowCells, r) =>
            rowCells.map((cell, c) => (
              <div key={`${r},${c}`} className={`cell ${cell.letter === null ? 'cell--black' : 'cell--white'}`}>
                {cell.letter !== null && cell.number && <span className="cell__number">{cell.number}</span>}
                {cell.letter !== null && solutionCells.has(`${r},${c}`) && (
                  <span className="cell__sol-idx">{solutionCells.get(`${r},${c}`)}</span>
                )}
                {cell.letter !== null && <span className="cell__letter">{cell.letter}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Solution strip letters — read from the scattered path cells
  const solutionLetters = solutionWord
    ? crossword.solutionPath.map(({ row, col }) => getCellDisplayLetter(row, col))
    : [];

  return (
    <div ref={layoutRef} className="cw-layout">
      {/* Left: clue bar + scrollable grid + solution strip */}
      <div className="cw-panel">
        <div className={`cw-cluebar${selectedWord ? '' : ' cw-cluebar--empty'}`}>
          {selectedWord ? (
            <>
              <span className="cw-cluebar__badge">
                {selectedWord.number}&thinsp;{selectedWord.direction === 'across' ? '→' : '↓'}
              </span>
              <span className="cw-cluebar__text">{selectedWord.clue}</span>
            </>
          ) : (
            <span className="cw-cluebar__hint">Klicke auf eine Zelle, um zu beginnen</span>
          )}
        </div>

        <div className="cw-scroll">
          <div className="cw-grid" style={{ gridTemplateColumns: `repeat(${crossword.cols}, ${cellSize}px)`, ['--cell-size' as any]: `${cellSize}px` }}>
            {crossword.grid.map((rowCells, r) =>
              rowCells.map((cell, c) => {
                if (cell.letter === null) {
                  return <div key={`${r},${c}`} className="cell cell--black" />;
                }
                const isSelected   = selectedCell?.[0] === r && selectedCell?.[1] === c;
                const isHighlighted = !isSelected && isCellInWord(r, c, selectedWord);
                const letter = getCellDisplayLetter(r, c);
                const solIdx = solutionCells.get(`${r},${c}`);

                return (
                  <div
                    key={`${r},${c}`}
                    className={`cell cell--white${isSelected ? ' cell--selected' : ''}${isHighlighted ? ' cell--highlighted' : ''}`}
                    onClick={() => handleCellClick(r, c)}
                  >
                    {cell.number && <span className="cell__number">{cell.number}</span>}
                    {solIdx !== undefined && <span className="cell__sol-idx">{solIdx}</span>}
                    <input
                      ref={el => { inputRefs.current[`${r},${c}`] = el; }}
                      className="cell__input"
                      type="text"
                      value={letter}
                      onInput={e => handleInput(e, r, c)}
                      onKeyDown={e => handleKeyDown(e, r, c)}
                      onChange={() => {}}
                      maxLength={2}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Solution word strip */}
        {solutionWord && (
          <div className="sol-strip">
            <span className="sol-strip__label">Lösungswort</span>
            <div className="sol-strip__boxes">
              {solutionLetters.map((letter, i) => (
                <div key={i} className="sol-box">
                  <span className="sol-box__idx">{i + 1}</span>
                  <span className={`sol-box__letter${letter ? ' sol-box__letter--filled' : ''}`}>
                    {letter}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: clue list */}
      <ClueList
        words={crossword.words}
        selectedWord={selectedWord}
        onSelectWord={word => {
          setSelectedCell([word.row, word.col]);
          setDirection(word.direction);
          inputRefs.current[`${word.row},${word.col}`]?.focus();
        }}
      />
    </div>
  );
}
