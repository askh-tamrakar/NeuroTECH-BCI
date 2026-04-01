@echo off
cls 
pushd "E:\WebSite\NeuroTECH-BCI\backend\"

:: Explicitly target the venus environment interpreter to resolve path handling issues
set "VENUS_PYTHON=E:\miniforge3\envs\neurotech\python.exe"

if exist "%VENUS_PYTHON%" (
    "%VENUS_PYTHON%" pipeline.py %*
) else (
    echo [NeuroTECH] WARNING: Venus environment not found at %VENUS_PYTHON%.
    echo [NeuroTECH] Attempting to use system 'python'...
    python pipeline.py %*
)

popd
echo [NeuroTECH] Pipeline session ended.
if errorlevel 1 pause