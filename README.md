# Queensbound API

This repository hosts the JSON API data for the Queensbound NYC subway audio tour application.

## API Endpoints

The following JSON endpoints are available via GitHub Pages:

- **Subway Lines**: `https://jonwsantiago.github.io/queensbound-api/subway-lines.json`
- **Subway Stops**: `https://jonwsantiago.github.io/queensbound-api/subway-stops.json`  
- **Audio Tracks**: `https://jonwsantiago.github.io/queensbound-api/audio-tracks.json`

## Data Structure

### Subway Lines
```json
[
  {
    "id": 1,
    "name": "7 Line",
    "color": "#b934ad",
    "description": "Lorem ipsum"
  }
]
```

### Subway Stops
```json
[
  {
    "id": 1,
    "name": "Jackson Heights - Roosevelt Ave",
    "latitude": 40.746848,
    "longitude": -73.891394,
    "subway_lines": [{"id": 1, "name": "7 Line"}]
  }
]
```

### Audio Tracks
```json
[
  {
    "id": 1,
    "title": "Welcome to Jackson Heights",
    "audio_file": "/audio/jackson_heights_welcome.mp3",
    "duration": 120,
    "subway_stop": 1
  }
]
```

## CORS Headers

All files are served with appropriate CORS headers to allow cross-origin requests from the Queensbound mobile application.

## Deployment

This repository is automatically deployed to GitHub Pages. Any changes to the main branch will update the live API endpoints.

---

Generated for the Queensbound NYC subway audio tour application.