const { getDefaultConfig } = require('expo/metro-config');
const { embedWebApp } = require('./scripts/embed-web-app');

// Refresh the embedded copy of ../index.html before every bundle.
embedWebApp();

module.exports = getDefaultConfig(__dirname);
