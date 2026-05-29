@echo off
cls
echo [NeuroBench] Starting Benchmarking Utility...
echo [NeuroBench] Running: python "D:\Neuro Science\NeuroTECH-BCI\backend\src\utils\neurobench.py"

python "D:\Neuro Science\NeuroTECH-BCI\backend\src\utils\neurobench.py"

echo [NeuroBench] Working Directory: %CD%
echo [NeuroBench] RUNNING:python -m src.utils.neurobench

python -m src.utils.neurobench

