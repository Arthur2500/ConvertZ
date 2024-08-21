[![Docker Image CI](https://github.com/Arthur2500/ConvertZ/actions/workflows/docker-image.yml/badge.svg)](https://github.com/Arthur2500/ConvertZ/actions/workflows/docker-image.yml)
# ConvertZ <img src="https://github.com/Arthur2500/ConvertZ/raw/main/public/favicon.ico" alt="Icon" width="24"/>
A lightweight video conversion and compression webapp using ffmpeg.

## Demo:
https://compress.ziemlich-schnell.de

## How to run:
### Use Prebuilt Image (Recommended)
```
docker run --name convertz --env SECURITY=disabled --env API_KEY=none -d -p 3000:3000 ghcr.io/arthur2500/convertz:latest 
```
or
```
mkdir ConvertZ &&
cd ConvertZ &&
wget https://raw.githubusercontent.com/Arthur2500/ConvertZ/main/docker-compose.yml &&
docker-compose up -d
```

### Build Docker Image Locally
```
git clone https://github.com/Arthur2500/ConvertZ.git &&
docker-compose -f docker-compose.local.yml up -d --build
```

### Run without Docker
Requirements:
```
Node.js >= 16
ffmpeg
```

Clone Repository
```
git clone https://github.com/Arthur2500/ConvertZ.git
```

Install dependencies
```
npm install
```

Run main.js
```
node main.js
```

For improved security, set environment variable SECURITY=enabled if exclusively accessed via Cloudflare Tunnel or localhost
```
SECURITY=enabled node main.js
```

API authentication key is also passed via environment variable
```
API_KEY=your-api-key-here node main.js
```

Or both
```
SECURITY=enabled API_KEY=your-api-key-here node main.js
```

## Configuration
`docker-compose.yml` Environment Settings:
- `SECURITY: [enabled/disabled]`: Enable/Disable Security features such as Ratelimiting for API and Helmet header protection
- `API_KEY: [none/$CUSTOM_KEY]`: If set to "none," no API authorization is used. Otherwise, the custom string is used as the API key. (see [Request Headers](#request-headers))

## Screenshots
![Screenshot 2024-08-20 215648](https://github.com/user-attachments/assets/a2d7979e-2f71-4f3f-9063-57128690e62a)

## API Endpoint

### Upload and Convert Video

Endpoint: `/api/upload`

Method: `POST`

Description: Upload and convert a video file to a specified format, resolution, frame rate, and bitrate.

#### Request Headers

- `Authorization`: API key (if required).

#### Request Body

- `video`: Video file to upload (multipart/form-data).
- `format`: Output format (`mp4`, `avi`, `mkv`, `webm`, `mov`).
- `resolution`: Output resolution, percentage of original resolution in steps of 10, value must be between 50 and 100 (e.g. `80` for 80% of original resolution).
- `fps`: Frame rate in steps of 1, value must be between 15 and 60 (e.g., `30` for 30 FPS).
- `bitrate`: Video bitrate in kbps in steps of 100, value must be between 1000 and 10000 (e.g., `1000` for 1000 kbps).

#### Response

- **Success**: Downloads the converted video file.
- **Failure**: JSON with an error message.

### Examples

#### `curl` Example

```sh
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: YOUR_API_KEY" \
  -F "video=@/path/to/your/video.mp4" \
  -F "format=mp4" \
  -F "resolution=80" \
  -F "fps=30" \
  -F "bitrate=1000" \
  -OJ
```

#### Python Example

```python
import requests

url = "http://localhost:3000/api/upload"
headers = {"Authorization": "YOUR_API_KEY"}
files = {"video": open("/path/to/your/video.mp4", "rb")}
data = {
    "format": "mp4",
    "resolution": "80",
    "fps": "30",
    "bitrate": "1000"
}

response = requests.post(url, headers=headers, files=files, data=data)

if response.status_code == 200:
    content_disposition = response.headers.get('Content-Disposition')
    filename = content_disposition.split("filename=")[-1].strip('"')
    with open(filename, "wb") as f:
        f.write(response.content)
    print(f"Video converted successfully and saved as {filename}!")
else:
    print("Error:", response.json())
```
