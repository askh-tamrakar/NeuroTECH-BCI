@echo off 
cls
echo [NeuroTECH] Activating Conda Environment 'venus'...
pushd "E:\WebSite\NeuroTECH-BCI"

:: Use 'call' to ensure control returns to the script and check for success
call conda activate NeuroTECH
if errorlevel 1 (
    echo [ERROR] Failed to activate conda environment 'venus'.
    echo [ERROR] Current Path: %PATH%
    pause
    exit /b 1
)

echo [NeuroTECH] Active Environment: %CONDA_DEFAULT_ENV%
echo [NeuroTECH] Working Directory: %CD%
