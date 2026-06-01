@echo off
cls
echo [NeuroBench] Starting Benchmarking Utility...
echo [NeuroBench] Running: python "<path to your repo on local machine>\backend\src\utils\neurobench.py"

python "<path to your repo on local machine>\backend\src\utils\neurobench.py"

echo [NeuroBench] Working Directory: %CD%
echo [NeuroBench] RUNNING:python -m src.utils.neurobench

python -m src.utils.neurobench

