import _ from 'lodash';
import { Request, response } from 'express';
import { QueryTypes } from 'sequelize';
const axios = require('axios').default;

import { Stops } from '../db/models/Stops.model';
const { config } = require('../../config/config');
import { sequelize } from '../db/index';
import { createAuthorizationHeader } from './auth';


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
    var stops_obj = []
    for (var stop of stops) {
        var stop_obj: any = stop.toJSON()
        const lat2 = parseFloat(stop.stop_lat);
        const lon2 = parseFloat(stop.stop_lon);
        const distance = getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2);
        stop_obj.distance = distance;
        stops_obj.push(stop_obj);
    }
    const sortedStops = _.sortBy(stops_obj, ['distance']);
    const closestStop = sortedStops[0];
    var closestStops = []
    closestStops.push(closestStop.stop_id)
    console.log(closestStop.stop_id, closestStop.distance, "kms away")
    if (closestStop.distance > config.DISTANCE_LIMIT_KM) {
        return [];
    }
    for (var this_stop of sortedStops.slice(1)) {
        if ((this_stop.distance - closestStop.distance) < config.THRESHOLD_DISTANCE_KM && sortedStops.indexOf(this_stop) < config.MAX_STATIONS ) {
            closestStops.push(this_stop.stop_id)
            console.log(this_stop.stop_id, this_stop.distance, "kms away")
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
    if (closestStop.distance.value / 1000 > config.DISTANCE_LIMIT_KM) {
        return [];
    }
    for (var stop of sortedResponses.slice(1)) {
        const threshold_passed = config.USE_TIME_THRESHOLD ?
            (stop.duration.value / 60 - closestStop.duration.value / 60) < config.THRESHOLD_TIME_MIN :
            (stop.distance.value / 1000 - closestStop.distance.value / 1000) < config.THRESHOLD_DISTANCE_KM
        //console.log("Delta distance:", (stop.distance.value / 1000 - closestStop.distance.value / 1000),"Delta time:" ,(stop.duration.value / 60 - closestStop.duration.value / 60));
        if (threshold_passed && sortedResponses.indexOf(stop) < config.MAX_STATIONS) {
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
            console.log("Response from google maps:", response);
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

const validateGps = (gps: string) => {
    if (gps.split(',').length !== 2) {
        return false;
    }
    var [lat, lon] = gps.split(',');
    var lat_val = parseFloat(lat);
    var lon_val = parseFloat(lon);
    if (!(!isNaN(lat_val) && !isNaN(lat as any) && lat_val <= 90 && lat_val >= -90)) {
        return false;
    }
    if (!(!isNaN(lon_val) && !isNaN(lon as any) && lon_val <= 180 && lon_val >= -180)) {
        return false;
    }
    return true;
}

const validateInputs = (req: Request) => {
    const body = req.body;
    const context = req.body.context;
    if (!context) {
        return "Context not found";
    }
    if (context.city != config.city || context.domain != config.domain || context.country != config.country || context.core_version != config.core_version) {
        return "Wrong value in context";
    }

    var start_received = false;
    var end_received = false;
    var start_gps_valid = true;
    var end_gps_valid = true;
    if (body.message?.intent?.fulfillment?.start?.location?.station_code) {
        start_received = true;
    }
    if (body.message?.intent?.fulfillment?.end?.location?.station_code) {
        end_received = true;
    }
    if (body.message?.intent?.fulfillment?.start?.location?.gps) {
        start_received = true;
        start_gps_valid = validateGps(body.message?.intent?.fulfillment?.start?.location?.gps);
    }
    if (body.message?.intent?.fulfillment?.end?.location?.gps) {
        end_received = true;
        end_gps_valid = validateGps(body.message?.intent?.fulfillment?.end?.location?.gps);
    }
    if (start_received && end_received && start_gps_valid && end_gps_valid) {
        return null;
    } else {
        return "Start and end locations not passed in expected format";
    }
}

const createOnSearch = async (req: Request) => {
    const body = req.body;
    var start_codes = [];
    var end_codes = [];
    if (body.message?.intent?.fulfillment?.start?.location?.station_code) {
        start_codes.push(body.message.intent.fulfillment.start.location.station_code)
    }
    if (body.message?.intent?.fulfillment?.end?.location?.station_code) {
        end_codes.push(body.message.intent.fulfillment.end.location.station_code);
    }

    const date = body.message?.intent?.fulfillment?.start?.time?.timestamp ?
        body.message?.intent?.fulfillment?.start?.time?.timestamp :
        new Date().toISOString();

    const callback_url = req.subscriber_type === 'bg' ? req.subscriber_url : body.context.bap_uri;
    if (start_codes.length === 0 || end_codes.length === 0) {
        var start_location = body.message?.intent?.fulfillment?.start?.location?.gps;
        var end_location = body.message?.intent?.fulfillment?.end?.location?.gps;
        if (config.USE_MAPS_API) {
            try {
                console.log(req.body?.context?.transaction_id, "Received search parameter start location :", start_location);
                console.log(req.body?.context?.transaction_id, "Received search parameter end location :", end_location);
                [start_codes, end_codes] = await findClosestStopsMaps(start_location, end_location);
            } catch (e) {
                console.log(req.body?.context?.transaction_id, "MAPS API call failed. Using fallback algorithm")
                start_codes = await findClosestStops(start_location);
                end_codes = await findClosestStops(end_location);
            }
        } else {
            if (start_codes.length === 0) {
                var start_location = body.message.intent.fulfillment.start.location.gps;
                console.log(req.body?.context?.transaction_id, "Received search parameter start location :", start_location);
                start_codes = await findClosestStops(start_location);
            }
            if (end_codes.length === 0) {
                var end_location = body.message.intent.fulfillment.end.location.gps;
                console.log(req.body?.context?.transaction_id, "Received search parameter end location :", end_location);
                end_codes = await findClosestStops(end_location);
            }
        }
    }
    console.log(req.body?.context?.transaction_id, 'start stations')
    console.log(start_codes);
    console.log(req.body?.context?.transaction_id, 'end stations')
    console.log(end_codes);
    if (start_codes.length === 0 || end_codes.length === 0) {
        console.log(req.body?.context?.transaction_id, "No routes found");
        return;
    }
    var locations: any = [];
    var items: any = [];
    for (var start_code of start_codes) {
        for (var end_code of end_codes) {
            if (start_code == end_code) {
                continue;
            }
            console.log(req.body?.context?.transaction_id, "ROUTE:", start_code, "TO", end_code);
            const stop_times = await get_stop_times(start_code, end_code, date);
            if (stop_times.length !== 0) {
                const fare = await get_fares(start_code, end_code);
                if (!_.find(locations, ['id', start_code])) {
                    const this_locations = await createLocationsArray(start_code);
                    locations = locations.concat(this_locations);
                }
                if (!_.find(locations, ['id', end_code])) {
                    const this_locations = await createLocationsArray(end_code);
                    locations = locations.concat(this_locations);
                }
                const this_items = await createItemsArray(start_code, end_code, fare, stop_times);
                items = items.concat(this_items);
            }
        }
    }
    if (items.length !== 0) {
        let response: any = {};
        response.context = body.context;
        response.context.action = 'on_search';
        response.context.bpp_id = config.bpp_id;
        response.context.bpp_uri = config.bpp_uri;
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
        const axios_config = await createHeaderConfig(response);
        console.log(req.body?.context?.transaction_id, "Response body", JSON.stringify(response));
        console.log(req.body?.context?.transaction_id, "Header", axios_config.headers);
        console.log(req.body?.context?.transaction_id, "Sending response to ", url);
        try {
            axios.post(url, response, axios_config);
        } catch (e) {
            console.log(e);
        }
    }
}

const createHeaderConfig = async (request: any) => {
    const header = await createAuthorizationHeader(request);
    const axios_config = {
        headers: {
            Authorization: header
        }
    }
    return axios_config;
}

const createItemsArray = async (from: string, to: string, fare: any, stop_times: any) => {
    const item_code = `${from}_TO_${to}`;
    const from_details = await getStationDetails(from);
    const to_details = await getStationDetails(to);
    const item_name = `${from_details.stop_name} to ${to_details.stop_name}`;
    const price = fare.price;
    const currency_type = fare.currency_type;
    var from_schedule = [];
    var to_schedule = [];
    for (var time of stop_times) {
        from_schedule.push(time.arrival_time);
        to_schedule.push(time.destination_time);
    }
    const item1 = {
        "id": item_code,
        "descriptor": {
            "name": item_name
        },
        "price": {
            "currency": currency_type,
            "value": price
        },
        "stops": [
            {
                "id": from,
                "time": {
                    "schedule": {
                        "times": from_schedule
                    }
                }
            },
            {
                "id": to,
                "time": {
                    "schedule": {
                        "times": to_schedule
                    }
                }
            },
        ],
        "location_id": from,
        "matched": true
    }
    return ([item1]);
}

const createLocationsArray = async (code: string) => {
    const station_details = await getStationDetails(code);
    const gps = `${station_details.stop_lat},${station_details.stop_lon}`;
    const name = station_details.stop_name;
    const location = {
        "id": code,
        "descriptor": {
            "name": name
        },
        "station_code": code,
        "gps": gps
    };
    return [location];
}

const getStationDetails = async (code: string) => {
    const stop = await Stops.findOne({ where: { stop_id: code } });
    if (stop) {
        return stop;
    } else {
        throw ("Stop not found")
    }
}

const getAllStations = async () => {
    const stops = await Stops.findAll();
    return stops;
}

const get_stop_times = async (start_stop: string, end_stop: string, date: string) => {
    const date_obj = new Date(date);
    const date_ist = new Date(date_obj.getTime() - ((-330) * 60 * 1000))
    var weekday = new Array(7);
    weekday[0] = "sunday";
    weekday[1] = "monday";
    weekday[2] = "tuesday";
    weekday[3] = "wednesday";
    weekday[4] = "thursday";
    weekday[5] = "friday";
    weekday[6] = "saturday";
    const day = date_obj.getDay();
    var times = await sequelize.query(`SELECT DISTINCT ori.*, end.arrival_time as destination_time
                    FROM 'StopTimes' ori, 'StopTimes' end, 'Trips' trip, 'Calendars' cal
                    WHERE ori.trip_id = end.trip_id AND
                    ori.stop_sequence < end.stop_sequence AND
                    ori.trip_id = trip.trip_id AND
                    trip.service_id = cal.service_id AND
                    ('${date_ist.toISOString().substring(0, 10)}' BETWEEN cal.start_date AND cal.end_date) AND
                    ori.stop_id = '${start_stop}' AND end.stop_id = '${end_stop}' AND
                    cal.${weekday[day]} = 1 order by ori.arrival_time`,
        { type: QueryTypes.SELECT });
    for (var time of times) {
        time.arrival_time = new Date(date_ist.toISOString().substring(0, 10) + 'T' + time.arrival_time + '.000+05:30').toISOString();
        time.departure_time = new Date(date_ist.toISOString().substring(0, 10) + 'T' + time.departure_time + '.000+05:30').toISOString();
        time.destination_time = new Date(date_ist.toISOString().substring(0, 10) + 'T' + time.destination_time + '.000+05:30').toISOString();
    }
    return times;
}

const get_fares = async (start: string, end: string) => {
    var fare = await sequelize.query(`SELECT attr.*
                                        FROM 'FareRules' fare, 'FareAttributes' attr
                                        WHERE fare.fare_id = attr.fare_id AND
                                        fare.origin_id =  '${start}' AND 
                                        fare.destination_id = '${end}'`,
        { type: QueryTypes.SELECT });
    if (fare.length === 0) {
        throw ('Fare rule not found');
    }
    return fare[0];
}


module.exports = { createOnSearch, validateInputs }
