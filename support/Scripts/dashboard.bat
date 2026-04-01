@echo off 
cls
echo [Dashboard] Starting Frontend Development Server...
pushd "E:\WebSite\NeuroTECH-BCI\frontend"
echo [Dashboard] Directory: %CD%
npm run dev
popd