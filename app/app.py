import os
import json
from flask import Flask, request, jsonify, send_from_directory, render_template
import subprocess

app = Flask(__name__, static_url_path='/static')

UPLOAD_FOLDER = '../uploads'
CONVERTED_FOLDER = '../converted'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CONVERTED_FOLDER, exist_ok=True)

PRESETS = {
    "low": {"resolution": "1280x720", "bitrate": "2M", "fps": "30", "format": "mp4"},
    "medium": {"resolution": "1920x1080", "bitrate": "5M", "fps": "60", "format": "mp4"},
    "high": {"resolution": "3840x2160", "bitrate": "10M", "fps": "60", "format": "mp4"}
}

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
    
    hours, minutes, seconds = map(float, duration.split(':'))
    total_seconds = hours * 3600 + minutes * 60 + seconds
    
    bitrate = float(settings['bitrate'][:-1]) * 1_000_000 if 'M' in settings['bitrate'] else float(settings['bitrate'])
    
    estimated_size = (bitrate * total_seconds) / 8  # Convert bits to bytes
    return estimated_size

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        file = request.files['file']
        settings = json.loads(request.form['settings'])
        input_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(input_path)
        output_filename = f"converted_{file.filename.split('.')[0]}.{settings['format']}"
        output_path = os.path.join(CONVERTED_FOLDER, output_filename)
        
        command = f"ffmpeg -i {input_path} -s {settings['resolution']} -b:v {settings['bitrate']} -r {settings['fps']} -f {settings['format']} {output_path}"
        subprocess.run(command, shell=True, check=True)
        
        estimated_size = estimate_file_size(input_path, settings)
        os.remove(input_path)
        
        response = jsonify({
            "estimated_size": estimated_size,
            "output_file": output_filename
        })
        response.headers['Content-Disposition'] = f'attachment; filename={output_filename}'
        return response
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Conversion error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)

@app.route('/estimate', methods=['POST'])
def estimate():
    try:
        file = request.files['file']
        settings = json.loads(request.form['settings'])
        input_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(input_path)
        estimated_size = estimate_file_size(input_path, settings)
        os.remove(input_path)
        return jsonify({
            "estimated_size": estimated_size if estimated_size else "Error calculating size"
        })
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    return send_from_directory(CONVERTED_FOLDER, filename, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
