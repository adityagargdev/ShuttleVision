# PyInstaller spec for ShuttleVision backend
# Run from project root:  pyinstaller backend/shuttlevision_backend.spec
# Output lands in backend/dist/shuttlevision_backend/
#
# NOTE: This creates a ~3-4 GB folder due to torch + ultralytics.
# Copy the entire shuttlevision_backend/ folder to frontend/resources/python_backend/
# before running `npm run dist:win`.

block_cipher = None

a = Analysis(
    ['run_analysis.py', 'download_video.py', 'extract_highlights_cli.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        # include model weights if you want them bundled (adds ~45 MB)
        # ('C:/Users/swati/badminton_models/track.pt', 'badminton_models'),
    ],
    hiddenimports=[
        'ultralytics',
        'ultralytics.models',
        'ultralytics.models.yolo',
        'torch',
        'torchvision',
        'cv2',
        'yt_dlp',
        'numpy',
        'scipy',
        'PIL',
        'sklearn',
    ],
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
    [],
    exclude_binaries=True,
    name='shuttlevision_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='shuttlevision_backend',
)
