import React from 'react';
import { CheckCircle, AlertTriangle, X, RotateCcw, TrendingUp, Shield, BarChart2 } from 'lucide-react';

function ScoreBadge({ score }) {
    const color =
        score >= 75 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
        score >= 50 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' :
                     'text-red-400 bg-red-500/10 border-red-500/30';
    return (
        <span className={`px-3 py-1 rounded-full font-mono font-black text-2xl border ${color}`}>
            {score}
        </span>
    );
}

function MetricCard({ icon: Icon, label, score, description }) {
    const pct = Math.round(score * 100);
    const barColor =
        pct >= 70 ? 'bg-emerald-500' :
        pct >= 45 ? 'bg-yellow-500' :
                   'bg-red-500';
    return (
        <div className="flex flex-col gap-1.5 p-3 bg-bg rounded-xl border border-border">
            <div className="flex items-center gap-2">
                <Icon size={16} className="text-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
                <span className="ml-auto font-mono font-bold text-sm text-white">{pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
                <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-muted">{description}</p>
        </div>
    );
}

export default function CalibrationReport({ report, onClose, onRecalibrate }) {
    if (!report) return null;

    const {
        overall_score = 0,
        rest_stability_score = 0,
        gesture_strength_score = 0,
        class_balance_score = 0,
        windows_per_class = {},
        drift_from_training_pct = null,
        recommendations = [],
    } = report;

    const headerColor =
        overall_score >= 75 ? 'text-emerald-400' :
        overall_score >= 50 ? 'text-yellow-400' :
                              'text-red-400';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col relative">

                {/* Header */}
                <div className="px-5 py-4 border-b border-border bg-bg/50 flex items-center gap-3">
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${overall_score >= 60 ? 'bg-emerald-500/20' : 'bg-yellow-500/20'}`}>
                        {overall_score >= 60
                            ? <CheckCircle size={22} className="text-emerald-400" />
                            : <AlertTriangle size={22} className="text-yellow-400" />
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-black text-white text-base">Calibration Report</h2>
                        <p className="text-[11px] text-muted">Runtime normalization applied</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ScoreBadge score={overall_score} />
                        <button onClick={onClose} className="p-1 text-muted hover:text-white transition-colors ml-1">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[70vh] no-scrollbar">

                    {/* Metric cards */}
                    <div className="grid grid-cols-1 gap-2">
                        <MetricCard
                            icon={Shield}
                            label="REST Stability"
                            score={rest_stability_score}
                            description="How consistent REST windows were. Higher = less noise at rest."
                        />
                        <MetricCard
                            icon={TrendingUp}
                            label="Gesture Strength"
                            score={gesture_strength_score}
                            description="Signal contrast between REST and gestures. Higher = clearer signal."
                        />
                        <MetricCard
                            icon={BarChart2}
                            label="Class Balance"
                            score={class_balance_score}
                            description="Even distribution of samples across gesture classes."
                        />
                    </div>

                    {/* Windows per class table */}
                    {Object.keys(windows_per_class).length > 0 && (
                        <div className="rounded-xl border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-bg/70 border-b border-border">
                                        <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">Class</th>
                                        <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">Windows</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(windows_per_class).map(([label, count]) => (
                                        <tr key={label} className="border-b border-border/50 last:border-0">
                                            <td className="px-3 py-2 font-mono text-xs text-text">{label}</td>
                                            <td className="px-3 py-2 font-mono text-xs text-primary text-right">{count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Drift info */}
                    {drift_from_training_pct !== null && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border ${
                            drift_from_training_pct > 50
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-surface border-border text-muted'
                        }`}>
                            <TrendingUp size={14} className="shrink-0" />
                            REST drift from training: <span className="ml-1 font-mono">{drift_from_training_pct}%</span>
                        </div>
                    )}

                    {/* Recommendations */}
                    {recommendations.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Recommendations</p>
                            {recommendations.map((rec, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-text bg-bg rounded-lg px-3 py-2 border border-border">
                                    <span className="text-primary mt-0.5 shrink-0">•</span>
                                    {rec}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-border bg-bg/50 flex gap-2">
                    <button
                        onClick={onRecalibrate}
                        className="flex items-center gap-1.5 px-4 py-2 bg-bg border border-border text-muted rounded-xl font-bold text-xs hover:text-white hover:border-primary/50 transition-all"
                    >
                        <RotateCcw size={13} /> Re-Calibrate
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 bg-primary text-primary-contrast rounded-xl font-bold text-sm hover:opacity-90 transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
