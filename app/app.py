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
    # Dummy function to estimate file size based on input settings
    return 50 * 1024 * 1024  # 50 MB, example size

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
