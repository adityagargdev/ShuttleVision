"""Standalone CLI: reads analysis.json and cuts one mp4 per rally."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from highlight_extractor import extract_highlights


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--video', required=True)
    ap.add_argument('--analysis-json', required=True)
    ap.add_argument('--out-dir', required=True)
    args = ap.parse_args()

    analysis = json.loads(Path(args.analysis_json).read_text(encoding='utf-8'))
    rallies = analysis['rallies']
    fps = analysis['meta']['fps']

    clips = extract_highlights(args.video, rallies, args.out_dir, fps=fps)
    for c in clips:
        print(f"CLIP:{c['clip_path']}", flush=True)
    print("DONE", flush=True)


if __name__ == '__main__':
    main()
