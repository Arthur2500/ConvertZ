const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const port = 3000;

// Set up multer for file uploads, saving files to 'uploads/' directory
const upload = multer({ dest: 'uploads/' });

// Set up EJS as the view engine
app.set('view engine', 'ejs');

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Route for rendering the home page
app.get('/', (req, res) => {
    res.render('index');
});

// Helper function to schedule file deletion after 1 hour
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

// Route for handling video uploads and conversion
app.post('/upload', upload.array('videos'), (req, res) => {
    const files = req.files;
    const outputFormat = req.body.format;
    const resolution = req.body.resolution;
    const fps = req.body.fps;
    const bitrate = req.body.bitrate + "k";

    console.log(`Received ${files.length} files for conversion.`);
    console.log(`Requested format: ${outputFormat}, resolution: ${resolution}%, fps: ${fps}, bitrate: ${bitrate}`);

    const scaleFactor = parseFloat(resolution) / 100; // Calculate the scale factor from resolution percentage
    const scaleFilter = `iw*${scaleFactor}:ih*${scaleFactor}`; // Build the scale filter for ffmpeg

    const convertedFiles = []; // Array to keep track of converted files

    // Map through each uploaded file and create a promise for conversion
    const conversionPromises = files.map((file) => {
        return new Promise((resolve, reject) => {
            const outputFilePath = path.join('converted', `${path.parse(file.filename).name}.${outputFormat}`);
            convertedFiles.push(outputFilePath);

            // Construct the ffmpeg command for video conversion
            const ffmpegCommand = `ffmpeg -i ${file.path} -vf "scale=${scaleFilter}" -r ${fps} -b:v ${bitrate} -preset fast ${outputFilePath}`;
            console.log(`Executing command: ${ffmpegCommand}`);

            // Execute the ffmpeg command
            exec(ffmpegCommand, (error) => {
                if (error) {
                    console.error(`Error during conversion: ${error.message}`);
                    reject(error);
                    return;
                }

                console.log(`Conversion completed for: ${outputFilePath}`);

                // Delete the uploaded file after conversion
                if (fs.existsSync(outputFilePath)) {
                    fs.unlink(file.path, (err) => {
                        if (err) {
                            console.error(`Error deleting uploaded file: ${err.message}`);
                        } else {
                            console.log(`Uploaded file deleted: ${file.path}`);
                        }
                    });
                    scheduleFileDeletion(outputFilePath); // Schedule deletion of converted file
                    resolve();
                } else {
                    const errorMsg = `Output file not created: ${outputFilePath}`;
                    console.error(errorMsg);
                    reject(new Error(errorMsg));
                }
            });
        });
    });

    // After all conversions are done
    Promise.all(conversionPromises)
        .then(() => {
            // If only one file is converted, send it directly
            if (convertedFiles.length === 1) {
                const file = convertedFiles[0];
                console.log(`Sending single converted file: ${file}`);
                res.setHeader('filetype', path.extname(file));
                res.download(file, () => {
                    // Delete the converted file after download
                    fs.unlink(file, (err) => {
                        if (err) {
                            console.error(`Error deleting converted file: ${err.message}`);
                        } else {
                            console.log(`Converted file deleted: ${file}`);
                        }
                    });
                });
            } else {
                // If multiple files are converted, zip them together
                const zipFilePath = path.join('converted', 'converted_videos.zip');
                console.log(`Creating zip archive: ${zipFilePath}`);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                // Event listeners for the archive process
                output.on('close', function () {
                    console.log(`Zip archive created, size: ${archive.pointer()} bytes`);
                    res.setHeader('filetype', '.zip');
                    res.download(zipFilePath, () => {
                        // Delete all converted files and the zip archive after download
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

                // Add each converted file to the zip archive
                convertedFiles.forEach((file) => {
                    if (fs.existsSync(file)) {
                        console.log(`Adding file to zip: ${file}`);
                        archive.file(file, { name: path.basename(file) });
                    } else {
                        console.error(`Converted file missing: ${file}`);
                    }
                });

                archive.finalize(); // Finalize the archive (finish the zip process)
                scheduleFileDeletion(zipFilePath); // Schedule deletion of the zip file
            }
        })
        .catch((error) => {
            console.error(`Error in conversion process: ${error.message}`);
            res.status(500).send('An error occurred during the conversion process.');
        });
});

// Route for rendering the privacy policy page
app.get('/privacy', (req, res) => {
    res.render('privacy');
});

// Start the server
app.listen(port, () => {
    console.log(`ConvertZ is running at http://localhost:${port}`);
});
