@echo off
cls
echo [NeuroBench] Starting Benchmarking Utility...
pushd "<path to your repo on local machine>\backend\"

:: Explicitly target the venus environment interpreter to resolve path handling issues
set "your_conda_env_name_PYTHON= <path to your conda environment>\envs\neurotech\python.exe"

if exist "%set "your_conda_env_name_PYTHON%" (
    "your_conda_env_name_PYTHON%" -m src.utils.neurobench
) else (
    echo [NeuroBench] WARNING: Venus environment not found at %your_conda_env_name_PYTHON%.
    echo [NeuroBench] Attempting to use system 'python'... python -m src.utils.neurobench %*
)

popd
echo [NeuroTECH] NeuroBench session ended.
if errorlevel 1 pause
