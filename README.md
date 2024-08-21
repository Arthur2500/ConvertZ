[![Docker Image CI](https://github.com/Arthur2500/ConvertZ/actions/workflows/docker-image.yml/badge.svg)](https://github.com/Arthur2500/ConvertZ/actions/workflows/docker-image.yml)
# ConvertZ <img src="https://github.com/Arthur2500/ConvertZ/raw/main/public/favicon.ico" alt="Icon" width="24"/>
A lightweight video conversion and compression webapp using ffmpeg.

## Demo:
https://compress.ziemlich-schnell.de

## How to run:
### Use Prebuilt Image (Recommended)
```
docker run --name convertz -d -p 3000:3000 ghcr.io/arthur2500/convertz:latest
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

## Screenshots
![Screenshot 2024-08-20 215648](https://github.com/user-attachments/assets/a2d7979e-2f71-4f3f-9063-57128690e62a)
