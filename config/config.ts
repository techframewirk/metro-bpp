export const config = {
    THRESHOLD_DISTANCE_KM: parseFloat(process.env.THRESHOLD_DISTANCE_KM || '') || 0.50,
    THRESHOLD_TIME_MIN: parseInt(process.env.THRESHOLD_TIME_MIN || '') || 3,
    USE_TIME_THRESHOLD: false, //Use time to determine close stops
    USE_MAPS_API: true, //Use Google maps API to determine close stops
    MAX_STATIONS: parseInt(process.env.MAX_STATIONS || '') || 2, //Maximum number of nearby stops to return for a location
    DISTANCE_LIMIT_KM: parseFloat(process.env.DISTANCE_LIMIT_KM || '') || 15,
    bpp_id: process.env.bpp_id || 'metro_bpp',
    bpp_uri: process.env.bpp_uri || 'https://b587-49-207-220-210.ngrok.io/',
    registry_url: process.env.registry_url || 'https://pilot-gateway-1.beckn.nsdl.co.in',
    unique_key_id: process.env.unique_key_id || '25',
    country: process.env.country || "IND",
    domain: process.env.domain || "nic2004:60212",
    city: process.env.city || "Kochi",
    core_version: process.env.core_version || "0.9.3",
    auth: false
}