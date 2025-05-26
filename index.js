#!/usr/bin/env node

const { serveHTTP, publishToCentral } = require('stremio-addon-sdk');
const addonInterface = require('./server');
// Start the Stremio addon server
serveHTTP(addonInterface, { port: process.env.PORT || 7001 })
    .then(({ url }) => {
        console.log('\n===================================================');
        console.log(`  DhakaFlix Addon running at ${url}  `);
        console.log('===================================================');
        console.log('- Install URL in Stremio: ' + url);
        console.log('- Now monitoring all requests with detailed logging');
        console.log('===================================================\n');
        
        // Uncomment these lines to publish your addon to the Stremio addon catalog
        // publishToCentral("https://my-addon.domain/manifest.json")
        // .then(result => console.log(result))
        // .catch(err => console.error(err));
    })
    .catch(err => console.error('STARTUP ERROR:', err)); 