const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
    // Set HTML content type
    res.setHeader('Content-Type', 'text/html');
    
    // Read and serve the main v2 HTML file
    const htmlPath = path.join(process.cwd(), 'public', 'v2-index.html');
    
    try {
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        res.status(200).send(htmlContent);
    } catch (error) {
        console.error('Error serving v2 HTML:', error);
        res.status(500).send('Error loading page');
    }
};