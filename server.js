// server.js - Main server that routes to v1 and v2
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve v1 (existing game) at root
app.use(express.static(path.join(__dirname, "public")));

// Serve v2 at /v2
app.use('/v2', express.static(path.join(__dirname, "v2/public-v2")));

// Mount v1 API routes (existing game)
const v1App = require("./index.js");
app.use('/', v1App);

// Mount v2 API routes at /v2
const v2App = require("./v2/index-v2.js");  
app.use('/v2', v2App);

// Catch-all to serve v1 index for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve v2 index at /v2
app.get('/v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'v2', 'public-v2', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`- Main game (v1): /`);
  console.log(`- New AI version (v2): /v2`);
});