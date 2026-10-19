#!/usr/bin/env bash
# usage: tools/encode.sh <frames_dir> <bgm.wav> <out.mp4>
# JPEG frames (BT.601 full range) -> H.264 BT.709 limited range; AAC with 1 dB of head-room for the lossy codec.
set -euo pipefail
frames="$1"; wav="$2"; out="$3"
ffmpeg -y -loglevel error -stats -framerate 30 -i "$frames/f%05d.jpg" -i "$wav" \
  -vf "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p" \
  -af "volume=-1.0dB" \
  -c:v libx264 -preset slow -crf 16 -tune film -g 60 -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest "$out"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of default=nw=1 "$out"
