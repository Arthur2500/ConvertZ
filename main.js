const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const archiver = require('archiver');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = 3000;

// Use Helmet and Ratelimit for enhanced security if the SECURITY environment variable is enabled
if (process.env.SECURITY === 'enabled') {
    app.use(helmet());
    const apiLimiter = rateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    });
    app.use('/api/', apiLimiter);
}

// Set up multer for file uploads with file type validation and size limit
const upload = multer({
    dest: 'uploads/', // Directory to save uploaded files temporarily
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB file size limit
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'video/mp4',
            'video/avi',
            'video/mkv',
            'video/webm',
            'video/quicktime',
            'video/mpeg',
            'application/octet-stream'
        ];
        // Validate file type
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video files are allowed.'));
        }
    }
});

// Set up EJS as the view engine
app.set('view engine', 'ejs');

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Render the home page
app.get('/', (req, res) => {
    res.render('index');
});

// Function to sanitize and validate input values
const sanitizeInput = (input, type) => {
    switch (type) {
        case 'resolution':
        case 'fps':
            const num = parseInt(input, 10);
            if (isNaN(num) || num <= 0) throw new Error('Invalid resolution or FPS value.');
            return num;
        case 'bitrate':
            if (!/^[0-9]+k$/.test(input)) throw new Error('Invalid bitrate format.'); // Validate bitrate format
            return input;
        case 'format':
            const allowedFormats = ['mp4', 'avi', 'mkv', 'webm', 'mov'];
            if (!allowedFormats.includes(input)) throw new Error('Invalid output format.');
            return input;
        default:
            throw new Error('Invalid input type.');
    }
};

// Ensure the file path is within the 'uploads' or 'converted' directories for security
const safePath = (filePath) => {
    const absolutePath = path.resolve(filePath);
    const allowedPaths = [path.resolve(__dirname, 'uploads'), path.resolve(__dirname, 'converted')];
    return allowedPaths.some(allowedPath => absolutePath.startsWith(allowedPath));
};

// Schedule file deletion after 1 hour
const scheduleFileDeletion = (filePath) => {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error(`Error deleting file after timeout: ${err.message}`);
                else console.log(`File deleted after 1 hour: ${filePath}`);
            });
        }
    }, 3600000); // 1 hour in milliseconds
};

// Handle video uploads and conversion
app.post('/upload', upload.array('videos'), (req, res) => {
    try {
        // Destructure and sanitize input values from the request body
        const { format, resolution, fps, bitrate } = req.body;
        const outputFormat = sanitizeInput(format, 'format');
        const sanitizedResolution = sanitizeInput(resolution, 'resolution');
        const sanitizedFps = sanitizeInput(fps, 'fps');
        const sanitizedBitrate = sanitizeInput(`${bitrate}k`, 'bitrate');

        // Calculate scale factor for video resolution
        const scaleFactor = sanitizedResolution / 100;
        const scaleFilter = `iw*${scaleFactor}:ih*${scaleFactor}`;

        // Create an array of promises to handle multiple file conversions
        const conversionPromises = req.files.map(file => new Promise((resolve, reject) => {
            const outputFilePath = path.join('converted', `${path.parse(file.filename).name}.${outputFormat}`);

            // Ensure both input and output paths are safe
            if (!safePath(file.path) || !safePath(outputFilePath)) {
                reject(new Error('Unsafe file path detected.'));
                return;
            }

            // Construct the ffmpeg command
            const ffmpegCommand = `ffmpeg -i ${file.path} -vf "scale=${scaleFilter}" -r ${sanitizedFps} -b:v ${sanitizedBitrate} -preset fast ${outputFilePath}`;
            console.log(`Executing command: ${ffmpegCommand}`);

            // Execute the ffmpeg command for conversion
            exec(ffmpegCommand, (error) => {
                if (error) {
                    reject(new Error(`Error during conversion: ${error.message}`));
                    return;
                }

                // Delete the original uploaded file after conversion
                fs.unlink(file.path, err => {
                    if (err) console.error(`Error deleting uploaded file: ${err.message}`);
                    else console.log(`Uploaded file deleted: ${file.path}`);
                });

                // Schedule the converted file for deletion after 1 hour
                scheduleFileDeletion(outputFilePath);
                resolve(outputFilePath);
            });
        }));

        // Handle all conversion promises
        Promise.all(conversionPromises)
            .then(convertedFiles => {
                // Handle single file conversion by sending the converted file to the client
                if (convertedFiles.length === 1) {
                    const file = convertedFiles[0];
                    res.download(file, 'converted_video.' + outputFormat, err => {
                        if (err) console.error(`Error sending converted file: ${err.message}`);
                        fs.unlink(file, err => {
                            if (err) console.error(`Error deleting converted file: ${err.message}`);
                        });
                    });
                } else {
                    // Handle multiple files by zipping them
                    const zipFilePath = path.join('converted', 'converted_videos.zip');
                    const output = fs.createWriteStream(zipFilePath);
                    const archive = archiver('zip', { zlib: { level: 9 } });

                    // Handle archiving errors
                    archive.on('error', err => {
                        console.error(`Archiving error: ${err.message}`);
                        res.status(500).send('An error occurred during archiving.');
                    });

                    // Send the zip file to the client after successful archiving
                    output.on('close', () => {
                        res.download(zipFilePath, 'converted_videos.zip', err => {
                            if (err) console.error(`Error sending zip file: ${err.message}`);
                            fs.unlink(zipFilePath, err => {
                                if (err) console.error(`Error deleting zip file: ${err.message}`);
                            });
                            // Clean up individual converted files after zipping
                            convertedFiles.forEach(file => {
                                fs.unlink(file, err => {
                                    if (err) console.error(`Error deleting converted file: ${err.message}`);
                                });
                            });
                        });
                    });

                    // Add files to the archive
                    archive.pipe(output);
                    convertedFiles.forEach(file => archive.file(file, { name: path.basename(file) }));
                    archive.finalize(); // Finalize the archive
                    scheduleFileDeletion(zipFilePath); // Schedule deletion of the zip file
                }
            })
            .catch(error => {
                console.error(`Error in conversion process: ${error.message}`);
                res.status(500).send('An error occurred during the conversion process.');
            });
    } catch (error) {
        console.error(`Error in processing request: ${error.message}`);
        res.status(400).send(error.message); // Return error to the client
    }
});

// Handle API video upload and conversion
app.post('/api/upload', upload.single('video'), (req, res) => {
    try {
        // Verify API key for security
        const apiKey = process.env.API_KEY;
        if (apiKey && apiKey !== "none" && req.headers['authorization'] !== apiKey) {
            return res.status(403).json({ error: 'Forbidden: Invalid API key' });
        }

        // Destructure and sanitize input values from the request body
        const { format, resolution, fps, bitrate } = req.body;
        const outputFormat = sanitizeInput(format, 'format');
        const sanitizedResolution = sanitizeInput(resolution, 'resolution');
        const sanitizedFps = sanitizeInput(fps, 'fps');
        const sanitizedBitrate = sanitizeInput(`${bitrate}k`, 'bitrate');

        // Calculate scale factor for video resolution
        const scaleFactor = sanitizedResolution / 100;
        const scaleFilter = `iw*${scaleFactor}:ih*${scaleFactor}`;

        // Define output file path
        const outputFilePath = path.join('converted', `${path.parse(req.file.filename).name}.${outputFormat}`);

        // Ensure both input and output paths are safe
        if (!safePath(req.file.path) || !safePath(outputFilePath)) {
            throw new Error('Unsafe file path detected.');
        }

        // Construct the ffmpeg command
        const ffmpegCommand = `ffmpeg -i ${req.file.path} -vf "scale=${scaleFilter}" -r ${sanitizedFps} -b:v ${sanitizedBitrate} -preset fast ${outputFilePath}`;
        console.log(`Executing command: ${ffmpegCommand}`);

        // Execute the ffmpeg command for conversion
        exec(ffmpegCommand, (error) => {
            if (error) {
                return res.status(500).json({ error: 'Conversion error.' });
            }

            // Delete the original uploaded file after conversion
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error deleting uploaded file: ${err.message}`);
            });

            // Schedule the converted file for deletion after 1 hour
            scheduleFileDeletion(outputFilePath);
            res.download(outputFilePath, err => {
                if (err) console.error(`Error sending converted file: ${err.message}`);
                fs.unlink(outputFilePath, err => {
                    if (err) console.error(`Error deleting converted file: ${err.message}`);
                });
            });
        });
    } catch (error) {
        console.error(`Error in API processing: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// Render the privacy policy page
app.get('/privacy', (req, res) => {
    res.render('privacy');
});

// Start the server
app.listen(port, () => {
    console.log(`ConvertZ is running at http://localhost:${port}`);
});

