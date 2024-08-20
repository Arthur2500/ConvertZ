[![Docker Image CI](https://github.com/Arthur2500/ConvertZ/actions/workflows/docker-image.yml/badge.svg)](https://github.com/Arthur2500/ConvertZ/actions/workflows/docker-image.yml)
# ConvertZ
A lightweight video conversion and compression webapp using ffmpeg.

## Demo:
https://compress.ziemlich-schnell.de

## How to run:
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

## Screenshots
![Screenshot 2024-08-20 215648](https://github.com/user-attachments/assets/a2d7979e-2f71-4f3f-9063-57128690e62a)
