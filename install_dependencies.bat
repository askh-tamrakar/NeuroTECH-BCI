@echo off
echo Installing Python dependencies...
pip install -r requirements.txt

echo Installing Frontend dependencies...
cd src\web\frontend
call npm install
cd ..\..\..

echo Done!
pause
