"""Mux the recorded WebM with the narration MP3 into a polished MP4.

Pipeline:
  1. Convert WebM (VP8) → MP4 (H.264) so the browser + video hosts accept it.
  2. Pad the video by freezing the last frame until it matches audio length.
  3. Overlay a soft title card during the first 3 seconds ("PhytoNet AI · Plant Database").
  4. Add a subtle fade-in / fade-out.
  5. Mux the narration MP3 as the audio track.
"""
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).parent


def probe_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(path),
    ]).decode().strip()
    return float(out)


def mux(module_slug: str, title: str):
    webm  = BASE / "raw"   / f"{module_slug}.webm"
    audio = BASE / "audio" / f"{module_slug}.mp3"
    out   = BASE / "final" / f"{module_slug}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)

    v_dur = probe_duration(webm)
    a_dur = probe_duration(audio)
    pad = max(0.0, a_dur - v_dur + 1.5)  # +1.5s tail after narration ends
    total = v_dur + pad
    fade_out_start = total - 1.0

    # tpad extends video by holding the LAST frame for `pad` seconds.
    # drawtext puts a title card visible during [0, 3s] with a soft fade.
    #
    # Note: `enable='between(t,0,3)'` shows text only in first 3s
    vf = (
        f"tpad=stop_mode=clone:stop_duration={pad},"
        f"fade=t=in:st=0:d=0.6,fade=t=out:st={fade_out_start:.2f}:d=1.0,"
        # Subtitle band at top - keeps demo focused on the UI
        f"drawtext="
        f"text='PhytoNet AI · {title}':"
        f"fontcolor=white:fontsize=42:"
        f"box=1:boxcolor=0x5139EDCC:boxborderw=22:"
        f"x=60:y=60:"
        f"enable='between(t,0.4,3.4)':"
        f"alpha='if(lt(t,0.4),0,if(lt(t,1),(t-0.4)/0.6,if(lt(t,3),1,if(lt(t,3.4),(3.4-t)/0.4,0))))'"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", str(webm),
        "-i", str(audio),
        "-filter_complex", f"[0:v]{vf}[v]",
        "-map", "[v]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        str(out),
    ]
    print("Running:", " ".join(cmd[:6]), "...")
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"✔ {out.name}: {out.stat().st_size // 1024} KB  |  {probe_duration(out):.1f}s")


if __name__ == "__main__":
    slug = sys.argv[1] if len(sys.argv) > 1 else "01_plant_database"
    title = sys.argv[2] if len(sys.argv) > 2 else "Plant Database"
    mux(slug, title)
