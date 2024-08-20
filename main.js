const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const archiver = require('archiver');
const helmet = require('helmet');

const app = express();
const port = 3000;

app.use(helmet()); // Adds security headers to the app using Helmet

// Set up multer for file uploads with file type validation and size limit
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['video/mp4', 'video/avi', 'video/mkv', 'video/webm', 'video/quicktime', 'video/mpeg'];
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
    if (type === 'resolution' || type === 'fps') {
        const num = parseInt(input, 10);
        if (isNaN(num) || num <= 0) {
            throw new Error('Invalid resolution or fps value.');
        }
        return num;
    } else if (type === 'bitrate') {
        const bitratePattern = /^[0-9]+k$/;  // Expecting format like '5000k'
        if (!bitratePattern.test(input)) {
            throw new Error('Invalid bitrate format.');
        }
        return input;
    } else if (type === 'format') {
        const allowedFormats = ['mp4', 'avi', 'mkv', 'webm'];
        if (!allowedFormats.includes(input)) {
            throw new Error('Invalid output format.');
        }
        return input;
    }
    throw new Error('Invalid input type.');
};

// Ensure that file paths are relative to the working directory
const safePath = (filePath) => path.normalize(filePath).startsWith(__dirname);

// Schedule file deletion after 1 hour
const scheduleFileDeletion = (filePath) => {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Error deleting file after timeout: ${err.message}`);
                } else {
                    console.log(`File deleted after 1 hour: ${filePath}`);
                }
            });
        }
    }, 3600000); // 1 hour in milliseconds
};

// Handle video uploads and conversion
app.post('/upload', upload.array('videos'), (req, res) => {
    const files = req.files;
    const outputFormat = sanitizeInput(req.body.format, 'format');
    const resolution = sanitizeInput(req.body.resolution, 'resolution');
    const fps = sanitizeInput(req.body.fps, 'fps');
    const bitrate = sanitizeInput(req.body.bitrate + "k", 'bitrate');

    const scaleFactor = parseFloat(resolution) / 100; // Calculate the scale factor from the resolution percentage
    const scaleFilter = `iw*${scaleFactor}:ih*${scaleFactor}`; // Create the scale filter for ffmpeg

    const convertedFiles = [];

    const conversionPromises = files.map((file) => {
        return new Promise((resolve, reject) => {
            const outputFilePath = path.join('converted', path.basename(`${path.parse(file.filename).name}.${outputFormat}`));
            convertedFiles.push(outputFilePath);

            const ffmpegCommand = `ffmpeg -i ${file.path} -vf "scale=${scaleFilter}" -r ${fps} -b:v ${bitrate} -preset fast ${outputFilePath}`;
            console.log(`Executing command: ${ffmpegCommand}`);

            if (!safePath(file.path) || !safePath(outputFilePath)) {
                reject(new Error('Unsafe file path detected.'));
                return;
            }

            exec(ffmpegCommand, (error) => {
                if (error) {
                    console.error(`Error during conversion: ${error.message}`);
                    reject(error);
                    return;
                }

                console.log(`Conversion completed for: ${outputFilePath}`);

                if (fs.existsSync(outputFilePath)) {
                    fs.unlink(file.path, (err) => {
                        if (err) {
                            console.error(`Error deleting uploaded file: ${err.message}`);
                        } else {
                            console.log(`Uploaded file deleted: ${file.path}`);
                        }
                    });
                    scheduleFileDeletion(outputFilePath);
                    resolve();
                } else {
                    const errorMsg = `Output file not created: ${outputFilePath}`;
                    console.error(errorMsg);
                    reject(new Error(errorMsg));
                }
            });
        });
    });

    Promise.all(conversionPromises)
        .then(() => {
            if (convertedFiles.length === 1) {
                const file = convertedFiles[0];
                console.log(`Sending single converted file: ${file}`);
                res.setHeader('filetype', path.extname(file));
                res.download(file, () => {
                    fs.unlink(file, (err) => {
                        if (err) {
                            console.error(`Error deleting converted file: ${err.message}`);
                        } else {
                            console.log(`Converted file deleted: ${file}`);
                        }
                    });
                });
            } else {
                const zipFilePath = path.join('converted', 'converted_videos.zip');
                console.log(`Creating zip archive: ${zipFilePath}`);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', function () {
                    console.log(`Zip archive created, size: ${archive.pointer()} bytes`);
                    res.setHeader('filetype', '.zip');
                    res.download(zipFilePath, () => {
                        convertedFiles.forEach((file) => {
                            fs.unlink(file, (err) => {
                                if (err) {
                                    console.error(`Error deleting converted file: ${err.message}`);
                                } else {
                                    console.log(`Converted file deleted: ${file}`);
                                }
                            });
                        });
                        fs.unlink(zipFilePath, (err) => {
                            if (err) {
                                console.error(`Error deleting zip file: ${err.message}`);
                            } else {
                                console.log(`Zip file deleted: ${zipFilePath}`);
                            }
                        });
                    });
                });

                archive.on('error', function (err) {
                    console.error(`Archiving error: ${err.message}`);
                    res.status(500).send('An error occurred during archiving.');
                });

                archive.pipe(output);

                convertedFiles.forEach((file) => {
                    if (fs.existsSync(file)) {
                        console.log(`Adding file to zip: ${file}`);
                        archive.file(file, { name: path.basename(file) });
                    } else {
                        console.error(`Converted file missing: ${file}`);
                    }
                });

                archive.finalize();
                scheduleFileDeletion(zipFilePath);
            }
        })
        .catch((error) => {
            console.error(`Error in conversion process: ${error.message}`);
            res.status(500).send('An error occurred during the conversion process.');
        });
});

// Render the privacy policy page
app.get('/privacy', (req, res) => {
    res.render('privacy');
});

// Start the server
app.listen(port, () => {
    console.log(`ConvertZ is running at http://localhost:${port}`);
});
