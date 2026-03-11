import type { PlacedWord } from '../types';

interface Props {
  words: PlacedWord[];
  selectedWord: PlacedWord | null;
  onSelectWord: (word: PlacedWord) => void;
}

export default function ClueList({ words, selectedWord, onSelectWord }: Props) {
  const across = words.filter(w => w.direction === 'across').sort((a, b) => a.number - b.number);
  const down = words.filter(w => w.direction === 'down').sort((a, b) => a.number - b.number);

  return (
    <div className="clue-list">
      <div className="clue-section">
        <h4 className="clue-section-title">→ Waagerecht</h4>
        {across.map(w => (
          <div
            key={w.id}
            className={`clue-item ${selectedWord?.id === w.id ? 'clue-selected' : ''}`}
            onClick={() => onSelectWord(w)}
          >
            <span className="clue-number">{w.number}.</span>
            <span className="clue-text">{w.clue}</span>
          </div>
        ))}
      </div>
      <div className="clue-section">
        <h4 className="clue-section-title">↓ Senkrecht</h4>
        {down.map(w => (
          <div
            key={w.id}
            className={`clue-item ${selectedWord?.id === w.id ? 'clue-selected' : ''}`}
            onClick={() => onSelectWord(w)}
          >
            <span className="clue-number">{w.number}.</span>
            <span className="clue-text">{w.clue}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
