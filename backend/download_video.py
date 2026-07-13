"""Download a YouTube (or any yt-dlp supported) URL to out_dir."""

import sys
import yt_dlp


class _Logger:
    """Suppress yt-dlp cookie-DB copy errors (Chrome/Edge locked on Windows).
    These are harmless — yt-dlp falls back to the next browser automatically."""
    _SKIP = ('could not copy', 'cookie database', 'cookiejar', '7271')

    def debug(self, msg): pass
    def info(self, msg): pass
    def warning(self, msg):
        if not any(p in msg.lower() for p in self._SKIP):
            sys.stderr.write(f"WARN:{msg}\n"); sys.stderr.flush()
    def error(self, msg):
        if not any(p in msg.lower() for p in self._SKIP):
            sys.stderr.write(f"{msg}\n"); sys.stderr.flush()


def download(url, out_dir):
    result = {'path': None}

    def hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            done  = d.get('downloaded_bytes', 0)
            if total and total > 0:
                pct = int(done / total * 100)
                sys.stdout.write(f"PROGRESS:{pct}\n")
                sys.stdout.flush()
        elif d['status'] == 'finished':
            result['path'] = d.get('filename')

    base_opts = {
        # Format 22 = 720p mp4, 18 = 360p mp4 — both pre-merged, no ffmpeg needed.
        'format': '22/18/best[ext=mp4]/best',
        'outtmpl': f'{out_dir}/%(title).80s.%(ext)s',
        'progress_hooks': [hook],
        'logger': _Logger(),
        'quiet': True,
        'windowsfilenames': True,
    }

    # Firefox first — most reliable on Windows when Chrome/Edge are open (no DB lock).
    # Fall back to Edge, Chrome, then no cookies.
    browsers = ['firefox', 'edge', 'chrome', None]
    last_error = None

    for browser in browsers:
        opts = {**base_opts}
        if browser:
            opts['cookiesfrombrowser'] = (browser,)
            sys.stdout.write(f"INFO:Trying with {browser} cookies…\n")
        else:
            sys.stdout.write("INFO:Trying without browser cookies…\n")
        sys.stdout.flush()

        result['path'] = None  # reset between attempts
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if result['path'] is None:
                    rdl = info.get('requested_downloads')
                    if rdl:
                        result['path'] = rdl[0].get('filepath') or ydl.prepare_filename(info)
                    else:
                        result['path'] = ydl.prepare_filename(info)
            return result['path']  # success
        except Exception as e:
            # Hook already fired → file is on disk. yt-dlp raised during post-processing
            # or context-manager cleanup — treat the download as successful.
            if result['path']:
                return result['path']
            last_error = e
            err_str = str(e).lower()
            if 'cookies' not in err_str and 'sign in' not in err_str and 'bot' not in err_str and browser is None:
                raise
            continue

    raise last_error


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--url',     required=True)
    ap.add_argument('--out-dir', required=True)
    args = ap.parse_args()

    try:
        path = download(args.url, args.out_dir)
        print(f"DONE:{path}", flush=True)
    except Exception as e:
        print(f"ERROR:{e}", flush=True)
        sys.exit(1)
