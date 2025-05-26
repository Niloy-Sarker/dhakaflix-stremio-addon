const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const http = require('http');
const url = require('url');

// Stremio Meta API configuration
const STREMIO_METAHUB_URL = 'https://v3-cinemeta.strem.io';

// Timeout configurations
const DEFAULT_TIMEOUTS = {
    search: 5000,        // 5 seconds for normal search
    extendedSearch: 15000, // 15 seconds for extended search
    load: 15000,         // 15 seconds for loading content
    stremioMeta: 5000    // 5 seconds for Stremio Meta API
};

// Provider-specific timeout configurations
const PROVIDER_TIMEOUTS = {
    dhakaflix7: {
        search: 10000,           // 10 seconds for dhakaflix7 search (slower server)
        extendedSearch: 25000,   // 25 seconds for dhakaflix7 extended search
        load: 25000             // 25 seconds for content loading
    }
};

// Provider configurations
const PROVIDERS = {
    dhakaflix14: {
        mainUrl: 'http://172.16.50.14',
        serverName: 'DHAKA-FLIX-14',
        name: '(BDIX) DhakaFlix 14',
        tvSeriesKeyword: ['KOREAN%20TV%20%26%20WEB%20Series'],
        supportedTypes: ['movie', 'series'],
        mainPage: {
            'Animation Movies (1080p)/': 'Animation Movies',
            'English Movies (1080p)/(2024) 1080p/': 'English Movies',
            'Hindi Movies/(2024)/': 'Hindi Movies',
            'IMDb Top-250 Movies/': 'IMDb Top-250 Movies',
            'SOUTH INDIAN MOVIES/Hindi Dubbed/(2024)/': 'Hindi Dubbed',
            'SOUTH INDIAN MOVIES/South Movies/2024/': 'South Movies',
            '/KOREAN TV %26 WEB Series/': 'Korean TV & WEB Series'
        }
    },
    dhakaflix12: {
        mainUrl: 'http://172.16.50.12',
        serverName: 'DHAKA-FLIX-12',
        name: '(BDIX) DhakaFlix 12',
        tvSeriesKeyword: ['TV-WEB-Series'],
        supportedTypes: ['series'],
        mainPage: {
            'TV-WEB-Series/TV Series ★%20 0%20 —%20 9/': 'TV Series ★ 0 — 9',
            'TV-WEB-Series/TV Series ♥%20 A%20 —%20 L/': 'TV Series ♥ A — L',
            'TV-WEB-Series/TV Series ♦%20 M%20 —%20 R/': 'TV Series ♦ M — R',
            'TV-WEB-Series/TV Series ♦%20 S%20 —%20 Z/': 'TV Series ♦ S — Z'
        }
    },
    dhakaflix9: {
        mainUrl: 'http://172.16.50.9',
        serverName: 'DHAKA-FLIX-9',
        name: '(BDIX) DhakaFlix 9',
        tvSeriesKeyword: ['Awards', 'WWE', 'KOREAN', 'Documentary', 'Anime'],
        supportedTypes: ['movie', 'series', 'anime'],
        mainPage: {
            'Anime %26 Cartoon TV Series/Anime-TV Series ♥%20 A%20 —%20 F/': 'Anime TV Series',
            'KOREAN TV %26 WEB Series/': 'KOREAN TV & WEB Series',
            'Documentary/': 'Documentary',
            'Awards %26 TV Shows/%23 TV SPECIAL %26 SHOWS/': 'TV SPECIAL & SHOWS',
            'Awards %26 TV Shows/%23 AWARDS/': 'Awards',
            'WWE %26 AEW Wrestling/WWE Wrestling/': 'WWE Wrestling',
            'WWE %26 AEW Wrestling/AEW Wrestling/': 'AEW Wrestling'
        }
    },
    dhakaflix7: {
        mainUrl: 'http://172.16.50.7',
        serverName: 'DHAKA-FLIX-7',
        name: '(BDIX) DhakaFlix 7',
        tvSeriesKeyword: [],
        supportedTypes: ['movie'],
        mainPage: {
            'English Movies/(2024)/': 'English Movies',
            'English Movies (1080p)/(2024) 1080p/': 'English Movies (1080p)',
            '3D Movies/': '3D Movies',
            'Foreign Language Movies/Japanese Language/': 'Japanese Movies',
            'Foreign Language Movies/Korean Language/': 'Korean Movies',
            'Foreign Language Movies/Bangla Dubbing Movies/': 'Bangla Dubbing Movies',
            'Foreign Language Movies/Pakistani Movie/': 'Pakistani Movies',
            'Kolkata Bangla Movies/(2024)/': 'Kolkata Bangla Movies',
            'Foreign Language Movies/Chinese Language/': 'Chinese Movies'
        }
    }
};

const manifest = require('./addon.json');
const builder = new addonBuilder(manifest);

// Cache system
const searchCache = new Map();
const streamCache = new Map();
const cacheTimestamps = new Map();
const CACHE_TTL = {
    search: 12 * 60 * 60 * 1000, // 12 hours for search results
    stream: 24 * 60 * 60 * 1000  // 24 hours for streams
};

// Helper function to update cache timestamps
function updateCacheTimestamp(cacheName, key) {
    cacheTimestamps.set(`${cacheName}:${key}`, Date.now());
}

// Helper function to check if cache is valid
function isCacheValid(cacheName, key) {
    const timestamp = cacheTimestamps.get(`${cacheName}:${key}`);
    if (!timestamp) return false;
    
    const elapsed = Date.now() - timestamp;
    const ttl = CACHE_TTL[cacheName];
    
    // Check if cache is approaching expiration (>80% of TTL)
    if (elapsed > (ttl * 0.8) && elapsed < ttl) {
        logDebug('CACHE_WARN', `Cache for ${cacheName}:${key} is approaching expiration (${Math.round((elapsed/ttl)*100)}%)`);
    }
    
    return elapsed < ttl;
}

// Function to clean up old cache entries
function cleanupCaches() {
    const now = Date.now();
    const startTime = process.hrtime();
    
    logDebug('CACHE', 'Running cache cleanup...');
    
    const cleanCache = (cache, name) => {
        let removedCount = 0;
        let totalCount = 0;
        
        for (const key of cache.keys()) {
            totalCount++;
            const timestamp = cacheTimestamps.get(`${name}:${key}`);
            if (!timestamp || (now - timestamp > CACHE_TTL[name])) {
                cache.delete(key);
                cacheTimestamps.delete(`${name}:${key}`);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            logDebug('CACHE', `Cleaned ${removedCount}/${totalCount} entries from ${name} cache`);
        } else if (totalCount > 0) {
            logDebug('CACHE', `No expired entries found in ${name} cache (${totalCount} total entries)`);
        } else {
            logDebug('CACHE_WARN', `${name} cache is empty`);
        }
    };
    
    cleanCache(searchCache, 'search');
    cleanCache(streamCache, 'stream');
    
    const diff = process.hrtime(startTime);
    const duration = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to ms
    logDebug('CACHE', `Cache cleanup completed in ${duration.toFixed(2)}ms`);
    
    setTimeout(cleanupCaches, 6 * 60 * 60 * 1000); // Run every 6 hours
}

// Start the cache cleanup process
setTimeout(cleanupCaches, 30 * 60 * 1000);

// Helper function to extract name from URL
function nameFromUrl(href) {
    const decoded = decodeURIComponent(href);
    const match = decoded.match(/.*\/([^/]+)(?:\/[^/]*)*$/);
    return match ? match[1] : '';
}

// Helper function to check if URL contains TV series keywords
function containsAnyLoop(text, keywords) {
    if (!keywords || !keywords.length) return false;
    return keywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
}

// Logger helper function
function logDebug(section, message, data = null) {
    const timestamp = new Date().toISOString();
    const startTime = process.hrtime();
    
    // Determine log level and format
    let level = '✓';  // Default: OK
    let color = '';
    
    if (section.includes('ERROR')) {
        level = '✗';  // ERROR
        color = '\x1b[31m'; // Red
    } else if (section.includes('WARN')) {
        level = '⚠';  // WARNING
        color = '\x1b[33m'; // Yellow
    }
    
    const resetColor = '\x1b[0m';
    
    // Log the message
    console.log(`${color}[${timestamp}] [${level}] [${section}] ${message}${resetColor}`);
    
    // Log additional data if provided
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
    
    // Calculate and log response time for certain operations
    if (message.includes('response') || section.includes('SEARCH') || section.includes('LOAD')) {
        const diff = process.hrtime(startTime);
        const responseTime = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to ms
        console.log(`${color}[${timestamp}] [${level}] [${section}_TIME] ${responseTime.toFixed(2)}ms${resetColor}`);
    }
}

// Helper function to properly construct URLs
function constructUrl(baseUrl, path) {
    // Remove any double slashes except after protocol
    const cleanPath = path.replace(/([^:]\/)\/+/g, "$1");
    // Ensure there's a single slash between baseUrl and path
    const url = `${baseUrl.replace(/\/$/, '')}/${cleanPath.replace(/^\//, '')}`;
    return url;
}

// Helper function to extract movie title and year from filename
function extractMovieTitleAndYear(filename) {
    // First try to match "Movie Name (YYYY)" pattern
    let match = filename.match(/^(.+?)\s*\((\d{4})\)/);
    
    if (match) {
        return {
            title: match[1].trim(),
            year: parseInt(match[2])
        };
    }
    
    // Try to find year anywhere in the filename (common in movie filenames)
    match = filename.match(/\b(19\d{2}|20\d{2})\b/);
    if (match) {
        const year = parseInt(match[1]);
        // Extract title - everything before the year or up to some common separator
        const titleMatch = filename.match(/^(.+?)(?:\s*[\(\[\-\|]|\s+\d{4}|$)/);
        const title = titleMatch ? titleMatch[1].trim() : filename;
        
        return {
            title: title,
            year: year
        };
    }
    
    // If no match, try to extract just the title before common separators
    match = filename.match(/^(.+?)(?:\s*[\(\[\-\|]|(?:\d{3,4}p)|(?:x\d{3}))/);
    
    if (match) {
        return {
            title: match[1].trim(),
            year: null
        };
    }
    
    // Last resort: return the whole name with extension removed
    match = filename.match(/^(.+)\.(?:mkv|mp4|avi|webm)$/i);
    
    if (match) {
        return {
            title: match[1].trim(),
            year: null
        };
    }
    
    return {
        title: filename,
        year: null
    };
}

// Helper function to extract episodes from a season folder
async function seasonExtractor(url, provider, seasonNum) {
    const timeoutDuration = 15000; // 15 seconds timeout for season extraction
    logDebug('SEASON', `Extracting episodes from season ${seasonNum} at URL: ${url}`);
    try {
        // Add timeout to avoid hanging requests
        const response = await Promise.race([
            axios.get(url, { timeout: timeoutDuration }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout extracting season')), timeoutDuration)
            )
        ]);
        const $ = cheerio.load(response.data);
        const episodes = [];
        let episodeNum = 0;
        
        $('tbody > tr:gt(1)').each((_, row) => {
            const aElement = $(row).find('td.fb-n > a');
            const link = aElement.attr('href');
            if (link && link.match(/\.(mkv|mp4|avi|webm)$/i)) {
                episodeNum++;
                episodes.push({
                    name: aElement.text(),
                    season: seasonNum,
                    episode: episodeNum,
                    url: constructUrl(provider.mainUrl, link)
                });
            }
        });
        
        logDebug('SEASON', `Found ${episodes.length} episodes in season ${seasonNum}`);
        return episodes;
    } catch (error) {
        logDebug('SEASON_ERROR', `Error extracting season ${seasonNum}`, { error: error.message });
        return [];
    }
}

// Function to fetch catalog entries from a specific category
async function fetchCategoryContent(pathUrl, provider) {
    const timeoutDuration = 10000; // 10 seconds timeout for category content
    logDebug('CATEGORY', `Fetching category content from: ${provider.name}, path: ${pathUrl}`);
    try {
        // Add timeout to avoid hanging requests
        const response = await Promise.race([
            axios.get(`${provider.mainUrl}/${provider.serverName}/${pathUrl}`, { timeout: timeoutDuration }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout fetching category')), timeoutDuration)
            )
        ]);
        logDebug('CATEGORY', `Response status: ${response.status} for ${pathUrl}`);
        
        const $ = cheerio.load(response.data);
        
        const items = [];
        $('tbody > tr:gt(1)').each((_, row) => {
            const aElement = $(row).find('td.fb-n > a');
            if (!aElement.length) return;
            
            const name = aElement.text();
            const url = provider.mainUrl + aElement.attr('href');
            const isTvSeries = containsAnyLoop(url, provider.tvSeriesKeyword);
            
            items.push({
                name,
                type: isTvSeries ? 'series' : 'movie',
                url,
                hasDualAudio: name.includes('Dual'),
                hasSubtitles: name.includes('ESub')
            });
        });
        
        logDebug('CATEGORY', `Fetched ${items.length} items from category ${pathUrl}`);
        return items;
    } catch (error) {
        logDebug('CATEGORY_ERROR', `Error fetching category: ${pathUrl}`, { error: error.message });
        return [];
    }
}

// Search implementation
async function search(query, provider, extendedTimeout = false) {
    // Get provider-specific timeout or use default
    const providerTimeouts = PROVIDER_TIMEOUTS[provider.serverName.toLowerCase()] || DEFAULT_TIMEOUTS;
    const timeoutDuration = extendedTimeout ? 
        (providerTimeouts.extendedSearch || DEFAULT_TIMEOUTS.extendedSearch) : 
        (providerTimeouts.search || DEFAULT_TIMEOUTS.search);
    
    logDebug('SEARCH', `Searching for "${query}" in provider: ${provider.name}${extendedTimeout ? ' with extended timeout' : ''} (timeout: ${timeoutDuration}ms)`);
    
    const cacheKey = `${provider.name}:${query}`;
    if (searchCache.has(cacheKey) && isCacheValid('search', cacheKey)) {
        logDebug('SEARCH_CACHE', `Found valid cached results for "${query}" in ${provider.name}`);
        return searchCache.get(cacheKey);
    }

    try {
        let results = [];
          if (query) {
            // Use search API for query with timeout
            logDebug('SEARCH', `Using search API for query: "${query}" (timeout: ${timeoutDuration}ms)`);
            const body = JSON.stringify({
                action: "get",
                search: {
                    href: `/${provider.serverName}/`,
                    pattern: query,
                    ignorecase: true
                }
            });

            const response = await Promise.race([
                axios.post(`${provider.mainUrl}/${provider.serverName}/`, body, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: timeoutDuration
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), timeoutDuration)
                )
            ]);

            logDebug('SEARCH', `Search response status: ${response.status}, found ${response.data.search.length} total items`);

            results = response.data.search
                .filter(post => !post.size) // Filter out non-folder items
                .slice(0, 20) // Limit to top 20 results for faster processing
                .map(post => {
                    const name = nameFromUrl(post.href);
                    const isTvSeries = containsAnyLoop(post.href, provider.tvSeriesKeyword);
                    
                    return {
                        name,
                        type: isTvSeries ? 'series' : 'movie',
                        url: post.href,
                        hasDualAudio: name.includes('Dual'),
                        hasSubtitles: name.includes('ESub')
                    };
                });
        } else {
            // For empty query, fetch from main page categories in parallel
            logDebug('SEARCH', `Empty query, fetching from main page categories`);
            const categoryPromises = Object.keys(provider.mainPage).map(path => 
                fetchCategoryContent(path, provider)
                    .catch(error => {
                        logDebug('SEARCH_ERROR', `Error fetching category ${path}`, { error: error.message });
                        return [];
                    })
            );
            
            const categoryResults = await Promise.all(categoryPromises);
            results = categoryResults.flat().slice(0, 40); // Limit total results
        }

        logDebug('SEARCH', `Final search results: ${results.length} items`);
        
        searchCache.set(cacheKey, results);
        updateCacheTimestamp('search', cacheKey);
        return results;
    } catch (error) {        
        logDebug('SEARCH_ERROR', `Error in search for "${query}"`, { error: error.message });
        
        // Return cached results even if expired in case of error
        if (searchCache.has(cacheKey)) {
            logDebug('SEARCH_WARN', `Returning expired cache for "${query}" due to error`);
            return searchCache.get(cacheKey);
        }
        
        return [];
    }
}

// Parallel search across all providers
async function searchAllProviders(query, type) {
    const startTime = process.hrtime();
    logDebug('SEARCH', `Starting parallel search for "${query}" (type: ${type}) across all providers`);
    
    // Initial search with standard timeout
    let flatResults = await performParallelSearch(query, type, false);
    
    // If no results found, try again with extended timeout
    if (flatResults.length === 0 && query) {
        logDebug('SEARCH_WARN', `No results found with standard timeout, retrying with extended timeout`);
        flatResults = await performParallelSearch(query, type, true);
    }
    
    const diff = process.hrtime(startTime);
    const totalTime = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to ms
    logDebug('SEARCH', `Completed search with ${flatResults.length} total results in ${totalTime.toFixed(2)}ms`);
    
    return flatResults;
}

// Helper function to perform the actual parallel search
async function performParallelSearch(query, type, extendedTimeout) {
    const searchPromises = Object.entries(PROVIDERS)
        .filter(([_, provider]) => provider.supportedTypes.includes(type))
        .map(async ([providerId, provider]) => {
            try {
                const providerStartTime = process.hrtime();
                const results = await search(query, provider, extendedTimeout);
                
                const diff = process.hrtime(providerStartTime);
                const responseTime = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to ms
                
                if (results.length > 0) {
                    logDebug('SEARCH', `Provider ${providerId} returned ${results.length} results in ${responseTime.toFixed(2)}ms${extendedTimeout ? ' (extended timeout)' : ''}`);
                } else {
                    logDebug('SEARCH_WARN', `Provider ${providerId} returned no results in ${responseTime.toFixed(2)}ms${extendedTimeout ? ' (extended timeout)' : ''}`);
                }
                
                return results.map(result => ({
                    ...result,
                    providerId
                }));
            } catch (error) {
                logDebug('SEARCH_ERROR', `Error searching provider ${providerId}${extendedTimeout ? ' with extended timeout' : ''}`, { error: error.message });
                return [];
            }
        });
        
    const allResults = await Promise.all(searchPromises);
    return allResults.flat();
}

// Load content implementation
async function load(url, provider) {
    // Get provider-specific timeout or use default
    const providerTimeouts = PROVIDER_TIMEOUTS[provider.serverName.toLowerCase()] || DEFAULT_TIMEOUTS;
    const timeoutDuration = providerTimeouts.load || DEFAULT_TIMEOUTS.load;
    
    logDebug('LOAD', `Loading content from URL: ${url} in provider: ${provider.name} (timeout: ${timeoutDuration}ms)`);
    
    try {
        const fullUrl = constructUrl(provider.mainUrl, url);
        // Add timeout to avoid hanging requests
        const response = await Promise.race([
            axios.get(fullUrl, { timeout: timeoutDuration }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout loading content')), timeoutDuration)
            )
        ]);
        logDebug('LOAD', `Load response status: ${response.status}`);
        
        const $ = cheerio.load(response.data);
        const imageLink = constructUrl(provider.mainUrl, $('td.fb-n > a[href*=".jpg"], td.fb-n > a[href*=".jpeg"], td.fb-n > a[href*=".png"]').attr('href') || '');
        const tableRows = $('tbody > tr:gt(1)');
        
        const isTvSeries = containsAnyLoop(url, provider.tvSeriesKeyword);
        logDebug('LOAD', `Content type detected: ${isTvSeries ? 'TV Series' : 'Movie'}`);
        
        if (isTvSeries) {
            const name = nameFromUrl(url);
            const episodes = [];
            let hasSeasonFolders = false;
            let seasonLoadPromises = [];
            
            // First check if this is a season folder
            const currentSeasonMatch = url.match(/season\s*(\d+)/i);
            if (currentSeasonMatch) {
                const seasonNum = parseInt(currentSeasonMatch[1]);
                logDebug('LOAD', `Loading episodes for Season ${seasonNum}`);
                const seasonEpisodes = await seasonExtractor(fullUrl, provider, seasonNum);
                return {
                    type: 'series',
                    name: name,
                    poster: imageLink,
                    episodes: seasonEpisodes
                };
            }
            
            // Check for season folders
            tableRows.each((_, row) => {
                const aElement = $(row).find('td.fb-n > a');
                const isFolder = $(row).find('td.fb-i > img[alt="folder"]').length > 0;
                const link = aElement.attr('href');
                const itemName = aElement.text();
                
                if (isFolder && itemName.toLowerCase().includes('season')) {
                    hasSeasonFolders = true;
                    const seasonMatch = itemName.match(/season\s*(\d+)/i);
                    const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : 0;
                    logDebug('LOAD', `Detected season folder: ${itemName}`);
                    
                    // Add promise to load season episodes
                    const seasonUrl = constructUrl(provider.mainUrl, link);
                    seasonLoadPromises.push(seasonExtractor(seasonUrl, provider, seasonNum));
                }
            });
            
            if (hasSeasonFolders) {
                // Wait for all season episodes to load
                const allSeasonEpisodes = await Promise.all(seasonLoadPromises);
                const episodes = allSeasonEpisodes.flat();
                logDebug('LOAD', `Loaded total ${episodes.length} episodes from all seasons`);
                
                return {
                    type: 'series',
                    name: name,
                    poster: imageLink,
                    episodes: episodes
                };
            } else {
                // No season folders, treat all video files as Season 1 episodes
                logDebug('LOAD', `No season folders found, treating all videos as Season 1 episodes`);
                let episodeNum = 0;
                tableRows.each((_, row) => {
                    const aElement = $(row).find('td.fb-n > a');
                    const link = aElement.attr('href');
                    if (link && link.match(/\.(mkv|mp4|avi|webm)$/i)) {
                        episodeNum++;
                        episodes.push({
                            name: aElement.text(),
                            season: 1,
                            episode: episodeNum,
                            url: constructUrl(provider.mainUrl, link)
                        });
                    }
                });
                
                return {
                    type: 'series',
                    name: name,
                    poster: imageLink,
                    episodes: episodes
                };
            }
        } else {            // For movies, first check if we're already at a video file
            const directVideoLinks = tableRows.find('td.fb-n > a[href$=".mkv"], td.fb-n > a[href$=".mp4"]');
            if (directVideoLinks.length > 0) {
                // Collect all video files
                const videoFiles = [];
                directVideoLinks.each((_, element) => {
                    const videoElement = $(element);
                    const name = videoElement.text();
                    const link = constructUrl(provider.mainUrl, videoElement.attr('href'));
                    videoFiles.push({
                        name,
                        url: link,
                        hasDualAudio: name.includes('Dual') || name.includes('Dual Audio'),
                        hasSubtitles: name.includes('ESub') || name.includes('Sub')
                    });
                });
                
                if (videoFiles.length > 0) {
                    // Use first video name as main name for the content
                    const name = videoFiles[0].name;
                    logDebug('LOAD', `Found ${videoFiles.length} direct movie files. Primary: ${name}`);
                    return {
                        type: 'movie',
                        name,
                        poster: imageLink,
                        videoFiles // Return all video files
                    };
                }
            }            // If no direct video file found, this might be a folder - try to find video files inside
            try {
                const folderResponse = await axios.get(fullUrl);
                const folder$ = cheerio.load(folderResponse.data);
                const videoLinks = folder$('td.fb-n > a[href$=".mkv"], td.fb-n > a[href$=".mp4"]');
                
                if (videoLinks.length > 0) {
                    // Collect all video files in the folder
                    const videoFiles = [];
                    videoLinks.each((_, element) => {
                        const videoElement = folder$(element);
                        const name = videoElement.text();
                        const link = constructUrl(provider.mainUrl, videoElement.attr('href'));
                        videoFiles.push({
                            name,
                            url: link,
                            hasDualAudio: name.includes('Dual') || name.includes('Dual Audio'),
                            hasSubtitles: name.includes('ESub') || name.includes('Sub')
                        });
                    });
                    
                    if (videoFiles.length > 0) {
                        // Use first video name as main name for the content
                        const name = videoFiles[0].name;
                        logDebug('LOAD', `Found ${videoFiles.length} movie files in folder. Primary: ${name}`);
                        return {
                            type: 'movie',
                            name,
                            poster: imageLink,
                            videoFiles // Return all video files
                        };
                    }
                }
            } catch (folderError) {
                logDebug('LOAD_ERROR', `Error loading folder content: ${url}`, { error: folderError.message });
            }

            logDebug('LOAD_ERROR', `No video files found in: ${url}`);
            return null;
        }
    } catch (error) {
        logDebug('LOAD_ERROR', `Error loading content: ${url}`, { error: error.message, stack: error.stack });
        return null;
    }
}

// Helper function to fetch meta information from Stremio
async function fetchStremioMeta(type, imdbId) {
    const timeoutDuration = 5000; // 5 seconds timeout for Stremio Meta API
    logDebug('STREMIO_META', `Fetching Stremio meta for ${type}/${imdbId}`);
    try {
        // Add timeout to avoid hanging requests
        const response = await Promise.race([
            axios.get(`${STREMIO_METAHUB_URL}/meta/${type}/${imdbId}.json`, { timeout: timeoutDuration }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout fetching Stremio meta')), timeoutDuration)
            )
        ]);        if (response.data && response.data.meta) {
            const meta = response.data.meta;
            const yearInfo = meta.year ? ` (${meta.year})` : '';
            logDebug('STREMIO_META', `Successfully fetched meta for ${imdbId}: ${meta.name}${yearInfo}`);
            return meta;
        }
        logDebug('STREMIO_META_ERROR', `No meta found for ${imdbId}`);
        return null;
    } catch (error) {
        logDebug('STREMIO_META_ERROR', `Error fetching meta for ${imdbId}`, { error: error.message });
        return null;
    }
}

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
    logDebug('META', `Meta request for type: ${type}, id: ${id}`);
    
    // Check if this is an IMDB ID
    const imdbMatch = id.match(/^tt\d+$/);
    if (imdbMatch) {
        // Fetch meta information from Stremio
        const meta = await fetchStremioMeta(type, id);
        if (!meta) {
            logDebug('META_ERROR', `Could not fetch meta information for ${id}`);
            return { meta: null };
        }

        // Search all providers in parallel
        logDebug('META', `Searching all providers for: ${meta.name}`);
        const results = await searchAllProviders(meta.name, type);
          // Find the best match across all results using similar scoring as stream handler
        let bestMatch = null;
        let bestMatchScore = 0;
        
        for (const result of results) {
            if (result.type !== type) continue;
            
            const { year: fileYear } = extractMovieTitleAndYear(result.name);
            
            const cleanName = result.name.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            const cleanMetaName = meta.name.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            // Calculate match score (higher is better)
            let score = 0;
            
            // Base score for title match
            if (cleanName.includes(cleanMetaName) || cleanMetaName.includes(cleanName)) {
                score += 10;
                
                // Exact title match gets higher score
                if (cleanName === cleanMetaName) {
                    score += 5;
                    logDebug('META', `Exact title match found for "${result.name}"`);
                }
                
                // Bonus points if year matches the IMDB year
                if (fileYear && meta.year) {
                    const yearDiff = Math.abs(fileYear - meta.year);
                    
                    if (yearDiff === 0) {
                        // Exact year match
                        score += 10;
                        logDebug('META', `Year match found: ${fileYear} === ${meta.year} for "${result.name}"`);
                    } else if (yearDiff === 1) {
                        // Off by one year (common for early/late releases)
                        score += 3;
                        logDebug('META', `Near year match found: ${fileYear} vs ${meta.year} (diff: ${yearDiff}) for "${result.name}"`);
                    }
                }
                
                // Update best match if this score is higher
                if (score > bestMatchScore) {
                    bestMatchScore = score;
                    bestMatch = result;
                }
            }
        }
        
        const matchingResult = bestMatch;

        if (matchingResult) {
            logDebug('META', `Found match in ${matchingResult.providerId}: ${matchingResult.name} (score: ${bestMatchScore})`);
            const provider = PROVIDERS[matchingResult.providerId];
            const content = await load(matchingResult.url, provider);
            
            if (content) {
                const metaObject = {
                    id: `${matchingResult.providerId}:${matchingResult.url}`,
                    type: content.type,
                    name: content.name,
                    poster: content.poster
                };

                if (content.type === 'series' && content.episodes) {
                    metaObject.videos = content.episodes.map((ep, index) => ({
                        id: `${matchingResult.providerId}:${ep.url}`,
                        title: ep.name,
                        season: ep.season,
                        episode: index + 1
                    }));
                }

                logDebug('META', `Returning meta object for: ${content.name}`);
                return { meta: metaObject };
            }
        }
        
        // Try fallback search for movies if no match found with full title
        if (type === 'movie') {
            logDebug('META', `No match found with full title. Trying fallback search for: ${meta.name}`);
            // Try simplified search using just the first part of the title
            const simplified = meta.name.includes(':') 
                ? meta.name.split(':')[0].trim() 
                : meta.name.split(/\s+/g).slice(0, 2).join(' ');
            
            if (simplified !== meta.name && simplified.length > 0) {
                logDebug('META', `Using simplified title for fallback search: "${simplified}"`);
                
                // Search all providers with simplified title
                for (const [providerId, provider] of Object.entries(PROVIDERS)) {
                    if (!provider.supportedTypes.includes(type)) continue;
                    
                    try {
                        const fallbackResults = await search(simplified, provider);
                        let bestFallbackMatch = null;
                        let bestFallbackScore = 0;
                        
                        for (const result of fallbackResults) {
                            if (result.type !== type) continue;
                            
                            const cleanResultName = result.name.toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            
                            const cleanSimplifiedName = simplified.toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            
                            // Calculate match score
                            let score = 0;
                            
                            if (cleanResultName.includes(cleanSimplifiedName) || cleanSimplifiedName.includes(cleanResultName)) {
                                score += 10;
                                
                                // Extract year information
                                const { year } = extractMovieTitleAndYear(result.name);
                                
                                if (cleanResultName === cleanSimplifiedName) {
                                    score += 5;
                                }
                                
                                // Check if the full title is in the result name
                                const cleanFullName = meta.name.toLowerCase()
                                    .replace(/[^\w\s]/g, '')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                                
                                if (cleanResultName.includes(cleanFullName)) {
                                    score += 8;
                                    logDebug('META', `Fallback result contains full title: "${result.name}"`);
                                }
                                
                                // Bonus points if year matches
                                if (year && meta.year) {
                                    const yearDiff = Math.abs(year - meta.year);
                                    
                                    if (yearDiff === 0) {
                                        score += 10;
                                        logDebug('META', `Year match in fallback: ${year} === ${meta.year} for "${result.name}"`);
                                    } else if (yearDiff === 1) {
                                        score += 3;
                                    }
                                }
                                
                                if (score > bestFallbackScore) {
                                    bestFallbackScore = score;
                                    bestFallbackMatch = result;
                                }
                            }
                        }
                        
                        // Use best fallback match if found
                        if (bestFallbackMatch) {
                            logDebug('META', `Found fallback match in ${providerId}: ${bestFallbackMatch.name} (score: ${bestFallbackScore})`);
                            
                            // Add provider ID to the result
                            bestFallbackMatch.providerId = providerId;
                            
                            const content = await load(bestFallbackMatch.url, provider);
                            
                            if (content) {
                                const metaObject = {
                                    id: `${providerId}:${bestFallbackMatch.url}`,
                                    type: content.type,
                                    name: content.name,
                                    poster: content.poster
                                };
                                
                                logDebug('META', `Fallback search successful. Returning meta for: ${content.name}`);
                                return { meta: metaObject };
                            }
                        }
                    } catch (error) {
                        logDebug('META_ERROR', `Error in fallback search for provider ${providerId}`, { error: error.message });
                        continue;
                    }
                }
            }
        }

        logDebug('META_ERROR', `No content found in any provider for: ${meta.name}`);
        return { meta: null };
    }

    // Handle direct provider URLs
    const [providerId, ...urlParts] = id.split(':');
    const url = urlParts.join(':');
    const provider = PROVIDERS[providerId];
    
    if (!provider) {
        logDebug('META_ERROR', `Provider not found: ${providerId}`);
        return { meta: null };
    }

    try {
        const content = await load(url, provider);
        if (!content) {
            logDebug('META_ERROR', `No content found for URL: ${url}`);
            return { meta: null };
        }

        const metaObject = {
            id,
            type: content.type,
            name: content.name,
            poster: content.poster
        };
        
        if (content.type === 'series' && content.episodes) {
            metaObject.videos = content.episodes.map((ep, index) => ({
                id: `${providerId}:${ep.url}`,
                title: ep.name,
                season: ep.season,
                episode: index + 1
            }));
        }
        
        logDebug('META', `Returning meta object for: ${content.name}`);
        return { meta: metaObject };
    } catch (error) {
        logDebug('META_ERROR', `Error in meta handler`, { error: error.message });
        return { meta: null };
    }
});

// Stream handler
builder.defineStreamHandler(async ({ type, id }) => {
    logDebug('STREAM', `Stream request for type: ${type}, id: ${id}`);
    
    if (streamCache.has(id)) {
        logDebug('STREAM_CACHE', `Found cached stream for id: ${id}`);
        return { streams: streamCache.get(id) };
    }

    // Check if this is an episode request (IMDB ID with season/episode)
    const episodeMatch = id.match(/^(tt\d+):(\d+):(\d+)$/);
    if (episodeMatch) {
        const [_, imdbId, seasonNum, episodeNum] = episodeMatch;
        logDebug('STREAM', `Detected episode request: IMDB=${imdbId}, S${seasonNum}E${episodeNum}`);
        
        // First get the series meta to get its name
        const meta = await fetchStremioMeta(type, imdbId);
        if (!meta) {
            logDebug('STREAM_ERROR', `Could not fetch meta information for ${imdbId}`);
            return { streams: [] };
        }

        // Search all providers for the series
        for (const [providerId, provider] of Object.entries(PROVIDERS)) {
            if (!provider.supportedTypes.includes(type)) continue;

            logDebug('STREAM', `Searching provider ${providerId} for series: ${meta.name}`);
            try {
                const results = await search(meta.name, provider);
                
                // Filter results to find closest match
                const matchingResult = results.find(result => {
                    if (result.type !== type) return false;
                    
                    const cleanName = result.name.toLowerCase()
                        .replace(/[^\w\s]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const cleanMetaName = meta.name.toLowerCase()
                        .replace(/[^\w\s]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    return cleanName.includes(cleanMetaName) || cleanMetaName.includes(cleanName);
                });

                if (matchingResult) {
                    logDebug('STREAM', `Found series match in ${providerId}: ${matchingResult.name}`);
                    const content = await load(matchingResult.url, provider);
                    
                    if (content && content.episodes) {
                        // Find the specific episode
                        const targetEpisode = content.episodes.find(ep => 
                            ep.season === parseInt(seasonNum) && 
                            ep.episode === parseInt(episodeNum)
                        );

                        if (targetEpisode) {
                            logDebug('STREAM', `Found episode S${seasonNum}E${episodeNum}: ${targetEpisode.name}`);
                            const streams = [{
                                title: targetEpisode.name,
                                url: targetEpisode.url
                            }];
                            
                            streamCache.set(id, streams);
                            updateCacheTimestamp('stream', id);
                            return { streams };
                        }
                    }
                }
            } catch (error) {
                logDebug('STREAM_ERROR', `Error searching provider ${providerId}`, { error: error.message });
                continue;
            }
        }

        logDebug('STREAM_ERROR', `No matching episode found for ${meta.name} S${seasonNum}E${episodeNum}`);
        return { streams: [] };
    }

    // Check if this is a regular IMDB ID
    const imdbMatch = id.match(/^tt\d+$/);
    if (imdbMatch) {
        logDebug('STREAM', `Detected IMDB ID: ${id}, fetching meta information`);
        const meta = await fetchStremioMeta(type, id);
        
        if (!meta) {
            logDebug('STREAM_ERROR', `Could not fetch meta information for ${id}`);
            return { streams: [] };
        }

        // Search all providers using the show name
        const allStreams = [];
        for (const [providerId, provider] of Object.entries(PROVIDERS)) {
            if (!provider.supportedTypes.includes(type)) continue;

            logDebug('STREAM', `Searching provider ${providerId} for: ${meta.name}`);
            try {
                const results = await search(meta.name, provider);
                  // Filter results to find closest match using scoring system
                let bestMatch = null;
                let bestMatchScore = 0;
                
                // Only for movies, we'll use a scoring system with year matching
                if (type === 'movie') {                    for (const result of results) {
                        if (result.type !== type) continue;
                        
                        // Extract title and year info from file name for better comparison
                        const { title: fileTitle, year: fileYear } = extractMovieTitleAndYear(result.name);
                        
                        const cleanName = result.name.toLowerCase()
                            .replace(/[^\w\s]/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        const cleanMetaName = meta.name.toLowerCase()
                            .replace(/[^\w\s]/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                            
                        // Calculate match score (higher is better)
                        let score = 0;
                        
                        // Base score for title match
                        if (cleanName.includes(cleanMetaName) || cleanMetaName.includes(cleanName)) {
                            score += 10;
                            
                            // Exact title match gets higher score
                            if (cleanName === cleanMetaName) {
                                score += 5;
                                logDebug('STREAM', `Exact title match found for "${result.name}"`);
                            }
                            
                            // Bonus points if year matches the IMDB year
                            if (fileYear && meta.year) {
                                const yearDiff = Math.abs(fileYear - meta.year);
                                
                                if (yearDiff === 0) {
                                    // Exact year match
                                    score += 10; // Increased from 5 to 10 for exact matches
                                    logDebug('STREAM', `Year match found: ${fileYear} === ${meta.year} for "${result.name}"`);
                                } else if (yearDiff === 1) {
                                    // Off by one year (common for early/late releases)
                                    score += 3;
                                    logDebug('STREAM', `Near year match found: ${fileYear} vs ${meta.year} (diff: ${yearDiff}) for "${result.name}"`);
                                }
                            }
                            
                            // Update best match if this score is higher
                            if (score > bestMatchScore) {
                                bestMatchScore = score;
                                bestMatch = result;
                            }
                        }
                    }
                      if (meta.year) {
                        logDebug('STREAM', `Best match score: ${bestMatchScore}${bestMatch ? ` for "${bestMatch.name}"` : ''} (IMDB Year: ${meta.year})`);
                    } else {
                        logDebug('STREAM', `Best match score: ${bestMatchScore}${bestMatch ? ` for "${bestMatch.name}"` : ''} (No IMDB year available)`);
                    }
                } else {
                    // Original method for series - first match that satisfies condition
                    bestMatch = results.find(result => {
                        // Only match results of the same type
                        if (result.type !== type) return false;
                        
                        const cleanName = result.name.toLowerCase()
                            .replace(/[^\w\s]/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        const cleanMetaName = meta.name.toLowerCase()
                            .replace(/[^\w\s]/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        return cleanName.includes(cleanMetaName) || cleanMetaName.includes(cleanName);
                    });
                }
                
                const matchingResult = bestMatch;

                if (matchingResult) {
                    logDebug('STREAM', `Found match in ${providerId}: ${matchingResult.name}`);
                    const content = await load(matchingResult.url, provider);
                      if (content) {
                        if (type === 'series' && content.episodes) {
                            // For series, add all episode streams
                            content.episodes.forEach(episode => {
                                allStreams.push({
                                    title: episode.name,
                                    url: episode.url
                                });
                            });
                        } else if (content.videoFiles) {
                            // For movies with multiple video files
                            content.videoFiles.forEach(videoFile => {
                                let title = videoFile.name;
                                
                                // Add informative tags to the stream title
                                // if (videoFile.hasDualAudio) {
                                //     title = `[Dual Audio] ${title}`;
                                // }
                                // if (videoFile.hasSubtitles) {
                                //     title = `[Sub] ${title}`;
                                // }
                                
                                allStreams.push({
                                    title: title,
                                    url: videoFile.url
                                });
                            });
                        } else if (content.url) {
                            // Fallback for direct episode links or old format
                            allStreams.push({
                                title: matchingResult.name,
                                url: content.url
                            });
                        }
                    }
                }
            } catch (error) {
                logDebug('STREAM_ERROR', `Error searching provider ${providerId}`, { error: error.message });
                continue;
            }
        }        if (allStreams.length > 0) {
            logDebug('STREAM', `Found ${allStreams.length} total streams across all providers`);
            streamCache.set(id, allStreams);
            updateCacheTimestamp('stream', id);
            return { streams: allStreams };
        }

        // Fallback search for movies only
        if (type === 'movie') {
            logDebug('STREAM', `No streams found with full title. Trying fallback search for movie: ${meta.name}`);
            // Try simplified search using just the first part of the title
            // Handle different title formats - either with ":" or just get the main title before any special characters
            const simplified = meta.name.includes(':') 
                ? meta.name.split(':')[0].trim() 
                : meta.name.split(/\s+/g).slice(0, 2).join(' '); // Take first 1-2 words as simplified title
            
            if (simplified !== meta.name && simplified.length > 0) {
                logDebug('STREAM', `Using simplified title for fallback search: "${simplified}"`);
                // Search with simplified title across all providers
                for (const [providerId, provider] of Object.entries(PROVIDERS)) {
                    if (!provider.supportedTypes.includes(type)) continue;
                    
                    try {
                        const fallbackResults = await search(simplified, provider);
                        
                        // Add year-based matching for better accuracy
                        let bestMatch = null;
                        let bestMatchScore = 0;
                        
                        for (const result of fallbackResults) {
                            if (result.type !== type) continue;
                            
                            const cleanResultName = result.name.toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                                
                            const cleanMetaName = simplified.toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            
                            // Calculate match score (higher is better)
                            let score = 0;                                // Base score for title match
                                if (cleanResultName.includes(cleanMetaName) || cleanMetaName.includes(cleanResultName)) {
                                    score += 10;
                                    
                                    // Extract year information
                                    const { title, year } = extractMovieTitleAndYear(result.name);
                                    
                                    // Exact title match gets higher score
                                    if (cleanResultName === cleanMetaName) {
                                        score += 5;
                                        logDebug('STREAM', `Exact title match found for "${result.name}"`);
                                    }
                                    
                                    // Bonus points if year matches
                                    if (year && meta.year) {
                                        const yearDiff = Math.abs(year - meta.year);
                                        
                                        if (yearDiff === 0) {
                                            // Exact year match
                                            score += 10; // Higher score for exact match
                                            logDebug('STREAM', `Year match found: ${year} === ${meta.year} for "${result.name}"`);
                                        } else if (yearDiff === 1) {
                                            // Off by one year (common for early/late releases)
                                            score += 3;
                                            logDebug('STREAM', `Near year match found: ${year} vs ${meta.year} (diff: ${yearDiff})`);
                                        }
                                    }
                                
                                // Update best match if this score is higher
                                if (score > bestMatchScore) {
                                    bestMatchScore = score;
                                    bestMatch = result;
                                }
                            }
                        }
                          // Use best match if found
                        if (bestMatch) {
                            logDebug('STREAM', `Found fallback match in ${providerId}: ${bestMatch.name} (score: ${bestMatchScore})`);
                            const content = await load(bestMatch.url, provider);
                            
                            if (content) {
                                const streams = [];
                                
                                if (content.videoFiles && content.videoFiles.length > 0) {
                                    // Handle movies with multiple video files
                                    content.videoFiles.forEach(videoFile => {
                                        streams.push({
                                            title: videoFile.name,
                                            url: videoFile.url
                                        });
                                    });
                                } else if (content.url) {
                                    // Handle direct URL content
                                    streams.push({
                                        title: bestMatch.name,
                                        url: content.url
                                    });
                                }
                                
                                if (streams.length > 0) {
                                    logDebug('STREAM', `Fallback search successful. Found ${streams.length} stream(s): ${streams[0].title}`);
                                    streamCache.set(id, streams);
                                    updateCacheTimestamp('stream', id);
                                    return { streams };
                                }
                            }
                        }
                    } catch (error) {
                        logDebug('STREAM_ERROR', `Error in fallback search for provider ${providerId}`, { error: error.message });
                        continue;
                    }
                }
            }
        }

        logDebug('STREAM_ERROR', `No streams found for ${meta.name} in any provider, fallback search also failed`);
        return { streams: [] };
    }

    // Handle direct provider URLs
    const [providerId, ...urlParts] = id.split(':');
    const url = urlParts.join(':');
    const provider = PROVIDERS[providerId];
    
    if (!provider) {
        logDebug('STREAM_ERROR', `Provider not found: ${providerId}`);
        return { streams: [] };
    }
    
    try {
        const content = await load(url, provider);
        if (!content) {
            logDebug('STREAM_ERROR', `No content found for URL: ${url}`);
            return { streams: [] };
        }

        const streams = [];
        if (type === 'series' && content.episodes) {
            // For series, add all episode streams
            content.episodes.forEach(episode => {
                streams.push({
                    title: episode.name,
                    url: episode.url
                });
            });
        } else if (content.url) {
            // For movies or direct episode links
            streams.push({
                title: content.name,
                url: content.url
            });
        }

        if (streams.length > 0) {
            logDebug('STREAM', `Returning ${streams.length} streams`);
            streamCache.set(id, streams);
            updateCacheTimestamp('stream', id);
            return { streams };
        }
    } catch (error) {
        logDebug('STREAM_ERROR', `Error loading content: ${url}`, { error: error.message });
    }

    return { streams: [] };
});

const addonInterface = builder.getInterface();

// Export the addon interface
module.exports = addonInterface;

// If this file is run directly, start the server
if (require.main === module) {
    // Create and start the HTTP server
    const server = http.createServer((req, res) => {
        const startTime = process.hrtime();
        
        // Log the request
        const reqUrl = url.parse(req.url);
        logDebug('SERVER', `${req.method} ${reqUrl.pathname}`);
        
        // Response handler to capture timing
        const originalEnd = res.end;
        res.end = function() {
            const diff = process.hrtime(startTime);
            const responseTime = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to ms
            logDebug('SERVER', `Response ${res.statusCode} sent in ${responseTime.toFixed(2)}ms`);
            return originalEnd.apply(this, arguments);
        };
        
        // Process the request
        addonInterface(req, res);
    });

}
