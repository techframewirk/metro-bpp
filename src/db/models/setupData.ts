import csv from 'csvtojson';
import path from 'path';

import { Calendar } from "./Calendar.model";
import { FareAttributes } from "./FareAttributes.model";
import { FareRules } from "./FareRules.model";
import { Stops } from "./Stops.model";
import { StopTimes } from "./StopTimes.model";
import { Trips } from "./Trips.model";


//./metro-Open-Data/
export const setupData = async (data_path: string) => {

    //Clear database
    Calendar.destroy({ where: {} });
    FareAttributes.destroy({ where: {} });
    FareRules.destroy({ where: {} });
    Stops.destroy({ where: {} });
    StopTimes.destroy({ where: {} });
    Trips.destroy({ where: {} });

    const files = ['calendar', 'fare_attributes', 'fare_rules', 'stops', 'stop_times', 'trips']
    const MODELS = [Calendar, FareAttributes, FareRules, Stops, StopTimes, Trips]

    for (let index = 0; index < files.length; index++) {
        const file_name = files[index] + '.txt';
        const model: any = MODELS[index];
        const data: any = await csv().fromFile(path.join(data_path, file_name));
        if(file_name === 'calendar.txt') {
            for(var row of data) {
                row.start_date = `${row.start_date.slice(0,4)}-${row.start_date.slice(4,6)}-${row.start_date.slice(6,8)}`
                row.end_date = `${row.end_date.slice(0,4)}-${row.end_date.slice(4,6)}-${row.end_date.slice(6,8)}`
            }
        }
        model.bulkCreate(data);
    }
}