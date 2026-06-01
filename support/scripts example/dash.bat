@echo off 
cls
echo [Dashboard] Starting Frontend Development Server...
pushd "<path to your repo on local machine>"
echo [Dashboard] Directory: %CD%
npm run dev
popd