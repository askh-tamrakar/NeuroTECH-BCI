@echo off
cls 
pushd "<path to your repo on local machine>\backend\"

:: Explicitly target the venus environment interpreter to resolve path handling issues
set "your_conda_env_name_PYTHON=<path to your conda environment>\envs\neurotech\python.exe"

if exist "%your_conda_env_name_PYTHON%" (
    "%your_conda_env_name_PYTHON%" pipeline.py %*
) else (
    echo [NeuroTECH] WARNING: Venus environment not found at %your_conda_env_name_PYTHON%.
    echo [NeuroTECH] Attempting to use system 'python'...
    python pipeline.py %*
)

popd
echo [NeuroTECH] Pipeline session ended.
if errorlevel 1 pause