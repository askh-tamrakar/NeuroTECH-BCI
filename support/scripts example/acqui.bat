@echo off
cls
echo [Acquisition] Starting Signal Acquisition App...
pushd "<path to your repo on local machine>"
echo [Acquisition] Running: python -m src.acquisition.acquisition_app
python -m src.acquisition.acquisition_app
popd




















