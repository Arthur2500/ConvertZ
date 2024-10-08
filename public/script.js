// Ensure the script only runs when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Code for the "Back" button on the privacy.html page
    const backButton = document.getElementById('backButton');

    if (backButton) {
        backButton.addEventListener('click', function() {
            window.location.href = '/';  // Redirect to the main page
        });
    }

    // Code for the form on the main page
    const form = document.querySelector('form');
    if (form) {
        // Define preset configurations for video conversion
        const presets = {
            low: {
                resolution: 60, // 60% of the original resolution
                fps: 24,
                bitrate: 2000 // 2000 kbps
            },
            medium: {
                resolution: 80, // 80% of the original resolution
                fps: 30,
                bitrate: 5000 // 5000 kbps
            },
            high: {
                resolution: 100, // 100% of the original resolution
                fps: 60,
                bitrate: 10000 // 10000 kbps
            }
        };

        // Update the form fields with preset values when a preset is selected
        document.getElementById('preset').addEventListener('change', function() {
            console.log(`Preset changed to: ${this.value}`);

            const customOptions = document.getElementById('custom-options');

            if (this.value === 'custom') {
                // Show custom options if 'custom' preset is selected
                customOptions.style.display = 'block';
                console.log('Custom options displayed');
            } else {
                // Hide custom options and apply the selected preset values
                customOptions.style.display = 'none';
                const selectedPreset = presets[this.value];
                console.log('Selected preset values:', selectedPreset);

                // Apply preset values to the form
                document.getElementById('resolution').value = selectedPreset.resolution;
                document.getElementById('fps').value = selectedPreset.fps;
                document.getElementById('bitrate').value = selectedPreset.bitrate;
            }
        });

        // Initialize the form with the medium preset as the default selection
        document.getElementById('preset').dispatchEvent(new Event('change'));

        // Client-side validation function
        function validateForm() {
            const resolution = document.getElementById('resolution').value;
            const fps = document.getElementById('fps').value;
            const bitrate = document.getElementById('bitrate').value;

            if (isNaN(resolution) || resolution < 50 || resolution > 100) {
                alert('Resolution must be a number between 50 and 100.');
                return false;
            }
            if (isNaN(fps) || fps < 15 || fps > 60) {
                alert('FPS must be a number between 15 and 60.');
                return false;
            }
            if (isNaN(bitrate) || bitrate < 1000 || bitrate > 10000) {
                alert('Bitrate must number between 1000 and 10000.');
                return false;
            }
            return true;
        }

        // Handle the form submission process and conversion
        const convertButton = form.querySelector('button[type="submit"]');
        let downloadUrl = '';

        form.addEventListener('submit', function(event) {
            event.preventDefault(); // Prevent the default form submission behavior
            console.log('Form submission intercepted. Starting conversion process...');

            // Validate form inputs before submission
            if (!validateForm()) {
                return;
            }

            // Disable the button and change text to indicate conversion in progress
            convertButton.disabled = true;
            convertButton.textContent = 'Converting...';

            const formData = new FormData(form);
            console.log('Form data prepared for submission:', formData);

            fetch('/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                console.log('Fetch response received:', response);

                if (!response.ok) {
                    throw new Error(`Server returned status: ${response.status}`);
                }

                // Get the content-disposition header to extract the filename
                const contentDisposition = response.headers.get('Content-Disposition');
                let fileName = '';

                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="?([^"]+)"?/);
                    if (match) {
                        fileName = match[1];
                    }
                }

                console.log('Resolved filename:', fileName);

                // Convert the response to a blob and pass it along with the filename
                return response.blob().then(blob => ({
                    blob: blob,
                    fileName: fileName
                }));
            })
            .then(({ blob, fileName }) => {
                // Create a download URL from the blob
                downloadUrl = window.URL.createObjectURL(blob);
                console.log('Download URL created:', downloadUrl);

                // Update the button text to 'Download' and enable it
                convertButton.textContent = 'Download';
                convertButton.disabled = false;

                // Add a one-time event listener to handle the download
                convertButton.addEventListener('click', downloadHandler, { once: true });

                function downloadHandler(event) {
                    event.preventDefault(); // Prevent default action on button click
                    console.log('Download button clicked. Starting download...');

                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = fileName; // Set the filename based on the header
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(downloadUrl); // Revoke the URL after download
                    console.log('Download completed. URL revoked.');

                    // Reset the button to its original state after download
                    convertButton.textContent = 'Upload and Convert';
                    convertButton.disabled = false;
                    downloadUrl = ''; // Reset the download URL
                }
            })
            .catch((error) => {
                // Handle any errors during the conversion process
                console.error('Conversion error:', error);
                convertButton.textContent = 'Upload and Convert';
                convertButton.disabled = false;
                alert('An error occurred during conversion.');
            });
        });
    }
});
