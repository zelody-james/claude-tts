#!/bin/sh
# Flips spoken replies on/off. The Stop hook skips tts.js while this flag file exists.
F="$HOME/.claude/tts-off"
if [ -e "$F" ]; then rm "$F" && echo "tts on"; else touch "$F" && echo "tts off"; fi
