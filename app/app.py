# app.py
import os
from flask import Flask, request, jsonify, send_from_directory, render_template
import subprocess

app = Flask(__name__, static_url_path='/static')

UPLOAD_FOLDER = 'uploads'
CONVERTED_FOLDER = 'converted'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CONVERTED_FOLDER, exist_ok=True)

def estimate_file_size(input_file, settings):
    duration_command = f"ffmpeg -i {input_file} 2>&1 | grep 'Duration' | awk '{{print $2}}' | tr -d ,"
    duration = subprocess.check_output(duration_command, shell=True).decode('utf-8')
    
    hours, minutes, seconds = map(float, duration.split(':'))
    total_seconds = hours * 3600 + minutes * 60 + seconds
    
    # Bitrate in bits per second (assuming settings['bitrate'] is like '1M' for 1 Mbps)
    bitrate = float(settings['bitrate'][:-1]) * 1_000_000 if 'M' in settings['bitrate'] else float(settings['bitrate'])
    
    estimated_size = (bitrate * total_seconds) / 8  # Convert bits to bytes
    return estimated_size

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    settings = request.form.to_dict()
    input_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(input_path)
    output_filename = f"converted_{file.filename}"
    output_path = os.path.join(CONVERTED_FOLDER, output_filename)
    
    command = f"ffmpeg -i {input_path} -s {settings['resolution']} -b:v {settings['bitrate']} -r {settings['fps']} -f {settings['format']} {output_path}"
    subprocess.run(command, shell=True)
    
    return jsonify({
        "estimated_size": estimate_file_size(input_path, settings),
        "output_file": output_filename
    })

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    return send_from_directory(CONVERTED_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
