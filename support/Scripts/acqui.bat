@echo off
cls
echo [Acquisition] Starting Signal Acquisition App...
pushd "E:\WebSite\NeuroTECH-BCI\backend"
echo [Acquisition] Running: python -m src.acquisition.acquisition_app
python -m src.acquisition.acquisition_app
popd