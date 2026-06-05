@echo off
cls
echo [Neurotech] Activating Conda Environment 'PLUTO'...
pushd "D:\Neuro Science\BCI\backend\venv"
:: USe 'call" to ensure control return to the script and check for success
call conda activate PLUTO
if errorlevel 1(
    echo [ERROR] Failed to activate conda environment 'PLUTO'.
    echo [ERROR] Current Path: %PATH%
    pause
    exit /b 1
)
popd

echo [Neuro TECH] Active Environment: %CONDA_DEFAULT_ENV%
echo [Neuro TECH] Working Directory: %CD%
