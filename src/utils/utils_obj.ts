import csv from 'csvtojson';
import _ from 'lodash';
const axios = require('axios').default;
import { Request } from 'express';
const { config }  = require('../../config/config');

export function combineURLs(baseURL: string, relativeURL: string) {
    return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}

const findClosestStops = async (gps: string) => {
    const lat1 = parseFloat(gps.split(',')[0])
    const lon1 = parseFloat(gps.split(',')[1])
    const stops = await getAllStations();
    for (var stop of stops) {
        const lat2 = stop.stop_lat;
        const lon2 = stop.stop_lon;
        const distance = getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2);
        stop.distance = distance;
    }
    const sortedStops = _.sortBy(stops, ['distance']);
    const closestStop = sortedStops[0];
    var closestStops = []
    closestStops.push(closestStop.stop_id)
    console.log(closestStop.stop_id, closestStop.distance, "kms away")
    for (var stop of sortedStops.slice(1)) {
        if ((stop.distance - closestStop.distance) < config.THRESHOLD_DISTANCE_KM) {
            closestStops.push(stop.stop_id)
            console.log(stop.stop_id, stop.distance, "kms away")
        } else {
            break;
        }
    }
    return closestStops;
}

const findClosestFromGMapsResponse = (sortedResponses: any) => {
    const closestStop = sortedResponses[0];
    var closestStops = []
    closestStops.push(closestStop.stop_id);
    console.log("Closest is ", closestStop.stop_id, closestStop.distance.text, " and ", closestStop.duration.text, " away");
    for (var stop of sortedResponses.slice(1)) {
        const threshold_passed = config.USE_TIME_THRESHOLD ?
            (stop.duration.value / 60 - closestStop.duration.value / 60) < config.THRESHOLD_TIME_MIN :
            (stop.distance.value / 1000 - closestStop.distance.value / 1000) < config.THRESHOLD_DISTANCE_KM
        //console.log("Delta distance:", (stop.distance.value / 1000 - closestStop.distance.value / 1000),"Delta time:" ,(stop.duration.value / 60 - closestStop.duration.value / 60));
        if (threshold_passed && sortedResponses.indexOf(stop) < config.MAX_STATIONS ) {
            closestStops.push(stop.stop_id);
            console.log(stop.stop_id, stop.distance.text, " and ", stop.duration.text, " away selected");
        } else {
            break;
        }
    }
    return closestStops;
}

const findClosestStopsMaps = async (gpsStart: string, gpsEnd: string) => {
    try {
        const stops: any = await getAllStations();
        const origins = [gpsStart, gpsEnd].join('|');
        const destinations_array = []
        for (var stop of stops) {
            destinations_array.push(`${stop.stop_lat},${stop.stop_lon}`);
        }
        const destinations = destinations_array.join('|');
        const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
            params: {
                destinations: destinations,
                origins: origins,
                key: process.env.MAPS_KEY,
                mode: 'DRIVING'
            }
        })
        if (response.data.status !== 'OK') {
            throw ("Maps API error")
        }

        const origin_distances = response.data.rows[0].elements;
        const destination_distances = response.data.rows[1].elements;

        for (var index in origin_distances) {
            origin_distances[index].stop_id = stops[index].stop_id
        }
        for (var index in destination_distances) {
            destination_distances[index].stop_id = stops[index].stop_id
        }
        const sorted_origin_distances = _.sortBy(origin_distances, ['distance.value']);
        const origin_stations = findClosestFromGMapsResponse(sorted_origin_distances);
        const sorted_destination_distances = _.sortBy(destination_distances, ['distance.value']);
        const destination_stations = findClosestFromGMapsResponse(sorted_destination_distances);
        return [origin_stations, destination_stations]
    } catch (error) {
        console.log(error);
        throw (error);
    }
}

const createOnSearch = async (req: Request) => {
    const body = req.body;
    var start_codes = [];
    var end_codes = [];
    if (body.message.intent.fulfillment.start.location.station_code) {
        start_codes.push(body.message.intent.fulfillment.start.location.station_code)
    }
    if (body.message.intent.fulfillment.end.location.station_code) {
        end_codes.push(body.message.intent.fulfillment.end.location.station_code);
    }
    const date = body.message.intent.fulfillment.start.time.timestamp;
    const callback_url = body.context.bap_uri;
    if (start_codes.length === 0 || end_codes.length === 0) {
        var start_location = body.message.intent.fulfillment.start.location.gps;
        var end_location = body.message.intent.fulfillment.end.location.gps;
        if (config.USE_MAPS_API) {
            try {
                console.log("Received search parameter start location :", start_location);
                console.log("Received search parameter end location :", end_location);
                [start_codes, end_codes] = await findClosestStopsMaps(start_location, end_location);
            } catch (e) {
                console.log("MAPS API call failed. Using fallback algorithm")
                start_codes = await findClosestStops(start_location);
                end_codes = await findClosestStops(end_location);
            }
        } else {
            if (start_codes.length === 0) {
                var start_location = body.message.intent.fulfillment.start.location.gps;
                console.log("Received search parameter start location :", start_location);
                start_codes = await findClosestStops(start_location);
            }
            if (end_codes.length === 0) {
                var end_location = body.message.intent.fulfillment.end.location.gps;
                console.log("Received search parameter end location :", end_location);
                end_codes = await findClosestStops(end_location);
            }
        }
    }
    console.log('start stations')
    console.log(start_codes);
    console.log('end stations')
    console.log(end_codes);
    var locations: any = [];
    var items: any = [];
    for (var start_code of start_codes) {
        for (var end_code of end_codes) {
            if(start_code == end_code) {
                continue;
            }
            console.log("ROUTE:", start_code, "TO", end_code);
            const direction = await find_direction(start_code, end_code);
            const stop_times = await find_stop_times(start_code, direction, date);
            const fare = await get_fares(start_code, end_code);
            if (!_.find(locations, ['id', start_code])) {
                const this_locations = await createLocationsArray(start_code, stop_times, date);
                locations = locations.concat(this_locations);
                console.log('locations');
                console.log(this_locations);
            }
            const this_items = await createItemsArray(start_code, end_code, fare);
            items = items.concat(this_items);
            console.log('items');
            console.log(this_items);
        }
    }
    let response: any = {};
    response.context = body.context;
    response.context.action = 'on_search'
    response.message = {
        "catalog": {
            "bpp/descriptor": {
                "name": "BPP"
            },
            "bpp/providers": [
                {
                    "id": "metro",
                    "descriptor": {
                        "name": "Kochi Metro Rail Limited"
                    },
                    "locations": locations,
                    "items": items
                }
            ]
        }
    };
    const url = combineURLs(callback_url, '/on_search');
    //axios.post(callback_url + '/on_search', response);
    console.log("Response sent");
}

const createItemsArray = async (from: string, to: string, fare: any) => {
    const item_code = `${from}_TO_${to}`;
    const from_details = await getStationDetails(from);
    const to_details = await getStationDetails(to);
    const item_name = `${from_details.stop_name} to ${to_details.stop_name}`;
    const price = fare.price;
    const item1 = {
        "id": item_code,
        "descriptor": {
            "name": item_name
        },
        "price": {
            "currency": "INR",
            "value": price
        },
        "location_id": from,
        "matched": true
    }
    const item2 = {
        "id": item_code + '_ROUND',
        "descriptor": {
            "name": item_name + ' round trip'
        },
        "price": {
            "currency": "INR",
            "value": (price * 2).toString()
        },
        "location_id": from,
        "matched": true
    };
    return ([item1, item2]);
}

const createLocationsArray = async (start: string, stop_times: any, time: string) => {
    const date = time.split('T')[0];
    const schedule = [];
    for (var stop_time of stop_times) {
        schedule.push(date + 'T' + stop_time.arrival_time + '.000Z');
    }
    const station_details = await getStationDetails(start);
    const gps = `${station_details.stop_lat},${station_details.stop_lon}`;
    const name = station_details.stop_name;
    const location = {
        "id": start,
        "descriptor": {
            "name": name
        },
        "station_code": start,
        "gps": gps,
        "time": {
            "schedule": {
                "times": schedule
            }
        }
    };
    return [location];
}

const getStationDetails = async (code: string) => {
    const stops = await csv().fromFile('./metro-Open-Data/stops.txt');
    const result = _.find(stops, ['stop_id', code]);
    if (result) {
        return result;
    }
}

const getAllStations = async () => {
    const stops = await csv().fromFile('./metro-Open-Data/stops.txt');
    return stops;
}

const validate_stop = async (stop: string) => {
    const stops = await csv().fromFile('./metro-Open-Data/stops.txt');
    const result = _.find(stops, ['stop_id', stop]);
    if (result) {
        return true;
    } else {
        return false;
    }
}

const find_direction = async (start: string, end: string) => {
    const stops = await csv().fromFile('./metro-Open-Data/stops.txt');
    const start_index = _.findIndex(stops, ['stop_id', start]);
    const end_index = _.findIndex(stops, ['stop_id', end]);
    if (start_index == -1) {
        throw ('Invalid start station');
    }
    if (end_index == -1) {
        throw ('Invalid end station');
    }
    if (start_index === end_index) {
        throw ('Start and end station same')
    }
    if (start_index < end_index) {
        return '0'
    } else {
        return '1'
    }
}

const find_stop_times = async (stop: string, direction: string, date: string) => {
    const trip_date = new Date(date);
    const service_id = (trip_date.getDay() === 0) ? 'SU' : 'WK';
    const trips = await csv().fromFile('./metro-Open-Data/trips.txt');
    const stop_times = await csv().fromFile('./metro-Open-Data/stop_times.txt');
    const filtered_trips = _.filter(trips, { 'direction_id': direction, 'service_id': service_id });
    const filtered_stop_times = _.filter(stop_times, function (o) {
        const found = _.find(filtered_trips, { 'trip_id': o.trip_id })
        if (!found) {
            return false
        }
        if (found.length === 0) {
            return false
        }
        return true
    });
    const final_stop_times = _.filter(filtered_stop_times, { 'stop_id': stop })
    return final_stop_times;
}

const get_fares = async (start: string, end: string) => {
    const fare_rules = await csv().fromFile('./metro-Open-Data/fare_rules.txt');
    const fare_rule = _.find(fare_rules, { 'origin_id': start, 'destination_id': end });
    if (!fare_rule) {
        throw ('Fare rule not found');
    }
    const fare_attributes = await csv().fromFile('./metro-Open-Data/fare_attributes.txt');
    const fare = _.find(fare_attributes, { 'fare_id': fare_rule['fare_id'] })
    return fare;
}


module.exports = { createOnSearch }
