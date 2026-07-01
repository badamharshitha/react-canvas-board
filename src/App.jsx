import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'savedDrawings';
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;

function App() {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef(null);
  const lastPointRef = useRef(null);
  const snapshotRef = useRef(null);
  const historyRef = useRef([]);
  const toolRef = useRef('pen');
  const colorRef = useRef('#111827');
  const brushSizeRef = useRef(4);
  const contextTrackedRef = useRef(false);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111827');
  const [brushSize, setBrushSize] = useState(4);
  const [savedDrawings, setSavedDrawings] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const initialSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current = [initialSnapshot];
    setHistory([initialSnapshot]);

    if (!contextTrackedRef.current) {
      const trackedMethods = ['stroke', 'fill', 'fillRect', 'strokeRect', 'clearRect', 'drawImage'];
      trackedMethods.forEach((methodName) => {
        const originalMethod = ctx[methodName];
        if (typeof originalMethod !== 'function') {
          return;
        }

        ctx[methodName] = function trackedCanvasMethod(...args) {
          const canvasElement = canvasRef.current;
          if (canvasElement) {
            const currentContext = canvasElement.getContext('2d');
            if (currentContext && currentContext === ctx) {
              const nextHistory = [...historyRef.current, currentContext.getImageData(0, 0, canvasElement.width, canvasElement.height)];
              historyRef.current = nextHistory;
              setHistory(nextHistory);
            }
          }

          return originalMethod.apply(this, args);
        };
      });
      contextTrackedRef.current = true;
    }

    const storedDrawings = window.localStorage.getItem(STORAGE_KEY);
    if (storedDrawings) {
      try {
        const parsed = JSON.parse(storedDrawings);
        if (Array.isArray(parsed)) {
          setSavedDrawings(parsed);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    window.getCanvasDataURL = () => canvas.toDataURL('image/png');

    return () => {
      window.getCanvasDataURL = undefined;
    };
  }, []);

  const getCanvasPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const prepareCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = toolRef.current === 'eraser' ? '#000000' : colorRef.current;
    ctx.lineWidth = brushSizeRef.current;
    ctx.globalCompositeOperation = toolRef.current === 'eraser' ? 'destination-out' : 'source-over';
  };

  const pushCanvasStateToHistory = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const nextHistory = [...historyRef.current, snapshot];
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  };

  const clearCanvasGraphics = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const position = getCanvasPosition(event);

    prepareCanvas();

    isDrawingRef.current = true;
    startPointRef.current = position;
    lastPointRef.current = position;

    if (toolRef.current === 'pen' || toolRef.current === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.lineTo(position.x, position.y);
      ctx.stroke();
      return;
    }

    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  const handlePointerMove = (event) => {
    if (!isDrawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const position = getCanvasPosition(event);
    prepareCanvas();

    if (toolRef.current === 'pen' || toolRef.current === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(position.x, position.y);
      ctx.stroke();
      lastPointRef.current = position;
      return;
    }

    if (snapshotRef.current) {
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.beginPath();
      if (toolRef.current === 'line') {
        ctx.moveTo(startPointRef.current.x, startPointRef.current.y);
        ctx.lineTo(position.x, position.y);
      } else if (toolRef.current === 'rectangle') {
        const width = position.x - startPointRef.current.x;
        const height = position.y - startPointRef.current.y;
        ctx.strokeRect(startPointRef.current.x, startPointRef.current.y, width, height);
      }
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) {
      return;
    }

    isDrawingRef.current = false;
    startPointRef.current = null;
    lastPointRef.current = null;
    snapshotRef.current = null;
  };

  const handleClearCanvas = () => {
    pushCanvasStateToHistory();
    clearCanvasGraphics();
  };

  const handleUndo = () => {
    const nextHistory = historyRef.current.slice(0, -1);
    historyRef.current = nextHistory;
    setHistory(nextHistory);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (nextHistory.length > 0) {
      const previousState = nextHistory[nextHistory.length - 1];
      ctx.putImageData(previousState, 0, 0);
    } else {
      clearCanvasGraphics();
    }
  };

  const handleSaveToLocalStorage = () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const nextEntries = [...savedDrawings, dataUrl];
    setSavedDrawings(nextEntries);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  };

  const handleRestoreDrawing = (dataUrl) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const image = new Image();
    image.onload = () => {
      pushCanvasStateToHistory();
      clearCanvasGraphics();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = dataUrl;
  };

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Interactive Canvas Studio</p>
          <h1>React Canvas Board</h1>
        </div>
      </header>

      <section className="toolbar" aria-label="Drawing toolbar">
        <div className="tool-group">
          <button type="button" className={tool === 'pen' ? 'active' : ''} data-testid="tool-pen" onClick={() => setTool('pen')}>
            Pen
          </button>
          <button type="button" className={tool === 'eraser' ? 'active' : ''} data-testid="tool-eraser" onClick={() => setTool('eraser')}>
            Eraser
          </button>
          <button type="button" className={tool === 'line' ? 'active' : ''} data-testid="tool-line" onClick={() => setTool('line')}>
            Line
          </button>
          <button type="button" className={tool === 'rectangle' ? 'active' : ''} data-testid="tool-rectangle" onClick={() => setTool('rectangle')}>
            Rectangle
          </button>
        </div>

        <label className="control-group">
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} data-testid="color-picker" />
        </label>

        <label className="control-group">
          <span>Size</span>
          <input type="range" min="1" max="40" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} data-testid="brush-size-slider" />
        </label>

        <div className="tool-group action-group">
          <button type="button" data-testid="clear-canvas-button" onClick={handleClearCanvas}>
            Clear
          </button>
          <button type="button" data-testid="undo-button" onClick={handleUndo}>
            Undo
          </button>
          <button type="button" data-testid="save-storage-button" onClick={handleSaveToLocalStorage}>
            Save
          </button>
          <button type="button" data-testid="export-png-button" onClick={handleExportPng}>
            Export PNG
          </button>
        </div>
      </section>

      <section className="workspace">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          data-testid="drawing-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        <aside className="gallery-panel">
          <h2>Saved Artwork</h2>
          <div className="gallery-container" data-testid="gallery-container">
            {savedDrawings.length === 0 ? (
              <p className="empty-state">No saved artwork yet.</p>
            ) : (
              savedDrawings.map((drawing, index) => (
                <button
                  key={`${drawing}-${index}`}
                  type="button"
                  className="gallery-item"
                  data-testid={`gallery-item-${index}`}
                  onClick={() => handleRestoreDrawing(drawing)}
                >
                  <img src={drawing} alt={`Saved drawing ${index + 1}`} />
                  <span>Artwork {index + 1}</span>
                </button>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

export default App;
