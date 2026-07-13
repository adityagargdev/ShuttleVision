import yt_dlp
import os
from pathlib import Path

DOWNLOAD_DIR = Path(__file__).parent.parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)


def download_youtube_video(url, output_filename=None):
    if output_filename is None:
        output_filename = "video_%(id)s"

    output_path = str(DOWNLOAD_DIR / f"{output_filename}.%(ext)s")

    ydl_opts = {
        "format": "best[ext=mp4][height<=720]/best[ext=mp4]/best",
        "outtmpl": output_path,
        "quiet": False,
        "no_warnings": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "video")
        ext = info.get("ext", "mp4")
        safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()
        final_path = str(DOWNLOAD_DIR / f"{safe_title}.{ext}")
        print(f"\nDownloaded: {title}")
        print(f"Saved to: {final_path}")
        return final_path


if __name__ == "__main__":
    url = input("Paste YouTube URL: ").strip()
    path = download_youtube_video(url)
    print("Ready:", path)
