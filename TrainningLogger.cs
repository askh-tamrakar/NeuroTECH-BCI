using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Linq;
using static SnakeGameAI.Snake_Game;

namespace SnakeGameAI {

    /// <summary>
    /// Professional-grade logging system for Snake AI training
    /// Tracks generation metrics, population statistics, and genome lifecycle data
    /// Outputs: session logs, CSV metrics, genome data, detailed reports, training summary
    /// </summary>
    public static class TrainingLogger {
        #region PRIVATE FIELDS

        private static Population population => Program.population;

        private static string logDirectory = null!;
        private static string currentSessionLog = "";
        private static string metricsLog = "";
        private static string errorLog = "";
        private static string genomeLog = "";
        private static bool isInitialized = false;

        private static DateTime sessionStartTime;
        private static string sessionId = "";

        private static List<GenerationMetrics> generationHistory = new();
        private static List<GenomeLifecycle> genomeLifecycles = new();

        #endregion

        #region DATA CLASSES

        /// <summary>
        /// Generation-level performance metrics
        /// </summary>
        public class GenerationMetrics {
            public int Generation { get; set; }
            public DateTime Timestamp { get; set; }
            public double BestFitness { get; set; }
            public double AverageFitness { get; set; }
            public double SmoothFitness { get; set; }
            public double MedianFitness { get; set; }
            public int BestScore { get; set; }
            public double AverageScore { get; set; }
            public int AliveCount { get; set; }
            public double MutationRate { get; set; }
            public int EliteCount { get; set; }
            public string BestGenomeID { get; set; } = "";
            public double DiversityScore { get; set; }
            public TimeSpan GenerationDuration { get; set; }
            public int MaxStepsSurvived { get; set; }
            public int AvgStepsSurvived { get; set; }
            public double FitnessImprovement { get; set; }
            public int GensSinceImprovement { get; set; }
        }

        /// <summary>
        /// Individual genome lifecycle and performance data
        /// </summary>
        public class GenomeLifecycle {
            public int Generation { get; set; }
            public string GenomeID { get; set; } = "";
            public int StepsSurvived { get; set; }
            public int Score { get; set; }
            public double Fitness { get; set; }
            public string CauseOfDeath { get; set; } = "";
            public int FoodEaten { get; set; }
            public double AvgStepsPerFood { get; set; }
            public int MaxSnakeLength { get; set; }
            public bool AddedToBestList { get; set; }
        }

        #endregion

        #region INITIALIZATION

        /// <summary>
        /// Initialize the logging system and create necessary directories/files
        /// </summary>
        public static void Initialize() {
            Console.OutputEncoding = Encoding.UTF8;
            if(isInitialized)
                return;

            sessionStartTime = DateTime.Now;
            sessionId = sessionStartTime.ToString("dd-MM-yyyy_HH.mm.ss");
            logDirectory = Path.Combine("Logs", $"SnakeAI_{sessionId}");

            if(!Directory.Exists(logDirectory)) {
                Directory.CreateDirectory(logDirectory);
            }

            currentSessionLog = Path.Combine(logDirectory, $"session_SnakeAI_{sessionId}.log");
            metricsLog = Path.Combine(logDirectory, $"metrics_SnakeAI_{sessionId}.csv");
            genomeLog = Path.Combine(logDirectory, $"genomes_SnakeAI_{sessionId}.csv");
            errorLog = Path.Combine(logDirectory, "errors.log");

            WriteSessionHeader();
            InitializeMetricsCSV();
            InitializeGenomeCSV();

            isInitialized = true;

            Log("═══════════════════════════════════════════════════════════════");
            Log("TRAINING LOGGER INITIALIZED");
            Log("═══════════════════════════════════════════════════════════════");
            Log($"Session ID: {sessionId}");
            Log($"Log Directory: {Path.GetFullPath(logDirectory)}");
            Log($"Session Log: {Path.GetFileName(currentSessionLog)}");
            Log($"Metrics CSV: {Path.GetFileName(metricsLog)}");
            Log($"Genomes CSV: {Path.GetFileName(genomeLog)}");
            Log("═══════════════════════════════════════════════════════════════\n");
        }

        #endregion

        #region FILE OPERATIONS

        /// <summary>
        /// Write comprehensive session header with system and configuration details
        /// </summary>
        private static void WriteSessionHeader() {
            var sb = new StringBuilder();
            sb.AppendLine("╔═══════════════════════════════════════════════════════════════╗");
            sb.AppendLine("║       SNAKE AI NEUROEVOLUTION - TRAINING SESSION LOG           ║");
            sb.AppendLine("╚═══════════════════════════════════════════════════════════════╝");
            sb.AppendLine();
            sb.AppendLine($"Session Started: {sessionStartTime:yyyy-MM-dd HH:mm:ss}");
            sb.AppendLine($"Session ID: {sessionId}");
            sb.AppendLine();
            sb.AppendLine("━━━ SYSTEM CONFIGURATION ━━━");
            sb.AppendLine($"OS: {Environment.OSVersion}");
            sb.AppendLine($".NET Version: {Environment.Version}");
            sb.AppendLine($"Processor Count: {Environment.ProcessorCount}");
            sb.AppendLine($"Working Directory: {Environment.CurrentDirectory}");
            sb.AppendLine();
            sb.AppendLine("━━━ HYPERPARAMETERS ━━━");
            sb.AppendLine($"Population Size: {Program.population?.Genomes.Count ?? 0}");
            sb.AppendLine($"Network Architecture: {string.Join("-", Program.layerSizes)}");
            sb.AppendLine($"Mutation Rate: {Program.population?.GetMutationRate() ?? 0:F4}");
            sb.AppendLine($"Ghost Mode: {Program.isGhostMode}");
            sb.AppendLine();
            sb.AppendLine("╔═══════════════════════════════════════════════════════════════╗\n");

            File.WriteAllText(currentSessionLog, sb.ToString(), Encoding.UTF8);
        }

        /// <summary>
        /// Initialize metrics CSV with properly aligned headers
        /// </summary>
        private static void InitializeMetricsCSV() {
            var headers = new[] {
                "Generation",
                "Timestamp",
                "BestFitness",
                "AvgFitness",
                "SmoothFitness",
                "MedianFitness",
                "BestScore",
                "AvgScore",
                "AliveCount",
                "MutationRate",
                "EliteCount",
                "BestGenomeID",
                "DiversityScore",
                "GenDuration_ms",
                "MaxStepsSurvived",
                "AvgStepsSurvived",
                "FitnessImprovement",
                "GensSinceImprovement"
            };
            File.WriteAllText(metricsLog, string.Join(",", headers) + "\n", Encoding.UTF8);
        }

        /// <summary>
        /// Initialize genome CSV with aligned headers
        /// </summary>
        private static void InitializeGenomeCSV() {
            var headers = new[] {
                "Generation",
                "GenomeID",
                "StepsSurvived",
                "Score",
                "FoodEaten",
                "Fitness",
                "CauseOfDeath",
                "AvgStepsPerFood",
                "MaxSnakeLength",
                "AddedToBestList"
            };
            File.WriteAllText(genomeLog, string.Join(",", headers) + "\n", Encoding.UTF8);
        }

        #endregion

        #region LOGGING

        /// <summary>
        /// Log message to both console and session log file with timestamp and level
        /// </summary>
        public static void Log(string message, LogLevel level = LogLevel.Info) {
            if(!isInitialized)
                Initialize();

            string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
            string levelStr = level.ToString().ToUpper().PadRight(7);
            string icon = GetLevelIcon(level);
            string logEntry = $"{icon} [{timestamp}] [{levelStr}] {message}";

            Console.WriteLine(logEntry);

            try {
                File.AppendAllText(currentSessionLog, logEntry + "\n", Encoding.UTF8);
            } catch(Exception ex) {
                Console.WriteLine($"ERROR: Failed to write to log file: {ex.Message}");
            }
        }

        /// <summary>
        /// Log error with full exception details and stack trace
        /// </summary>
        public static void LogError(string message, Exception ex = null!) {
            if(!isInitialized)
                Initialize();

            string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
            var sb = new StringBuilder();
            sb.AppendLine($"\n[{timestamp}] ERROR: {message}");

            if(ex != null) {
                sb.AppendLine($"  Exception Type: {ex.GetType().Name}");
                sb.AppendLine($"  Message: {ex.Message}");
                sb.AppendLine($"  Stack Trace:\n{ex.StackTrace}");

                if(ex.InnerException != null) {
                    sb.AppendLine($"  Inner Exception: {ex.InnerException.Message}");
                }
            }

            sb.AppendLine(new string('─', 70));

            try {
                File.AppendAllText(errorLog, sb.ToString(), Encoding.UTF8);
            } catch {
                Console.WriteLine("CRITICAL: Cannot write to error log!");
            }

            Log($"ERROR: {message}", LogLevel.Error);
            if(ex != null) {
                Log($"  Exception: {ex.Message}", LogLevel.Error);
            }
        }

        /// <summary>
        /// Log individual genome death and performance data
        /// </summary>
        public static void LogGenomeDeath(Genome genome, int generation, bool addedToBest = false) {
            if(!isInitialized)
                Initialize();

            if(genome.GenomeID == population.SmartBestGenome.GenomeID)
                addedToBest = true;

            var lifecycle = new GenomeLifecycle {
                Generation = generation,
                GenomeID = genome.GenomeID,
                StepsSurvived = genome.StepsSnapshot,
                Score = genome.Game.updateScore,
                FoodEaten = genome.Game.updateScore,
                Fitness = genome.Fitness,
                CauseOfDeath = genome.Game.causeOfDeath.ToString(),
                MaxSnakeLength = genome.SnakeLength,
                AddedToBestList = addedToBest,
                AvgStepsPerFood = genome.Game.updateScore > 0 ? (double)genome.StepsSnapshot / genome.Game.updateScore : 0
            };

            genomeLifecycles.Add(lifecycle);
            WriteGenomeToCSV(lifecycle);
        }

        #endregion

        #region CSV WRITERS

        /// <summary>
        /// Write genome data row to CSV file
        /// </summary>
        private static void WriteGenomeToCSV(GenomeLifecycle lifecycle) {
            try {
                var values = new[] {
                    lifecycle.Generation.ToString(),
                    lifecycle.GenomeID,
                    lifecycle.StepsSurvived.ToString(),
                    lifecycle.Score.ToString(),
                    lifecycle.FoodEaten.ToString(),
                    lifecycle.Fitness.ToString("F6"),
                    lifecycle.CauseOfDeath,
                    lifecycle.AvgStepsPerFood.ToString("F3"),
                    lifecycle.MaxSnakeLength.ToString(),
                    lifecycle.AddedToBestList.ToString()
                };

                File.AppendAllText(genomeLog, string.Join(",", values) + "\n", Encoding.UTF8);
            } catch(Exception ex) {
                LogError("Failed to write genome to CSV", ex);
            }
        }

        /// <summary>
        /// Write generation metrics row to CSV file
        /// </summary>
        private static void WriteMetricsToCSV(GenerationMetrics metrics) {
            try {
                var values = new[] {
                    metrics.Generation.ToString(),
                    metrics.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                    metrics.BestFitness.ToString("F6"),
                    metrics.AverageFitness.ToString("F6"),
                    metrics.SmoothFitness.ToString("F6"),
                    metrics.MedianFitness.ToString("F6"),
                    metrics.BestScore.ToString(),
                    metrics.AverageScore.ToString(),
                    metrics.AliveCount.ToString(),
                    metrics.MutationRate.ToString("F8"),
                    metrics.EliteCount.ToString(),
                    metrics.BestGenomeID,
                    metrics.DiversityScore.ToString("F2"),
                    metrics.GenerationDuration.TotalMilliseconds.ToString("F0"),
                    metrics.MaxStepsSurvived.ToString(),
                    metrics.AvgStepsSurvived.ToString(),
                    metrics.FitnessImprovement.ToString("F6"),
                    metrics.GensSinceImprovement.ToString()
                };

                File.AppendAllText(metricsLog, string.Join(",", values) + "\n", Encoding.UTF8);
            } catch(Exception ex) {
                LogError("Failed to write metrics to CSV", ex);
            }
        }

        #endregion

        #region GENERATION TRACKING

        /// <summary>
        /// Log generation metrics and performance data
        /// </summary>
        public static void LogGeneration(Population population) {
            if(!isInitialized)
                Initialize();

            var BestGenomeOfCurrentGeneration = population.BestEverGenomeList.Count > 0
                ? population.BestEverGenomeList.Last()
                : population.SmartBestGenome;

            var metrics = new GenerationMetrics {
                Generation = population.Generation,
                Timestamp = DateTime.Now,
                BestFitness = BestGenomeOfCurrentGeneration.Fitness,
                AverageFitness = population.AverageFitness,
                SmoothFitness = population.SmoothedFitnessHistory.Count > 0
                    ? population.SmoothedFitnessHistory.Last()
                    : 0.0,
                MedianFitness = CalculateMedian(population.FitnessHistory),
                BestScore = BestGenomeOfCurrentGeneration.Game.updateScore,
                AverageScore = population.Genomes.Average(g => g.Game.updateScore),
                AliveCount = population.AliveCount,
                MutationRate = population.GetMutationRate(),
                EliteCount = population.EliteCount,
                BestGenomeID = BestGenomeOfCurrentGeneration.GenomeID ?? "N/A",
                DiversityScore = CalculateDiversity(population),
                MaxStepsSurvived = BestGenomeOfCurrentGeneration.StepsSnapshot,
                AvgStepsSurvived = (int)population.Genomes.Average(g => g.StepsSnapshot),
                GensSinceImprovement = population.GenerationSiceImprovement
            };

            if(generationHistory.Count > 0) {
                var prevBest = generationHistory.Last().BestFitness;
                metrics.FitnessImprovement = metrics.BestFitness - prevBest;
            }

            generationHistory.Add(metrics);

            LogGenerationSummary(metrics, population);
            WriteMetricsToCSV(metrics);

            if(metrics.Generation % 10 == 0) {
                WriteDetailedReport(metrics);
            }
        }

        /// <summary>
        /// Write professionally formatted generation summary with auto-centered headers
        /// </summary>
        private static void LogGenerationSummary(GenerationMetrics metrics, Population population) {
            var lines = new List<string> {
                $"║ Time: {metrics.Timestamp:HH:mm:ss}",
                $"║ Best Genome ID: {metrics.BestGenomeID}",
                $"║ Fitness: {metrics.BestFitness:F4} ║ Avg: {metrics.AverageFitness:F4} ║ Median: {metrics.MedianFitness:F4}",
                $"║ Score: {metrics.BestScore} ║ Avg Score: {metrics.AverageScore:F4}",
                $"║ Steps: {metrics.MaxStepsSurvived} ║ Mutation: {metrics.MutationRate:F4}",
                $"║ Diversity: {metrics.DiversityScore:F2}%"
            };

            if(metrics.FitnessImprovement > 0)
                lines.Add($"║ ↑ Improvement: +{metrics.FitnessImprovement:F4}");
            else if(metrics.FitnessImprovement < 0)
                lines.Add($"║ ↓ Decline: {metrics.FitnessImprovement:F4}");

            int eliteCount = population.Genomes.Count / 10;
            int mutatedChildren = population.Genomes.Count - eliteCount;
            var bestGenome = population.BestEverGenome;

            var nextGenLines = new List<string> {
                $"║ Elites Preserved: {eliteCount}",
                $"║ Mutated Children: {mutatedChildren}"
            };

            var bestGenomeLines = new List<string> {
                $"║ Genome ID: {bestGenome.GenomeID}",
                $"║ Score: {bestGenome.Game.updateScore}",
                $"║ Fitness: {bestGenome.Fitness:F4}",
                $"║ Steps: {bestGenome.StepsSnapshot}"
            };

            int contentWidth = Math.Max(
                Math.Max(
                    lines.Max(l => l.Length),
                    Math.Max(nextGenLines.Max(l => l.Length), bestGenomeLines.Max(l => l.Length))
                ), 60
            ) + 2;

            string Pad(string l) => l.PadRight(contentWidth - 1) + "║";
            string separator = $"╠{new string('═', contentWidth - 2)}╣";
            string topBar = $"╔{new string('═', contentWidth - 2)}╗";
            string bottomBar = $"╚{new string('═', contentWidth - 2)}╝";

            var sb = new StringBuilder();
            sb.AppendLine($"\n{topBar}");
            sb.AppendLine(Pad($"╠══ GENERATION {metrics.Generation}"));
            sb.AppendLine(separator);
            foreach(var l in lines)
                sb.AppendLine(Pad(l));
            sb.AppendLine(separator);
            sb.AppendLine(Pad($"╠══ NEXT GENERATION {metrics.Generation + 1}"));
            sb.AppendLine(separator);
            foreach(var l in nextGenLines)
                sb.AppendLine(Pad(l));
            sb.AppendLine(separator);
            sb.AppendLine(Pad($"╠══ BEST EVER GENOME "));
            sb.AppendLine(separator);
            foreach(var l in bestGenomeLines)
                sb.AppendLine(Pad(l));
            sb.AppendLine(bottomBar);

            Log(sb.ToString(), LogLevel.Info);
        }

        #endregion

        #region REPORTS

        /// <summary>
        /// Write detailed report every 10 generations with comprehensive statistics
        /// </summary>
        private static void WriteDetailedReport(GenerationMetrics metrics) {
            var reportPath = Path.Combine(logDirectory, $"report_gen{metrics.Generation}.txt");

            var sb = new StringBuilder();
            sb.AppendLine("╔═══════════════════════════════════════════════════════════════╗");
            sb.AppendLine($"║     DETAILED REPORT - GENERATION {metrics.Generation}             ║ ");
            sb.AppendLine("╚═══════════════════════════════════════════════════════════════╝\n");

            sb.AppendLine("PERFORMANCE METRICS:");
            sb.AppendLine($"  Best Fitness:       {metrics.BestFitness:F6}");
            sb.AppendLine($"  Average Fitness:    {metrics.AverageFitness:F6}");
            sb.AppendLine($"  Median Fitness:     {metrics.MedianFitness:F6}");
            sb.AppendLine($"  Best Score:         {metrics.BestScore}");
            sb.AppendLine($"  Average Score:      {metrics.AverageScore}");
            sb.AppendLine();

            sb.AppendLine("POPULATION STATISTICS:");
            sb.AppendLine($"  Alive Count:        {metrics.AliveCount}");
            sb.AppendLine($"  Mutation Rate:      {metrics.MutationRate:F8}");
            sb.AppendLine($"  Elite Count:        {metrics.EliteCount}");
            sb.AppendLine($"  Diversity Score:    {metrics.DiversityScore:F2}%");
            sb.AppendLine();

            sb.AppendLine("SURVIVAL ANALYSIS:");
            sb.AppendLine($"  Max Steps:          {metrics.MaxStepsSurvived}");
            sb.AppendLine($"  Avg Steps:          {metrics.AvgStepsSurvived}");
            sb.AppendLine();

            sb.AppendLine("PROGRESS METRICS:");
            sb.AppendLine($"  Fitness Improvement: {metrics.FitnessImprovement:F6}");
            sb.AppendLine($"  Gens Since Improvement: {metrics.GensSinceImprovement}");
            sb.AppendLine();

            if(generationHistory.Count >= 10) {
                sb.AppendLine("TREND ANALYSIS (Last 10 Generations):");
                var recent = generationHistory.TakeLast(10).ToList();
                sb.AppendLine($"  Avg Best Fitness:   {recent.Average(m => m.BestFitness):F6}");
                sb.AppendLine($"  Avg Best Score:     {recent.Average(m => m.BestScore):F2}");
                sb.AppendLine($"  Trend:              {(recent.Last().BestFitness > recent.First().BestFitness ? "IMPROVING" : "DECLINING")}");
                sb.AppendLine();
            }

            sb.AppendLine("╔═══════════════════════════════════════════════════════════════╗\n");

            File.WriteAllText(reportPath, sb.ToString(), Encoding.UTF8);
            Log($"Report saved: report_gen{metrics.Generation}.txt", LogLevel.Info);
        }

        /// <summary>
        /// Write comprehensive training session summary
        /// </summary>
        public static void LogTrainingSummary() {
            if(!isInitialized || generationHistory.Count == 0)
                return;

            var totalDuration = DateTime.Now - sessionStartTime;
            var bestGen = generationHistory.OrderByDescending(m => m.BestFitness).First();
            var lastGen = generationHistory.Last();
            var firstGen = generationHistory.First();

            var sb = new StringBuilder();
            sb.AppendLine("\n╔═══════════════════════════════════════════════════════════════╗");
            sb.AppendLine("║              TRAINING SESSION SUMMARY                         ║");
            sb.AppendLine("╚═══════════════════════════════════════════════════════════════╝\n");

            sb.AppendLine($"Session ID:             {sessionId}");
            sb.AppendLine($"Total Duration:         {totalDuration:hh\\:mm\\:ss}");
            sb.AppendLine($"Total Generations:      {generationHistory.Count}");
            sb.AppendLine($"Total Genomes Tested:   {genomeLifecycles.Count}");
            sb.AppendLine();

            sb.AppendLine("BEST PERFORMANCE ACHIEVED:");
            sb.AppendLine($"  Generation:           {bestGen.Generation}");
            sb.AppendLine($"  Best Fitness:         {bestGen.BestFitness:F6}");
            sb.AppendLine($"  Best Score:           {bestGen.BestScore}");
            sb.AppendLine($"  Genome ID:            {bestGen.BestGenomeID}");
            sb.AppendLine();

            sb.AppendLine("FINAL STATE (Generation " + lastGen.Generation + "):");
            sb.AppendLine($"  Final Fitness:        {lastGen.BestFitness:F6}");
            sb.AppendLine($"  Final Score:          {lastGen.BestScore}");
            sb.AppendLine($"  Final Mutation Rate:  {lastGen.MutationRate:F8}");
            sb.AppendLine($"  Final Diversity:      {lastGen.DiversityScore:F2}%");
            sb.AppendLine();

            sb.AppendLine("OVERALL PROGRESS:");
            sb.AppendLine($"  Initial Fitness:      {firstGen.BestFitness:F6}");
            sb.AppendLine($"  Final Fitness:        {lastGen.BestFitness:F6}");
            sb.AppendLine($"  Total Improvement:    {lastGen.BestFitness - firstGen.BestFitness:F6}");
            double improvementPct = ((lastGen.BestFitness - firstGen.BestFitness) / Math.Max(firstGen.BestFitness, 0.001)) * 100;
            sb.AppendLine($"  Improvement %:        {improvementPct:F2}%");
            sb.AppendLine();

            sb.AppendLine("╔═══════════════════════════════════════════════════════════════╗");
            sb.AppendLine($"║ Session Ended:  {DateTime.Now:yyyy-MM-dd HH:mm:ss}   ║");
            sb.AppendLine($"║ Log Directory:  {Path.GetFullPath(logDirectory)}     ║");
            sb.AppendLine("╚═══════════════════════════════════════════════════════════════╝\n");

            string summary = sb.ToString();
            Log(summary, LogLevel.Info);

            var currentGenStr = generationHistory.Count > 0
                ? $"_Gen{generationHistory.Count}"
                : "_Gen0";

            var bestScoreStr = bestGen.BestScore > 0
                ? $"_Best{bestGen.BestScore}"
                : "";

            var summaryPath = Path.Combine(logDirectory, $"SnakeAI{currentGenStr}{bestScoreStr}_{sessionId}.txt");
            File.WriteAllText(summaryPath, summary, Encoding.UTF8);
        }

        #endregion

        #region UTILITIES

        /// <summary>
        /// Calculate median value from a list of doubles
        /// </summary>
        private static double CalculateMedian(List<double> values) {
            if(values.Count == 0)
                return 0;
            var sorted = values.OrderBy(v => v).ToList();
            int mid = sorted.Count / 2;
            return sorted.Count % 2 == 0
                ? (sorted[mid - 1] + sorted[mid]) / 2.0
                : sorted[mid];
        }

        /// <summary>
        /// Calculate population diversity as percentage of unique genome IDs
        /// </summary>
        private static double CalculateDiversity(Population population) {
            var uniqueIDs = population.Genomes.Select(g => g.GenomeID).Distinct().Count();
            return (double)uniqueIDs / population.Genomes.Count * 100.0;
        }

        /// <summary>
        /// Export metrics to custom file path
        /// </summary>
        public static void ExportMetrics(string filename = null!) {
            if(generationHistory.Count == 0) {
                Log("No metrics to export", LogLevel.Warning);
                return;
            }
            string exportPath = filename ?? Path.Combine(logDirectory, $"export_{sessionId}.csv");
            Log($"Metrics exported: {Path.GetFileName(exportPath)}", LogLevel.Info);
        }

        #endregion

        private static string GetLevelIcon(LogLevel level) {
            return level switch {
                LogLevel.Debug => "●",
                LogLevel.Info => "ℹ",
                LogLevel.Warning => "⚠",
                LogLevel.Error => "✗",
                LogLevel.Critical => "⛔",
                _ => "○"
            };
        }
    }

    /// <summary>
    /// Log level enumeration for categorizing log messages
    /// </summary>
    public enum LogLevel {
        Debug,
        Info,
        Warning,
        Error,
        Critical
    }
}
