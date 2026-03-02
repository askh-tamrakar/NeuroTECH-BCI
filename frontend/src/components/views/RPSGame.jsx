import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrainCircuit, Activity, ImageIcon } from 'lucide-react';
import CustomSelect from '../ui/CustomSelect';
import '../../styles/views/RPSGame.css';

const MOVES = ['ROCK', 'PAPER', 'SCISSORS'];

const ASSETS = {
    set1: {
        ROCK: '/images/rock.png',
        PAPER: '/images/paper.png',
        SCISSORS: '/images/scissors.png',
    },
    set2: {
        ROCK: '/images/Rock_2.png',
        PAPER: '/images/Paper_2.png',
        SCISSORS: '/images/Scissor_2.png',
    }
};

const WIN_CONDITIONS = {
    ROCK: 'SCISSORS',
    PAPER: 'ROCK',
    SCISSORS: 'PAPER',
};

const MoveImage = ({ move, assetType, type }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [move, assetType]);

    if (assetType === 'emoji' || hasError) {
        return (
            <span className="pop" style={{ fontSize: '14rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                {move === 'ROCK' ? '🪨' : move === 'PAPER' ? '📄' : '✂️'}
            </span>
        );
    }

    const currentSet = ASSETS[assetType] || ASSETS.set1;
    const src = currentSet[move];

    // Transformation logic
    let transform = '';
    if (assetType === 'set1' || assetType === 'image') {
        transform = type === 'player' ? 'rotate(45deg)' : 'rotate(-45deg)';

        // Specific flips requested by user
        if (move === 'ROCK' && type === 'player') {
            transform += ' scaleX(-1)';
        } else if (move === 'PAPER' && type === 'computer') {
            transform += ' scaleX(-1)';
        } else if (move === 'SCISSORS' && type === 'computer') {
            transform += ' scaleX(-1)';
        }
    } else if (assetType === 'set2') {
        if (type === 'computer') {
            transform = 'scaleX(-1)';
        }
    }

    return (
        <div className="pop" style={{ width: '300px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
                src={src}
                alt={move}
                className="card-image"
                style={{
                    transform: transform,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transition: 'transform 0.3s ease-out'
                }}
                onError={() => setHasError(true)}
            />
        </div>
    );
};

const RPSGame = ({ wsEvent }) => {
    // Game State
    const [gameState, setGameState] = useState('idle'); // 'idle', 'waiting', 'revealed', 'resetting'
    const [playerMove, setPlayerMove] = useState(null);
    const [computerMove, setComputerMove] = useState(null);
    const [result, setResult] = useState(null);
    const [countdown, setCountdown] = useState(0);
    // Mode: automatic via WS events, or manual via on-screen buttons
    const [manualMode, setManualMode] = useState(false);
    // Visual asset mode
    const [assetType, setAssetType] = useState('set1'); // 'set1', 'set2', 'emoji'
    // Difficulty for computer move randomness: 'low' (repeats sometimes), 'moderate' (avoid repeats), 'high' (fully random)
    const [difficulty, setDifficulty] = useState('moderate');

    // Models
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');

    // Stats
    const [score, setScore] = useState({ player: 0, computer: 0 });

    // Refs for logic
    const computerMoveRef = useRef(null);
    const processingRef = useRef(false);

    // Initialize Computer Move
    const pickComputerMove = useCallback(() => {
        const last = computerMoveRef.current;
        let choice;
        if (difficulty === 'low') {
            // slight bias to repeat last move (~60%) to make it more predictable
            if (last && Math.random() < 0.6) {
                choice = last;
            } else {
                choice = MOVES[Math.floor(Math.random() * MOVES.length)];
            }
        } else if (difficulty === 'moderate') {
            // avoid repeating the last move to increase variety
            const options = MOVES.filter((m) => m !== last);
            choice = options[Math.floor(Math.random() * options.length)];
        } else {
            // high = fully random
            choice = MOVES[Math.floor(Math.random() * MOVES.length)];
        }
        computerMoveRef.current = choice;
        setComputerMove(choice); // Stored but hidden until reveal
        console.log("Computer chose (hidden):", choice, "(difficulty:", difficulty, ")");
    }, [difficulty]);

    const togglePrediction = (active) => {
        fetch(`/api/emg/predict/${active ? 'start' : 'stop'}`, { method: 'POST' })
            .catch(err => console.error("Prediction toggle failed:", err));
    };

    const resetGame = useCallback(() => {
        setPlayerMove(null);
        setResult(null);
        processingRef.current = false;
        pickComputerMove();

        if (!manualMode) {
            setGameState('waiting_for_rest');
            // Keep prediction running for auto-restart
        } else {
            setGameState('idle');
            // Disable prediction when game sends to idle
            togglePrediction(false);
        }
    }, [pickComputerMove, manualMode]);

    // Connect on mount
    useEffect(() => {
        pickComputerMove();

        // Fetch models
        fetch('/api/models/emg')
            .then(res => res.json())
            .then(data => {
                setModels(data);
                if (data.length > 0) {
                    const activeModel = data.find(m => m.active);
                    if (activeModel) {
                        setSelectedModel(activeModel.name);
                    } else {
                        // No active model found, auto-load the first one
                        const first = data[0].name;
                        setSelectedModel(first);
                        handleModelChange({ target: { value: first } });
                    }
                }
            })
            .catch(err => console.error("Failed to load models:", err));

        // Ensure prediction is off on mount/unmount
        return () => togglePrediction(false);
    }, [pickComputerMove]);

    const handleModelChange = async (e) => {
        const name = e.target.value;
        setSelectedModel(name);
        // Load model on backend
        try {
            const res = await fetch('/api/models/emg/load', {
                method: 'POST',
                body: JSON.stringify({ model_name: name }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) {
                const err = await res.json();
                console.error("Failed to switch model:", err);
            } else {
                console.log("Model switched successfully to:", name);
            }
        } catch (err) {
            console.error("Failed to switch model (network):", err);
        }
    };

    // Event Log State
    const [eventLogs, setEventLogs] = useState([]);
    const [currentPrediction, setCurrentPrediction] = useState('REST');

    // -------------------------------------------------------------
    // EVENT LOGGING (runs ONLY when wsEvent changes to prevent double logs)
    // -------------------------------------------------------------
    useEffect(() => {
        if (!wsEvent) return;

        // Unified Real-time prediction handling
        if (wsEvent.event === 'emg_prediction') {
            setCurrentPrediction(String(wsEvent.label || 'REST').toUpperCase());
            return;
        }

        const eventName = String(wsEvent.event || '').toUpperCase();
        if (!eventName || eventName.trim() === '' || eventName === 'UNKNOWN_EVENT') return;

        // Log game-critical events (moves)
        if (eventName !== 'REST' && MOVES.includes(eventName)) {
            setEventLogs(prev => [{
                id: Date.now() + Math.random(),
                time: new Date().toLocaleTimeString(),
                name: eventName,
                channel: wsEvent.channel
            }, ...prev].slice(0, 15));
        }
    }, [wsEvent]);

    // -------------------------------------------------------------
    // GAME LOGIC (Handle Event via Prop only if NOT in manual mode)
    // -------------------------------------------------------------
    useEffect(() => {
        if (!wsEvent || manualMode) return;

        const eventName = String(wsEvent.event || '').toUpperCase();

        // Check for Auto-Restart Logic (Waiting for Rest)
        if (gameState === 'waiting_for_rest') {
            if (eventName === 'REST') {
                setGameState('waiting');
            }
            return;
        }

        // Check if we are in waiting state
        if (gameState !== 'waiting' || processingRef.current || !eventName || eventName.trim() === '') return;

        // Filter for RPS events
        if (MOVES.includes(eventName)) {
            handlePlayerMove(eventName);
        }
    }, [wsEvent, gameState, manualMode]);

    const handlePlayerMove = (pMove) => {
        // prevent double-processing
        if (processingRef.current) return;
        processingRef.current = true;
        const cMove = computerMoveRef.current || MOVES[Math.floor(Math.random() * MOVES.length)];

        setPlayerMove(pMove);
        setComputerMove(cMove); // Ensure it's set in state for rendering

        determineWinner(pMove, cMove);
        setGameState('revealed');

        // Auto reset after 3 seconds
        let count = 3;
        setCountdown(count);
        const interval = setInterval(() => {
            count--;
            setCountdown(count);
            if (count <= 0) {
                clearInterval(interval);
                resetGame();
            }
        }, 1000);
    };

    // Manual UI helpers
    const onManualMove = (move) => {
        // Only allow when waiting and not currently processing
        if (gameState !== 'waiting' || processingRef.current) return;
        handlePlayerMove(move);
    };

    const toggleManualMode = () => {
        // switching modes won't reset the current round, but will ignore WS events when manual
        setManualMode((v) => !v);
    };

    // Keyboard handling: map R / P / S to moves when in manual mode
    useEffect(() => {
        const onKeyDown = (ev) => {
            if (!manualMode) return;
            const k = ev.key.toLowerCase();
            if (k === 'r') onManualMove('ROCK');
            if (k === 'p') onManualMove('PAPER');
            if (k === 's') onManualMove('SCISSORS');
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [manualMode, gameState]);

    const determineWinner = (p, c) => {
        if (p === c) {
            setResult('TIE');
        } else if (WIN_CONDITIONS[p] === c) {
            setResult('WIN');
            setScore(prev => ({ ...prev, player: prev.player + 1 }));
        } else {
            setResult('LOSE');
            setScore(prev => ({ ...prev, computer: prev.computer + 1 }));
        }
    };

    // Helper for rendering card
    const renderCard = (type, move, revealed = true) => {
        const isWinner = result === 'WIN' && type === 'player' || result === 'LOSE' && type === 'computer';
        const isLoser = result === 'LOSE' && type === 'player' || result === 'WIN' && type === 'computer';

        let boxClass = 'card-box';
        if (revealed && result) {
            if (isWinner) boxClass += ' winner';
            if (isLoser) boxClass += ' loser';
        } else if (type === 'computer' && !revealed) {
            // active state?
        }

        return (
            <div className={boxClass}>
                <div className="card-label">{type === 'player' ? 'YOU' : 'COMPUTER'}</div>
                {revealed && move ? (
                    <MoveImage move={move} assetType={assetType} type={type} />
                ) : (
                    <div className="card-placeholder">?</div>
                )}
            </div>
        );
    };

    const handlePlay = () => {
        setGameState('waiting');
        pickComputerMove();
        // Enable prediction only if not in manual mode
        if (!manualMode) {
            togglePrediction(true);
        }
    };

    return (
        <div className="rps-container overflow-hidden relative">
            <div className="rps-main">
                {/* Absolute positioning for Title, Scoreboard, and Controls to float them at the top */}
                <div className="absolute top-8 left-8 right-8 flex justify-between items-start z-20 pointer-events-none">
                    {/* Left side: elements must have pointer-events-auto to be clickable */}
                    <div className="flex flex-col gap-4 pointer-events-auto">
                        <div className="rps-title" style={{ marginBottom: 0 }}>NEURO RPS</div>

                        <div className="top-controls flex flex-wrap" style={{ marginLeft: 0 }}>
                            <div className="flex items-center gap-2 bg-surface rounded px-2 py-1 border border-white/10 ml-2">
                                <BrainCircuit size={16} className="text-primary" />
                                <div className="w-40">
                                    <CustomSelect
                                        value={selectedModel}
                                        onChange={(val) => handleModelChange({ target: { value: val } })}
                                        options={models.map(m => ({ value: m.name, label: m.name }))}
                                        placeholder="Select Model"
                                        className="border-none bg-transparent"
                                    />
                                </div>
                            </div>
                            <div className="w-32">
                                <CustomSelect
                                    value={difficulty}
                                    onChange={setDifficulty}
                                    options={[
                                        { value: 'low', label: 'Low' },
                                        { value: 'moderate', label: 'Moderate' },
                                        { value: 'high', label: 'High' }
                                    ]}
                                    placeholder="Difficulty"
                                />
                            </div>

                            <button className={`mode-btn ${manualMode ? 'active' : ''}`} onClick={toggleManualMode} title="Toggle manual mode">
                                {manualMode ? 'Manual' : 'Auto'}
                            </button>
                            <button
                                className="flex items-center justify-center p-2 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors ml-2"
                                onClick={() => setAssetType(prev => prev === 'set1' ? 'set2' : prev === 'set2' ? 'emoji' : 'set1')}
                                title="Toggle Asset Type"
                            >
                                <ImageIcon size={18} className="text-muted hover:text-white transition-colors" />
                            </button>
                        </div>

                        {gameState !== 'waiting' && result && (
                            <div className="result-overlay-side animate-in slide-in-from-left duration-500">
                                <div className={`result-text-side ${result.toLowerCase()}`}>
                                    {result === 'TIE' ? (
                                        <>IT'S A<br />TIE</>
                                    ) : (
                                        <>YOU<br />{result}!</>
                                    )}
                                </div>
                                <div className="text-muted mt-2 font-mono tracking-widest text-lg">
                                    RESETTING IN {countdown}...
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Center Scoreboard using margin auto and position absolute inside the flex container */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-0 pointer-events-auto">
                        <div className="scoreboard" style={{ position: 'relative', transform: 'none', left: 'auto', top: 'auto' }}>
                            <div>Player: <strong>{score.player}</strong></div>
                            <div>Computer: <strong>{score.computer}</strong></div>
                        </div>
                    </div>
                </div>

                <div className="rps-main">
                    {/* Status Text and Play Button shifted down */}
                    <div className="status-text mt-8" style={{ minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
                        {gameState === 'idle' ? (
                            <button
                                onClick={handlePlay}
                                className="px-8 py-2 bg-primary text-primary-contrast rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform animate-in zoom-in duration-300"
                            >
                                PLAY
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    setGameState('idle');
                                    togglePrediction(false);
                                }}
                                className="px-6 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform animate-in zoom-in duration-300"
                            >
                                STOP
                            </button>
                        )}

                        {gameState === 'waiting' && !manualMode && (
                            <span className="pulse">
                                {currentPrediction === 'REST' || currentPrediction === 'UNKNOWN'
                                    ? "Waiting for Player Gesture..."
                                    : "Recording Gesture..."}
                            </span>
                        )}
                        {gameState === 'waiting_for_rest' && !manualMode && <span className="animate-pulse text-yellow-400">Release Gesture...</span>}
                        {gameState === 'waiting' && manualMode && <span className="pulse">Manual Mode: press <strong>R</strong>/<strong>P</strong>/<strong>S</strong></span>}
                        {gameState !== 'waiting' && gameState !== 'waiting_for_rest' && gameState !== 'idle' && <span>Result Received</span>}
                    </div>

                    <div className="cards-row">
                        {renderCard('player', playerMove, !!playerMove)}

                        <div className="vs-badge">VS</div>

                        {/* Computer hidden until revealed */}
                        {renderCard('computer', computerMove, gameState !== 'waiting')}
                    </div>

                </div>
            </div>

            <div className="rps-sidebar">
                {/* Event Log Panel */}
                <div className="w-full h-full flex flex-col bg-surface/80 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl">
                    <div className="text-sm font-bold text-muted uppercase tracking-wider mb-4 flex justify-between items-center pb-3 border-b border-white/10 flex-shrink-0">
                        <span>Event Log</span>
                        <span className="text-[11px] opacity-60">Last 15 events</span>
                    </div>
                    <div className="space-y-2 font-mono text-sm overflow-y-auto flex-1 pr-2 custom-scrollbar">
                        {eventLogs.length === 0 ? (
                            <div className="text-muted/50 italic py-4 text-center">No events received yet...</div>
                        ) : (
                            eventLogs.map((log) => (
                                <div key={log.id} className="flex gap-4 py-2 border-b border-white/5 last:border-0 hover:bg-white/5 px-3 rounded text-base">
                                    <span className="text-muted">{log.time}</span>
                                    <span className={`font-bold ${log.name === 'ROCK' ? 'text-amber-400' :
                                        log.name === 'PAPER' ? 'text-blue-400' :
                                            log.name === 'SCISSORS' ? 'text-pink-400' : 'text-text'
                                        }`}>
                                        {log.name}
                                    </span>
                                    <span className="text-muted ml-auto text-xs">{log.channel}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RPSGame;
