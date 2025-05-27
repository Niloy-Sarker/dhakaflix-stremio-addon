#!/usr/bin/env node

const { serveHTTP, publishToCentral } = require('stremio-addon-sdk');
const localtunnel = require('localtunnel');
const addonInterface = require('./server');

// Start the Stremio addon server
serveHTTP(addonInterface, { port: process.env.PORT || 7001 })
    .then(async ({ url }) => {
        console.log('===================================================');
        console.log('- Local addon URL: ' + url);
        
        // Create a tunnel to expose the local server
        try {            const tunnel = await localtunnel({ 
                port: process.env.PORT || 7001,
                subdomain: 'yourname' // Using your a custom subdomain
            });
            console.log('- Public addon URL: ' + tunnel.url);
            console.log('===================================================\n');
            
            tunnel.on('close', () => {
                console.log('Tunnel closed');
            });
            
            tunnel.on('error', (err) => {
                console.error('Tunnel error:', err);
            });
        } catch (err) {
            console.error('Failed to create tunnel:', err);
        }
    })
    .catch(err => console.error('STARTUP ERROR:', err));