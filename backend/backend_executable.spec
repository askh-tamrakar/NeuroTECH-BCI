# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Base directories
backend_dir = os.path.abspath(os.curdir)
project_root = os.path.dirname(backend_dir)

added_files = [
    ('config', 'config'),
    ('src', 'src'),
    ('../frontend/dist', 'frontend/dist'),
]

# Binary dependencies
binaries = [
    ('I:/miniforge3/Lib/site-packages/pylsl/lib/lsl.dll', '.'),
]

# BrainFlow DLLs often need to be collected explicitly
import brainflow
brainflow_lib_dir = os.path.join(os.path.dirname(brainflow.__file__), 'lib')
if os.path.exists(brainflow_lib_dir):
    for f in os.listdir(brainflow_lib_dir):
        if f.endswith('.dll'):
            binaries.append((os.path.join(brainflow_lib_dir, f), 'brainflow/lib'))

hidden_imports = [
    'src.acquisition.stream_manager',
    'src.processing.filter_router',
    'src.feature.router',
    'src.server.web_server',
    'eventlet.hubs.epolls',
    'eventlet.hubs.kqueue',
    'eventlet.hubs.selects',
    'dns',
] + collect_submodules('src')

a = Analysis(
    ['launcher.py'],
    pathex=[backend_dir],
    binaries=binaries,
    datas=added_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='NeuroTECH-Backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
