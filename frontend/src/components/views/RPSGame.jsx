import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrainCircuit, Activity, ImageIcon, Menu, ChevronLeft, Gamepad2, Settings, History, ScrollText, Zap, Trophy } from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';
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

const MoveImage = ({ move, assetType, type, onImageError, globalFallbackMode }) => {
    const [localError, setLocalError] = useState(false);

    useEffect(() => {
        setLocalError(false);
    }, [move, assetType]);

    const handleError = () => {
        setLocalError(true);
        if (onImageError) {
            onImageError();
        }
    };

    if (assetType === 'emoji' || localError || globalFallbackMode) {
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
                onError={handleError}
            />
        </div>
    );
};

const RPSGame = ({ wsEvent }) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
    const [globalFallbackMode, setGlobalFallbackMode] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Difficulty for computer move randomness: 'low' (repeats sometimes), 'moderate' (avoid repeats), 'high' (fully random)
    const [difficulty, setDifficulty] = useState('moderate');

    // Models
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');

    // Stats
    const [score, setScore] = useState({ player: 0, computer: 0 });
    const [matchWinner, setMatchWinner] = useState(null);

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
        fetch(`${API_BASE_URL}/api/emg/predict/${active ? 'start' : 'stop'}`, { method: 'POST' })
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

    const resetMatch = useCallback(() => {
        setScore({ player: 0, computer: 0 });
        setMatchWinner(null);
        setPlayerMove(null);
        setResult(null);
        processingRef.current = false;
        pickComputerMove();
        setGameState('idle');
        togglePrediction(false);
    }, [pickComputerMove]);

    // Connect on mount
    useEffect(() => {
        pickComputerMove();

        // Fetch models
        fetch(`${API_BASE_URL}/api/models/emg`)
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
            const res = await fetch(`${API_BASE_URL}/api/models/emg/load`, {
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
        // prevent double-processing or moving if match is over
        if (processingRef.current || matchWinner) return;
        processingRef.current = true;
        const cMove = computerMoveRef.current || MOVES[Math.floor(Math.random() * MOVES.length)];

        setPlayerMove(pMove);
        setComputerMove(cMove); // Ensure it's set in state for rendering
        soundHandler.playRPSMove(); // Play sound on move selection

        const matchEnded = determineWinner(pMove, cMove);
        
        if (matchEnded) {
            setGameState('match_over');
            togglePrediction(false); // Disable gesture recognition if game over
            return; // Skip auto reset to let them see the celebration
        }

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
        if (gameState !== 'waiting' || processingRef.current || matchWinner) return;
        handlePlayerMove(move);
    };

    const toggleManualMode = () => {
        // switching modes won't reset the current round, but will ignore WS events when manual
        setManualMode((v) => !v);
    };

    // Keyboard handling: map R / P / S to moves when in manual mode
    useEffect(() => {
        const onKeyDown = (ev) => {
            if (!manualMode || matchWinner) return;
            const k = ev.key.toLowerCase();
            if (k === 'r') onManualMove('ROCK');
            if (k === 'p') onManualMove('PAPER');
            if (k === 's') onManualMove('SCISSORS');
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [manualMode, gameState, matchWinner]);

    const determineWinner = (p, c) => {
        let endMatch = false;
        if (p === c) {
            setResult('TIE');
            soundHandler.playRPSMove(); // Play sound for tie
        } else if (WIN_CONDITIONS[p] === c) {
            setResult('WIN');
            setScore(prev => {
                const newScore = prev.player + 1;
                if (newScore >= 5) setMatchWinner('player');
                return { ...prev, player: newScore };
            });
            if (score.player + 1 >= 5) endMatch = true;
            soundHandler.playRPSWin(); // Play sound for win
        } else {
            setResult('LOSE');
            setScore(prev => {
                const newScore = prev.computer + 1;
                if (newScore >= 5) setMatchWinner('computer');
                return { ...prev, computer: newScore };
            });
            if (score.computer + 1 >= 5) endMatch = true;
            soundHandler.playRPSLose(); // Play sound for lose
        }
        return endMatch;
    };

    // Helper for rendering card
    const renderCard = (type, move, revealed = true) => {
        const isWinner = result === 'WIN' && type === 'player' || result === 'LOSE' && type === 'computer';
        const isLoser = result === 'LOSE' && type === 'player' || result === 'WIN' && type === 'computer';

        let boxClass = 'card-box relative transition-shadow duration-300';
        
        if (revealed && result) {
            if (isWinner) {
                boxClass += ' winner shadow-[0_0_35px_rgba(16,185,129,0.5)] border-green-500/50';
            } else if (isLoser) {
                boxClass += ' loser shadow-[0_0_35px_rgba(239,68,68,0.5)] border-red-500/50';
            } else {
                // TIE
                boxClass += ' shadow-[0_0_30px_rgba(0,243,255,0.3)] border-primary/40';
            }
        } else {
            // Reset / Idle state
            boxClass += ' shadow-[0_0_30px_rgba(0,243,255,0.3)] border-primary/40';
        }

        if (type === 'computer' && !revealed) {
            // active state?
        }

        return (
            <div className={boxClass}>
                <div className="card-label">{type === 'player' ? 'YOU' : 'COMPUTER'}</div>
                {revealed && move ? (
                    <MoveImage
                        move={move}
                        assetType={assetType}
                        type={type}
                        onImageError={() => setGlobalFallbackMode(true)}
                        globalFallbackMode={globalFallbackMode}
                    />
                ) : (
                    <div className="card-placeholder">?</div>
                )}
            </div>
        );
    };

    const handlePlay = () => {
        setGameState('waiting');
        pickComputerMove();
        soundHandler.playRPSStart(); // Play sound on game start
        // Enable prediction only if not in manual mode
        if (!manualMode) {
            togglePrediction(true);
        }
    };

    return (
        <div className="rps-container overflow-hidden pt-[94px] pb-[35px] relative h-full flex flex-row-reverse w-full">
            
            {/* Main Game Area */}
            <div className="flex-1 flex flex-col items-center justify-start h-full overflow-hidden w-full relative">
                
                {/* Header (Title, Scoreboard) */}
                <div className="rps-header flex items-start justify-between w-full px-4 md:px-8 py-2 md:py-4 z-20 shrink-0 relative">
                    {/* Title on left */}
                    <div className="rps-title m-0 text-3xl md:text-4xl text-left w-1/3">NEURO RPS</div>
                    
                    {/* Centered Scoreboard */}
                    <div className="scoreboard-container flex flex-col items-center pt-2 absolute left-1/2 -translate-x-1/2 pointer-events-none">
                        <div className="scoreboard transform-none left-auto top-auto pointer-events-auto" style={{ margin: 0 }}>
                            <div>Player: <strong>{score.player}</strong></div>
                            <div>Computer: <strong>{score.computer}</strong></div>
                        </div>
                        {gameState !== 'waiting' && result && (
                            <div className="mt-2 text-center animate-in slide-in-from-top duration-300">
                                 <div className="text-muted font-mono tracking-widest text-sm md:text-lg">
                                     RESETTING IN {countdown}...
                                 </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Right spacer for balance */}
                    <div className="w-1/3"></div>
                </div>

                {/* Arena */}
                <div className="rps-arena flex-1 flex flex-col items-center justify-center relative w-full px-4 overflow-hidden md:mb-8">
                    
                    {/* Celebration Overlay */}
                    {matchWinner && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-500">
                            <div className="flex flex-col items-center p-8 bg-surface border border-primary/50 rounded-2xl shadow-[0_0_50px_rgba(0,243,255,0.3)] animate-in zoom-in duration-700 delay-150">
                                <Trophy size={64} className={`mb-4 ${matchWinner === 'player' ? 'text-green-400' : 'text-red-400'} animate-bounce`} />
                                <h2 className="text-4xl md:text-5xl font-black mb-2 uppercase tracking-widest text-center" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                                    {matchWinner === 'player' ? 'You Win!' : 'Computer Wins!'}
                                </h2>
                                <p className="text-muted text-lg font-mono mb-8 uppercase tracking-widest">Match Over</p>
                                <button
                                    onClick={resetMatch}
                                    className="px-8 py-3 bg-primary text-primary-contrast rounded-xl font-bold text-xl shadow-[0_0_20px_rgba(0,243,255,0.4)] hover:scale-105 transition-transform"
                                >
                                    Play Again
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="status-text shrink-0" style={{ minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                        {gameState === 'idle' ? (
                            <button
                                onClick={handlePlay}
                                className="px-6 md:px-8 py-2 bg-primary text-primary-contrast rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform animate-in zoom-in duration-300"
                            >
                                PLAY
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    setGameState('idle');
                                    togglePrediction(false);
                                }}
                                className="px-4 md:px-6 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform animate-in zoom-in duration-300"
                            >
                                STOP
                            </button>
                        )}

                        {gameState === 'waiting' && !manualMode && (
                            <span className="pulse text-sm md:text-base">
                                {currentPrediction === 'REST' || currentPrediction === 'UNKNOWN'
                                    ? "Waiting for Gesture"
                                    : "Recording..."}
                            </span>
                        )}
                        {gameState === 'waiting_for_rest' && !manualMode && <span className="animate-pulse text-yellow-400 text-sm md:text-base">Release Gesture...</span>}
                        {gameState === 'waiting' && manualMode && <span className="pulse text-sm md:text-base">Manual Mode: press <strong>R</strong>/<strong>P</strong>/<strong>S</strong></span>}
                        {gameState !== 'waiting' && gameState !== 'waiting_for_rest' && gameState !== 'idle' && (
                            <span className="animate-in fade-in zoom-in duration-300 text-sm md:text-base">
                                {result === 'TIE' ? "IT'S A TIE" : `YOU ${result}!`}
                            </span>
                        )}
                    </div>

                    <div className="cards-row flex flex-row items-center justify-center gap-2 md:gap-12 w-full mt-4 md:mt-12 shrink-0">
                        {renderCard('player', playerMove, !!playerMove)}
                        <div className="vs-badge shrink-0">VS</div>
                        {renderCard('computer', computerMove, gameState !== 'waiting')}
                    </div>
                </div>
            </div>

            {/* Left Sidebar Container */}
            <div className={`transition-all duration-300 ease-in-out border-r border-border bg-surface/80 backdrop-blur-md flex flex-col h-full relative ${!isSidebarCollapsed ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.5rem] overflow-visible'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}>
                
                {/* Collapsed State Icons */}
                {isSidebarCollapsed && (
                    <div className="flex flex-col items-center gap-6 mt-4 w-full animate-fade-in shrink-0 h-full">
                        <button onClick={() => setIsSidebarCollapsed(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors mb-2" title="Expand Sidebar">
                            <Menu size={24} className="text-primary" />
                        </button>
                        <Gamepad2 size={24} className="text-primary animate-pulse" title="RPS Game Setup" />

                        <button onClick={() => setIsSidebarCollapsed(false)} title="Model Settings" className="hover:text-primary transition-colors group relative mt-2">
                            <BrainCircuit size={20} className="text-muted group-hover:text-primary" />
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Model Settings</div>
                        </button>

                        <button onClick={() => setIsSidebarCollapsed(false)} title="Visual Options" className="hover:text-primary transition-colors group relative mt-2">
                            <ImageIcon size={20} className="text-muted group-hover:text-primary" />
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Visual Options</div>
                        </button>

                        <button onClick={() => setIsSidebarCollapsed(false)} title="Event Log" className="hover:text-primary transition-colors group relative mt-2">
                            <History size={20} className="text-muted group-hover:text-primary" />
                            {eventLogs.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse blur-[1px]"></span>}
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Event Log</div>
                        </button>
                    </div>
                )}

                {/* Expanded Container */}
                <div className={`flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 min-w-[320px] w-80 shrink-0 ${isSidebarCollapsed ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between shrink-0 mb-2">
                        <div>
                            <h2 className="text-2xl font-bold text-text mb-1 flex items-center gap-3">
                                <Gamepad2 size={28} className="text-primary animate-pulse" />
                                <span style={{ letterSpacing: '2.3px' }}>Controls</span>
                            </h2>
                            <p className="text-xs text-muted">RPS Settings</p>
                        </div>
                        <button
                            onClick={() => setIsSidebarCollapsed(true)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="Collapse Sidebar"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    </div>

                    {/* Model Settings */}
                    <div className="flex flex-col gap-3 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50 mt-2">
                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-2 mb-1">
                                <BrainCircuit size={16} className="text-primary" /> AI Model
                            </label>
                            <CustomSelect
                                value={selectedModel}
                                onChange={(val) => handleModelChange({ target: { value: val } })}
                                options={models.map(m => ({ value: m.name, label: m.name }))}
                                placeholder="Select Model"
                            />
                        </div>
                        <div className="flex flex-col space-y-2 pt-3 border-t border-border/30">
                            <label className="text-sm font-bold text-muted uppercase tracking-widest mb-1 flex items-center gap-2">
                                <Settings size={16} /> Computer Level
                            </label>
                            <CustomSelect
                                value={difficulty}
                                onChange={setDifficulty}
                                options={[
                                    { value: 'low', label: 'Low Prediction' },
                                    { value: 'moderate', label: 'Balanced' },
                                    { value: 'high', label: 'Highly Random' }
                                ]}
                                placeholder="Difficulty"
                            />
                        </div>
                    </div>

                    {/* Visual & Modes */}
                    <div className="flex flex-col gap-3 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                                <Activity size={16} /> Input Mode
                            </label>
                            <button className={`mode-btn ${manualMode ? 'active' : ''}`} onClick={toggleManualMode} title="Toggle manual mode">
                                {manualMode ? 'Manual' : 'Sensor'}
                            </button>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-border/30">
                            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                                <ImageIcon size={16} /> Assets
                            </label>
                            <button
                                className="flex items-center justify-center px-3 py-1.5 rounded-lg bg-surface border border-border hover:bg-white/10 transition-colors shadow-sm"
                                onClick={() => {
                                    setAssetType(prev => prev === 'set1' ? 'set2' : 'set1');
                                    setGlobalFallbackMode(false);
                                    soundHandler.playRPSWarp();
                                }}
                                title="Toggle Asset Type"
                            >
                                <span className="text-xs font-bold text-primary mr-2 uppercase tracking-wide">
                                    {assetType === 'set1' ? 'Classic' : 'Variant'}
                                </span>
                                <ImageIcon size={16} className="text-primary" />
                            </button>
                        </div>
                    </div>

                    {/* Match Controls */}
                    <button
                        onClick={resetMatch}
                        className="flex items-center justify-center gap-2 w-full py-3 mt-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-bold uppercase tracking-widest hover:bg-red-500/20 hover:border-red-500/50 transition-all shrink-0"
                    >
                        Reset Match
                    </button>

                    {/* Event Log */}
                    <div className="flex flex-col flex-grow min-h-[0] border border-border/50 rounded-xl bg-bg/10 mt-2 p-1">
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center pb-2 border-b border-white/10 px-3 pt-2 shrink-0">
                                <span className="flex items-center gap-2"><History size={14} /> Log History</span>
                                <span className="text-[10px] opacity-60">Last 15</span>
                            </div>
                            <div className="space-y-1 font-mono text-xs overflow-y-auto flex-1 px-3 pb-2 custom-scrollbar">
                                {eventLogs.length === 0 ? (
                                    <div className="text-muted/50 italic py-2 text-center">Awaiting data...</div>
                                ) : (
                                    eventLogs.map((log) => (
                                        <div key={log.id} className="flex flex-col justify-center py-1.5 border-b border-lightest/5 last:border-0 hover:bg-white/5 px-2 rounded group">
                                            <div className="flex justify-between items-center w-full">
                                                <span className={`font-bold ${log.name === 'ROCK' ? 'text-amber-400' :
                                                    log.name === 'PAPER' ? 'text-blue-400' :
                                                        log.name === 'SCISSORS' ? 'text-pink-400' : 'text-text'
                                                    }`}>
                                                    {log.name}
                                                </span>
                                                <span className="text-muted text-[10px] group-hover:text-white/60 transition-colors">{log.time}</span>
                                            </div>
                                            <span className="text-muted/40 text-[9px] truncate">{log.channel || 'System Event'}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default RPSGame;
