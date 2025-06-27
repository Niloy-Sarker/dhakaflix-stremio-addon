# DhakaFlix Stremio Addon
# learning
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

### Project Structure

```
├── addon.json          # Addon manifest configuration
├── index.js           # Main entry point
├── server.js          # Addon server implementation
├── package.json       # Node.js dependencies and scripts
└── README.md          # This file
```

**Note**: This addon only works with ISP with DhakaFlix FTP access in Bangladesh.
