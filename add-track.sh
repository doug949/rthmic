#!/bin/bash
# Usage: ./add-track.sh "/path/to/Track Name.mp3" "Track Title"
# Example: ./add-track.sh ~/Desktop/new-track.mp3 "My New Track"

set -e

FILE_PATH="$1"
TITLE="$2"

if [ -z "$FILE_PATH" ] || [ -z "$TITLE" ]; then
  echo "Usage: ./add-track.sh \"/path/to/file.mp3\" \"Track Title\""
  exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "Error: File not found: $FILE_PATH"
  exit 1
fi

FILENAME=$(basename "$FILE_PATH")

echo "→ Uploading to Wasabi..."
aws s3 cp "$FILE_PATH" "s3://rthm-audio/$FILENAME" \
  --profile wasabi \
  --endpoint-url https://s3.eu-west-1.wasabisys.com

echo "→ Adding to tracks.ts..."

# Get the next ID
LAST_ID=$(grep '"id":' app/data/tracks.ts | tail -1 | grep -o '[0-9]*')
NEXT_ID=$((LAST_ID + 1))

# Insert new track before the closing ];
NEW_ENTRY="  {\n    id: \"$NEXT_ID\",\n    title: \"$TITLE\",\n    audioKey: \"$FILENAME\",\n  },"

# Use Python for reliable multiline insert
python3 -c "
import re, sys
with open('app/data/tracks.ts') as f:
    content = f.read()
entry = '  {\n    id: \"$NEXT_ID\",\n    title: \"$TITLE\",\n    audioKey: \"$FILENAME\",\n  },'
content = content.rstrip().rstrip(']').rstrip().rstrip(';').rstrip() + '\n' + entry + '\n];\n'
with open('app/data/tracks.ts', 'w') as f:
    f.write(content)
"

echo "→ Committing and pushing..."
git add app/data/tracks.ts
git commit -m "Add track: $TITLE"
git push

echo "→ Deploying to Vercel..."
vercel deploy --prod --scope video4 2>&1 | grep -E "Production:|Error"

echo ""
echo "✓ Done! '$TITLE' is now live."
