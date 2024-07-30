import os
import json
import random
import string
from flask import Flask, request, jsonify, send_from_directory, render_template, after_this_request
import subprocess

app = Flask(__name__, static_url_path='/static')

UPLOAD_FOLDER = 'uploads'
CONVERTED_FOLDER = 'converted'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CONVERTED_FOLDER, exist_ok=True)

PRESETS = {
    "low": {"scale": 0.5, "bitrate": "2M", "fps": "30", "format": "mp4"},
    "medium": {"scale": 0.75, "bitrate": "5M", "fps": "60", "format": "mp4"},
    "high": {"scale": 1.0, "bitrate": "10M", "fps": "60", "format": "mp4"}
}

def get_video_resolution(input_file):
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        width, height = map(int, result.stdout.decode().strip().split(','))
        return width, height
    except Exception as e:
        return None, None

def get_video_duration(input_file):
    try:
        result = subprocess.run(
            ['ffmpeg', '-i', input_file],
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE
        )
        for line in result.stderr.decode().split('\n'):
            if 'Duration' in line:
                duration = line.split('Duration: ')[1].split(',')[0]
                return duration
        return None
    except Exception as e:
        return None

def estimate_file_size(input_file, settings):
    duration = get_video_duration(input_file)
    if not duration:
        return None
    
    try:
        hours, minutes, seconds = map(float, duration.split(':'))
        total_seconds = hours * 3600 + minutes * 60 + seconds
    except ValueError:
        return None

    original_width, original_height = get_video_resolution(input_file)
    if not original_width or not original_height:
        return None
    
    try:
        scale = float(settings['scale'])
        new_width = int(original_width * scale)
        new_height = int(original_height * scale)
        
        bitrate = float(settings['bitrate'][:-1]) * 1_000_000 if 'M' in settings['bitrate'] else float(settings['bitrate'])
        
        # Estimated size in bytes
        estimated_size = (bitrate * total_seconds) / 8
        
        # Adjust size based on resolution change
        resolution_ratio = (new_width * new_height) / (original_width * original_height)
        adjusted_size = estimated_size * resolution_ratio
        
        return adjusted_size
    except (ValueError, KeyError):
        return None

def generate_hex_hash(length=6):
    return ''.join(random.choices(string.hexdigits.lower(), k=length))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/privacy.html')
def privacy():
    return render_template('privacy.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    input_paths = []
    output_paths = []
    try:
        files = request.files.getlist('files')
        settings = json.loads(request.form['settings'])
        for file in files:
            input_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(input_path)
            original_width, original_height = get_video_resolution(input_path)
            if original_width is None or original_height is None:
                return jsonify({"error": "Error retrieving video resolution"}), 500

            # Berechne neue Auflösung basierend auf dem Preset
            scale = settings['scale']
            new_width = int(original_width * scale)
            new_height = int(original_height * scale)

            # Generate unique filename with hex hash
            hex_hash = generate_hex_hash()
            base_name = file.filename.rsplit('.', 1)[0]
            output_filename = f"converted_{base_name}_{hex_hash}.{settings['format']}"
            output_path = os.path.join(CONVERTED_FOLDER, output_filename)
            
            command = f"ffmpeg -y -i {input_path} -vf scale={new_width}:{new_height} -b:v {settings['bitrate']} -r {settings['fps']} -f {settings['format']} {output_path}"
            subprocess.run(command, shell=True, check=True)
            
            input_paths.append(input_path)
            output_paths.append(output_path)

        estimated_size = sum([estimate_file_size(path, settings) for path in input_paths])
        for path in input_paths:
            os.remove(path)

        response = jsonify({
            "estimated_size": estimated_size,
            "output_files": [os.path.basename(path) for path in output_paths]
        })
        response.headers['Content-Disposition'] = 'attachment'
        return response
    except subprocess.CalledProcessError as e:
        for path in input_paths:
            if os.path.exists(path):
                os.remove(path)
        for path in output_paths:
            if os.path.exists(path):
                os.remove(path)
        return jsonify({"error": f"Conversion error: {str(e)}"}), 500
    except Exception as e:
        for path in input_paths:
            if os.path.exists(path):
                os.remove(path)
        for path in output_paths:
            if os.path.exists(path):
                os.remove(path)
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@app.route('/estimate', methods=['POST'])
def estimate():
    try:
        files = request.files.getlist('files')
        settings = json.loads(request.form['settings'])
        total_estimated_size = 0
        for file in files:
            input_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(input_path)
            estimated_size = estimate_file_size(input_path, settings)
            if estimated_size:
                total_estimated_size += estimated_size
            os.remove(input_path)
        return jsonify({
            "estimated_size": total_estimated_size if total_estimated_size else "Error calculating size"
        })
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    @after_this_request
    def remove_file(response):
        try:
            os.remove(os.path.join(CONVERTED_FOLDER, filename))
        except Exception as e:
            app.logger.error(f'Error removing file: {str(e)}')
        return response

    return send_from_directory(CONVERTED_FOLDER, filename, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
