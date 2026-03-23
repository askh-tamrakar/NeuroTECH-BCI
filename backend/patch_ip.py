import os
import re

file_path = r'e:\WebSite\NeuroTECH-BCI\backend\src\utils\neurobench.py'

with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

target = r'(self\.ip_input = QtWidgets\.QLineEdit\(self\.target_ip\)\s*wifi_form\.addRow\("Target IP", self\.ip_input\))'

replacement = '''ip_layout = QtWidgets.QHBoxLayout()
        ip_layout.setContentsMargins(0,0,0,0)
        self.ip_input = QtWidgets.QLineEdit(self.target_ip)
        self.btn_auto_ip = QtWidgets.QPushButton("Get IP")
        self.btn_auto_ip.clicked.connect(self._auto_local_ip)
        ip_layout.addWidget(self.ip_input)
        ip_layout.addWidget(self.btn_auto_ip)
        wifi_form.addRow("Target IP", ip_layout)'''

new_text = re.sub(target, replacement, text, count=1)

if new_text != text:
    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_text)
    print("Patched successfully!")
else:
    print("Match not found!")
