import os
import json
import random
import string
import io
from flask import Flask, request, jsonify, send_from_directory, render_template, after_this_request
import subprocess
from multiprocessing import Pool, cpu_count

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

def get_video_info(input_file):
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'csv=p=0', input_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        width, height, duration = result.stdout.decode().strip().split(',')
        return int(width), int(height), float(duration)
    except Exception as e:
        app.logger.error(f'Error getting video info: {str(e)}')
        return None, None, None

def estimate_file_size(input_file, settings):
    width, height, duration = get_video_info(input_file)
    if not width or not height or not duration:
        return None
    
    try:
        scale = float(settings['scale'])
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        bitrate = float(settings['bitrate'][:-1]) * 1_000_000 if 'M' in settings['bitrate'] else float(settings['bitrate'])
        
        estimated_size = (bitrate * duration) / 8
        resolution_ratio = (new_width * new_height) / (width * height)
        adjusted_size = estimated_size * resolution_ratio
        
        return adjusted_size
    except (ValueError, KeyError) as e:
        app.logger.error(f'Error estimating file size: {str(e)}')
        return None

def generate_hex_hash(length=6):
    return ''.join(random.choices(string.hexdigits.lower(), k=length))

def convert_video(args):
    input_path, output_path, settings = args
    width, height, _ = get_video_info(input_path)
    scale = settings['scale']
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    command = [
        'ffmpeg', '-y', '-i', input_path,
        '-vf', f'scale={new_width}:{new_height}',
        '-b:v', settings['bitrate'],
        '-r', settings['fps'],
        '-f', settings['format'],
        output_path
    ]
    
    process = subprocess.Popen(command, stderr=subprocess.PIPE)
    while True:
        output = process.stderr.readline()
        if process.poll() is not None:
            break
        if output:
            app.logger.info(output.decode().strip())
    
    if process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, command)
    
    return output_path

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
        tasks = []
        for file in files:
            input_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(input_path)
            
            hex_hash = generate_hex_hash()
            base_name = file.filename.rsplit('.', 1)[0]
            output_filename = f"converted_{base_name}_{hex_hash}.{settings['format']}"
            output_path = os.path.join(CONVERTED_FOLDER, output_filename)
            
            tasks.append((input_path, output_path, settings))
            input_paths.append(input_path)
            output_paths.append(output_path)

        with Pool(cpu_count()) as pool:
            pool.map(convert_video, tasks)

        estimated_size = sum([estimate_file_size(path, settings) for path in input_paths])
        for path in input_paths:
            if os.path.exists(path):
                os.remove(path)

        response_data = {
            "estimated_size": estimated_size,
            "output_files": [os.path.basename(path) for path in output_paths]
        }

        return jsonify(response_data)
    except subprocess.CalledProcessError as e:
        app.logger.error(f'Conversion error: {str(e)}')
        for path in input_paths:
            if os.path.exists(path):
                os.remove(path)
        for path in output_paths:
            if os.path.exists(path):
                os.remove(path)
        return jsonify({"error": f"Conversion error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f'Unexpected error: {str(e)}')
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
        app.logger.error(f'Unexpected error: {str(e)}')
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
