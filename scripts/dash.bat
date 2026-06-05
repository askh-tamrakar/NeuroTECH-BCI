@echo off 
cls
echo [Dashboard] Starting Frontend Development Server...
pushd "D:\Neuro Science\NeuroTECH-BCI\frontend"
echo [Dashboard] Directory: %CD%
npm run dev
popd