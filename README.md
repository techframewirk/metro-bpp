# Metro BPP

Metro BPP that reads static GTFS data from metro-Open-Data folder and returns catalog of available tickets between stations including the schedule and fare.
The Metro BPP takes in the start and end GPS coordinates, finds the closest metro stations to the coordinates and returns ticket information for trips between the them. Current implementation works only for start and end stations within the same trip in the GTFS data.

### Building the application using Docker 

Run the following command :
`docker build . -t metro-bpp`

To run the built image run the command :
`docker run -p 8000:8000 --name metro --env MAPS_KEY=< key > metro-bpp`

#### Environment Variables

The following environment variables should be set.

- `MAPS_KEY` : Google maps API key for location matrix API
- `sign_public_key` : Signing public key
- `sign_private_key` : Signing public key
- `bpp_id` 
- `bpp_uri`
- `registry_url`
- `unique_key_id`
- `country` : Default value set as "IND"
- `domain` : Default value set as "nic2004:60212"
- `city` : Default value set as ""
- `core_version` :  Default value set as "0.9.3"
    
#### Optional
- `THRESHOLD_DISTANCE_KM` : Threshold to select next closest station (default: 0.50)
- `MAX_STATIONS` : Maximum number of nearest stations to return for a location (default:2)
- `DISTANCE_LIMIT_KM` : Maximum distance from which closest station should be returned (default:15)