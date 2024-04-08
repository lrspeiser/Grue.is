const { google } = require("googleapis");
const path = require("path");
const fs = require("fs"); // Use the original fs for createWriteStream
const fsp = require("fs").promises; // Use fs.promises for async file operations

// Initialize Google Drive API with your service account
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "service-account-key.json"), // Ensure this path is correct
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const driveService = google.drive({ version: "v3", auth });

async function downloadFile(fileId) {
  try {
    console.log(`Attempting to download file with ID: ${fileId}`);
    // Get the file's metadata
    const fileMetadata = await driveService.files.get({
      fileId: fileId,
      fields: "name, mimeType",
    });

    // Stream the file content
    const destPath = path.join(__dirname, fileMetadata.data.name);
    console.log(`Downloading to: ${destPath}`);
    const dest = fs.createWriteStream(destPath);

    await driveService.files
      .get(
        {
          fileId: fileId,
          alt: "media",
        },
        { responseType: "stream" },
      )
      .then((res) => {
        return new Promise((resolve, reject) => {
          console.log(`Starting download: ${fileMetadata.data.name}`);
          res.data
            .on("end", () => {
              console.log(`Completed download: ${fileMetadata.data.name}`);
              resolve(destPath);
            })
            .on("error", (err) => {
              console.error("Error downloading file:", err);
              reject(err);
            })
            .pipe(dest);
        });
      });
  } catch (error) {
    console.error("Error downloading file:", error.message);
  }
}

// Example usage: Replace 'YOUR_FILE_ID_HERE' with the actual file ID
const fileId = "17XIET0f6tP8dfrA4LQhnJvRv5peRtqIo"; // Example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
downloadFile(fileId);
