# DhakaFlix Stremio Addon

A Stremio addon that provides access to DhakaFlix (BDIX) content including series, anime, and movies.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download here](https://git-scm.com/)

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Niloy-Sarker/dhakaflix-stremio-addon.git
cd dhakaflix-stremio-addon
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Addon

```bash
node index.js
```

The addon will start on port 7001 by default. You'll see output similar to:
```
===================================================
- Install URL in Stremio: http://localhost:7001/manifest.json
===================================================
```

### 4. Install in Stremio

1. Copy the install URL from the terminal output
2. Open Stremio
3. Go to **Settings** → **Addons**
4. Click **Add Addon** and paste the URL: `http://localhost:7001/manifest.json`
5. Click **Install**

## Configuration

### Environment Variables

You can customize the addon behavior using environment variables:

- `PORT` - Server port (default: 7001)

Example:
```bash
PORT=8080 npm start
```

### Custom Port

To run on a different port:

```bash
PORT=3000 npm start
```

Then use `http://localhost:3000/manifest.json` as the install URL in Stremio.

## Features

- **Content Types**: Series, Anime, Movies
- **BDIX Optimized**: Designed for Bangladesh internet users
- **No P2P**: Direct streaming without peer-to-peer
- **Family Friendly**: No adult content

## Development

### Project Structure

```
├── addon.json          # Addon manifest configuration
├── index.js           # Main entry point
├── server.js          # Addon server implementation
├── package.json       # Node.js dependencies and scripts
└── README.md          # This file
```

### Available Scripts

- `npm start` - Run the addon in production mode
- `npm run dev` - Run the addon in development mode with auto-restart

### Making Changes

1. Edit the source files
2. If running in dev mode (`npm run dev`), changes will auto-restart the server
3. If running in production mode, restart manually with `npm start`

## Troubleshooting

### Common Issues

**Port already in use**
```
Error: listen EADDRINUSE :::7001
```
Solution: Use a different port with `PORT=8080 npm start`

**Module not found**
```
Error: Cannot find module 'stremio-addon-sdk'
```
Solution: Run `npm install` to install dependencies

**Stremio can't connect to addon**
- Ensure the addon is running (`npm start` or `npm run dev`)
- Check that the URL matches the one shown in terminal
- Verify firewall isn't blocking the port
- Try restarting Stremio

### Getting Help

If you encounter issues:

1. Check the terminal output for error messages
2. Ensure all dependencies are installed (`npm install`)
3. Verify Node.js version (`node --version`)
4. Check if the port is available

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

If you find this addon useful, consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 🤝 Contributing to the codebase

---

**Note**: This addon is designed for BDIX users in Bangladesh and may not work optimally outside of Bangladesh due to content delivery restrictions.
