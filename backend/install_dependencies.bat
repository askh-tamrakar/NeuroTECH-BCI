@echo off
echo Installing Python dependencies...
pip install -r requirements.txt

echo Installing Frontend dependencies...
cd ..\frontend
call npm install
cd ..\backend

echo Done!
pause
