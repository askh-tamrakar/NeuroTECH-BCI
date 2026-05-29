@echo off
cls 
pushd "D:\Neuro Science\NeuroTECH-BCI\backend\"

:: Explicitly target the venus environment interpreter to resolve path handling issues
set "pluto_PYTHON=E:\miniforge3\envs\neurotech\python.exe"

if exist "%pluto_PYTHON%" (
    "%pluto_PYTHON%" pipeline.py %*
) else (
    echo [NeuroTECH] WARNING: Venus environment not found at %pluto_PYTHON%.
    echo [NeuroTECH] Attempting to use system 'python'...
    python pipeline.py %*
)

popd
echo [NeuroTECH] Pipeline session ended.
if errorlevel 1 pause